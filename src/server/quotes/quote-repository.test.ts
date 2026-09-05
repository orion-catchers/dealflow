import { describe, expect, it } from "vitest";
import {
  InMemoryQuoteRepository,
  QuoteRepositoryError,
} from "./quote-repository";
import type { PolicyEvaluation } from "@/contracts/atharva";
import { priceQuote } from "@/features/quotes/engine/pricing";

const evaluation: PolicyEvaluation = {
  status: "NOT_REQUIRED",
  riskLevel: "NONE",
  requiredApprovalChain: [],
  breaches: [],
  weightedExcessPct: "0.00",
  worstLineExcessPct: "0.00",
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

const quoteLine = {
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

function input() {
  const pricing = priceQuote({
    currency: "INR",
    lines: [quoteLine],
    orderDiscountPct: "0",
  });
  return {
    quoteId: "quote-1",
    customerId: "customer-acme",
    salesRepId: "rep-arjun",
    currency: "INR" as const,
    createdBy: "rep-arjun",
    createdAt: "2026-09-05T00:00:00.000Z",
    lines: pricing.lines,
    pricing,
    evaluation,
  };
}

describe("InMemoryQuoteRepository", () => {
  it("creates, scopes, and revisions quotes without mutating old revisions", () => {
    const repository = new InMemoryQuoteRepository();
    const created = repository.create(input());
    const revised = repository.createRevision({
      ...input(),
      quoteId: created.id,
      revisionId: "revision-2",
      expectedRevision: 1,
      createdAt: "2026-09-05T01:00:00.000Z",
      lines: [{ ...created.revisions[0].lines[0], discountPct: "5" }],
    });

    expect(repository.list({ customerId: "customer-acme" })).toHaveLength(1);
    expect(revised.currentRevisionNumber).toBe(2);
    expect(
      repository.getRevision(created.id, created.currentRevisionId)
        .revisionNumber,
    ).toBe(1);
    expect(revised.revisions).toHaveLength(2);
  });

  it("rejects stale revisions and confirmed quote edits", () => {
    const repository = new InMemoryQuoteRepository();
    const created = repository.create(input());
    const revisionInput = {
      ...input(),
      quoteId: created.id,
      revisionId: "revision-2",
      expectedRevision: 1,
    };
    repository.createRevision(revisionInput);

    expect(() => repository.createRevision(revisionInput)).toThrowError(
      expect.objectContaining({ code: "CONFLICT" }),
    );
  });

  it("rejects empty quote and missing line removal", () => {
    const repository = new InMemoryQuoteRepository();
    expect(() => repository.create({ ...input(), lines: [] })).toThrowError(
      QuoteRepositoryError,
    );
    const created = repository.create(input());
    const missingLineInput = {
      ...input(),
      quoteId: created.id,
      revisionId: "revision-missing-line",
      expectedRevision: 1,
    };
    expect(() =>
      repository.removeLine(missingLineInput, "missing"),
    ).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
  });
});
