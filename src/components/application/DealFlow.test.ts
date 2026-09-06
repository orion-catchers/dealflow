import { describe, expect, it } from "vitest";
import type { Actor, Quote } from "@/contracts/application";
import { dealNextStep } from "./DealFlow";

function createMockQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: "q-1",
    name: "Acme Deal",
    customerId: "c-1",
    repId: "rep-1",
    currency: "INR",
    revision: "r2",
    stage: "UNDER_NEGOTIATION",
    sent: true,
    lines: [
      {
        id: "l-1",
        productId: "p-1",
        variantId: "v-1",
        description: "Laptop",
        quantity: 1,
        discountPct: 5,
        unitPrice: "1000.00",
        unitCost: "500.00",
        taxPct: 18,
        tax: "171.00",
        net: "950.00",
        total: "1121.00",
        profit: "450.00",
        interval: "ONE_TIME",
        stockTracked: true,
      },
    ],
    totals: [],
    orderDiscountPct: 0,
    promisedDate: null,
    history: [],
    events: [],
    evaluation: { status: "APPROVED", chain: [], step: 0, reasons: [], worstExcess: 0 },
    at: "2026-09-06T00:00:00.000Z",
    requestedDate: null,
    dateReviewPending: false,
    ...overrides,
  };
}

describe("dealNextStep copy attribution", () => {
  const repActor: Actor = { id: "rep-1", name: "Sarah Rep", email: "sarah@dealflow.test", role: "SALES_REP", active: true };

  it("does not attribute sales rep revision to customer", () => {
    const q = createMockQuote({
      stage: "UNDER_NEGOTIATION",
      sent: true,
      events: [
        { id: "e-1", at: "2026-09-06T01:00:00.000Z", actor: "Sarah Rep", text: "Terms revised", revision: "r2" },
      ],
    });

    const step = dealNextStep(q, { actor: repActor, customerName: "Acme Corp" });
    expect(step.detail).not.toContain("Acme Corp proposed Version 2");
    expect(step.detail).toContain("Acme Corp can accept Version 2 in their portal.");
  });

  it("attributes customer proposal to customer when proposed via portal", () => {
    const q = createMockQuote({
      stage: "UNDER_NEGOTIATION",
      sent: true,
      events: [
        { id: "e-1", at: "2026-09-06T01:00:00.000Z", actor: "Acme Corp", text: "Customer proposal submitted", revision: "r2" },
      ],
    });

    const step = dealNextStep(q, { actor: repActor, customerName: "Acme Corp" });
    expect(step.detail).toContain("Acme Corp proposed Version 2");
  });
});
