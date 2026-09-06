"use client";

import Link from "next/link";
import { useState } from "react";
import type { ApprovalBreachRow, ApprovalDecisionView, ApprovalDetail, ApprovalStepView } from "@/contracts/ruchir";
import {
  Button,
  Card,
  DataTable,
  ErrorState,
  Input,
  Money,
  PageHeader,
  StatusBadge,
  type Column,
} from "@/dev-adapter/ui";
import { api, ApiClientError } from "@/lib/api/client";
import { useApi, useMutation } from "@/features/catalog/ui/useApi";

function fmtDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 16).replace("T", " ");
}

type DecisionKind = "APPROVE" | "REJECT" | "RETURN";

export function ApprovalDetail({ revisionId }: { revisionId: string }) {
  const detail = useApi<ApprovalDetail>(`/api/approvals/${revisionId}`);
  const mutation = useMutation();
  const [decision, setDecision] = useState<DecisionKind>("APPROVE");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const breachColumns: Array<Column<ApprovalBreachRow>> = [
    { key: "reason", header: "Reason", render: (b) => b.reason },
    { key: "excessPct", header: "Excess pts %", align: "right", render: (b) => b.excessPointsPct.toFixed(2) },
    {
      key: "excessAmt",
      header: "Excess amount",
      align: "right",
      render: (b) => <Money amount={b.excessAmount} currency="INR" />,
    },
  ];

  const chainColumns: Array<Column<ApprovalStepView>> = [
    { key: "step", header: "Step", render: (s) => s.stepIndex + 1 },
    { key: "role", header: "Role", render: (s) => s.role.replaceAll("_", " ") },
    { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
  ];

  const historyColumns: Array<Column<ApprovalDecisionView>> = [
    { key: "when", header: "When", render: (h) => fmtDate(h.createdAt) },
    { key: "actor", header: "Actor", render: (h) => `${h.actorName} (${h.actorRole.replaceAll("_", " ")})` },
    { key: "step", header: "Step", render: (h) => h.stepIndex + 1 },
    { key: "kind", header: "Decision", render: (h) => <StatusBadge status={h.kind} /> },
    { key: "reason", header: "Reason", render: (h) => h.reason },
  ];

  async function submit() {
    setSaved(null);
    const result = await mutation.run(() =>
      api<ApprovalDetail>(`/api/approvals/${revisionId}`, {
        method: "POST",
        json: { decision, reason },
      }),
    );
    if (result) {
      setSaved("Decision recorded");
      setReason("");
      detail.reload();
    }
  }

  const d = detail.data;

  return (
    <div>
      <PageHeader
        title="Approval detail"
        description={d ? `${d.customerName} · quote ${d.quoteId}` : "Loading revision…"}
        actions={
          <Link href="/approvals" className="text-sm hover:underline">
            ← Back to approvals
          </Link>
        }
      />
      {detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : null}
      {detail.loading && !d ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {d ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Risk">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Risk level</span>
                  <StatusBadge status={d.riskLevel} />
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Weighted excess</span>
                  <span className="tabular-nums">{d.weightedExcessPct.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Worst line excess</span>
                  <span className="tabular-nums">{d.worstLineExcessPct.toFixed(2)}%</span>
                </div>
              </div>
            </Card>
            <Card title="Why flagged" className="md:col-span-2">
              {d.reasons.length === 0 ? (
                <p className="text-sm text-slate-500">No evaluation reasons stored.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
                  {d.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {d.breaches.length > 0 ? (
            <Card title="Policy breaches">
              <DataTable columns={breachColumns} rows={d.breaches} rowKey={(b, i) => `${b.reason}-${i}`} />
            </Card>
          ) : null}

          <Card title="Approval chain">
            <DataTable columns={chainColumns} rows={d.chain} rowKey={(s) => String(s.stepIndex)} />
          </Card>

          <Card title="Decision history">
            <DataTable
              columns={historyColumns}
              rows={d.history}
              emptyMessage="No decisions yet"
              rowKey={(h) => h.id}
            />
          </Card>

          {d.canAct ? (
            <Card title="Record decision">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(["APPROVE", "REJECT", "RETURN"] as const).map((k) => (
                    <Button
                      key={k}
                      type="button"
                      variant={decision === k ? "primary" : "secondary"}
                      onClick={() => setDecision(k)}
                    >
                      {k}
                    </Button>
                  ))}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="approval-reason">
                    Reason
                  </label>
                  <Input
                    id="approval-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Required explanation for audit trail"
                  />
                  {mutation.fieldErrors.reason ? (
                    <p className="mt-1 text-sm text-rose-700">{mutation.fieldErrors.reason}</p>
                  ) : null}
                </div>
                {mutation.errorMessage ? (
                  <p className="text-sm text-rose-700">
                    {mutation.errorMessage}
                    {mutation.error instanceof ApiClientError && mutation.error.code === "FORBIDDEN"
                      ? " — switch dev actor to the matching reviewer."
                      : null}
                  </p>
                ) : null}
                {saved ? <p className="text-sm text-emerald-700">{saved}</p> : null}
                <Button type="button" disabled={mutation.pending || !reason.trim()} onClick={() => void submit()}>
                  {mutation.pending ? "Saving…" : "Submit decision"}
                </Button>
              </div>
            </Card>
          ) : (
            <p className="text-sm text-slate-600">You cannot act on this revision with the current dev actor.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
