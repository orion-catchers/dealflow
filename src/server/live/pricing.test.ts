import { describe, expect, it } from "vitest";
import type { DataState, Product, Quote } from "@/contracts/application";
import { applyAtharvaEvaluation, displayCustomerTier, makeLine, policySnapshot, resolvedPrice } from "./pricing";

const actorQuote = (tier: string, discountPct: number): { state: DataState; quote: Quote } => {
  const quote: Quote = {
    id: "quote-test",
    name: "Acme",
    customerId: "customer-1",
    repId: "rep-1",
    currency: "INR",
    revision: "r1",
    stage: "DRAFT",
    sent: false,
    lines: [
      {
        id: "line-1",
        productId: "product-1",
        variantId: "variant-1",
        description: "Workstation",
        quantity: 2,
        discountPct,
        unitPrice: "18000.00",
        unitCost: "9000.00",
        taxPct: 18,
        tax: "0.00",
        net: "0.00",
        total: "0.00",
        profit: "0.00",
        interval: "ONE_TIME",
        stockTracked: true,
      },
    ],
    totals: [],
    orderDiscountPct: 0,
    promisedDate: null,
    history: [],
    events: [],
    evaluation: { status: "NOT_REQUIRED", chain: [], step: 0, reasons: [], worstExcess: 0 },
    at: "2026-09-06T00:00:00.000Z",
    requestedDate: null,
    dateReviewPending: false,
  };
  const state = {
    customers: [{ id: "customer-1", name: "Acme", email: "a@x.test", tier, currency: "INR", repId: "rep-1" }],
    products: [
      {
        id: "product-1",
        name: "Workstation",
        category: "Hardware",
        interval: "ONE_TIME",
        unit: "UNIT",
        description: "Workstation",
        price: "18000.00",
        cost: "9000.00",
        taxPct: 18,
        active: true,
        stockTracked: true,
        planId: "",
        variants: [{ id: "variant-1", name: "Standard", extraPrice: "0.00" }],
      },
    ],
    priceRules: [],
    quotes: [quote],
    orders: [],
    warehouses: [],
    stock: [],
    plans: [],
    subscriptions: [],
    invoices: [],
    payments: [],
    rules: [],
    proposals: [],
    messages: [],
    policy: {
      tierLimits: { Gold: 15, Silver: 10, Bronze: 5 },
      categoryLimits: { Hardware: 15, Services: 10 },
      financeExcess: 5,
      financeWeighted: 8,
      budget: "0.00",
    },
    healthSettings: { stalledDays: 5, anomalyPoints: 10, minimumHistory: 3 },
    flags: [],
    tasks: [],
    users: [],
  } as unknown as DataState;
  return { state, quote };
};

describe("applyAtharvaEvaluation", () => {
  it("persists discounted net before tax for qty 2 × 18000 at 50%", () => {
    const { state, quote } = actorQuote("Gold", 50);
    applyAtharvaEvaluation(state, quote);
    expect(quote.lines[0]?.net).toBe("18000.00");
    expect(quote.lines[0]?.tax).toBe("3240.00");
    expect(quote.lines[0]?.total).toBe("21240.00");
    expect(quote.totals[0]).toMatchObject({ net: "18000.00", tax: "3240.00", total: "21240.00" });
  });

  it("requires manager and finance when Bronze ceiling is breached", () => {
    const { state, quote } = actorQuote("Bronze", 50);
    expect(policySnapshot(state, quote).rules.tierName).toBe("Bronze");
    expect(policySnapshot(state, quote).rules.defaultCeilingPct).toBe("5");
    applyAtharvaEvaluation(state, quote);
    expect(quote.evaluation.status).toBe("PENDING");
    expect(quote.evaluation.chain).toEqual(["SALES_MANAGER", "FINANCE_OPS"]);
  });

  it("throws AppError 400 INVALID_ARGUMENT when discount exceeds 100", () => {
    const { state, quote } = actorQuote("Gold", 118);
    expect(() => applyAtharvaEvaluation(state, quote)).toThrowError(
      expect.objectContaining({ status: 400, code: "INVALID_ARGUMENT" })
    );
  });
});

