/**
 * Catalog boundary engine (blueprint §7): customerId/search → resolved product/variant
 * price, tax, unit, plan reference.
 *
 * Pure functions: inputs in, outputs out. Never imports a repository or the DB.
 */
import type {
  CatalogSearchInput,
  CatalogSearchItem,
  Customer,
  PriceList,
  PriceRule,
  Product,
  ResolvedPrice,
  TaxRate,
  Variant,
} from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";
import { parseMoney, toMoney } from "./money";

export interface ResolvePriceArgs {
  customer: Customer;
  product: Product;
  variant?: Variant;
  priceLists: PriceList[];
  priceRules: PriceRule[];
  taxRates: TaxRate[];
  /** Defaults to 1. Used for `minQty` rule eligibility. */
  quantity?: number;
}

/** Whole catalog snapshot that `searchCatalog` filters and prices. */
export interface CatalogSearchData {
  customer: Customer;
  products: Product[];
  variants: Variant[];
  priceLists: PriceList[];
  priceRules: PriceRule[];
  taxRates: TaxRate[];
}

/**
 * Step 1 — which price list applies to this customer.
 * Explicit `customer.priceListId` (must be active) wins; otherwise the active list
 * whose tier and currency match the customer.
 */
export function selectPriceList(customer: Customer, priceLists: PriceList[]): PriceList {
  if (customer.priceListId) {
    const explicit = priceLists.find((pl) => pl.id === customer.priceListId);
    if (explicit && explicit.active) return explicit;
    // Fall through to tier/currency default when the override is missing or inactive.
  }
  const byTier = priceLists.find((pl) => pl.active && pl.tier === customer.tier && pl.currency === customer.currency);
  if (byTier) return byTier;
  throw new ApiFailure(
    "INVALID_INPUT",
    `No price list for tier/currency ${customer.tier}/${customer.currency} (customer ${customer.id})`,
  );
}

/**
 * Step 2 — most specific applicable rule inside the list.
 * Variant rule (productId + variantId) beats product rule (no variantId). Rules with a
 * `minQty` apply only when `quantity >= minQty`; among equally specific rules the one
 * with the highest satisfied `minQty` wins.
 */
export function selectPriceRule(
  priceList: PriceList,
  priceRules: PriceRule[],
  product: Product,
  variant: Variant | undefined,
  quantity: number,
): PriceRule | undefined {
  const eligible = priceRules.filter(
    (r) => r.priceListId === priceList.id && r.productId === product.id && (r.minQty === undefined || quantity >= r.minQty),
  );
  const pick = (rules: PriceRule[]) =>
    rules.length === 0 ? undefined : [...rules].sort((a, b) => (b.minQty ?? 0) - (a.minQty ?? 0))[0];

  if (variant) {
    const variantRule = pick(eligible.filter((r) => r.variantId === variant.id));
    if (variantRule) return variantRule;
  }
  return pick(eligible.filter((r) => r.variantId === undefined));
}

function assertQuantity(quantity: number | undefined): number {
  if (quantity === undefined) return 1;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ApiFailure("INVALID_INPUT", `quantity must be a positive number (got ${quantity})`);
  }
  return quantity;
}

function assertSellable(product: Product, variant: Variant | undefined) {
  if (!product.active || product.archivedAt) {
    throw new ApiFailure("INVALID_INPUT", `Product ${product.id} is archived or inactive`);
  }
  if (variant) {
    if (variant.productId !== product.id) {
      throw new ApiFailure("INVALID_INPUT", `Variant ${variant.id} does not belong to product ${product.id}`);
    }
    if (!variant.active) {
      throw new ApiFailure("INVALID_INPUT", `Variant ${variant.id} is inactive`);
    }
  }
}

function findTaxRate(product: Product, taxRates: TaxRate[]): TaxRate {
  const tax = taxRates.find((t) => t.id === product.taxRateId);
  if (!tax) throw new ApiFailure("INVALID_INPUT", `Tax rate ${product.taxRateId} for product ${product.id} not found`);
  if (!tax.active) throw new ApiFailure("INVALID_INPUT", `Tax rate ${product.taxRateId} is inactive`);
  if (!Number.isFinite(tax.ratePct) || tax.ratePct < 0 || tax.ratePct > 100) {
    throw new ApiFailure("INVALID_INPUT", `Tax rate ${tax.id} has an invalid percentage`);
  }
  return tax;
}

