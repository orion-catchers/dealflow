"use client";
/**
 * Screen 15 — Admin / Reporting Dashboard (client).
 *
 * Reads `ReportAggregates` from GET /api/reports, dropdown data from GET /api/reports/options
 * and downloads PDF/XLSX from GET /api/reports/export. Applied filters live in the URL query
 * string so a report can be shared or reloaded; the filter bar edits a draft copy until
 * "Apply" is pressed. No success feedback is shown before the server responds.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApprovalStatusFilter,
  ExportFormat,
  ProductCategory,
  ReportAggregates,
  ReportFilters,
  ReportPeriodPreset,
  ReportQuoteRecord,
} from "@/contracts/harsh";
import { Button, Card, DataTable, EmptyState, ErrorState, Input, Money, PageHeader, Select, StatusBadge, type Column } from "@/dev-adapter/ui";
import { api, ApiClientError, getDevActor } from "@/lib/api/client";
import type { ReportFilterOptions } from "../service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERIODS: { value: ReportPeriodPreset; label: string }[] = [
  { value: "TODAY", label: "Today" },
  { value: "THIS_WEEK", label: "This week" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "THIS_QUARTER", label: "This quarter" },
  { value: "CUSTOM", label: "Custom range" },
];
const PERIOD_VALUES = PERIODS.map((p) => p.value);

const APPROVAL_STATUSES: { value: ApprovalStatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "NOT_REQUIRED", label: "Not required" },
];
const APPROVAL_VALUES = APPROVAL_STATUSES.map((a) => a.value);

const CATEGORY_VALUES: ProductCategory[] = ["HARDWARE", "ACCESSORIES", "SERVICES", "SUBSCRIPTIONS"];

const STAGE_ORDER: ReportAggregates["byStage"][number]["stage"][] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "UNDER_NEGOTIATION",
  "CONFIRMED",
  "REJECTED",
];

const STAGE_BAR_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-400",
  PENDING_APPROVAL: "bg-amber-400",
  APPROVED: "bg-emerald-400",
  UNDER_NEGOTIATION: "bg-violet-400",
  CONFIRMED: "bg-blue-500",
  REJECTED: "bg-rose-400",
};

const DEFAULT_FILTERS: ReportFilters = { period: "THIS_MONTH" };
const REPORT_CURRENCY = "INR";
const REPORT_TIME_ZONE = "Asia/Kolkata";

// ---------------------------------------------------------------------------
// Filter <-> URL helpers (query param names match `src/features/reports/api.ts`)
// ---------------------------------------------------------------------------

function isOneOf<T extends string>(value: string | null, allowed: readonly T[]): value is T {
  return value !== null && (allowed as readonly string[]).includes(value);
}

function filtersFromParams(params: URLSearchParams): ReportFilters {
  const period = params.get("period");
  const f: ReportFilters = { period: isOneOf(period, PERIOD_VALUES) ? period : DEFAULT_FILTERS.period };
  const from = params.get("from");
  const to = params.get("to");
  if (from) f.from = from;
  if (to) f.to = to;
  const teamId = params.get("teamId");
  if (teamId) f.teamId = teamId;
  const repId = params.get("repId");
  if (repId) f.repId = repId;
  const approvalStatus = params.get("approvalStatus");
  if (isOneOf(approvalStatus, APPROVAL_VALUES)) f.approvalStatus = approvalStatus;
  const productId = params.get("productId");
  if (productId) f.productId = productId;
  const category = params.get("category");
  if (isOneOf(category, CATEGORY_VALUES)) f.category = category;
  return f;
}

function filtersToQuery(f: ReportFilters): string {
  const q = new URLSearchParams();
  q.set("period", f.period);
  if (f.period === "CUSTOM") {
    if (f.from) q.set("from", f.from);
    if (f.to) q.set("to", f.to);
  }
  if (f.teamId) q.set("teamId", f.teamId);
  if (f.repId) q.set("repId", f.repId);
  if (f.approvalStatus && f.approvalStatus !== "ALL") q.set("approvalStatus", f.approvalStatus);
  if (f.productId) q.set("productId", f.productId);
  if (f.category) q.set("category", f.category);
  return q.toString();
}

/** Client-side guard mirroring the server's CUSTOM validation so we fail before the request. */
function validateDraft(f: ReportFilters): string | null {
  if (f.period !== "CUSTOM") return null;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!f.from || !re.test(f.from) || !f.to || !re.test(f.to)) return "Custom range needs both From and To dates.";
  if (f.from >= f.to) return "From must be earlier than To (To is exclusive).";
  return null;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

