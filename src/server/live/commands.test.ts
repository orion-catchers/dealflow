import { describe, expect, it } from "vitest";
import type { Actor, DataState, Quote } from "@/contracts/application";
import { runLiveCommand } from "./commands";
import { AppError } from "@/server/errors";

function createMockState(): { state: DataState; quote: Quote } {
  const quote: Quote = {
    id: "q-1",
    name: "Acme",
    customerId: "c-1",
    repId: "rep-1",
    currency: "INR",
    revision: "r1",
    stage: "DRAFT",
    sent: false,
    lines: [
      {
        id: "line-1",
        productId: "prod-1",
        variantId: "var-1",
        description: "Widget A",
        quantity: 2,
        discountPct: 10,
        unitPrice: "100.00",
        unitCost: "50.00",
        taxPct: 18,
        tax: "32.40",
        net: "180.00",
        total: "212.40",
        profit: "80.00",
        interval: "ONE_TIME",
        stockTracked: true,
      },
      {
        id: "line-2",
        productId: "prod-1",
        variantId: "var-1",
        description: "Widget B",
        quantity: 1,
        discountPct: 5,
        unitPrice: "100.00",
        unitCost: "50.00",
        taxPct: 18,
        tax: "17.10",
        net: "95.00",
        total: "112.10",
        profit: "45.00",
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
    customers: [{ id: "c-1", name: "Acme", email: "a@x.test", tier: "Gold", currency: "INR", repId: "rep-1" }],
    products: [
      {
        id: "prod-1",
        name: "Widget",
        category: "Hardware",
        interval: "ONE_TIME",
        unit: "UNIT",
        description: "Widget",
        price: "100.00",
        cost: "50.00",
        taxPct: 18,
        active: true,
        stockTracked: true,
        planId: "",
        variants: [{ id: "var-1", name: "Standard", extraPrice: "0.00" }],
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
}

describe("runLiveCommand saveQuote", () => {
  const repActor: Actor = { id: "rep-1", name: "Alice Rep", email: "rep@example.test", role: "SALES_REP", active: true };

  it("does not delete unmentioned lines when saving quote", async () => {
    const { state, quote } = createMockState();
    const dirty = { quotes: new Map(), rules: false, messages: false };

    await runLiveCommand(
      state,
      repActor,
      "saveQuote",
      {
        id: quote.id,
        expectedRevision: "r1",
        customerId: "c-1",
        orderDiscountPct: 0,
        lines: [{ id: "line-1", quantity: 5, discountPct: 15 }],
      },
      dirty
    );

    expect(quote.lines).toHaveLength(2);
    expect(quote.lines.find((l) => l.id === "line-1")?.quantity).toBe(5);
    expect(quote.lines.find((l) => l.id === "line-1")?.discountPct).toBe(15);
    expect(quote.lines.find((l) => l.id === "line-2")?.quantity).toBe(1);
  });

  it("throws AppError 400 INVALID_ARGUMENT when discountPct > 100", async () => {
    const { state, quote } = createMockState();
    const dirty = { quotes: new Map(), rules: false, messages: false };

    await expect(
      runLiveCommand(
        state,
        repActor,
        "saveQuote",
        {
          id: quote.id,
          expectedRevision: "r1",
          customerId: "c-1",
          orderDiscountPct: 0,
          lines: [{ id: "line-1", quantity: 2, discountPct: 120 }],
        },
        dirty
      )
    ).rejects.toMatchObject({ status: 400, code: "INVALID_ARGUMENT" });
  });

  it("throws AppError 400 INVALID_ARGUMENT when orderDiscountPct > 100", async () => {
    const { state, quote } = createMockState();
    const dirty = { quotes: new Map(), rules: false, messages: false };

    await expect(
      runLiveCommand(
        state,
        repActor,
        "saveQuote",
        {
          id: quote.id,
          expectedRevision: "r1",
          customerId: "c-1",
          orderDiscountPct: 150,
          lines: [],
        },
        dirty
      )
    ).rejects.toMatchObject({ status: 400, code: "INVALID_ARGUMENT" });
  });
});

describe("runLiveCommand task RBAC", () => {
  const financeActor: Actor = { id: "fin-1", name: "Fin Ops", email: "fin@example.test", role: "FINANCE_OPS", active: true };

  it("allows FINANCE_OPS to create a task without 403 FORBIDDEN", async () => {
    const { state } = createMockState();
    const dirty = { quotes: new Map(), rules: false, messages: false };

    // When missing fields, it should throw 422 VALIDATION, NOT 403 FORBIDDEN
    try {
      await runLiveCommand(state, financeActor, "task", { id: "new" }, dirty);
    } catch (err) {
      expect((err as AppError).status).not.toBe(403);
      expect((err as AppError).code).not.toBe("FORBIDDEN");
    }
  });
});
