"use client";

import Link from "next/link";
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
        <Link className="font-medium text-slate-900 underline" href={`/quotes/${quote.id}`}>
          {`Quotation · version ${quote.currentRevisionNumber}`}
        </Link>
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
        actions={
          <>
            <StatusBadge status="LIVE" label="LIVE quotes" />
            <Link className="text-sm font-medium text-teal-800 underline" href="/quotes/new">
              New quote
            </Link>
          </>
        }
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
  const load = (recompute = false) => {
    setBusy(true);
    const request = recompute
      ? fetchJson<HealthData>("/api/health", { method: "POST" })
      : fetchJson<HealthData>("/api/health");
    void request
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  useEffect(() => load(true), []);
  const createTask = async (flagId: string, action: "NUDGE" | "ESCALATE") => {
    const session = await fetchJson<{ actor: { id: string } }>("/api/auth/me");
    await fetchJson("/api/health/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flagId,
        action,
        assigneeId: session.actor.id,
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
            <StatusBadge status="LIVE" label="LIVE flags" />
            <Button variant="secondary" onClick={() => load(true)} disabled={busy}>
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
                        {flag.quoteId ? (
                          <Link className="underline" href={`/quotes/${flag.quoteId}`}>
                            Open quotation
                          </Link>
                        ) : (
                          <Link className="underline" href={`/fulfillment/${flag.orderId}`}>
                            Open delivery
                          </Link>
                        )}
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
  type PolicyView = {
    policyVersionId: string;
    name: string;
    rules: {
      defaultCeilingPct: string;
      financeWorstLineThresholdPct: string;
      financeWeightedThresholdPct: string;
      totalDiscountBudgetPct?: string;
    };
    tierCeilings: Array<{ tier: string; ceilingPct: string }>;
    categoryCeilings: Array<{
      categoryId: string;
      categoryCode: string;
      categoryName: string;
      tier: string;
      ceilingPct: string;
    }>;
    chain: Array<{ stepIndex: number; role: string }>;
    thresholds: {
      managerWorstExcessPct: string;
      financeWorstExcessPct: string;
      financeWeightedExcessPct: string;
      totalDiscountBudgetPct: string | null;
    };
  };
  const [policy, setPolicy] = useState<PolicyView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void fetchJson<PolicyView>("/api/policies")
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
  const save = async () => {
    setMessage(null);
    try {
      const next = await fetchJson<PolicyView>("/api/policies", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: policy.name,
          rules: policy.rules,
          tierCeilings: policy.tierCeilings,
          categoryCeilings: policy.categoryCeilings,
          chain: policy.chain,
          thresholds: policy.thresholds,
        }),
      });
      setPolicy(next);
      setMessage(`Published ${next.policyVersionId}. New quotes use this version immediately.`);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <div>
      <PageHeader
        title="Discount Policy"
        description="Saving publishes a new immutable policy version. Current evaluations keep their captured snapshot."
        actions={<StatusBadge status="LIVE" label="LIVE policy versions" />}
      />
      <Card>
        <p className="mb-4 text-xs text-slate-500">Active version {policy.policyVersionId}</p>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          {policy.tierCeilings.map((item, index) => (
            <label key={`${item.tier}-${index}`} className="text-xs font-medium text-slate-600">
              {item.tier} ceiling
              <Input
                className="mt-1"
                inputMode="decimal"
                value={item.ceilingPct}
                onChange={(event) => {
                  const tierCeilings = policy.tierCeilings.map((ceiling, i) =>
                    i === index ? { ...ceiling, ceilingPct: event.target.value } : ceiling,
                  );
                  setPolicy({ ...policy, tierCeilings });
                }}
              />
            </label>
          ))}
          {policy.categoryCeilings
            .filter((item) => item.tier === "GOLD")
            .map((item) => (
              <label key={`${item.tier}-${item.categoryId}`} className="text-xs font-medium text-slate-600">
                {item.categoryName} ({item.categoryCode})
                <Input
                  className="mt-1"
                  inputMode="decimal"
                  value={item.ceilingPct}
                  onChange={(event) => {
                    const categoryCeilings = policy.categoryCeilings.map((ceiling) =>
                      ceiling.categoryId === item.categoryId && ceiling.tier === item.tier
                        ? { ...ceiling, ceilingPct: event.target.value }
                        : ceiling,
                    );
                    setPolicy({ ...policy, categoryCeilings });
                  }}
                />
              </label>
            ))}
          <label className="text-xs font-medium text-slate-600">
            Manager worst-line threshold
            <Input
              className="mt-1"
              inputMode="decimal"
              value={policy.thresholds.managerWorstExcessPct}
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  thresholds: { ...policy.thresholds, managerWorstExcessPct: event.target.value },
                })
              }
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Finance worst-line threshold
            <Input
              className="mt-1"
              inputMode="decimal"
              value={policy.thresholds.financeWorstExcessPct}
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  thresholds: { ...policy.thresholds, financeWorstExcessPct: event.target.value },
                })
              }
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Finance weighted threshold
            <Input
              className="mt-1"
              inputMode="decimal"
              value={policy.thresholds.financeWeightedExcessPct}
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  thresholds: { ...policy.thresholds, financeWeightedExcessPct: event.target.value },
                })
              }
            />
          </label>
        </div>
        <div className="mt-4 text-xs text-slate-600">
          Approval chain: {policy.chain.map((step) => `${step.stepIndex + 1}. ${step.role}`).join(" → ")}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => void save()}>Publish new version</Button>
          {message ? (
            <span className="text-sm text-slate-600">{message}</span>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
