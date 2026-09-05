/**
 * CatalogService — permissions + persistence around the pure catalog engine.
 *
 * Roles: ADMIN owns catalog mutations; ADMIN/SALES_MANAGER maintain customers; every
 * internal role reads; CUSTOMER may only read/resolve for its own customerId.
 * Products are archived, never hard-deleted (blueprint §10). Price rules may be deleted.
 */
import type {
  Actor,
  CatalogDashboardSummary,
  CatalogSearchInput,
  CatalogSearchItem,
  Customer,
  PlanRef,
  PriceList,
  PriceRule,
  Product,
  ProductCategory,
  ResolvePriceInput,
  ResolvedPrice,
  Role,
  SalesTeam,
  TaxRate,
  Variant,
} from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";
import { requireRole } from "@/lib/auth/dev-actor";
import {
  catalogSearchInputSchema,
  customerCreateSchema,
  parseInput,
  customerUpdateSchema,
  priceListCreateSchema,
  priceListUpdateSchema,
  priceRuleUpsertSchema,
  productCreateSchema,
  productUpdateSchema,
  resolvePriceInputSchema,
  taxRateCreateSchema,
  variantCreateSchema,
  variantUpdateSchema,
} from "./api";
import { resolvePrice, searchCatalog } from "./engine/resolve-price";
import { getCatalogRepository, type CatalogRepository } from "./repository";

const INTERNAL: Role[] = ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"];
const CUSTOMER_MAINTAINERS: Role[] = ["ADMIN", "SALES_MANAGER"];

const now = () => new Date().toISOString();

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "item"
  );
}

function shortRandom(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 6);
}

/** IDs like `prod-nexa-probook-15-a1b2c3`. */
export function makeId(prefix: "prod" | "var" | "cust" | "pl" | "pr" | "tax", name: string): string {
  return `${prefix}-${slugify(name)}-${shortRandom()}`;
}

/** Apply a PATCH object where `null` clears an optional field and `undefined` is a no-op. */
function applyPatch<T extends object>(target: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out as T;
}

export class CatalogService {
  constructor(private readonly repo: CatalogRepository = getCatalogRepository()) {}

  // ------------------------------------------------------------------ guards

  private requireInternal(actor: Actor) {
    requireRole(actor, ...INTERNAL);
  }

  /** Internal roles pass; CUSTOMER passes only for its own customerId. */
  private requireCustomerScope(actor: Actor, customerId: string) {
    if (!actor.active) throw new ApiFailure("FORBIDDEN", "Inactive account");
    if (actor.role === "CUSTOMER") {
      if (!actor.customerId || actor.customerId !== customerId) {
        throw new ApiFailure("FORBIDDEN", "Customers may only access their own customer record");
      }
      return;
    }
    this.requireInternal(actor);
  }

  private async mustGetCustomer(id: string): Promise<Customer> {
    const c = await this.repo.getCustomer(id);
    if (!c) throw new ApiFailure("NOT_FOUND", `Customer ${id} not found`);
    return c;
  }

  private async mustGetProduct(id: string): Promise<Product> {
    const p = await this.repo.getProduct(id);
    if (!p) throw new ApiFailure("NOT_FOUND", `Product ${id} not found`);
    return p;
  }

  private async mustGetVariant(productId: string, variantId: string): Promise<Variant> {
    const v = await this.repo.getVariant(variantId);
    if (!v || v.productId !== productId) {
      throw new ApiFailure("NOT_FOUND", `Variant ${variantId} not found on product ${productId}`);
    }
    return v;
  }

  private async mustGetPriceList(id: string): Promise<PriceList> {
    const pl = await this.repo.getPriceList(id);
    if (!pl) throw new ApiFailure("NOT_FOUND", `Price list ${id} not found`);
    return pl;
  }

