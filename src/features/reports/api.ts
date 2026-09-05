/**
 * Request parsing for `/api/reports/*` — zod schemas over URLSearchParams.
 */
import { z } from "zod";
import type { ExportFormat, ReportFilters } from "@/contracts/harsh";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** Empty strings from cleared dropdowns and missing params (null) are treated as "not set". */
const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blankToUndefined, schema.optional());

export const reportFiltersSchema = z.object({
  period: z.preprocess(blankToUndefined, z.enum(["TODAY", "THIS_WEEK", "THIS_MONTH", "THIS_QUARTER", "CUSTOM"]).default("THIS_MONTH")),
  from: optional(isoDate),
  to: optional(isoDate),
  teamId: optional(z.string().min(1)),
  repId: optional(z.string().min(1)),
  approvalStatus: optional(z.enum(["ALL", "PENDING", "APPROVED", "REJECTED", "NOT_REQUIRED"])),
  productId: optional(z.string().min(1)),
  category: optional(z.enum(["HARDWARE", "ACCESSORIES", "SERVICES", "SUBSCRIPTIONS"])),
});

export const exportFormatSchema = z.enum(["PDF", "XLSX"]);

const FILTER_KEYS = ["period", "from", "to", "teamId", "repId", "approvalStatus", "productId", "category"] as const;

function pick(params: URLSearchParams, keys: readonly string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of keys) out[k] = params.get(k);
  return out;
}

/** Parse report filters from a query string; throws ZodError (→ INVALID_INPUT via `handle`). */
export function parseReportFilters(params: URLSearchParams): ReportFilters {
  const parsed = reportFiltersSchema.parse(pick(params, FILTER_KEYS));
  // Strip undefined keys so `filters` echoes cleanly in JSON / exports.
  const filters: ReportFilters = { period: parsed.period };
  if (parsed.from !== undefined) filters.from = parsed.from;
  if (parsed.to !== undefined) filters.to = parsed.to;
  if (parsed.teamId !== undefined) filters.teamId = parsed.teamId;
  if (parsed.repId !== undefined) filters.repId = parsed.repId;
  if (parsed.approvalStatus !== undefined) filters.approvalStatus = parsed.approvalStatus;
  if (parsed.productId !== undefined) filters.productId = parsed.productId;
  if (parsed.category !== undefined) filters.category = parsed.category;
  return filters;
}

export function parseExportFormat(params: URLSearchParams): ExportFormat {
  return exportFormatSchema.parse((params.get("format") ?? "").toUpperCase());
}
