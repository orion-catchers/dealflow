/**
 * Spreadsheet export — pure. Serialises a `ReportAggregates` (the SAME filtered dataset the
 * dashboard shows) into an .xlsx workbook using SheetJS (`xlsx@0.18.5`).
 */
import * as XLSX from "xlsx";
import type { ReportAggregates } from "@/contracts/harsh";

export interface ExportOptions {
  /** Provenance note printed in the Summary sheet / PDF header; the caller decides the text. */
  sourceLabel?: string;
}

type Cell = string | number;

function describeFilters(agg: ReportAggregates): [string, Cell][] {
  const f = agg.filters;
  return [
    ["Period", f.period],
    ["Range from (inclusive)", agg.resolvedRange.from],
    ["Range to (exclusive)", agg.resolvedRange.to],
    ["Team", f.teamId ?? "All"],
    ["Rep", f.repId ?? "All"],
    ["Approval status", f.approvalStatus ?? "ALL"],
    ["Product", f.productId ?? "All"],
    ["Category", f.category ?? "All"],
  ];
}

export function buildXlsx(agg: ReportAggregates, options: ExportOptions = {}): Uint8Array {
  const wb = XLSX.utils.book_new();

  // --- Summary ------------------------------------------------------------------------
  const summary: Cell[][] = [
    ["DealFlow360 - Sales Report"],
    [options.sourceLabel ?? "Generated from stored records"],
    [],
    ["Filters", ""],
    ...describeFilters(agg),
    [],
    ["Sales", ""],
    ["Quotes", agg.sales.quoteCount],
    ["Confirmed orders", agg.sales.confirmedOrderCount],
    ["Confirmed one-time revenue", Number(agg.sales.confirmedOneTimeRevenue)],
    ["Confirmed monthly recurring", Number(agg.sales.confirmedMonthlyRecurring)],
    ["Pipeline value", Number(agg.sales.pipelineValue)],
    ["Average weighted discount %", agg.sales.averageWeightedDiscountPct],
    ["Conversion rate %", agg.sales.conversionRatePct],
    [],
    ["Approvals", ""],
    ["Pending", agg.approvals.pending],
    ["Approved", agg.approvals.approved],
    ["Rejected", agg.approvals.rejected],
    ["Not required", agg.approvals.notRequired],
    ["Manager only", agg.approvals.managerOnly],
    ["Manager + Finance", agg.approvals.managerFinance],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet["!cols"] = [{ wch: 32 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  // --- By Rep -------------------------------------------------------------------------
  const repSheet = XLSX.utils.json_to_sheet(
    agg.byRep.map((r) => ({
      "Rep ID": r.repId,
      Rep: r.repName,
      Quotes: r.quoteCount,
      Confirmed: r.confirmedCount,
      "Confirmed one-time revenue": Number(r.confirmedOneTimeRevenue),
      "Avg discount %": r.averageDiscountPct,
    })),
    { header: ["Rep ID", "Rep", "Quotes", "Confirmed", "Confirmed one-time revenue", "Avg discount %"] },
  );
  XLSX.utils.book_append_sheet(wb, repSheet, "By Rep");

  // --- By Product ---------------------------------------------------------------------
  const productSheet = XLSX.utils.json_to_sheet(
    agg.byProduct.map((p) => ({
      "Product ID": p.productId,
      Product: p.productName,
      Category: p.category,
      "Units quoted": p.unitsQuoted,
      "Units confirmed": p.unitsConfirmed,
      "Net revenue": Number(p.netRevenue),
      "Avg discount %": p.averageDiscountPct,
    })),
    { header: ["Product ID", "Product", "Category", "Units quoted", "Units confirmed", "Net revenue", "Avg discount %"] },
  );
  XLSX.utils.book_append_sheet(wb, productSheet, "By Product");

  // --- By Stage -----------------------------------------------------------------------
  const stageSheet = XLSX.utils.json_to_sheet(
    agg.byStage.map((s) => ({ Stage: s.stage, Count: s.count, Value: Number(s.value) })),
    { header: ["Stage", "Count", "Value"] },
  );
  XLSX.utils.book_append_sheet(wb, stageSheet, "By Stage");

  // --- Quotes (rows) ------------------------------------------------------------------
  const quotesSheet = XLSX.utils.json_to_sheet(
    agg.rows.map((q) => ({
      Number: q.quoteNumber,
      Customer: q.customerName,
      Rep: q.repName,
      Stage: q.stage,
      Approval: q.approvalStatus,
      Level: q.requiredApprovalLevel,
      "One-time": Number(q.oneTimeTotal),
      Monthly: Number(q.monthlyRecurringTotal),
      "Weighted %": q.weightedDiscountPct,
      Created: q.createdAt,
      Confirmed: q.confirmedAt ?? "",
    })),
    { header: ["Number", "Customer", "Rep", "Stage", "Approval", "Level", "One-time", "Monthly", "Weighted %", "Created", "Confirmed"] },
  );
  XLSX.utils.book_append_sheet(wb, quotesSheet, "Quotes");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(out);
}