  private async assertTaxRate(taxRateId: string) {
    const tax = (await this.repo.listTaxRates()).find((t) => t.id === taxRateId);
    if (!tax) throw new ApiFailure("INVALID_INPUT", `Tax rate ${taxRateId} not found`, { field: "taxRateId" });
    if (!tax.active) throw new ApiFailure("INVALID_INPUT", `Tax rate ${taxRateId} is inactive`, { field: "taxRateId" });
  }

  private async assertPlanLink(isSubscription: boolean, planId: string | undefined) {
    if (isSubscription) {
      if (!planId) throw new ApiFailure("INVALID_INPUT", "Subscription products require a planId", { field: "planId" });
      const plan = (await this.repo.listPlans()).find((p) => p.id === planId);
      if (!plan) throw new ApiFailure("INVALID_INPUT", `Plan ${planId} not found`, { field: "planId" });
    } else if (planId) {
      throw new ApiFailure("INVALID_INPUT", "planId is only valid for subscription products", { field: "planId" });
    }
  }

  private async assertSkuUnique(sku: string, exceptVariantId?: string) {
    const clash = (await this.repo.listVariants()).find((v) => v.sku === sku && v.id !== exceptVariantId);
    if (clash) throw new ApiFailure("CONFLICT", `SKU ${sku} already used by variant ${clash.id}`, { field: "sku" });
  }

  // -------------------------------------------------------------- customers

  async listCustomers(actor: Actor): Promise<Customer[]> {
    if (actor.role === "CUSTOMER") {
      if (!actor.active) throw new ApiFailure("FORBIDDEN", "Inactive account");
      if (!actor.customerId) return [];
      const own = await this.repo.getCustomer(actor.customerId);
      return own ? [own] : [];
    }
    this.requireInternal(actor);
    return this.repo.listCustomers();
  }

  async getCustomer(actor: Actor, id: string): Promise<Customer> {
    this.requireCustomerScope(actor, id);
    return this.mustGetCustomer(id);
  }

  async createCustomer(actor: Actor, raw: unknown): Promise<Customer> {
    requireRole(actor, ...CUSTOMER_MAINTAINERS);
    const input = parseInput(customerCreateSchema, raw);
    if (input.priceListId) await this.mustGetPriceList(input.priceListId);
    const customer: Customer = {
      id: makeId("cust", input.name),
      name: input.name,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      tier: input.tier,
      currency: input.currency,
      assignedRepId: input.assignedRepId,
      priceListId: input.priceListId,
      active: input.active ?? true,
      createdAt: now(),
    };
    return this.repo.insertCustomer(customer);
  }

  async updateCustomer(actor: Actor, id: string, raw: unknown): Promise<Customer> {
    requireRole(actor, ...CUSTOMER_MAINTAINERS);
    const patch = parseInput(customerUpdateSchema, raw);
    const existing = await this.mustGetCustomer(id);
    if (patch.priceListId) await this.mustGetPriceList(patch.priceListId);
    return this.repo.updateCustomer(applyPatch(existing, patch));
  }

  // ------------------------------------------------------------ sales teams

  async listSalesTeams(actor: Actor): Promise<SalesTeam[]> {
    this.requireInternal(actor);
    return this.repo.listSalesTeams();
  }

  // -------------------------------------------------------------- tax rates

  async listTaxRates(actor: Actor): Promise<TaxRate[]> {
    this.requireInternal(actor);
    return this.repo.listTaxRates();
  }

  async createTaxRate(actor: Actor, raw: unknown): Promise<TaxRate> {
    requireRole(actor, "ADMIN");
    const input = parseInput(taxRateCreateSchema, raw);
    return this.repo.insertTaxRate({
      id: makeId("tax", input.name),
      name: input.name,
      ratePct: input.ratePct,
      active: input.active ?? true,
    });
  }

  // ------------------------------------------------------------------ plans

  /** DEV FIXTURE of Ruchir's `/api/plans` — replaced by his live endpoint. */
  async listPlans(actor: Actor): Promise<PlanRef[]> {
    this.requireInternal(actor);
    return this.repo.listPlans();
  }

  // --------------------------------------------------------------- products

