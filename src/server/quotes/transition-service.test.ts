import { describe, expect, it } from "vitest";
import type { Actor, PolicyEvaluation } from "@/contracts/atharva";
import { priceQuote } from "@/features/quotes/engine/pricing";
import { InMemoryQuoteRepository } from "./quote-repository";
import {
  InMemoryQuoteTransitionService,
  QuoteTransitionError,
} from "./transition-service";

const customer: Actor = {
  id: "customer-neha",
  role: "CUSTOMER",
  customerId: "customer-acme",
};
const evaluation: PolicyEvaluation = {
  status: "NOT_REQUIRED",
  riskLevel: "NONE",
  requiredApprovalChain: [],
  breaches: [],
  weightedExcessPct: "0",
  worstLineExcessPct: "0",
  reasons: [],
  policySnapshot: {
    policyVersionId: "policy-1",
    capturedAt: "2026-09-05T00:00:00.000Z",
    rules: {
      tierId: "tier-gold",
      tierName: "Gold",
      defaultCeilingPct: "15",
      categoryCeilingsPct: {},
      managerThresholdPct: "0",
      financeWorstLineThresholdPct: "5",
      financeWeightedThresholdPct: "3",
      minimumHistorySamples: 3,
    },
  },
};
const inputLine = {
  productId: "product-laptop",
  category: "Hardware",
  description: "Laptop",
  quantity: 1,
  unitPrice: "100.00",
  unitCost: "50.00",
  taxPct: "0",
  discountPct: "0",
  billingInterval: "ONE_TIME" as const,
  stockTracked: true,
};

function setup() {
  const pricing = priceQuote({
    currency: "INR",
    lines: [inputLine],
    orderDiscountPct: "0",
  });
  const repository = new InMemoryQuoteRepository();
  repository.create({
    quoteId: "quote-1",
    customerId: "customer-acme",
    salesRepId: "rep-arjun",
    currency: "INR",
    createdBy: "rep-arjun",
    createdAt: "2026-09-05T00:00:00.000Z",
    lines: pricing.lines,
    pricing,
    evaluation,
  });
  return {
    repository,
    service: new InMemoryQuoteTransitionService(repository),
  };
}

describe("InMemoryQuoteTransitionService", () => {
  it("creates a proposal revision and enforces customer ownership", () => {
    const { service } = setup();
    const pricing = priceQuote({
      currency: "INR",
      lines: [{ ...inputLine, discountPct: "2" }],
      orderDiscountPct: "0",
    });
    const result = service.propose({
      quoteId: "quote-1",
      expectedRevision: 1,
      customer,
      body: "Please adjust the price",
      createdBy: customer.id,
      createdAt: "2026-09-05T01:00:00.000Z",
      currency: "INR",
      lines: pricing.lines,
      pricing,
      evaluation,
    });
    expect(result.quote.currentRevisionNumber).toBe(2);
    expect(service.getProposals("quote-1")).toHaveLength(1);
    expect(() =>
      service.propose({
        quoteId: "quote-1",
        expectedRevision: 2,
        customer: { ...customer, customerId: "customer-beta" },
        body: "No",
        createdBy: customer.id,
        createdAt: "2026-09-05T01:00:00.000Z",
        currency: "INR",
        lines: pricing.lines,
        pricing,
        evaluation,
      }),
    ).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("blocks pending approval and confirms one order on repeated request", async () => {
    const { repository, service } = setup();
    repository.setStage("quote-1", 1, "APPROVED", "2026-09-05T01:00:00.000Z");
    const accepted = service.accept({
      quoteId: "quote-1",
      expectedRevision: 1,
      customer,
      requestKey: "accept-1",
      createdAt: "2026-09-05T01:00:00.000Z",
    });
    expect(accepted.revisionId).toBe("quote-1-revision-1");
    const deps = {
      billing: { initialize: async () => "CONNECTED" as const },
      fulfillment: { initialize: async () => "CONNECTED" as const },
    };
    const first = await service.confirmOrder(
      {
        quoteId: "quote-1",
        expectedRevision: 1,
        customer,
        requestKey: "confirm-1",
        createdAt: "2026-09-05T01:00:00.000Z",
      },
      deps,
    );
    const second = await service.confirmOrder(
      {
        quoteId: "quote-1",
        expectedRevision: 1,
        customer,
        requestKey: "confirm-1",
        createdAt: "2026-09-05T01:00:00.000Z",
      },
      deps,
    );
    expect(second).toEqual(first);
  });
});
