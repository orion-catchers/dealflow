"use client";

import { useState } from "react";
import type { SubscriptionChangeRecord, SubscriptionRecord } from "@/contracts/ruchir";
import { Button, Card, DataTable, ErrorState, Input, Money, PageHeader, StatusBadge } from "@/dev-adapter/ui";
import { useApi, useMutation } from "@/features/catalog/ui/useApi";
import { api, newRequestKey } from "@/lib/api/client";

type Detail = SubscriptionRecord & { changes: SubscriptionChangeRecord[] };

export function SubscriptionDetail({ id }: { id: string }) {
  const detail = useApi<Detail>(`/api/subscriptions/${id}`);
  const mutation = useMutation();
  const [quantity, setQuantity] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setNotice(null);
    const result = await mutation.run(() =>
      api<SubscriptionRecord>(`/api/subscriptions/${id}`, {
        method: "PATCH",
        json: { requestKey: newRequestKey("sub"), ...body },
      }),
    );
    if (result) {
      setNotice("Saved");
      detail.reload();
    }
  }

  const sub = detail.data;

  return (
    <div>
      <PageHeader title={sub ? sub.planName : "Subscription"} description={sub?.customerName} />
      {detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : null}
      {mutation.errorMessage ? <p className="mb-3 text-sm text-rose-700">{mutation.errorMessage}</p> : null}
      {notice ? <p className="mb-3 text-sm text-emerald-700">{notice}</p> : null}
      {sub ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Schedule">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Status</dt>
                <dd>
                  <StatusBadge status={sub.status} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Quantity</dt>
                <dd>{sub.quantity}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Unit price</dt>
                <dd>
                  <Money amount={sub.unitPrice} currency={sub.currency ?? "INR"} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Period</dt>
                <dd>
                  {sub.currentPeriodStart} → {sub.currentPeriodEnd}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Next bill</dt>
                <dd>{sub.nextBillingDate ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Cancel policy</dt>
                <dd>{sub.cancelPolicy}</dd>
              </div>
            </dl>
          </Card>
          <Card title="Actions">
            <div className="flex flex-wrap gap-2">
              <Input
                className="w-24"
                placeholder="Qty"
                aria-label="New subscription quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <Button
                type="button"
                disabled={mutation.pending || !quantity}
                onClick={() => void patch({ quantity: Number(quantity) })}
              >
                Change quantity
              </Button>
              <Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => void patch({ pause: true })}>
                Pause
              </Button>
              <Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => void patch({ resume: true })}>
                Resume
              </Button>
              <Button type="button" variant="danger" disabled={mutation.pending} onClick={() => void patch({ cancel: true })}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
      <h2 className="mt-8 mb-3 text-base font-semibold">Change log</h2>
      <DataTable
        columns={[
          { key: "kind", header: "Kind", render: (c) => c.kind },
          { key: "when", header: "Effective", render: (c) => c.effectiveDate },
          {
            key: "adj",
            header: "Adjustment",
            align: "right",
            render: (c) =>
              c.adjustmentAmount != null ? (
                <Money amount={c.adjustmentAmount} currency={sub?.currency ?? "INR"} />
              ) : (
                "—"
              ),
          },
        ]}
        rows={sub?.changes ?? []}
        loading={detail.loading}
        emptyMessage="No changes"
        rowKey={(c) => c.id}
      />
    </div>
  );
}