  async listProducts(actor: Actor, opts: { includeArchived?: boolean } = {}): Promise<Product[]> {
    this.requireInternal(actor);
    const all = await this.repo.listProducts();
    return opts.includeArchived ? all : all.filter((p) => !p.archivedAt);
  }

  async getProduct(actor: Actor, id: string): Promise<{ product: Product; variants: Variant[] }> {
    this.requireInternal(actor);
    const product = await this.mustGetProduct(id);
    const variants = await this.repo.listVariants(id);
    return { product, variants };
  }

  async createProduct(actor: Actor, raw: unknown): Promise<Product> {
    requireRole(actor, "ADMIN");
    const input = parseInput(productCreateSchema, raw);
    await this.assertTaxRate(input.taxRateId);
    await this.assertPlanLink(input.isSubscription, input.planId);
    const ts = now();
    const product: Product = {
      id: makeId("prod", input.name),
      name: input.name,
      category: input.category,
      unit: input.unit,
      description: input.description,
      basePrice: input.basePrice,
      baseCost: input.baseCost,
      taxRateId: input.taxRateId,
      stockTracked: input.stockTracked,
      isSubscription: input.isSubscription,
      planId: input.planId,
      shippingWeightKg: input.shippingWeightKg,
      active: input.active ?? true,
      createdAt: ts,
      updatedAt: ts,
    };
    return this.repo.insertProduct(product);
  }

  async updateProduct(actor: Actor, id: string, raw: unknown): Promise<Product> {
    requireRole(actor, "ADMIN");
    const patch = parseInput(productUpdateSchema, raw);
    const existing = await this.mustGetProduct(id);
    const next = applyPatch(existing, patch);
    if (patch.taxRateId !== undefined) await this.assertTaxRate(next.taxRateId);
    if (patch.isSubscription !== undefined || patch.planId !== undefined) {
      await this.assertPlanLink(next.isSubscription, next.planId);
    }
    next.updatedAt = now();
    return this.repo.updateProduct(next);
  }

  /** Archive (soft delete): `active=false`, `archivedAt` set. Idempotent. Never deletes. */
  async archiveProduct(actor: Actor, id: string): Promise<Product> {
    requireRole(actor, "ADMIN");
    const existing = await this.mustGetProduct(id);
    if (existing.archivedAt) return existing;
    const ts = now();
    return this.repo.updateProduct({ ...existing, active: false, archivedAt: ts, updatedAt: ts });
  }

  async restoreProduct(actor: Actor, id: string): Promise<Product> {
    requireRole(actor, "ADMIN");
    const existing = await this.mustGetProduct(id);
    if (!existing.archivedAt) return existing;
    const { archivedAt: _archivedAt, ...rest } = existing;
    void _archivedAt;
    return this.repo.updateProduct({ ...rest, active: true, updatedAt: now() });
  }

  // --------------------------------------------------------------- variants

  async listVariants(actor: Actor, productId: string): Promise<Variant[]> {
    this.requireInternal(actor);
    await this.mustGetProduct(productId);
    return this.repo.listVariants(productId);
  }

  async createVariant(actor: Actor, productId: string, raw: unknown): Promise<Variant> {
    requireRole(actor, "ADMIN");
    const input = parseInput(variantCreateSchema, raw);
    const product = await this.mustGetProduct(productId);
    if (product.archivedAt) throw new ApiFailure("CONFLICT", `Product ${productId} is archived`);
    await this.assertSkuUnique(input.sku);
    const variant: Variant = {
      id: makeId("var", `${product.name}-${input.label}`),
      productId,
      label: input.label,
      attributes: input.attributes,
      extraPrice: input.extraPrice,
      extraCost: input.extraCost,
      sku: input.sku,
      active: input.active ?? true,
    };
    await this.repo.updateProduct({ ...product, updatedAt: now() });
    return this.repo.insertVariant(variant);
  }

