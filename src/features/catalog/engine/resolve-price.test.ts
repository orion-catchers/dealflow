import { describe, expect, it } from "vitest";
import type { PriceRule, Product } from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";
import { customers, priceLists, priceRules, products, taxRates, variants } from "@/fixtures/harsh";
import { resolvePrice, searchCatalog } from "./resolve-price";

const byId = <T extends { id: string }>(list: T[], id: string): T => {
  const found = list.find((x) => x.id === id);
  if (!found) throw new Error(`fixture ${id} missing`);
  return found;
};

const acme = byId(customers, "customer-acme"); // GOLD
const beta = byId(customers, "customer-beta"); // SILVER
const gamma = byId(customers, "customer-gamma"); // BRONZE
const laptop = byId(products, "prod-laptop");
const support = byId(products, "prod-support");
const setup = byId(products, "prod-setup");
const laptop32 = byId(variants, "var-laptop-32-1tb");
const mouseWhite = byId(variants, "var-mouse-white");

const base = { priceLists, priceRules, taxRates };

function expectFailure(fn: () => unknown, code: ApiFailure["code"], messagePart?: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiFailure);
    expect((e as ApiFailure).code).toBe(code);
    if (messagePart) expect((e as ApiFailure).message).toContain(messagePart);
    return;
  }
  throw new Error("expected ApiFailure");
}

describe("resolvePrice — fixture arithmetic (blueprint §13)", () => {
  it("Gold Acme laptop → 50000.00 base, cost 40000.00, tax 0, stock tracked", () => {
    const r = resolvePrice({ customer: acme, product: laptop, ...base });
    expect(r.unitPrice).toBe("50000.00");
    expect(r.unitCost).toBe("40000.00");
    expect(r.priceSource).toEqual({ priceListId: "pl-inr-gold", ruleId: undefined, basis: "BASE" });
    expect(r.taxPct).toBe(0);
    expect(r.taxRateId).toBe("tax-zero");
    expect(r.stockTracked).toBe(true);
    expect(r.isSubscription).toBe(false);
    expect(r.currency).toBe("INR");
    expect(r.unit).toBe("UNIT");
    expect(r.variantId).toBeUndefined();
  });

  it("Gold Acme laptop 32GB/1TB variant → 58000.00 / 46000.00 with variant label", () => {
    const r = resolvePrice({ customer: acme, product: laptop, variant: laptop32, ...base });
    expect(r.unitPrice).toBe("58000.00");
    expect(r.unitCost).toBe("46000.00");
    expect(r.variantId).toBe("var-laptop-32-1tb");
    expect(r.variantLabel).toBe("32GB / 1TB");
    expect(r.priceSource.basis).toBe("BASE");
  });

  it("Silver Beta laptop → 52000.00 FIXED from pr-silver-laptop", () => {
    const r = resolvePrice({ customer: beta, product: laptop, ...base });
    expect(r.unitPrice).toBe("52000.00");
    expect(r.priceSource).toEqual({ priceListId: "pl-inr-silver", ruleId: "pr-silver-laptop", basis: "FIXED" });
  });

  it("Silver Beta laptop 32GB → fixed price replaces base, variant extra still added (60000.00)", () => {
    const r = resolvePrice({ customer: beta, product: laptop, variant: laptop32, ...base });
    expect(r.unitPrice).toBe("60000.00");
    expect(r.unitCost).toBe("46000.00");
    expect(r.priceSource.basis).toBe("FIXED");
  });

  it("Bronze Gamma support seat → 1200.00 FIXED, subscription with plan reference", () => {
    const r = resolvePrice({ customer: gamma, product: support, ...base });
    expect(r.unitPrice).toBe("1200.00");
    expect(r.unitCost).toBe("400.00");
    expect(r.isSubscription).toBe(true);
    expect(r.planId).toBe("plan-support-monthly");
    expect(r.stockTracked).toBe(false);
    expect(r.unit).toBe("SEAT");
    expect(r.priceSource).toEqual({ priceListId: "pl-inr-bronze", ruleId: "pr-bronze-support", basis: "FIXED" });
  });

  it("Gold setup → 2200.00 FIXED with GST 18%", () => {
    const r = resolvePrice({ customer: acme, product: setup, ...base });
    expect(r.unitPrice).toBe("2200.00");
    expect(r.taxPct).toBe(18);
    expect(r.taxRateId).toBe("tax-gst-18");
    expect(r.priceSource.ruleId).toBe("pr-gold-setup");
  });

  it("Silver dock rule with discountPct 0 → DISCOUNT basis at base price", () => {
    const dock = byId(products, "prod-dock");
    const r = resolvePrice({ customer: beta, product: dock, ...base });
    expect(r.unitPrice).toBe("3000.00");
    expect(r.priceSource).toEqual({ priceListId: "pl-inr-silver", ruleId: "pr-silver-dock", basis: "DISCOUNT" });
  });
});

