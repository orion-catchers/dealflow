/**
 * Report service — orchestrates repository reads + pure engine functions.
 *
 * Scope rules: ADMIN / SALES_MANAGER / FINANCE see everything; SALES_REP is forced to its
 * own `repId`; CUSTOMER is forbidden. Aggregates and exports run on the SAME filtered
 * dataset (`ReportAggregates.rows`), so a PDF/XLSX always matches the dashboard numbers.
 */
import type { Actor, ExportFormat, ProductCategory, ReportAggregates, ReportFilters, SalesTeam } from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";
import { requireRole } from "@/server/lib/auth/dev-actor";
import { aggregateReport } from "./engine/aggregate";
import { buildPdf } from "./engine/export-pdf";
import { buildXlsx } from "./engine/export-xlsx";
import { filterRecords } from "./engine/filter";
import { DEFAULT_REPORT_TIME_ZONE, resolvePeriod } from "./engine/period";
import { getReportRepository, type ReportProductInfo, type ReportRepInfo, type ReportRepository } from "./repository";

export interface ReportExportResult {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}

export interface ReportFilterOptions {
  teams: SalesTeam[];
  reps: ReportRepInfo[];
  products: ReportProductInfo[];
  categories: ProductCategory[];
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  PDF: "application/pdf",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const EXTENSIONS: Record<ExportFormat, string> = { PDF: "pdf", XLSX: "xlsx" };

const ALL_CATEGORIES: ProductCategory[] = ["HARDWARE", "ACCESSORIES", "SERVICES", "SUBSCRIPTIONS"];

/** Provenance label for exports; computed here so the pure exporters never read env. */
export function exportSourceLabel(nodeEnv: string | undefined = process.env.NODE_ENV): string {
  return nodeEnv !== "production" ? "Generated from stored records; DEV FIXTURE data" : "Generated from stored records";
}

export class ReportService {
  constructor(
    private readonly repo: ReportRepository = getReportRepository(),
    private readonly timeZone: string = DEFAULT_REPORT_TIME_ZONE,
  ) {}

  /** Apply role scope to the requested filters. Throws FORBIDDEN for customers. */
  scopeFilters(filters: ReportFilters, actor: Actor): ReportFilters {
    requireRole(actor, "ADMIN", "SALES_MANAGER", "FINANCE", "SALES_REP");
    if (actor.role === "SALES_REP") {
      if (filters.repId && filters.repId !== actor.id) {
        throw new ApiFailure("FORBIDDEN", "Sales reps can only report on their own quotes");
      }
      return { ...filters, repId: actor.id };
    }
    return filters;
  }

  async run(filters: ReportFilters, actor: Actor, now: Date = new Date()): Promise<ReportAggregates> {
    const scoped = this.scopeFilters(filters, actor);
    const range = resolvePeriod(scoped, now, this.timeZone);
    const [records, teams] = await Promise.all([this.repo.listQuoteRecords(), this.repo.listTeams()]);
    const rows = filterRecords(records, scoped, range, teams, this.timeZone);
    return aggregateReport(rows, scoped, range);
  }

  async export(filters: ReportFilters, format: ExportFormat, actor: Actor, now: Date = new Date()): Promise<ReportExportResult> {
    const agg = await this.run(filters, actor, now);
    const options = { sourceLabel: exportSourceLabel() };
    const bytes = format === "PDF" ? await buildPdf(agg, options) : buildXlsx(agg, options);
    return {
      bytes,
      filename: `dealflow-report-${agg.resolvedRange.from}_${agg.resolvedRange.to}.${EXTENSIONS[format]}`,
      contentType: CONTENT_TYPES[format],
    };
  }

  /** Dropdown data for the reporting screen. SALES_REP only sees itself in `reps`. */
  async filterOptions(actor: Actor): Promise<ReportFilterOptions> {
    requireRole(actor, "ADMIN", "SALES_MANAGER", "FINANCE", "SALES_REP");
    const [teams, reps, products] = await Promise.all([this.repo.listTeams(), this.repo.listReps(), this.repo.listProducts()]);
    const visibleReps = actor.role === "SALES_REP" ? reps.filter((r) => r.id === actor.id) : reps;
    return { teams, reps: visibleReps, products, categories: ALL_CATEGORIES };
  }
}

let cached: ReportService | undefined;

export function getReportService(): ReportService {
  if (!cached) cached = new ReportService();
  return cached;
}
