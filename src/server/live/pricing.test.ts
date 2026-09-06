import { describe, expect, it } from "vitest";
import type { DataState, Quote } from "@/contracts/application";
import { applyAtharvaEvaluation, displayCustomerTier, policySnapshot } from "./pricing";

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
