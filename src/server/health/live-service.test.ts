import { describe, expect, it } from "vitest";
import { toContractFlagType, toDbFlagType } from "./flag-type";
import { quoteListItem } from "@/server/quotes/http";
import type { Quote } from "@/contracts/atharva";

describe("health flag type mapping", () => {
  it("round-trips stalled quote names between contract and Prisma", () => {
    expect(toDbFlagType("STALLED_QUOTE")).toBe("STALLED");
    expect(toContractFlagType("STALLED")).toBe("STALLED_QUOTE");
    expect(toDbFlagType("DELIVERY_RISK")).toBe("DELIVERY_RISK");
  });
});

describe("quote list projection", () => {
  it("exposes the current revision for pipeline cards", () => {
    const current = {
      id: "rev-2",
      quoteId: "q1",
      revisionNumber: 2,
      createdAt: "2026-09-05T00:00:00.000Z",
      createdBy: "rep-1",
      currency: "INR" as const,
      lines: [],
      pricing: {
        lines: [],
        totals: {
          currency: "INR" as const,
          oneTimeTotal: "0.00",
          recurringTotals: {},
          taxTotal: "0.00",
          costTotal: "0.00",
          marginTotal: "0.00",
          marginPct: "0.00",
        },
        orderDiscountPct: "0",
        effectiveDiscountPct: "0",
      },
      evaluation: {
        status: "NOT_REQUIRED" as const,
        riskLevel: "NONE" as const,
        requiredApprovalChain: [],
        breaches: [],
        weightedExcessPct: "0",
        worstLineExcessPct: "0",
        reasons: [],
        policySnapshot: {
          policyVersionId: "p1",
          capturedAt: "2026-09-05T00:00:00.000Z",
          rules: {
            tierId: "GOLD",
            tierName: "Gold",
            defaultCeilingPct: "15",
            categoryCeilingsPct: {},
            managerThresholdPct: "0",
            financeWorstLineThresholdPct: "5",
            financeWeightedThresholdPct: "3",
            minimumHistorySamples: 3,
          },
        },
      },
      approvalStatus: "NOT_REQUIRED" as const,
    };
    const quote: Quote = {
      id: "q1",
      customerId: "c1",
      salesRepId: "r1",
      stage: "DRAFT",
      currentRevisionId: "rev-2",
      currentRevisionNumber: 2,
      lastBusinessActivityAt: "2026-09-05T00:00:00.000Z",
      revisions: [current],
    };
    expect(quoteListItem(quote).currentRevision?.id).toBe("rev-2");
  });
});