describe("resolvePrice — price list selection", () => {
  it("uses customer.priceListId override when set and active", () => {
    const r = resolvePrice({ customer: { ...acme, priceListId: "pl-inr-silver" }, product: laptop, ...base });
    expect(r.priceSource.priceListId).toBe("pl-inr-silver");
    expect(r.unitPrice).toBe("52000.00");
  });

  it("falls back to tier/currency default when override is inactive", () => {
    const inactiveSilver = priceLists.map((pl) => (pl.id === "pl-inr-silver" ? { ...pl, active: false } : pl));
    const r = resolvePrice({ customer: { ...acme, priceListId: "pl-inr-silver" }, product: laptop, ...base, priceLists: inactiveSilver });
    expect(r.priceSource.priceListId).toBe("pl-inr-gold");
  });

  it("throws INVALID_INPUT when no list matches tier/currency", () => {
    expectFailure(
      () => resolvePrice({ customer: { ...acme, currency: "USD" }, product: laptop, ...base }),
      "INVALID_INPUT",
      "No price list for tier/currency",
    );
  });
});

describe("resolvePrice — rule specificity and minQty", () => {
  const variantRule: PriceRule = {
    id: "pr-test-variant",
    priceListId: "pl-inr-gold",
    productId: "prod-laptop",
    variantId: "var-laptop-32-1tb",
    fixedPrice: "49000.00",
  };
  const productRule: PriceRule = { id: "pr-test-product", priceListId: "pl-inr-gold", productId: "prod-laptop", discountPct: 10 };
  const bulkRule: PriceRule = { id: "pr-test-bulk", priceListId: "pl-inr-gold", productId: "prod-laptop", discountPct: 20, minQty: 5 };

  it("variant-specific rule beats product rule; variant extra still added", () => {
    const r = resolvePrice({ customer: acme, product: laptop, variant: laptop32, ...base, priceRules: [productRule, variantRule] });
    expect(r.priceSource.ruleId).toBe("pr-test-variant");
    expect(r.unitPrice).toBe("57000.00"); // 49000 fixed + 8000 extra
  });

  it("product rule applies to other variants (discount basis)", () => {
    const laptop16 = byId(variants, "var-laptop-16-512");
    const r = resolvePrice({ customer: acme, product: laptop, variant: laptop16, ...base, priceRules: [productRule, variantRule] });
    expect(r.priceSource).toEqual({ priceListId: "pl-inr-gold", ruleId: "pr-test-product", basis: "DISCOUNT" });
    expect(r.unitPrice).toBe("45000.00");
  });

  it("minQty rule applies only when quantity ≥ minQty", () => {
    const below = resolvePrice({ customer: acme, product: laptop, ...base, priceRules: [bulkRule], quantity: 4 });
    expect(below.priceSource.basis).toBe("BASE");
    expect(below.unitPrice).toBe("50000.00");

    const atMin = resolvePrice({ customer: acme, product: laptop, ...base, priceRules: [bulkRule], quantity: 5 });
    expect(atMin.priceSource.ruleId).toBe("pr-test-bulk");
    expect(atMin.unitPrice).toBe("40000.00");

    const defaultQty = resolvePrice({ customer: acme, product: laptop, ...base, priceRules: [bulkRule] });
    expect(defaultQty.priceSource.basis).toBe("BASE");
  });

  it("prefers the highest satisfied minQty among equally specific rules", () => {
    const r = resolvePrice({ customer: acme, product: laptop, ...base, priceRules: [productRule, bulkRule], quantity: 10 });
    expect(r.priceSource.ruleId).toBe("pr-test-bulk");
  });

  it("rejects non-positive quantity", () => {
    expectFailure(() => resolvePrice({ customer: acme, product: laptop, ...base, quantity: 0 }), "INVALID_INPUT", "quantity");
  });
});

