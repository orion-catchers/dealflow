"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  AllocationCommitResult,
  AllocationPlanEntry,
  Backorder,
  BackorderPlanEntry,
  CancelAllocationResult,
  FulfillmentDetail,
  Reservation,
  Shipment,
  ShipmentActionResult,
} from "@/contracts/harsh";
import {
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  Money,
  PageHeader,
  StatusBadge,
  type Column,
} from "@/dev-adapter/ui";
import { api, ApiClientError, newRequestKey } from "@/lib/api/client";
import { OverrideEditor } from "./OverrideEditor";
import { useApi } from "./useApi";

function fmtDate(value: string | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function strategyLabel(strategy: string): string {
  return strategy.replaceAll("_", " ");
}

function formatMutationError(e: unknown): string {
  if (!(e instanceof ApiClientError)) return e instanceof Error ? e.message : "Request failed";
  const extra = formatDetails(e.details);
  return extra ? `${e.message}${extra}` : e.message;
}

function formatDetails(details: unknown): string {
  if (details == null) return "";
  if (typeof details === "string") return ` — ${details}`;
  if (typeof details === "object" && "errors" in details && Array.isArray((details as { errors: unknown }).errors)) {
    const msgs = (details as { errors: { message?: string }[] }).errors
      .map((x) => x.message)
      .filter((m): m is string => Boolean(m));
    if (msgs.length) return ` — ${msgs.join("; ")}`;
  }
  try {
    return ` — ${JSON.stringify(details)}`;
  } catch {
    return "";
  }
}

function savedMessage(replayed: boolean): string {
  return replayed ? "Already applied (replayed) — no duplicate reservation" : "Saved";
}

type DialogKind = "accept" | "override" | "consolidate" | "ship" | "deliver" | "cancel" | null;

export function FulfillmentDetailView({ orderId }: { orderId: string }) {
  const { data, error, loading, reload } = useApi<FulfillmentDetail>(`/api/fulfillment/${orderId}`);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [intentKey, setIntentKey] = useState<string | null>(null);
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);

  function openDialog(kind: Exclude<DialogKind, null>, prefix: string, nextShipmentId?: string) {
    setDialog(kind);
    setIntentKey(newRequestKey(prefix));
    setShipmentId(nextShipmentId ?? null);
    setActionError(null);
    if (kind === "cancel") setCancelReason("");
  }

  function closeDialog() {
    setDialog(null);
    setIntentKey(null);
    setShipmentId(null);
    setBusy(false);
  }

  async function runMutation<T extends { replayed: boolean }>(fn: () => Promise<T>, closeOverride = false): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    setSaved(null);
    try {
      const result = await fn();
      setSaved(savedMessage(result.replayed));
      await reload();
      closeDialog();
      if (closeOverride) setOverrideOpen(false);
      return true;
    } catch (e) {
      setActionError(formatMutationError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const preview = data?.preview ?? null;
  const currency = data?.order.currency ?? "INR";
  const serviceOnly =
    data != null &&
    data.status === "DELIVERED" &&
    data.order.lines.length > 0 &&
    data.order.lines.every((l) => !l.stockTracked);

  const canCancel =
    (data?.reservations.some((r) => r.status === "RESERVED") ?? false) ||
    (data?.backorders.some((b) => b.status === "OPEN") ?? false);

  const lineColumns: Column<FulfillmentDetail["lines"][number]>[] = [
    { key: "product", header: "Product", render: (row) => row.productName },
    { key: "variant", header: "Variant", render: (row) => row.variantLabel ?? "—" },
    { key: "tracked", header: "Stock-tracked", render: (row) => (row.stockTracked ? "Yes" : "No") },
    { key: "qty", header: "Qty", align: "right", render: (row) => row.quantity },
    { key: "reserved", header: "Reserved", align: "right", render: (row) => row.reserved },
    { key: "shipped", header: "Shipped", align: "right", render: (row) => row.shipped },
    { key: "delivered", header: "Delivered", align: "right", render: (row) => row.delivered },
    {
      key: "backordered",
      header: "Backordered",
      align: "right",
      render: (row) => <span className={row.backordered > 0 ? "font-medium text-amber-700" : undefined}>{row.backordered}</span>,
    },
    { key: "unallocated", header: "Unallocated", align: "right", render: (row) => row.unallocated },
  ];

  const reservationColumns: Column<Reservation>[] = [
    {
      key: "warehouse",
      header: "Warehouse",
      render: (row) => data?.stock.find((s) => s.warehouseId === row.warehouseId)?.warehouseName ?? row.warehouseId,
    },
    {
      key: "variant",
      header: "Variant",
      render: (row) => data?.stock.find((s) => s.variantId === row.variantId)?.variantLabel ?? row.variantId,
    },
    { key: "qty", header: "Qty", align: "right", render: (row) => row.quantity },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "shipment", header: "Shipment", render: (row) => row.shipmentId ?? "—" },
  ];

  const backorderColumns: Column<Backorder>[] = [
    {
      key: "variant",
      header: "Variant",
      render: (row) => data?.stock.find((s) => s.variantId === row.variantId)?.variantLabel ?? row.variantId,
    },
    { key: "remaining", header: "Remaining", align: "right", render: (row) => row.remainingQuantity },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "created", header: "Created", render: (row) => fmtDate(row.createdAt) },
  ];

  const acceptSummary = useMemo(() => {
    if (!preview) return { warehouses: [] as string[], units: 0, backorders: 0 };
    return {
      warehouses: preview.warehouses.map((w) => `${w.warehouseName} (${w.totalUnits} units)`),
      units: preview.warehouses.reduce((n, w) => n + w.totalUnits, 0),
      backorders: preview.backorders.reduce((n, b) => n + b.quantity, 0),
    };
  }, [preview]);

  const shipTarget = data?.shipments.find((s) => s.id === shipmentId);

  async function submitAccept() {
    if (!intentKey) return;
    await runMutation(() =>
      api<AllocationCommitResult>(`/api/fulfillment/${orderId}/accept`, {
        method: "POST",
        json: { requestKey: intentKey },
      }),
    );
  }

  async function submitConsolidate() {
    if (!intentKey || !preview) return;
    await runMutation(() =>
      api<AllocationCommitResult>(`/api/fulfillment/${orderId}/consolidate`, {
        method: "POST",
        json: { requestKey: intentKey, allocations: preview.allocations },
      }),
    );
  }

  async function submitShip() {
    if (!intentKey || !shipmentId) return;
    await runMutation(() =>
      api<ShipmentActionResult>(`/api/fulfillment/${orderId}/ship`, {
        method: "POST",
        json: { requestKey: intentKey, shipmentId },
      }),
    );
  }

  async function submitDeliver() {
    if (!intentKey || !shipmentId) return;
    await runMutation(() =>
      api<ShipmentActionResult>(`/api/fulfillment/${orderId}/deliver`, {
        method: "POST",
        json: { requestKey: intentKey, shipmentId },
      }),
    );
  }

  async function submitCancel() {
    if (!intentKey) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setActionError("A reason is required.");
      return;
    }
    await runMutation(() =>
      api<CancelAllocationResult>(`/api/fulfillment/${orderId}/cancel`, {
        method: "POST",
        json: { requestKey: intentKey, reason },
      }),
    );
  }

  async function submitOverride(allocations: AllocationPlanEntry[], backorders: BackorderPlanEntry[]) {
    if (!intentKey) return;
    const ok = await runMutation(
      () =>
        api<AllocationCommitResult>(`/api/fulfillment/${orderId}/override`, {
          method: "POST",
          json: { requestKey: intentKey, allocations, backorders },
        }),
      true,
    );
    if (ok) setDialog(null);
  }

  if (loading && !data) {
    return <p className="text-sm text-slate-500">Loading fulfillment…</p>;
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={() => void reload()} />;
  }

  if (!data) {
    return <EmptyState message="Fulfillment not found." />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={data.order.orderId}
        description={`${data.order.customerName} · Promised ${data.order.promisedDate ?? "—"}`}
        actions={
          <>
            <StatusBadge status="LIVE" />
            <StatusBadge status={data.status} />
            <Link href="/fulfillment" className="text-sm text-blue-700 hover:underline">
              All orders
            </Link>
            <Button type="button" variant="secondary" onClick={() => void reload()}>
              Reload
            </Button>
          </>
        }
      />

      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {actionError && !dialog && !overrideOpen ? <ErrorState message={actionError} /> : null}
      {saved ? <p className="text-sm text-emerald-700">{saved}</p> : null}

      {data.consolidationAvailable && preview ? (
        <Card className="border-amber-300 bg-amber-50">
          <p className="mb-2 text-sm font-semibold text-amber-900">Stock has arrived that can cover an open backorder</p>
          <p className="mb-3 text-sm text-amber-900">
            Suggested allocations for backordered remainder ({preview.shipmentCount} new shipment
            {preview.shipmentCount === 1 ? "" : "s"}, estimated{" "}
            <Money amount={preview.estimatedTotalCost} currency={currency} />
            ):
          </p>
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-amber-950">
            {preview.allocations.map((a) => {
              const wh = preview.warehouses.find((w) => w.warehouseId === a.warehouseId)?.warehouseName ?? a.warehouseId;
              const line = data.order.lines.find((l) => l.orderLineId === a.orderLineId);
              return (
                <li key={`${a.orderLineId}-${a.warehouseId}`}>
                  {line?.productName ?? a.orderLineId}
                  {line?.variantLabel ? ` · ${line.variantLabel}` : ""}: {a.quantity} units from {wh}
                </li>
              );
            })}
          </ul>
          <Button type="button" onClick={() => openDialog("consolidate", "consolidate")}>
            Consolidate
          </Button>
        </Card>
      ) : null}

      {serviceOnly ? <EmptyState message="No goods to ship — service-only order" /> : null}

      <Card title="Lines">
        <DataTable columns={lineColumns} rows={data.lines} emptyMessage="No lines." rowKey={(row) => row.orderLineId} />
      </Card>

      {preview && !serviceOnly ? (
        <Card title="Recommended split · Preview">
          <p className="mb-2 text-sm text-slate-600">
            Preview only. Does not reserve until Accept. Seeded Acme 10-laptop demo: Main 6, East 3, backorder 1; docks stay on Main.
          </p>
          <p className="mb-3 text-sm text-slate-700">
            Strategy: <span className="font-medium">{strategyLabel(preview.strategy)}</span>
            {acceptSummary.warehouses.length > 0
              ? ` · ${acceptSummary.warehouses.join("; ")}; backorder ${acceptSummary.backorders}`
              : null}
          </p>
          <div className="space-y-3">
            {preview.warehouses.map((w) => (
              <div key={w.warehouseId} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">
                    {w.warehouseName} · {w.totalUnits} units
                  </p>
                  <Money amount={w.estimatedCost} currency={currency} />
                </div>
                <ul className="text-sm text-slate-600">
                  {w.lines.map((l) => (
                    <li key={l.orderLineId}>
                      {l.productName}
                      {l.variantLabel ? ` · ${l.variantLabel}` : ""} × {l.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span>
              Shipments: <strong className="tabular-nums">{preview.shipmentCount}</strong>
            </span>
            <span>
              Estimated total: <Money amount={preview.estimatedTotalCost} currency={currency} />
            </span>
          </div>
          {preview.backorders.length > 0 ? (
            <div className="mt-3 space-y-1">
              {preview.backorders.map((b) => {
                const line = data.order.lines.find((l) => l.orderLineId === b.orderLineId);
                return (
                  <div key={b.orderLineId} className="flex flex-wrap items-center gap-2 text-sm">
                    <StatusBadge status="OPEN" label="Backorder" />
                    <span className="text-amber-800">
                      {line?.productName ?? b.orderLineId}
                      {line?.variantLabel ? ` · ${line.variantLabel}` : ""} — {b.quantity} units
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {preview.notes.map((note) => (
            <p key={note} className="mt-2 text-xs text-slate-500">
              {note}
            </p>
          ))}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => openDialog("accept", "accept")}>
              Accept Suggested Split
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOverrideOpen(true);
                setIntentKey(newRequestKey("override"));
                setDialog("override");
                setActionError(null);
              }}
            >
              Manual Override
            </Button>
          </div>
        </Card>
      ) : null}

      {overrideOpen && data ? (
        <OverrideEditor
          detail={data}
          busy={busy}
          error={actionError}
          onCancel={() => {
            setOverrideOpen(false);
            setDialog(null);
            setIntentKey(null);
            setActionError(null);
          }}
          onSubmit={(allocations, backorders) => void submitOverride(allocations, backorders)}
        />
      ) : null}

      <Card title="Reservations">
        <DataTable
          columns={reservationColumns}
          rows={data.reservations}
          emptyMessage="No reservations."
          rowKey={(row) => row.id}
        />
      </Card>

      <Card title="Backorders">
        <DataTable columns={backorderColumns} rows={data.backorders} emptyMessage="No backorders." rowKey={(row) => row.id} />
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Shipments</h3>
        {data.shipments.length === 0 ? (
          <EmptyState message="No shipments." />
        ) : (
          data.shipments.map((s) => (
            <ShipmentCard
              key={s.id}
              shipment={s}
              detail={data}
              currency={currency}
              onShip={() => openDialog("ship", "ship", s.id)}
              onDeliver={() => openDialog("deliver", "deliver", s.id)}
            />
          ))
        )}
      </div>

      {canCancel && !serviceOnly ? (
        <div>
          <Button type="button" variant="danger" onClick={() => openDialog("cancel", "cancel")}>
            Cancel unshipped allocation
          </Button>
        </div>
      ) : null}

      <Dialog
        open={dialog === "accept"}
        onClose={closeDialog}
        title="Accept suggested split"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={busy}>
              Back
            </Button>
            <Button type="button" onClick={() => void submitAccept()} disabled={busy}>
              {busy ? "Saving…" : "Confirm accept"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">Commit the recommended allocation. The server recomputes the plan and reserves stock once.</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {acceptSummary.warehouses.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm">
          Total units: {acceptSummary.units}. Backorder units:{" "}
          <span className={acceptSummary.backorders > 0 ? "text-amber-700" : undefined}>{acceptSummary.backorders}</span>.
        </p>
        {actionError && dialog === "accept" ? <p className="mt-3 text-sm text-rose-700">{actionError}</p> : null}
      </Dialog>

      <Dialog
        open={dialog === "consolidate"}
        onClose={closeDialog}
        title="Consolidate remaining backorder"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={busy}>
              Back
            </Button>
            <Button type="button" onClick={() => void submitConsolidate()} disabled={busy}>
              {busy ? "Saving…" : "Confirm consolidate"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          A <strong>new shipment</strong> will be created for the stock that just became available. Earlier shipments are left
          untouched.
        </p>
        {actionError && dialog === "consolidate" ? <p className="mt-3 text-sm text-rose-700">{actionError}</p> : null}
      </Dialog>

      <Dialog
        open={dialog === "ship"}
        onClose={closeDialog}
        title="Ship this plan"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={busy}>
              Back
            </Button>
            <Button type="button" onClick={() => void submitShip()} disabled={busy}>
              {busy ? "Saving…" : "Confirm ship"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Mark shipment <span className="font-mono">{shipTarget?.id}</span> as shipped. On-hand and reserved stock are consumed
          once.
        </p>
        {actionError && dialog === "ship" ? <p className="mt-3 text-sm text-rose-700">{actionError}</p> : null}
      </Dialog>

      <Dialog
        open={dialog === "deliver"}
        onClose={closeDialog}
        title="Mark delivered"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={busy}>
              Back
            </Button>
            <Button type="button" onClick={() => void submitDeliver()} disabled={busy}>
              {busy ? "Saving…" : "Confirm delivered"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Mark shipment <span className="font-mono">{shipTarget?.id}</span> as delivered.
        </p>
        {actionError && dialog === "deliver" ? <p className="mt-3 text-sm text-rose-700">{actionError}</p> : null}
      </Dialog>

      <Dialog
        open={dialog === "cancel"}
        onClose={closeDialog}
        title="Cancel unshipped allocation"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={busy}>
              Back
            </Button>
            <Button type="button" variant="danger" onClick={() => void submitCancel()} disabled={busy || !cancelReason.trim()}>
              {busy ? "Saving…" : "Confirm cancel"}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-700">
          Releases reserved stock and open backorders. <strong>Already shipped goods are not affected.</strong>
        </p>
        <label className="mb-1 block text-xs font-medium text-slate-600">Reason</label>
        <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why is this allocation cancelled?" />
        {actionError && dialog === "cancel" ? <p className="mt-3 text-sm text-rose-700">{actionError}</p> : null}
      </Dialog>
    </div>
  );
}

function ShipmentCard({
  shipment,
  detail,
  currency,
  onShip,
  onDeliver,
}: {
  shipment: Shipment;
  detail: FulfillmentDetail;
  currency: string;
  onShip: () => void;
  onDeliver: () => void;
}) {
  const warehouseName = detail.stock.find((s) => s.warehouseId === shipment.warehouseId)?.warehouseName ?? shipment.warehouseId;
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-sm">{shipment.id}</p>
          <p className="text-sm text-slate-600">{warehouseName}</p>
        </div>
        <StatusBadge status={shipment.status} />
      </div>
      <ul className="mb-2 text-sm text-slate-700">
        {shipment.lines.map((l) => {
          const line = detail.order.lines.find((ol) => ol.orderLineId === l.orderLineId);
          return (
            <li key={`${l.orderLineId}-${l.variantId}`}>
              {line?.productName ?? l.orderLineId}
              {line?.variantLabel ? ` · ${line.variantLabel}` : ""} × {l.quantity}
            </li>
          );
        })}
      </ul>
      <p className="text-sm">
        Estimated cost: <Money amount={shipment.estimatedCost} currency={currency} />
      </p>
      <p className="text-xs text-slate-500">Shipped: {fmtDate(shipment.shippedAt)}</p>
      <p className="mb-3 text-xs text-slate-500">Delivered: {fmtDate(shipment.deliveredAt)}</p>
      <div className="flex flex-wrap gap-2">
        {shipment.status === "PLANNED" ? (
          <Button type="button" onClick={onShip}>
            Ship
          </Button>
        ) : null}
        {shipment.status === "SHIPPED" ? (
          <Button type="button" onClick={onDeliver}>
            Mark Delivered
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