  async updateVariant(actor: Actor, productId: string, variantId: string, raw: unknown): Promise<Variant> {
    requireRole(actor, "ADMIN");
    const patch = parseInput(variantUpdateSchema, raw);
    const existing = await this.mustGetVariant(productId, variantId);
    if (patch.sku !== undefined) await this.assertSkuUnique(patch.sku, variantId);
    return this.repo.updateVariant(applyPatch(existing, patch));
  }

  /** Variants are deactivated, not deleted (stock/order lines reference them). */
  async deactivateVariant(actor: Actor, productId: string, variantId: string): Promise<Variant> {
    requireRole(actor, "ADMIN");
    const existing = await this.mustGetVariant(productId, variantId);
    if (!existing.active) return existing;
    return this.repo.updateVariant({ ...existing, active: false });
  }

  // ------------------------------------------------------------ price lists

  async listPriceLists(actor: Actor): Promise<PriceList[]> {
    this.requireInternal(actor);
    return this.repo.listPriceLists();
  }

  async getPriceList(actor: Actor, id: string): Promise<{ priceList: PriceList; rules: PriceRule[] }> {
    this.requireInternal(actor);
    const priceList = await this.mustGetPriceList(id);
    const rules = await this.repo.listPriceRules(id);
    return { priceList, rules };
  }

  async createPriceList(actor: Actor, raw: unknown): Promise<PriceList> {
    requireRole(actor, "ADMIN");
    const input = parseInput(priceListCreateSchema, raw);
    return this.repo.insertPriceList({
      id: makeId("pl", input.name),
      name: input.name,
      currency: input.currency,
      tier: input.tier,
      active: input.active ?? true,
    });
  }