describe("displayCustomerTier", () => {
  it("maps STANDARD and bronze aliases", () => {
    expect(displayCustomerTier("STANDARD")).toBe("Bronze");
    expect(displayCustomerTier("silver")).toBe("Silver");
  });
});

describe("resolvedPrice & price rule resolution", () => {
  const laptop: Product = {
    id: "prod-laptop",
    name: "Enterprise Laptop",
    category: "Hardware",
    interval: "ONE_TIME",
    unit: "UNIT",
    description: "Laptop",
    price: "50000.00",
    cost: "35000.00",
    taxPct: 18,
    active: true,
    stockTracked: true,
    planId: "",
    variants: [
      { id: "var-16gb", name: "16GB RAM", extraPrice: "0.00" },
      { id: "var-32gb", name: "32GB RAM", extraPrice: "8000.00" },
    ],
  };

  it("resolves variant-specific price rule directly without double-adding extraPrice", () => {
    const { state, quote } = actorQuote("Gold", 0);
    state.products.push(laptop);
    state.priceRules = [
      // Base product rule for Gold tier: 48,000
      { id: "r-base", productId: "prod-laptop", variantId: null, tier: "Gold", currency: "INR", price: "48000.00" },
      // Variant-specific rule for 32GB RAM: 54,000
      { id: "r-var", productId: "prod-laptop", variantId: "var-32gb", tier: "Gold", currency: "INR", price: "54000.00" },
    ];

    const price32GB = resolvedPrice(state, quote, laptop, "var-32gb");
    expect(price32GB).toBe("54000.00");
  });

  it("applies base product rule plus variant extraPrice when no variant-specific rule exists", () => {
    const { state, quote } = actorQuote("Gold", 0);
    state.products.push(laptop);
    state.priceRules = [
      { id: "r-base", productId: "prod-laptop", variantId: null, tier: "Gold", currency: "INR", price: "48000.00" },
    ];

    const price16GB = resolvedPrice(state, quote, laptop, "var-16gb");
    expect(price16GB).toBe("48000.00");

    const price32GB = resolvedPrice(state, quote, laptop, "var-32gb");
    expect(price32GB).toBe("56000.00"); // 48000 + 8000
  });

  it("falls back to product base price + variant extraPrice when no price rule exists", () => {
    const { state, quote } = actorQuote("Silver", 0);
    state.products.push(laptop);
    state.priceRules = []; // No rules for Silver

    const price32GB = resolvedPrice(state, quote, laptop, "var-32gb");
    expect(price32GB).toBe("58000.00"); // 50000 + 8000
  });

  it("handles tier matching case-insensitively and maps STANDARD to Bronze", () => {
    const { state, quote } = actorQuote("Bronze", 0);
    state.products.push(laptop);
    state.priceRules = [
      { id: "r-std", productId: "prod-laptop", variantId: null, tier: "STANDARD", currency: "INR", price: "49000.00" },
    ];

    const price = resolvedPrice(state, quote, laptop, "var-16gb");
    expect(price).toBe("49000.00");
  });

  it("creates quote line with resolved price and keeps line during applyAtharvaEvaluation", () => {
    const { state, quote } = actorQuote("Gold", 0);
    state.products.push(laptop);
    state.priceRules = [
      { id: "r-var", productId: "prod-laptop", variantId: "var-32gb", tier: "Gold", currency: "INR", price: "54000.00" },
    ];

    const line = makeLine(state, quote, laptop.id, "var-32gb", 1);
    expect(line.unitPrice).toBe("54000.00");

    quote.lines.push(line);
    applyAtharvaEvaluation(state, quote);

    expect(quote.lines).toHaveLength(2);
    expect(quote.lines[1]?.unitPrice).toBe("54000.00");
    expect(quote.lines[1]?.net).toBe("54000.00");
    expect(Number(quote.lines[1]?.profit)).toBeGreaterThan(0);
  });
});
