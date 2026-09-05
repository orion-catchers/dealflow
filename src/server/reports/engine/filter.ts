/**
 * Report filtering — pure. Applies period / team / rep / approval / product / category
 * filters to stored `ReportQuoteRecord`s. Aggregates and exports both run on the output of
 * this function so they always describe the same dataset (blueprint §7 "Reports").
 */
import type { ReportFilters, ReportLineRecord, ReportQuoteRecord, SalesTeam } from "@/contracts/harsh";
import { DEFAULT_REPORT_TIME_ZONE, localDateOf, type ResolvedRange } from "./period";

/**
 * Period match: a quote belongs to the range when its `createdAt` OR its `confirmedAt`
 * (IST calendar date) falls in `[from, to)`. A quote created before the period but
 * confirmed inside it therefore counts — confirmed revenue lands in the period it closed.
 */
export function inPeriod(record: ReportQuoteRecord, range: ResolvedRange, timeZone: string = DEFAULT_REPORT_TIME_ZONE): boolean {
  const created = localDateOf(record.createdAt, timeZone);
  if (created >= range.from && created < range.to) return true;
  if (record.confirmedAt) {
    const confirmed = localDateOf(record.confirmedAt, timeZone);
    if (confirmed >= range.from && confirmed < range.to) return true;
  }
  return false;
}

/** Team match: record carries the teamId, or its rep is a member of the team. */
export function inTeam(record: ReportQuoteRecord, teamId: string, teams: SalesTeam[]): boolean {
  if (record.teamId === teamId) return true;
  const team = teams.find((t) => t.id === teamId);
  return team ? team.memberUserIds.includes(record.repId) : false;
}

export function matchesApproval(record: ReportQuoteRecord, status: ReportFilters["approvalStatus"]): boolean {
  if (!status || status === "ALL") return true;
  return record.approvalStatus === status;
}

/** True when the line satisfies the product / category filters (both optional, AND-ed). */
export function lineMatches(line: ReportLineRecord, filters: Pick<ReportFilters, "productId" | "category">): boolean {
  if (filters.productId && line.productId !== filters.productId) return false;
  if (filters.category && line.category !== filters.category) return false;
  return true;
}

/**
 * Lines of a record that the product/category filters select.
 *
 * Semantics when a product or category filter is set: the QUOTE is included when at least
 * one line matches, and quote-level metrics (quoteCount, revenue, pipeline, byRep, byStage)
 * count the WHOLE quote — the stored totals are facts about the quote, not the product.
 * Line-level metrics (byProduct) only count the MATCHING lines, so the product table never
 * shows products the user filtered out. Without product/category filters all lines match.
 */
export function selectLines(record: ReportQuoteRecord, filters: Pick<ReportFilters, "productId" | "category">): ReportLineRecord[] {
  if (!filters.productId && !filters.category) return record.lines;
  return record.lines.filter((l) => lineMatches(l, filters));
}

export function filterRecords(
  records: ReportQuoteRecord[],
  filters: ReportFilters,
  range: ResolvedRange,
  teams: SalesTeam[],
  timeZone: string = DEFAULT_REPORT_TIME_ZONE,
): ReportQuoteRecord[] {
  return records.filter((r) => {
    if (!inPeriod(r, range, timeZone)) return false;
    if (filters.teamId && !inTeam(r, filters.teamId, teams)) return false;
    if (filters.repId && r.repId !== filters.repId) return false;
    if (!matchesApproval(r, filters.approvalStatus)) return false;
    if ((filters.productId || filters.category) && selectLines(r, filters).length === 0) return false;
    return true;
  });
}
