"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  type Column,
} from "@/dev-adapter/ui";

type QuoteRow = {
  id: string;
  customerId: string;
  salesRepId: string;
  stage: string;
  currentRevisionNumber: number;
  currentRevision?: {
    evaluation: { riskLevel: string; requiredApprovalChain: string[] };
    pricing: {
      totals: { oneTimeTotal: string; recurringTotals: Record<string, string> };
    };
  };
  lastBusinessActivityAt: string;
};
type HealthData = {
  flags: Array<{
    id: string;
    type: string;
    status: string;
    quoteId?: string;
    orderId?: string;
    reason: string;
    detectedAt: string;
  }>;
  tasks: Array<{
    id: string;
    action: string;
    assigneeId: string;
    dueDate: string;
    status: string;
  }>;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed");
  return body.data as T;
}

export function QuotePipelineScreen() {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [stage, setStage] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetchJson<QuoteRow[]>("/api/quotes")
      .then(setQuotes)
      .catch((e: Error) => setError(e.message));
  }, []);
  const rows =
    stage === "ALL" ? quotes : quotes.filter((quote) => quote.stage === stage);
  const columns: Column<QuoteRow>[] = [
    {
      key: "id",
      header: "Quote",
      render: (quote) => (
        <span className="font-medium text-slate-900">{quote.id}</span>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (quote) => quote.customerId,
    },
    {
      key: "stage",
      header: "Stage",
      render: (quote) => <StatusBadge status={quote.stage} />,
    },
    {
      key: "revision",
      header: "Revision",
      align: "right",
      render: (quote) => quote.currentRevisionNumber,
    },
    {
      key: "risk",
      header: "Approval",
      render: (quote) => (
        <StatusBadge
          status={quote.currentRevision?.evaluation.riskLevel ?? "NONE"}
        />
      ),
    },
    {
      key: "activity",
      header: "Last activity",
      render: (quote) =>
        new Date(quote.lastBusinessActivityAt).toLocaleDateString(),
    },
  ];
  return (
    <div>
      <PageHeader
        title="Quotation Pipeline"
        description="Review scoped quotes, current revisions, and approval risk."
        actions={<StatusBadge status="DEV FIXTURE" label="DEV FIXTURE data" />}
      />
      <Card className="mb-4">
        <label className="text-xs font-medium text-slate-600">
          Stage
          <Select
            className="mt-1 max-w-xs"
            value={stage}
            onChange={(event) => setStage(event.target.value)}
          >
            <option value="ALL">All stages</option>
            {[
              "DRAFT",
              "PENDING_APPROVAL",
              "APPROVED",
              "UNDER_NEGOTIATION",
              "CONFIRMED",
              "REJECTED",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
        </label>
      </Card>
      {error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : rows.length ? (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(quote) => quote.id}
          emptyMessage="No quotes match this stage."
        />
      ) : (
        <EmptyState message="No quotes are available for this actor." />
      )}
    </div>
  );
}

export function HealthDashboardScreen() {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [defaultDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  });
  const load = () => {
    setBusy(true);
    void fetchJson<HealthData>("/api/health")
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  useEffect(load, []);
  const createTask = async (flagId: string, action: "NUDGE" | "ESCALATE") => {
    await fetchJson("/api/health/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flagId,
        action,
        assigneeId: "rep-arjun",
        dueDate: defaultDueDate,
      }),
    });
    load();
  };
  return (
    <div>
      <PageHeader
        title="Deal Health"
        description="Act on stalled quotes, discount anomalies, and delivery risks."
        actions={
          <>
            <StatusBadge status="DEV FIXTURE" label="DEV FIXTURE data" />
            <Button variant="secondary" onClick={load} disabled={busy}>
              {busy ? "Refreshing..." : "Refresh"}
            </Button>
          </>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data?.flags.length ? (
        <EmptyState message="No active health flags." />
      ) : (
        <div className="space-y-3">
          {data.flags
            .filter((flag) => flag.status === "ACTIVE")
            .map((flag) => (
              <Card key={flag.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={flag.type} />
                      <span className="font-medium text-slate-900">
                        {flag.quoteId ?? flag.orderId}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{flag.reason}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => void createTask(flag.id, "NUDGE")}
                    >
                      Nudge
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => void createTask(flag.id, "ESCALATE")}
                    >
                      Escalate
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}

export function PolicyEditorScreen() {
  const [policy, setPolicy] = useState<{
    rules: {
      defaultCeilingPct: string;
      financeWorstLineThresholdPct: string;
      financeWeightedThresholdPct: string;
      totalDiscountBudgetPct?: string;
    };
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void fetchJson<typeof policy>("/api/policies")
      .then(setPolicy)
      .catch((e: Error) => setMessage(e.message));
  }, []);
  if (!policy)
    return (
      <div>
        <PageHeader title="Discount Policy" />
        <p className="text-sm text-slate-500">
          {message ?? "Loading policy..."}
        </p>
      </div>
    );
  const update = (field: keyof typeof policy.rules, value: string) =>
    setPolicy({ ...policy, rules: { ...policy.rules, [field]: value } });
  const save = async () => {
    setMessage(null);
    try {
      await fetchJson("/api/policies", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(policy.rules),
      });
      setMessage("Policy saved.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <div>
      <PageHeader
        title="Discount Policy"
        description="Configure approval thresholds used by new evaluations."
        actions={
          <StatusBadge status="DEV FIXTURE" label="DEV FIXTURE policy" />
        }
      />
      <Card>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          {(
            [
              ["defaultCeilingPct", "Default ceiling"],
              ["financeWorstLineThresholdPct", "Finance worst-line threshold"],
              ["financeWeightedThresholdPct", "Finance weighted threshold"],
              ["totalDiscountBudgetPct", "Total discount budget"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="text-xs font-medium text-slate-600">
              {label}
              <Input
                className="mt-1"
                inputMode="decimal"
                value={policy.rules[field] ?? ""}
                onChange={(event) => update(field, event.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => void save()}>Save policy</Button>
          {message ? (
            <span className="text-sm text-slate-600">{message}</span>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