/** Resolve the unit price/cost for one customer + product (+ variant). */
export function resolvePrice(args: ResolvePriceArgs): ResolvedPrice {
  const { customer, product, variant, priceLists, priceRules, taxRates } = args;
  const quantity = assertQuantity(args.quantity);

  if (!customer.active) throw new ApiFailure("INVALID_INPUT", `Customer ${customer.id} is inactive`);
  assertSellable(product, variant);

  const priceList = selectPriceList(customer, priceLists);
  const rule = selectPriceRule(priceList, priceRules, product, variant, quantity);
  const tax = findTaxRate(product, taxRates);

  const basePrice = parseMoney(product.basePrice, "product.basePrice");
  const baseCost = parseMoney(product.baseCost, "product.baseCost");

  // Step 3 — base unit price from rule; fixedPrice replaces the PRODUCT base price,
  // discountPct reduces it, otherwise base. Variant extra is added on top in all cases.
  let basis: ResolvedPrice["priceSource"]["basis"] = "BASE";
  let unit = basePrice;
  if (rule?.fixedPrice !== undefined) {
    unit = parseMoney(rule.fixedPrice, "rule.fixedPrice");
    basis = "FIXED";
  } else if (rule?.discountPct !== undefined) {
    if (!Number.isFinite(rule.discountPct) || rule.discountPct < 0 || rule.discountPct > 100) {
      throw new ApiFailure("INVALID_INPUT", `Rule ${rule.id} discountPct must be within 0–100`);
    }
    unit = basePrice * (1 - rule.discountPct / 100);
    basis = "DISCOUNT";
  }

  const extraPrice = variant ? parseMoney(variant.extraPrice, "variant.extraPrice") : 0;
  const extraCost = variant ? parseMoney(variant.extraCost, "variant.extraCost") : 0;

  return {
    productId: product.id,
    variantId: variant?.id,
    productName: product.name,
    variantLabel: variant?.label,
    category: product.category,
    unit: product.unit,
    currency: priceList.currency,
    unitPrice: toMoney(unit + extraPrice, "unitPrice"),
    unitCost: toMoney(baseCost + extraCost, "unitCost"),
    taxRateId: tax.id,
    taxPct: tax.ratePct,
    stockTracked: product.stockTracked,
    isSubscription: product.isSubscription,
    planId: product.planId,
    priceSource: { priceListId: priceList.id, ruleId: rule?.id, basis },
  };
}

/**
 * Filter the catalog for a customer and price every product (no variant) for them.
 * Archived products are always excluded; inactive-but-not-archived products are
 * included only with `includeInactive` (they are listed but not priced — see notes).
 */
export function searchCatalog(input: CatalogSearchInput, data: CatalogSearchData): CatalogSearchItem[] {
  const q = input.query?.trim().toLowerCase() ?? "";
  const variantsByProduct = new Map<string, Variant[]>();
  for (const v of data.variants) {
    const list = variantsByProduct.get(v.productId) ?? [];
    list.push(v);
    variantsByProduct.set(v.productId, list);
  }

  const items: CatalogSearchItem[] = [];
  for (const product of data.products) {
    if (product.archivedAt) continue;
    if (!product.active && !input.includeInactive) continue;
    if (input.category && product.category !== input.category) continue;

    const variants = variantsByProduct.get(product.id) ?? [];
    if (q) {
      const haystack = [product.name, product.description, product.id, ...variants.map((v) => v.sku), ...variants.map((v) => v.label)]
        .join("\n")
        .toLowerCase();
      if (!haystack.includes(q)) continue;
    }

    // Price inactive products as if active so the includeInactive listing still shows a
    // reference price; resolvePrice itself rejects them for live quoting.
    const priceable: Product = product.active ? product : { ...product, active: true };
    const resolved = resolvePrice({
      customer: data.customer,
      product: priceable,
      priceLists: data.priceLists,
      priceRules: data.priceRules,
      taxRates: data.taxRates,
    });

    items.push({ product, variants: input.includeInactive ? variants : variants.filter((v) => v.active), resolved });
  }
  return items;
}
