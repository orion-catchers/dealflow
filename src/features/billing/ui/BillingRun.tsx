"use client";

import { useEffect, useState } from "react";
import type { CreditNoteRecord, DueBillingResult } from "@/contracts/ruchir";
import { Button, DataTable, ErrorState, Input, PageHeader } from "@/dev-adapter/ui";
import { useApi, useMutation } from "@/features/catalog/ui/useApi";
import { api, newRequestKey } from "@/lib/api/client";

export function BillingRun() {
  const credits = useApi<CreditNoteRecord[]>("/api/credits");
  const mutation = useMutation();
  const [asOf, setAsOf] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setAsOf(new Date().toISOString().slice(0, 10));
  }, []);

  async function runDue() {
    setNotice(null);
    const result = await mutation.run(() =>
      api<DueBillingResult>("/api/billing/run-due", {
        method: "POST",
        json: { requestKey: newRequestKey("due"), asOf },
      }),
    );
    if (result) {
      setNotice(
        result.replayed
          ? "Replayed the same due-run key — no new invoices"
          : `Created ${result.invoices.length} invoice(s)`,
      );
      credits.reload();
    }
  }

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Run due recurring invoices. Credits appear here after cancellation or proration."
        actions={
          <div className="flex items-center gap-2">
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            <Button type="button" disabled={mutation.pending || !asOf} onClick={() => void runDue()}>
              Run due billing
            </Button>
          </div>
        }
      />
      {mutation.errorMessage ? <p className="mb-3 text-sm text-rose-700">{mutation.errorMessage}</p> : null}
      {notice ? <p className="mb-3 text-sm text-emerald-700">{notice}</p> : null}
      {credits.error ? <ErrorState message={credits.error} onRetry={credits.reload} /> : null}
      <DataTable
        columns={[
          { key: "id", header: "Credit", render: (c) => c.id },
          { key: "reason", header: "Reason", render: (c) => c.reason },
          { key: "amount", header: "Amount", align: "right", render: (c) => c.amount },
          { key: "applied", header: "Applied", align: "right", render: (c) => c.appliedAmount },
        ]}
        rows={credits.data ?? []}
        loading={credits.loading}
        emptyMessage="No credit notes"
        rowKey={(c) => c.id}
      />
    </div>
  );
}
