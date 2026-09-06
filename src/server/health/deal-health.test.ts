import { describe, expect, it } from "vitest";
import { findHealthCandidates, reconcileHealthFlags } from "./deal-health";

const settings = {
  stalledAfterDays: 5,
  anomalyMinimumSamples: 3,
  anomalyMarginAboveAveragePct: "10",
};

describe("deal health", () => {
  it("detects stalled quotes, discount anomalies, and paid-undelivered orders", () => {
    const candidates = findHealthCandidates({
      now: "2026-09-10T00:00:00.000Z",
      settings,
      quotes: [
        {
          quoteId: "quote-stalled",
          stage: "UNDER_NEGOTIATION",
          lastBusinessActivityAt: "2026-09-01T00:00:00.000Z",
          currentEffectiveDiscountPct: "12",
          salesRepId: "rep-arjun",
          comparableConfirmedDiscounts: [],
        },
        {
          quoteId: "quote-sent-stalled",
          stage: "UNDER_NEGOTIATION",
          lastBusinessActivityAt: "2026-08-01T00:00:00.000Z",
          currentEffectiveDiscountPct: "8",
          salesRepId: "rep-arjun",
          comparableConfirmedDiscounts: [],
        },
        {
          quoteId: "quote-anomaly",
          stage: "UNDER_NEGOTIATION",
          lastBusinessActivityAt: "2026-09-09T00:00:00.000Z",
          currentEffectiveDiscountPct: "25",
          salesRepId: "rep-arjun",
          comparableConfirmedDiscounts: [
            {
              quoteId: "old-1",
              confirmedAt: "2026-09-01T00:00:00.000Z",
              effectiveDiscountPct: "10",
            },
            {
              quoteId: "old-2",
              confirmedAt: "2026-09-02T00:00:00.000Z",
              effectiveDiscountPct: "11",
            },
            {
              quoteId: "old-3",
              confirmedAt: "2026-09-03T00:00:00.000Z",
              effectiveDiscountPct: "12",
            },
          ],
        },
      ],
      orders: [
        {
          orderId: "order-paid",
          promisedDate: "2026-09-20",
          undeliveredGoodsQty: 1,
          unallocatedGoodsQty: 1,
          paid: true,
        },
      ],
    });
    expect(candidates.map((candidate) => candidate.type)).toEqual([
      "STALLED_QUOTE",
      "STALLED_QUOTE",
      "DISCOUNT_ANOMALY",
      "DELIVERY_RISK",
    ]);
  });

  it("does not duplicate active flags and resolves cleared conditions", () => {
    const active = reconcileHealthFlags(
      [],
      [
        {
          fingerprint: "STALLED_QUOTE:quote-1",
          type: "STALLED_QUOTE",
          quoteId: "quote-1",
          reason: "stalled",
        },
      ],
      "2026-09-10T00:00:00.000Z",
    );
    const repeated = reconcileHealthFlags(
      active,
      [
        {
          fingerprint: "STALLED_QUOTE:quote-1",
          type: "STALLED_QUOTE",
          quoteId: "quote-1",
          reason: "stalled",
        },
      ],
      "2026-09-11T00:00:00.000Z",
    );
    expect(repeated).toHaveLength(1);
    const resolved = reconcileHealthFlags(
      repeated,
      [],
      "2026-09-12T00:00:00.000Z",
    );
    expect(resolved[0].status).toBe("RESOLVED");
    const reactivated = reconcileHealthFlags(
      resolved,
      [
        {
          fingerprint: "STALLED_QUOTE:quote-1",
          type: "STALLED_QUOTE",
          quoteId: "quote-1",
          reason: "stalled again",
        },
      ],
      "2026-09-13T00:00:00.000Z",
    );
    expect(reactivated[0].status).toBe("ACTIVE");
  });
});
