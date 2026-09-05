/**
 * Prisma CatalogRepository — maps Ruchir's catalog tables onto Harsh contracts.
 * Used when DATABASE_URL is set (not during Vitest).
 */
import type { Customer, PlanRef, PriceList, PriceRule, Product, SalesTeam, TaxRate, Variant } from "@/contracts/harsh";
import { prisma, type Db, type Tx } from "@/server/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  FIXTURE_CUSTOMER_EMAIL,
  FIXTURE_USER_EMAIL,
  moneyOf,
  pctFromTaxRateId,
  taxRateIdFromPct,
  toCustomer,
  toPlan,
  toPriceList,
  toPriceRule,
  toProduct,
  toSalesTeam,
  toVariant,
  tierToDb,
  virtualTaxRate,
} from "@/server/lib/db/map";
import type { CatalogRepository } from "./repository";

type Client = Db | Tx;

const productInclude = { category: true, variants: { select: { shippingWeight: true } } } as const;

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly db: Client = prisma) {}

  async reset(): Promise<void> {
    // Live database is not reset from the catalog service. Use `pnpm prisma db seed`.
  }

  private async resolveUserId(symbolOrId: string | undefined): Promise<string> {
    if (!symbolOrId) {
      const admin = await this.db.user.findFirst({ where: { role: "ADMIN" } });
      if (!admin) throw new Error("No ADMIN user in database to assign as default actor");
      return admin.id;
    }
    const byId = await this.db.user.findUnique({ where: { id: symbolOrId } });
    if (byId) return byId.id;
    const email = FIXTURE_USER_EMAIL[symbolOrId];
    if (email) {
      const byEmail = await this.db.user.findUnique({ where: { email } });
      if (byEmail) return byEmail.id;
    }
    const fallback = await this.db.user.findFirst({ where: { role: "SALES_REP" } });
    if (!fallback) throw new Error(`Cannot resolve user '${symbolOrId}'`);
    return fallback.id;
  }

  private async resolveCustomerRow(id: string) {
    const byId = await this.db.customer.findUnique({ where: { id }, include: { assignedRep: true } });
    if (byId) return byId;
    const email = FIXTURE_CUSTOMER_EMAIL[id];
    if (email) {
      return this.db.customer.findFirst({ where: { contactEmail: email }, include: { assignedRep: true } });
    }
    return this.db.customer.findFirst({ where: { name: id }, include: { assignedRep: true } });
  }

  private async ensureCategory(code: string): Promise<string> {
    const existing = await this.db.category.findUnique({ where: { code } });
    if (existing) return existing.id;
    const created = await this.db.category.create({
      data: { code, name: code.charAt(0) + code.slice(1).toLowerCase() },
    });
    return created.id;
  }

  async listCustomers(): Promise<Customer[]> {
    const rows = await this.db.customer.findMany({ include: { assignedRep: true }, orderBy: { name: "asc" } });
    return rows.map(toCustomer);
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const row = await this.resolveCustomerRow(id);
    return row ? toCustomer(row) : undefined;
  }

  async insertCustomer(c: Customer): Promise<Customer> {
    const lists = await this.db.priceList.findMany({ take: 1 });
    const priceListId = c.priceListId ?? lists[0]?.id;
    if (!priceListId) throw new Error("Cannot create customer without a price list in the database");
    const assignedRepId = await this.resolveUserId(c.assignedRepId);
    const row = await this.db.customer.create({
      data: {
        id: c.id.startsWith("cust-") || c.id.startsWith("customer-") ? undefined : c.id,
        name: c.name,
        contactName: c.contactName ?? c.name,
        contactEmail: c.contactEmail ?? `${c.id}@example.invalid`,
        discountTier: tierToDb(c.tier),
        currency: c.currency,
        priceListId,
        assignedRepId,
      },
      include: { assignedRep: true },
    });
    return toCustomer(row);
  }

  async updateCustomer(c: Customer): Promise<Customer> {
    const existing = await this.resolveCustomerRow(c.id);
    if (!existing) throw new Error(`Customer ${c.id} not found`);
    const assignedRepId = c.assignedRepId ? await this.resolveUserId(c.assignedRepId) : existing.assignedRepId;
    const row = await this.db.customer.update({
      where: { id: existing.id },
      data: {
        name: c.name,
        contactName: c.contactName ?? existing.contactName,
        contactEmail: c.contactEmail ?? existing.contactEmail,
        discountTier: tierToDb(c.tier),
        currency: c.currency,
        priceListId: c.priceListId ?? existing.priceListId,
        assignedRepId,
      },
      include: { assignedRep: true },
    });
    return toCustomer(row);
  }

  async listSalesTeams(): Promise<SalesTeam[]> {
    const rows = await this.db.salesTeam.findMany({ include: { members: true }, orderBy: { name: "asc" } });
    return rows.map(toSalesTeam);
  }

  async listTaxRates(): Promise<TaxRate[]> {
    const products = await this.db.product.findMany({ select: { taxPct: true } });
    const pcts = new Set<number>([0, 18]);
    for (const p of products) pcts.add(Math.round(Number(p.taxPct)));
    return [...pcts].sort((a, b) => a - b).map((pct) => virtualTaxRate(taxRateIdFromPct(pct), pct, pct === 0 ? "Zero (demo)" : `GST ${pct}%`));
  }

  async insertTaxRate(t: TaxRate): Promise<TaxRate> {
    // No TaxRate table — virtual ids `tax-{pct}` are derived from Product.taxPct.
    return t;
  }

  async listPlans(): Promise<PlanRef[]> {
    const rows = await this.db.subscriptionPlan.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } });
    return rows.map(toPlan);
  }

  async listProducts(): Promise<Product[]> {
    const rows = await this.db.product.findMany({ include: productInclude, orderBy: { name: "asc" } });
    return rows.map(toProduct);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const row =
      (await this.db.product.findUnique({ where: { id }, include: productInclude })) ??
      (await this.db.product.findUnique({ where: { sku: id }, include: productInclude }));
    return row ? toProduct(row) : undefined;
  }

  async insertProduct(p: Product): Promise<Product> {
    const categoryId = await this.ensureCategory(p.category);
    const row = await this.db.product.create({
      data: {
        sku: p.id,
        name: p.name,
        categoryId,
        unit: p.unit,
        description: p.description,
        taxPct: pctFromTaxRateId(p.taxRateId),
        basePrice: p.basePrice,
        baseCost: p.baseCost,
        stockTracked: p.stockTracked,
        defaultPlanId: p.isSubscription ? (p.planId ?? null) : null,
        archivedAt: p.archivedAt ? new Date(p.archivedAt) : null,
      },
      include: productInclude,
    });
    return toProduct(row);
  }

  async updateProduct(p: Product): Promise<Product> {
    const existing = await this.db.product.findUnique({ where: { id: p.id } });
    if (!existing) throw new Error(`Product ${p.id} not found`);
    const categoryId = await this.ensureCategory(p.category);
    const row = await this.db.product.update({
      where: { id: p.id },
      data: {
        name: p.name,
        categoryId,
        unit: p.unit,
        description: p.description,
        taxPct: pctFromTaxRateId(p.taxRateId),
        basePrice: p.basePrice,
        baseCost: p.baseCost,
        stockTracked: p.stockTracked,
        defaultPlanId: p.isSubscription ? (p.planId ?? null) : null,
        archivedAt: p.archivedAt ? new Date(p.archivedAt) : p.active ? null : existing.archivedAt,
      },
      include: productInclude,
    });
    return toProduct(row);
  }

  async listVariants(productId?: string): Promise<Variant[]> {
    const rows = await this.db.variant.findMany({
      where: productId ? { productId } : undefined,
      include: { product: { select: { baseCost: true } } },
      orderBy: { sku: "asc" },
    });
    return rows.map((v) => toVariant(v, Number(v.product.baseCost)));
  }

  async getVariant(id: string): Promise<Variant | undefined> {
    const row =
      (await this.db.variant.findUnique({ where: { id }, include: { product: { select: { baseCost: true } } } })) ??
      (await this.db.variant.findUnique({ where: { sku: id }, include: { product: { select: { baseCost: true } } } }));
    return row ? toVariant(row, Number(row.product.baseCost)) : undefined;
  }

  async insertVariant(v: Variant): Promise<Variant> {
    const product = await this.db.product.findUnique({ where: { id: v.productId } });
    if (!product) throw new Error(`Product ${v.productId} not found`);
    const base = Number(product.baseCost);
    const row = await this.db.variant.create({
      data: {
        productId: v.productId,
        sku: v.sku,
        name: v.label,
        extraPrice: v.extraPrice,
        cost: moneyOf(base + Number(v.extraCost)),
        attributes: JSON.parse(JSON.stringify(v.attributes)) as Prisma.InputJsonValue,
        archivedAt: v.active ? null : new Date(),
      },
    });
    return toVariant(row, base);
  }

  async updateVariant(v: Variant): Promise<Variant> {
    const product = await this.db.product.findUnique({ where: { id: v.productId } });
    if (!product) throw new Error(`Product ${v.productId} not found`);
    const base = Number(product.baseCost);
    const row = await this.db.variant.update({
      where: { id: v.id },
      data: {
        name: v.label,
        extraPrice: v.extraPrice,
        cost: moneyOf(base + Number(v.extraCost)),
        sku: v.sku,
        attributes: JSON.parse(JSON.stringify(v.attributes)) as Prisma.InputJsonValue,
        archivedAt: v.active ? null : new Date(),
      },
    });
    return toVariant(row, base);
  }

  async listPriceLists(): Promise<PriceList[]> {
    const rows = await this.db.priceList.findMany({ orderBy: { name: "asc" } });
    return rows.map(toPriceList);
  }

  async getPriceList(id: string): Promise<PriceList | undefined> {
    const row =
      (await this.db.priceList.findUnique({ where: { id } })) ?? (await this.db.priceList.findUnique({ where: { code: id } }));
    return row ? toPriceList(row) : undefined;
  }

  async insertPriceList(pl: PriceList): Promise<PriceList> {
    const code = pl.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || `pl-${Date.now()}`;
    const row = await this.db.priceList.create({
      data: { code, name: pl.name, currency: pl.currency },
    });
    return toPriceList(row);
  }

  async updatePriceList(pl: PriceList): Promise<PriceList> {
    const row = await this.db.priceList.update({
      where: { id: pl.id },
      data: { name: pl.name, currency: pl.currency },
    });
    return toPriceList(row);
  }

  async listPriceRules(priceListId?: string): Promise<PriceRule[]> {
    const rows = await this.db.priceRule.findMany({
      where: { ...(priceListId ? { priceListId } : {}), active: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toPriceRule);
  }

  async getPriceRule(id: string): Promise<PriceRule | undefined> {
    const row = await this.db.priceRule.findUnique({ where: { id } });
    return row ? toPriceRule(row) : undefined;
  }

  async insertPriceRule(r: PriceRule): Promise<PriceRule> {
    const list = await this.db.priceList.findUnique({ where: { id: r.priceListId } });
    const row = await this.db.priceRule.create({
      data: {
        priceListId: r.priceListId,
        productId: r.productId,
        variantId: r.variantId ?? null,
        tier: "GOLD",
        currency: list?.currency ?? "INR",
        unitPrice: r.fixedPrice ?? "0.00",
        active: true,
      },
    });
    return toPriceRule(row);
  }

  async updatePriceRule(r: PriceRule): Promise<PriceRule> {
    const row = await this.db.priceRule.update({
      where: { id: r.id },
      data: {
        productId: r.productId,
        variantId: r.variantId ?? null,
        unitPrice: r.fixedPrice ?? "0.00",
        active: true,
      },
    });
    return toPriceRule(row);
  }

  async deletePriceRule(id: string): Promise<boolean> {
    try {
      await this.db.priceRule.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}
