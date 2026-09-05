import { describe, expect, it } from "vitest";
import type { ReportFilters, ReportQuoteRecord } from "@/contracts/harsh";
import { reportQuoteRecords, salesTeams } from "@/fixtures/harsh";
import { aggregateReport, STAGE_ORDER } from "./aggregate";
import { filterRecords } from "./filter";
import { resolvePeriod } from "./period";

const now = new Date("2026-09-05T05:30:00.000Z");
const ALL: ReportFilters = { period: "CUSTOM", from: "2026-08-01", to: "2026-10-01" };

function report(filters: ReportFilters, records: ReportQuoteRecord[] = reportQuoteRecords) {
  const range = resolvePeriod(filters, now);
  const rows = filterRecords(records, filters, range, salesTeams);
  return aggregateReport(rows, filters, range);
}

describe("aggregateReport — THIS_MONTH fixture assertions", () => {
  const agg = report({ period: "THIS_MONTH" });

  it("sales", () => {
    expect(agg.resolvedRange).toEqual({ from: "2026-09-01", to: "2026-10-01" });
    expect(agg.sales.quoteCount).toBe(3);
    expect(agg.sales.confirmedOrderCount).toBe(1);
    expect(agg.sales.confirmedOneTimeRevenue).toBe("466400.00");
    expect(agg.sales.confirmedMonthlyRecurring).toBe("9200.00");
    // pipeline: Q-1043 (434600 + 8400) + Q-1044 (20000 + 0)
    expect(agg.sales.pipelineValue).toBe("463000.00");
    // mean(11.9, 17.9, 0) = 9.933… → 9.9
    expect(agg.sales.averageWeightedDiscountPct).toBe(9.9);
    // 1 confirmed / (3 − 1 draft) = 50%
    expect(agg.sales.conversionRatePct).toBe(50);
  });

  it("approvals", () => {
    expect(agg.approvals).toEqual({ pending: 1, approved: 0, rejected: 0, notRequired: 2, managerOnly: 0, managerFinance: 1 });
  });

  it("rows are the filtered dataset", () => {
    expect(agg.rows.map((r) => r.quoteNumber).sort()).toEqual(["Q-1042", "Q-1043", "Q-1044"]);
    expect(agg.filters).toEqual({ period: "THIS_MONTH" });
  });
});

describe("aggregateReport — full range", () => {
  const agg = report(ALL);

  it("counts all six and both confirmed orders", () => {
    expect(agg.sales.quoteCount).toBe(6);
    expect(agg.sales.confirmedOrderCount).toBe(2);
    expect(agg.sales.confirmedOneTimeRevenue).toBe("653600.00"); // 466400 + 187200
    expect(agg.sales.confirmedMonthlyRecurring).toBe("9200.00");
    // pipeline: Q-1043 443000 + Q-1044 20000 + Q-1039 13500 (REJECTED excluded)
    expect(agg.sales.pipelineValue).toBe("476500.00");
    // 2 confirmed / (6 − 1 draft) = 40%
    expect(agg.sales.conversionRatePct).toBe(40);
  });

  it("approvals counts", () => {
    expect(agg.approvals).toEqual({ pending: 1, approved: 1, rejected: 1, notRequired: 3, managerOnly: 1, managerFinance: 2 });
  });

  it("byRep sorted by confirmed revenue desc then name", () => {
    expect(agg.byRep.map((r) => r.repId)).toEqual(["rep-arjun", "rep-priya", "rep-rohit"]);
    const arjun = agg.byRep[0];
    expect(arjun).toMatchObject({ repName: "Arjun Mehta", quoteCount: 2, confirmedCount: 1, confirmedOneTimeRevenue: "466400.00" });
    expect(arjun.averageDiscountPct).toBe(14.9); // mean(11.9, 17.9)
    expect(agg.byRep[2]).toMatchObject({ repId: "rep-rohit", confirmedOneTimeRevenue: "0.00", averageDiscountPct: 12.5 });
  });

  it("byProduct sorted by net revenue desc then name", () => {
    // net revenue (CONFIRMED only): laptop 627200, dock 26400, support 9200, then the two
    // zero-revenue products alphabetically ("Cloud Backup" before "Onsite Setup").
    expect(agg.byProduct.map((p) => p.productId)).toEqual(["prod-laptop", "prod-dock", "prod-support", "prod-backup", "prod-setup"]);
    const laptop = agg.byProduct[0];
    // units: 10 + 10 + 4 + 2 = 26 quoted; confirmed 10 (Q-1042) + 4 (Q-1040) = 14
    expect(laptop).toMatchObject({ productName: "Nexa ProBook 15", category: "HARDWARE", unitsQuoted: 26, unitsConfirmed: 14 });
    // net revenue: 10*50000*0.88 = 440000 + 4*52000*0.90 = 187200 → 627200
    expect(laptop.netRevenue).toBe("627200.00");
    // mean(12, 18, 10, 25) = 16.25 → 16.3
    expect(laptop.averageDiscountPct).toBe(16.3);
  });

  it("byStage emits every stage in canonical order with count and value", () => {
    expect(agg.byStage.map((s) => s.stage)).toEqual([...STAGE_ORDER]);
    const byStage = Object.fromEntries(agg.byStage.map((s) => [s.stage, s]));
    expect(byStage.DRAFT).toMatchObject({ count: 1, value: "20000.00" });
    expect(byStage.PENDING_APPROVAL).toMatchObject({ count: 1, value: "443000.00" });
    expect(byStage.APPROVED).toMatchObject({ count: 0, value: "0.00" });
    expect(byStage.UNDER_NEGOTIATION).toMatchObject({ count: 1, value: "13500.00" });
    expect(byStage.CONFIRMED).toMatchObject({ count: 2, value: "662800.00" }); // 475600 + 187200
    expect(byStage.REJECTED).toMatchObject({ count: 1, value: "97200.00" });
  });
});