describe("resolvePrice — validation", () => {
  it("rejects a variant that does not belong to the product", () => {
    expectFailure(
      () => resolvePrice({ customer: acme, product: laptop, variant: mouseWhite, ...base }),
      "INVALID_INPUT",
      "does not belong",
    );
  });

  it("rejects archived product", () => {
    const archived: Product = { ...laptop, active: false, archivedAt: "2026-09-05T00:00:00.000Z" };
    expectFailure(() => resolvePrice({ customer: acme, product: archived, ...base }), "INVALID_INPUT", "archived");
  });

  it("rejects inactive variant", () => {
    expectFailure(
      () => resolvePrice({ customer: acme, product: laptop, variant: { ...laptop32, active: false }, ...base }),
      "INVALID_INPUT",
      "inactive",
    );
  });

  it("rejects missing or inactive tax rate", () => {
    expectFailure(() => resolvePrice({ customer: acme, product: { ...laptop, taxRateId: "tax-nope" }, ...base }), "INVALID_INPUT", "Tax rate");
    const inactiveTax = taxRates.map((t) => (t.id === "tax-zero" ? { ...t, active: false } : t));
    expectFailure(() => resolvePrice({ customer: acme, product: laptop, ...base, taxRates: inactiveTax }), "INVALID_INPUT", "inactive");
  });

  it("rejects non-finite or negative money", () => {
    expectFailure(() => resolvePrice({ customer: acme, product: { ...laptop, basePrice: "abc" }, ...base }), "INVALID_INPUT", "basePrice");
    expectFailure(() => resolvePrice({ customer: acme, product: { ...laptop, baseCost: "-1" }, ...base }), "INVALID_INPUT", "baseCost");
  });
});

describe("searchCatalog", () => {
  const data = { customer: acme, products, variants, priceLists, priceRules, taxRates };

  it("returns every active product priced for the customer with its variants", () => {
    const items = searchCatalog({ customerId: acme.id }, data);
    expect(items.map((i) => i.product.id).sort()).toEqual(products.map((p) => p.id).sort());
    const laptopItem = items.find((i) => i.product.id === "prod-laptop")!;
    expect(laptopItem.variants).toHaveLength(2);
    expect(laptopItem.resolved.unitPrice).toBe("50000.00");
    expect(laptopItem.resolved.variantId).toBeUndefined();
  });

  it("filters by case-insensitive query on name/description/sku and by category", () => {
    expect(searchCatalog({ customerId: acme.id, query: "probook" }, data).map((i) => i.product.id)).toEqual(["prod-laptop"]);
    expect(searchCatalog({ customerId: acme.id, query: "NMOUSE-WHT" }, data).map((i) => i.product.id)).toEqual(["prod-mouse"]);
    expect(searchCatalog({ customerId: acme.id, query: "billed" }, data).map((i) => i.product.id).sort()).toEqual([
      "prod-backup",
      "prod-support",
    ]);
    expect(searchCatalog({ customerId: acme.id, category: "ACCESSORIES" }, data).map((i) => i.product.id).sort()).toEqual([
      "prod-dock",
      "prod-mouse",
    ]);
  });

  it("excludes archived always and inactive unless includeInactive", () => {
    const tweaked = products.map((p) =>
      p.id === "prod-mouse"
        ? { ...p, active: false }
        : p.id === "prod-dock"
          ? { ...p, active: false, archivedAt: "2026-09-05T00:00:00.000Z" }
          : p,
    );
    const ids = (includeInactive?: boolean) =>
      searchCatalog({ customerId: acme.id, includeInactive }, { ...data, products: tweaked }).map((i) => i.product.id);
    expect(ids()).not.toContain("prod-mouse");
    expect(ids()).not.toContain("prod-dock");
    expect(ids(true)).toContain("prod-mouse");
    expect(ids(true)).not.toContain("prod-dock");
  });
});