function fmtDate(ts: string | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : dateFormatter.format(d);
}

function fmtPct(n: number): string {
  return `${Number.isFinite(n) ? n.toFixed(1) : "0.0"}%`;
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

function fmtLevel(level: ReportQuoteRecord["requiredApprovalLevel"]): string {
  switch (level) {
    case "MANAGER_FINANCE":
      return "Manager + Finance";
    case "MANAGER":
      return "Manager";
    default:
      return "None";
  }
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return `${e.message} (${e.code})`;
  if (e instanceof Error) return e.message;
  return "Unexpected error";
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? fallback;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ExportState = { busy: ExportFormat | null; error: string | null };

export function ReportsDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Applied filters come from the URL; the key changes only when the query string changes.
  const appliedKey = searchParams.toString();
  const applied = useMemo(() => filtersFromParams(new URLSearchParams(appliedKey)), [appliedKey]);
  const appliedQuery = useMemo(() => filtersToQuery(applied), [applied]);

  const [draft, setDraft] = useState<ReportFilters>(applied);
  const [draftError, setDraftError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(applied);
    setDraftError(null);
  }, [applied]);

  // Dropdown data.
  const [options, setOptions] = useState<ReportFilterOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const loadOptions = useCallback(async () => {
    setOptionsError(null);
    try {
      setOptions(await api<ReportFilterOptions>("/api/reports/options"));
    } catch (e) {
      setOptionsError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  // Aggregates.
  const [report, setReport] = useState<ReportAggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const loadReport = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api<ReportAggregates>(`/api/reports?${appliedQuery}`);
      if (seq !== requestSeq.current) return; // a newer request superseded this one
      setReport(data);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setError(errorMessage(e));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [appliedQuery]);
  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  // Export.
  const [exportState, setExportState] = useState<ExportState>({ busy: null, error: null });
  const handleExport = useCallback(
    async (format: ExportFormat) => {
      setExportState({ busy: format, error: null });
      try {
        const res = await fetch(`/api/reports/export?${appliedQuery}&format=${format}`, {
          headers: { "x-dev-actor": getDevActor() },
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
          const msg = body?.error?.message ?? `Export failed (${res.status})`;
          const code = body?.error?.code;
          throw new Error(code ? `${msg} (${code})` : msg);
        }
        const blob = await res.blob();
        const filename = filenameFromDisposition(res.headers.get("content-disposition"), `dealflow-report.${format.toLowerCase()}`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
        setExportState({ busy: null, error: null });
      } catch (e) {
        setExportState({ busy: null, error: errorMessage(e) });
      }
    },
    [appliedQuery],
  );

  // Filter bar handlers.
  const visibleReps = useMemo(() => {
    const reps = options?.reps ?? [];
    return draft.teamId ? reps.filter((r) => r.teamId === draft.teamId) : reps;
  }, [options, draft.teamId]);

  const updateDraft = (patch: Partial<ReportFilters>) => {
    setDraftError(null);
    setDraft((prev) => {
      const next: ReportFilters = { ...prev, ...patch };
      // Drop keys explicitly cleared (empty string from a "All …" option).
      (Object.keys(next) as (keyof ReportFilters)[]).forEach((k) => {
        if (k !== "period" && !next[k]) delete next[k];
      });
      // Changing team invalidates a rep outside that team.
      if (patch.teamId !== undefined && next.repId && options) {
        const rep = options.reps.find((r) => r.id === next.repId);
        if (next.teamId && rep && rep.teamId !== next.teamId) delete next.repId;
      }
      return next;
    });
  };

  const applyDraft = () => {
    const problem = validateDraft(draft);
    if (problem) {
      setDraftError(problem);
      return;
    }
    const qs = filtersToQuery(draft);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const resetDraft = () => {
    setDraft(DEFAULT_FILTERS);
    setDraftError(null);
    router.replace(pathname, { scroll: false });
  };

  // Derived view data.
  const rows = report?.rows ?? [];
  const isEmpty = !loading && !error && report !== null && rows.length === 0;
  const maxStageCount = Math.max(1, ...(report?.byStage.map((s) => s.count) ?? [0]));
  const stageRows = STAGE_ORDER.map((stage) => report?.byStage.find((s) => s.stage === stage) ?? { stage, count: 0, value: "0" });
  const exporting = exportState.busy !== null;
  const canExport = !loading && !error && report !== null && !exporting;

  // Columns.
  const repColumns: Column<ReportAggregates["byRep"][number]>[] = [
    { key: "rep", header: "Rep", render: (r) => r.repName },
    { key: "quotes", header: "Quotes", align: "right", render: (r) => fmtInt(r.quoteCount) },
    { key: "confirmed", header: "Confirmed", align: "right", render: (r) => fmtInt(r.confirmedCount) },
    { key: "revenue", header: "Revenue", align: "right", render: (r) => <Money amount={r.confirmedOneTimeRevenue} currency={REPORT_CURRENCY} /> },
    { key: "disc", header: "Avg discount", align: "right", render: (r) => fmtPct(r.averageDiscountPct) },
  ];

  const productColumns: Column<ReportAggregates["byProduct"][number]>[] = [
    { key: "product", header: "Product", render: (p) => p.productName },
    { key: "category", header: "Category", render: (p) => <span className="text-slate-600">{humanize(p.category)}</span> },
    { key: "quoted", header: "Units quoted", align: "right", render: (p) => fmtInt(p.unitsQuoted) },
    { key: "confirmed", header: "Units confirmed", align: "right", render: (p) => fmtInt(p.unitsConfirmed) },
    { key: "revenue", header: "Net revenue", align: "right", render: (p) => <Money amount={p.netRevenue} currency={REPORT_CURRENCY} /> },
    { key: "disc", header: "Avg discount", align: "right", render: (p) => fmtPct(p.averageDiscountPct) },
  ];

  const quoteColumns: Column<ReportQuoteRecord>[] = [
    { key: "number", header: "Number", className: "whitespace-nowrap font-medium text-slate-900", render: (q) => q.quoteNumber },
    { key: "customer", header: "Customer", className: "whitespace-nowrap", render: (q) => q.customerName },
    { key: "rep", header: "Rep", className: "whitespace-nowrap", render: (q) => q.repName },
    { key: "stage", header: "Stage", render: (q) => <StatusBadge status={q.stage} /> },
    { key: "approval", header: "Approval", render: (q) => <StatusBadge status={q.approvalStatus} /> },
    { key: "level", header: "Level", className: "whitespace-nowrap", render: (q) => fmtLevel(q.requiredApprovalLevel) },
    { key: "oneTime", header: "One-time", align: "right", className: "whitespace-nowrap", render: (q) => <Money amount={q.oneTimeTotal} currency={q.currency} /> },
    { key: "monthly", header: "Monthly", align: "right", className: "whitespace-nowrap", render: (q) => <Money amount={q.monthlyRecurringTotal} currency={q.currency} /> },
    { key: "weighted", header: "Weighted %", align: "right", render: (q) => fmtPct(q.weightedDiscountPct) },
    { key: "created", header: "Created", className: "whitespace-nowrap tabular-nums", render: (q) => fmtDate(q.createdAt) },
    { key: "confirmed", header: "Confirmed", className: "whitespace-nowrap tabular-nums", render: (q) => fmtDate(q.confirmedAt) },
  ];

  const sales = report?.sales;
  const approvals = report?.approvals;

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Sales, approval and product metrics computed from stored quote and order records. Exports use the same filtered dataset as the dashboard."
        actions={
          <>
            <StatusBadge status="DEV FIXTURE" label="DEV FIXTURE data" />
            <Button variant="secondary" disabled={!canExport} onClick={() => void handleExport("PDF")}>
              {exportState.busy === "PDF" ? "Exporting PDF…" : "Export PDF"}
            </Button>
            <Button variant="secondary" disabled={!canExport} onClick={() => void handleExport("XLSX")}>
              {exportState.busy === "XLSX" ? "Exporting XLSX…" : "Export XLSX"}
            </Button>
          </>
        }
      />

      {exportState.error ? (
        <div className="mb-4">
          <ErrorState message={`Export failed: ${exportState.error}`} onRetry={() => setExportState({ busy: null, error: null })} />
        </div>
      ) : null}

      {/* Filter bar */}
      <Card title="Filters" className="mb-6">
        {optionsError ? (
          <div className="mb-3">
            <ErrorState message={`Filter options failed to load: ${optionsError}`} onRetry={() => void loadOptions()} />
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-medium text-slate-600">
            Period
            <Select className="mt-1" value={draft.period} onChange={(e) => updateDraft({ period: e.target.value as ReportPeriodPreset })}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </label>
          {draft.period === "CUSTOM" ? (
            <>
              <label className="block text-xs font-medium text-slate-600">
                From (inclusive)
                <Input className="mt-1" type="date" value={draft.from ?? ""} onChange={(e) => updateDraft({ from: e.target.value })} />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                To (exclusive)
                <Input className="mt-1" type="date" value={draft.to ?? ""} onChange={(e) => updateDraft({ to: e.target.value })} />
              </label>
            </>
          ) : null}
          <label className="block text-xs font-medium text-slate-600">
            Team
            <Select className="mt-1" value={draft.teamId ?? ""} onChange={(e) => updateDraft({ teamId: e.target.value })} disabled={!options}>
              <option value="">All teams</option>
              {(options?.teams ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Rep
            <Select className="mt-1" value={draft.repId ?? ""} onChange={(e) => updateDraft({ repId: e.target.value })} disabled={!options}>
              <option value="">All reps</option>
              {visibleReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Approval status
            <Select
              className="mt-1"
              value={draft.approvalStatus ?? "ALL"}
              onChange={(e) => updateDraft({ approvalStatus: e.target.value as ApprovalStatusFilter })}
            >
              {APPROVAL_STATUSES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Product
            <Select className="mt-1" value={draft.productId ?? ""} onChange={(e) => updateDraft({ productId: e.target.value })} disabled={!options}>
              <option value="">All products</option>
              {(options?.products ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Category
            <Select
              className="mt-1"
              value={draft.category ?? ""}
              onChange={(e) => updateDraft({ category: (e.target.value || undefined) as ProductCategory | undefined })}
            >
              <option value="">All categories</option>
              {(options?.categories ?? CATEGORY_VALUES).map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={applyDraft} disabled={loading}>
            Apply
          </Button>
          <Button variant="secondary" onClick={resetDraft} disabled={loading}>
            Reset
          </Button>
          {draftError ? <span className="text-sm text-rose-700">{draftError}</span> : null}
          {report ? (
            <span className="ml-auto text-sm text-slate-600">
              Showing <span className="font-medium tabular-nums text-slate-900">{report.resolvedRange.from}</span> →{" "}
              <span className="font-medium tabular-nums text-slate-900">{report.resolvedRange.to}</span> (IST calendar dates, To exclusive)
            </span>
          ) : loading ? (
            <span className="ml-auto text-sm text-slate-500">Resolving period…</span>
          ) : null}
        </div>
      </Card>

      {error ? (
        <div className="mb-6">
          <ErrorState message={`Report failed to load: ${error}`} onRetry={() => void loadReport()} />
        </div>
      ) : null}

      {/* Sales metrics */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Sales</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Card title="Quotes">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{sales ? fmtInt(sales.quoteCount) : "—"}</p>
          </Card>
          <Card title="Confirmed orders">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{sales ? fmtInt(sales.confirmedOrderCount) : "—"}</p>
          </Card>
          <Card title="Confirmed one-time revenue">
            <p className="text-xl font-semibold text-slate-900">{sales ? <Money amount={sales.confirmedOneTimeRevenue} currency={REPORT_CURRENCY} /> : "—"}</p>
          </Card>
          <Card title="Confirmed monthly recurring">
            <p className="text-xl font-semibold text-slate-900">{sales ? <Money amount={sales.confirmedMonthlyRecurring} currency={REPORT_CURRENCY} /> : "—"}</p>
          </Card>
          <Card title="Pipeline value">
            <p className="text-xl font-semibold text-slate-900">{sales ? <Money amount={sales.pipelineValue} currency={REPORT_CURRENCY} /> : "—"}</p>
          </Card>
          <Card title="Avg weighted discount">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{sales ? fmtPct(sales.averageWeightedDiscountPct) : "—"}</p>
          </Card>
          <Card title="Conversion">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{sales ? fmtPct(sales.conversionRatePct) : "—"}</p>
          </Card>
        </div>
      </section>

      {/* Approvals + stage */}
      <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Approvals</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card title="Pending">
              <p className="text-2xl font-semibold tabular-nums text-amber-700">{approvals ? fmtInt(approvals.pending) : "—"}</p>
            </Card>
            <Card title="Approved">
              <p className="text-2xl font-semibold tabular-nums text-emerald-700">{approvals ? fmtInt(approvals.approved) : "—"}</p>
            </Card>
            <Card title="Rejected">
              <p className="text-2xl font-semibold tabular-nums text-rose-700">{approvals ? fmtInt(approvals.rejected) : "—"}</p>
            </Card>
            <Card title="Not required">
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{approvals ? fmtInt(approvals.notRequired) : "—"}</p>
            </Card>
            <Card title="Manager only">
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{approvals ? fmtInt(approvals.managerOnly) : "—"}</p>
            </Card>
            <Card title="Manager + Finance">
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{approvals ? fmtInt(approvals.managerFinance) : "—"}</p>
            </Card>
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">By stage</h2>
          <Card>
            {loading && !report ? (
              <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
            ) : (
              <ul className="space-y-2">
                {stageRows.map((s) => (
                  <li key={s.stage} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
                    <span className="truncate text-slate-700">{humanize(s.stage)}</span>
                    <div className="h-4 w-full overflow-hidden rounded bg-slate-100" aria-hidden="true">
                      <div
                        className={`h-full rounded ${STAGE_BAR_COLORS[s.stage] ?? "bg-slate-400"}`}
                        style={{ width: `${s.count === 0 ? 0 : Math.max(2, (s.count / maxStageCount) * 100)}%` }}
                      />
                    </div>
                    <span className="whitespace-nowrap text-right tabular-nums text-slate-700">
                      {fmtInt(s.count)} · <Money amount={s.value} currency={REPORT_CURRENCY} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      {isEmpty ? (
        <div className="mb-6">
          <EmptyState message="No quotes match these filters" />
        </div>
      ) : (
        <>
          <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">By rep</h2>
              <DataTable columns={repColumns} rows={report?.byRep ?? []} loading={loading} emptyMessage="No reps in range" rowKey={(r) => r.repId} />
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">By product</h2>
              <DataTable
                columns={productColumns}
                rows={report?.byProduct ?? []}
                loading={loading}
                emptyMessage="No products in range"
                rowKey={(p) => p.productId}
              />
            </div>
          </section>

          <section className="mb-6">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Quotes</h2>
              {report ? <span className="text-xs text-slate-500">{fmtInt(rows.length)} rows · same dataset used by exports</span> : null}
            </div>
            <DataTable columns={quoteColumns} rows={rows} loading={loading} emptyMessage="No quotes match these filters" rowKey={(q) => q.quoteId} />
          </section>
        </>
      )}
    </div>
  );
}