describe("aggregateReport — product/category filters affect only line-level metrics", () => {
  it("productId prod-laptop → 4 quotes, byProduct only laptop", () => {
    const agg = report({ ...ALL, productId: "prod-laptop" });
    expect(agg.sales.quoteCount).toBe(4);
    expect(agg.byProduct.map((p) => p.productId)).toEqual(["prod-laptop"]);
    // quote-level revenue still counts whole quotes (Q-1042 incl. dock/support + Q-1040)
    expect(agg.sales.confirmedOneTimeRevenue).toBe("653600.00");
  });

  it("category SERVICES → 3 quotes, byProduct support + setup only", () => {
    const agg = report({ ...ALL, category: "SERVICES" });
    expect(agg.rows.map((r) => r.quoteNumber).sort()).toEqual(["Q-1042", "Q-1043", "Q-1044"]);
    expect(agg.byProduct.map((p) => p.productId).sort()).toEqual(["prod-setup", "prod-support"]);
    const support = agg.byProduct.find((p) => p.productId === "prod-support")!;
    expect(support).toMatchObject({ unitsQuoted: 20, unitsConfirmed: 10, netRevenue: "9200.00", averageDiscountPct: 12 });
  });
});

describe("aggregateReport — edge cases", () => {
  it("empty dataset yields zeros, not NaN", () => {
    const agg = report({ period: "CUSTOM", from: "2026-01-01", to: "2026-02-01" });
    expect(agg.sales).toEqual({
      quoteCount: 0,
      confirmedOrderCount: 0,
      confirmedOneTimeRevenue: "0.00",
      confirmedMonthlyRecurring: "0.00",
      pipelineValue: "0.00",
      averageWeightedDiscountPct: 0,
      conversionRatePct: 0,
    });
    expect(agg.byRep).toEqual([]);
    expect(agg.byProduct).toEqual([]);
    expect(agg.byStage).toHaveLength(STAGE_ORDER.length);
  });

  it("SUPERSEDED rows count in no approval bucket but stay in rows", () => {
    const superseded: ReportQuoteRecord = { ...reportQuoteRecords[0], quoteId: "q-x", quoteNumber: "Q-X", approvalStatus: "SUPERSEDED" };
    const agg = report(ALL, [superseded]);
    expect(agg.rows).toHaveLength(1);
    expect(agg.approvals.pending + agg.approvals.approved + agg.approvals.rejected + agg.approvals.notRequired).toBe(0);
  });

  it("conversion rate is 0 when only drafts exist", () => {
    const draft = reportQuoteRecords.find((r) => r.stage === "DRAFT")!;
    const agg = report(ALL, [draft]);
    expect(agg.sales.conversionRatePct).toBe(0);
  });
});
