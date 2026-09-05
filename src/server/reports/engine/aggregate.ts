/**
 * Report aggregation — pure. Sums STORED totals from already-filtered records; never
 * recomputes pricing, discounts or approval policy (blueprint §4 Harsh, §7 "Reports").
 *
 * Money: decimal strings summed via Number() and emitted with `.toFixed(2)`.
 * Percent: 0–100 with one decimal.
 */
import type { Money, Pct, QuoteStageForReport, ReportAggregates, ReportFilters, ReportQuoteRecord } from "@/contracts/harsh";
import { selectLines } from "./filter";
import type { ResolvedRange } from "./period";

/** Canonical stage order used for `byStage` (all stages emitted, zero-filled). */
export const STAGE_ORDER: readonly QuoteStageForReport[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "UNDER_NEGOTIATION",
  "CONFIRMED",
  "REJECTED",
];

const PIPELINE_STAGES: ReadonlySet<QuoteStageForReport> = new Set(["DRAFT", "PENDING_APPROVAL", "APPROVED", "UNDER_NEGOTIATION"]);

export function money(n: number): Money {
  return n.toFixed(2);
}

export function pct(n: number): Pct {
  return Math.round(n * 10) / 10;
}

function mean(values: number[]): Pct {
  if (values.length === 0) return 0;
  return pct(values.reduce((a, b) => a + b, 0) / values.length);
}

function quoteValue(r: ReportQuoteRecord): number {
  return Number(r.oneTimeTotal) + Number(r.monthlyRecurringTotal);
}

export function aggregateReport(records: ReportQuoteRecord[], filters: ReportFilters, range: ResolvedRange): ReportAggregates {
  // --- Sales -------------------------------------------------------------------------
  const confirmed = records.filter((r) => r.stage === "CONFIRMED");
  const draftCount = records.filter((r) => r.stage === "DRAFT").length;
  const confirmedOneTime = confirmed.reduce((s, r) => s + Number(r.oneTimeTotal), 0);
  const confirmedMonthly = confirmed.reduce((s, r) => s + Number(r.monthlyRecurringTotal), 0);
  const pipeline = records.filter((r) => PIPELINE_STAGES.has(r.stage)).reduce((s, r) => s + quoteValue(r), 0);
  const conversionDenominator = records.length - draftCount;

  const sales: ReportAggregates["sales"] = {
    quoteCount: records.length,
    confirmedOrderCount: confirmed.length,
    confirmedOneTimeRevenue: money(confirmedOneTime),
    confirmedMonthlyRecurring: money(confirmedMonthly),
    pipelineValue: money(pipeline),
    averageWeightedDiscountPct: mean(records.map((r) => r.weightedDiscountPct)),
    conversionRatePct: conversionDenominator > 0 ? pct((confirmed.length / conversionDenominator) * 100) : 0,
  };

  // --- Approvals ---------------------------------------------------------------------
  // SUPERSEDED is intentionally counted in no bucket; the row still appears in `rows`.
  const approvals: ReportAggregates["approvals"] = {
    pending: records.filter((r) => r.approvalStatus === "PENDING").length,
    approved: records.filter((r) => r.approvalStatus === "APPROVED").length,
    rejected: records.filter((r) => r.approvalStatus === "REJECTED").length,
    notRequired: records.filter((r) => r.approvalStatus === "NOT_REQUIRED").length,
    managerOnly: records.filter((r) => r.requiredApprovalLevel === "MANAGER").length,
    managerFinance: records.filter((r) => r.requiredApprovalLevel === "MANAGER_FINANCE").length,
  };

  // --- By rep ------------------------------------------------------------------------
  const repMap = new Map<string, { repName: string; quoteCount: number; confirmedCount: number; revenue: number; discounts: number[] }>();
  for (const r of records) {
    const entry = repMap.get(r.repId) ?? { repName: r.repName, quoteCount: 0, confirmedCount: 0, revenue: 0, discounts: [] };
    entry.quoteCount += 1;
    entry.discounts.push(r.weightedDiscountPct);
    if (r.stage === "CONFIRMED") {
      entry.confirmedCount += 1;
      entry.revenue += Number(r.oneTimeTotal);
    }
    repMap.set(r.repId, entry);
  }
  const byRep: ReportAggregates["byRep"] = [...repMap.entries()]
    .map(([repId, e]) => ({
      repId,
      repName: e.repName,
      quoteCount: e.quoteCount,
      confirmedCount: e.confirmedCount,
      confirmedOneTimeRevenue: money(e.revenue),
      averageDiscountPct: mean(e.discounts),
    }))
    .sort((a, b) => Number(b.confirmedOneTimeRevenue) - Number(a.confirmedOneTimeRevenue) || a.repName.localeCompare(b.repName));

  // --- By product (matching lines only; see selectLines) -----------------------------
  const productMap = new Map<
    string,
    { productName: string; category: ReportAggregates["byProduct"][number]["category"]; unitsQuoted: number; unitsConfirmed: number; netRevenue: number; discounts: number[] }
  >();
  for (const r of records) {
    const isConfirmed = r.stage === "CONFIRMED";
    for (const l of selectLines(r, filters)) {
      const entry = productMap.get(l.productId) ?? {
        productName: l.productName,
        category: l.category,
        unitsQuoted: 0,
        unitsConfirmed: 0,
        netRevenue: 0,
        discounts: [],
      };
      entry.unitsQuoted += l.quantity;
      entry.discounts.push(l.effectiveDiscountPct);
      if (isConfirmed) {
        entry.unitsConfirmed += l.quantity;
        entry.netRevenue += Number(l.netAmount);
      }
      productMap.set(l.productId, entry);
    }
  }
  const byProduct: ReportAggregates["byProduct"] = [...productMap.entries()]
    .map(([productId, e]) => ({
      productId,
      productName: e.productName,
      category: e.category,
      unitsQuoted: e.unitsQuoted,
      unitsConfirmed: e.unitsConfirmed,
      netRevenue: money(e.netRevenue),
      averageDiscountPct: mean(e.discounts),
    }))
    .sort((a, b) => Number(b.netRevenue) - Number(a.netRevenue) || a.productName.localeCompare(b.productName));

  // --- By stage ----------------------------------------------------------------------
  const byStage: ReportAggregates["byStage"] = STAGE_ORDER.map((stage) => {
    const inStage = records.filter((r) => r.stage === stage);
    return { stage, count: inStage.length, value: money(inStage.reduce((s, r) => s + quoteValue(r), 0)) };
  });

  return {
    filters,
    resolvedRange: { from: range.from, to: range.to },
    sales,
    approvals,
    byRep,
    byProduct,
    byStage,
    rows: records,
  };
}