  /** Lists archive via `active=false`; there is no delete. */
  async updatePriceList(actor: Actor, id: string, raw: unknown): Promise<PriceList> {
    requireRole(actor, "ADMIN");
    const patch = parseInput(priceListUpdateSchema, raw);
    const existing = await this.mustGetPriceList(id);
    // `tier: null` is a meaningful value here (explicit-assignment-only list), so merge
    // directly rather than through applyPatch's null-clears semantics.
    const next: PriceList = { ...existing };
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.currency !== undefined) next.currency = patch.currency;
    if (patch.tier !== undefined) next.tier = patch.tier;
    if (patch.active !== undefined) next.active = patch.active;
    return this.repo.updatePriceList(next);
  }

  async listPriceRules(actor: Actor, priceListId?: string): Promise<PriceRule[]> {
    this.requireInternal(actor);
    if (priceListId) await this.mustGetPriceList(priceListId);
    return this.repo.listPriceRules(priceListId);
  }

  /** Create (no `id`) or replace (`id`) a rule inside `priceListId`. */
  async upsertPriceRule(actor: Actor, priceListId: string, raw: unknown): Promise<PriceRule> {
    requireRole(actor, "ADMIN");
    const input = parseInput(priceRuleUpsertSchema, raw);
    await this.mustGetPriceList(priceListId);
    const product = await this.mustGetProduct(input.productId);
    if (input.variantId) await this.mustGetVariant(product.id, input.variantId);

    const rule: PriceRule = {
      id: input.id ?? makeId("pr", `${product.name}${input.variantId ? `-${input.variantId}` : ""}`),
      priceListId,
      productId: input.productId,
      variantId: input.variantId,
      fixedPrice: input.fixedPrice,
      discountPct: input.discountPct,
      minQty: input.minQty,
    };

    if (input.id) {
      const existing = await this.repo.getPriceRule(input.id);
      if (!existing) throw new ApiFailure("NOT_FOUND", `Price rule ${input.id} not found`);
      if (existing.priceListId !== priceListId) {
        throw new ApiFailure("CONFLICT", `Price rule ${input.id} belongs to list ${existing.priceListId}`);
      }
      return this.repo.updatePriceRule(rule);
    }

    // Prevent duplicate rules for the same (product, variant, minQty) in one list.
    const dup = (await this.repo.listPriceRules(priceListId)).find(
      (r) => r.productId === rule.productId && r.variantId === rule.variantId && (r.minQty ?? 1) === (rule.minQty ?? 1),
    );
    if (dup) {
      throw new ApiFailure("CONFLICT", `Rule ${dup.id} already covers this product/variant/minQty; pass its id to update`, {
        ruleId: dup.id,
      });
    }
    return this.repo.insertPriceRule(rule);
  }

  async deletePriceRule(actor: Actor, priceListId: string, ruleId: string): Promise<{ deleted: true; ruleId: string }> {
    requireRole(actor, "ADMIN");
    const existing = await this.repo.getPriceRule(ruleId);
    if (!existing || existing.priceListId !== priceListId) {
      throw new ApiFailure("NOT_FOUND", `Price rule ${ruleId} not found on list ${priceListId}`);
    }
    await this.repo.deletePriceRule(ruleId);
    return { deleted: true, ruleId };
  }

  // ------------------------------------------------------- catalog boundary

  async resolve(actor: Actor, raw: ResolvePriceInput | unknown): Promise<ResolvedPrice> {
    const input = parseInput(resolvePriceInputSchema, raw);
    this.requireCustomerScope(actor, input.customerId);
    const customer = await this.mustGetCustomer(input.customerId);
    const product = await this.mustGetProduct(input.productId);
    const variant = input.variantId ? await this.repo.getVariant(input.variantId) : undefined;
    if (input.variantId && !variant) throw new ApiFailure("NOT_FOUND", `Variant ${input.variantId} not found`);
    const [priceLists, priceRules, taxRates] = await Promise.all([
      this.repo.listPriceLists(),
      this.repo.listPriceRules(),
      this.repo.listTaxRates(),
    ]);
    return resolvePrice({ customer, product, variant, priceLists, priceRules, taxRates, quantity: input.quantity });
  }

  async search(actor: Actor, raw: CatalogSearchInput | unknown): Promise<CatalogSearchItem[]> {
    const input = parseInput(catalogSearchInputSchema, raw);
    this.requireCustomerScope(actor, input.customerId);
    // Customers never see inactive products.
    if (actor.role === "CUSTOMER") input.includeInactive = false;
    const customer = await this.mustGetCustomer(input.customerId);
    const [products, variants, priceLists, priceRules, taxRates] = await Promise.all([
      this.repo.listProducts(),
      this.repo.listVariants(),
      this.repo.listPriceLists(),
      this.repo.listPriceRules(),
      this.repo.listTaxRates(),
    ]);
    return searchCatalog(input, { customer, products, variants, priceLists, priceRules, taxRates });
  }

  // -------------------------------------------------------------- dashboard

  async dashboardSummary(actor: Actor): Promise<CatalogDashboardSummary> {
    this.requireInternal(actor);
    const [products, variants, priceLists, priceRules] = await Promise.all([
      this.repo.listProducts(),
      this.repo.listVariants(),
      this.repo.listPriceLists(),
      this.repo.listPriceRules(),
    ]);
    const live = products.filter((p) => !p.archivedAt);
    const byCategoryMap = new Map<ProductCategory, number>();
    for (const p of live) byCategoryMap.set(p.category, (byCategoryMap.get(p.category) ?? 0) + 1);
    const order: ProductCategory[] = ["HARDWARE", "ACCESSORIES", "SERVICES", "SUBSCRIPTIONS"];
    return {
      productCount: products.length,
      activeProductCount: live.filter((p) => p.active).length,
      variantCount: variants.length,
      priceListCount: priceLists.length,
      priceRuleCount: priceRules.length,
      subscriptionProductCount: live.filter((p) => p.isSubscription).length,
      byCategory: order.filter((c) => byCategoryMap.has(c)).map((category) => ({ category, count: byCategoryMap.get(category)! })),
    };
  }
}

/** Default service bound to the process-wide repository singleton. */
export function getCatalogService(): CatalogService {
  return new CatalogService(getCatalogRepository());
}
