"use client";

import { useEffect, useState } from "react";
import type { OrderDeliveryRead } from "@/contracts/harsh";
import type { InvoiceRecord, PaymentMethod, PaymentRecord } from "@/contracts/ruchir";
import { Button, Card, Dialog, ErrorState, Input, Money, PageHeader, Select, StatusBadge } from "@/dev-adapter/ui";
import { useApi, useMutation } from "@/features/catalog/ui/useApi";
import { api, newRequestKey } from "@/lib/api/client";

const METHODS: PaymentMethod[] = ["BANK_TRANSFER", "CARD", "CHEQUE", "CASH", "OTHER"];

export function InvoiceDetail({ id }: { id: string }) {
  const invoice = useApi<InvoiceRecord>(`/api/invoices/${id}`);
  const integrations = useApi<{ flags: { stripe: boolean } }>("/api/integrations/status");
  const deliveryPath = invoice.data?.orderId ? `/api/fulfillment/${invoice.data.orderId}/delivery` : null;
  const delivery = useApi<OrderDeliveryRead>(deliveryPath);
  const mutation = useMutation();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setPaidOn(new Date().toISOString().slice(0, 10));
  }, []);

  async function pay() {
    setNotice(null);
    const result = await mutation.run(() =>
      api<PaymentRecord>("/api/payments", {
        method: "POST",
        json: {
          invoiceId: id,
          amount,
          method,
          reference,
          paidOn,
          requestKey: newRequestKey("pay"),
        },
      }),
    );
    if (result) {
      setNotice(result.replayed ? "Replayed payment — no duplicate" : "Payment recorded");
      setOpen(false);
      invoice.reload();
    }
  }

  async function startCardCheckout() {
    if (!row) return;
    setNotice(null);
    const result = await mutation.run(() =>
      api<{ checkoutUrl?: string }>("/api/payments/checkout", {
        method: "POST",
        json: { invoiceId: id, amount: row.outstanding, currency: row.currency },
      }),
    );
    if (result?.checkoutUrl) {
      window.location.assign(result.checkoutUrl);
      return;
    }
    if (result) setNotice("Stripe did not return a checkout URL.");
  }

  const row = invoice.data;

  return (
    <div>
      <PageHeader
        title={row ? `Invoice ${row.id}` : "Invoice"}
        description={row?.customerName}
        actions={
          <div className="flex gap-2">
            <a href={`/api/invoices/${id}/pdf`} className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
              Download PDF
            </a>
            {integrations.data?.flags.stripe && Number(row?.outstanding ?? 0) > 0 ? (
              <Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => void startCardCheckout()}>
                Card checkout (Stripe)
              </Button>
            ) : null}
            <Button type="button" onClick={() => setOpen(true)}>
              Record payment
            </Button>
          </div>
        }
      />
      {invoice.error ? <ErrorState message={invoice.error} onRetry={invoice.reload} /> : null}
      {mutation.errorMessage ? <p className="mb-3 text-sm text-rose-700">{mutation.errorMessage}</p> : null}
      {notice ? <p className="mb-3 text-sm text-emerald-700">{notice}</p> : null}
      {row ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Amounts">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Status</dt>
                <dd>
                  <StatusBadge status={row.status} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Kind</dt>
                <dd>{row.kind}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Total</dt>
                <dd>
                  <Money amount={row.total} currency={row.currency} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Paid</dt>
                <dd>
                  <Money amount={row.paidAmount} currency={row.currency} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Credits</dt>
                <dd>
                  <Money amount={row.creditedAmount} currency={row.currency} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Outstanding</dt>
                <dd>
                  <Money amount={row.outstanding} currency={row.currency} />
                </dd>
              </div>
            </dl>
          </Card>
          <Card title="Delivery (independent of payment)">
            {delivery.error ? <p className="text-sm text-slate-500">No fulfillment record for this order.</p> : null}
            {delivery.data ? (
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge status={delivery.data.status} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Delivered</dt>
                  <dd>
                    {delivery.data.deliveredUnits} / {delivery.data.totalStockTrackedUnits}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">Delivery is tracked on the fulfillment record, not paid status.</p>
            )}
          </Card>
        </div>
      ) : null}
      <h2 className="mt-8 mb-3 text-base font-semibold">Lines</h2>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {(row?.lines ?? []).map((line) => (
          <li key={line.id} className="flex justify-between px-3 py-2 text-sm">
            <span>
              {line.description} × {line.quantity}
            </span>
            <span className="tabular-nums">{line.lineTotal}</span>
          </li>
        ))}
      </ul>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record payment"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={mutation.pending} onClick={() => void pay()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm">
            Amount
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </label>
          <label className="block text-sm">
            Method
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            Reference
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
          <label className="block text-sm">
            Paid on
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </label>
        </div>
      </Dialog>
    </div>
  );
}
