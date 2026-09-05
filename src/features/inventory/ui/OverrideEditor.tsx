"use client";

import { useMemo, useState } from "react";
import type { AllocationPlanEntry, BackorderPlanEntry, FulfillmentDetail } from "@/contracts/harsh";
import { Button, Card, Input } from "@/dev-adapter/ui";

function cellKey(orderLineId: string, warehouseId: string): string {
  return `${orderLineId}::${warehouseId}`;
}

function parseQty(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function OverrideEditor({
  detail,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  detail: FulfillmentDetail;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (allocations: AllocationPlanEntry[], backorders: BackorderPlanEntry[]) => void;
}) {
  const warehouses = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of detail.stock) map.set(s.warehouseId, s.warehouseName);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [detail.stock]);

  const lines = useMemo(() => {
    return detail.lines
      .filter((l) => l.stockTracked && l.quantity - l.shipped - l.delivered > 0)
      .map((l) => {
        const orderLine = detail.order.lines.find((ol) => ol.orderLineId === l.orderLineId);
        return {
          ...l,
          variantId: orderLine?.variantId ?? "",
          remaining: l.quantity - l.shipped - l.delivered,
        };
      })
      .filter((l) => l.variantId.length > 0);
  }, [detail]);

  const [qty, setQty] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const line of detail.lines) {
      if (!line.stockTracked) continue;
      for (const s of detail.stock) {
        const reserved = detail.reservations
          .filter((r) => r.status === "RESERVED" && r.orderLineId === line.orderLineId && r.warehouseId === s.warehouseId)
          .reduce((n, r) => n + r.quantity, 0);
        if (reserved > 0) init[cellKey(line.orderLineId, s.warehouseId)] = String(reserved);
      }
    }
    return init;
  });

  function availableFor(variantId: string, warehouseId: string): number {
    const row = detail.stock.find((s) => s.variantId === variantId && s.warehouseId === warehouseId);
    const own = detail.reservations
      .filter((r) => r.status === "RESERVED" && r.variantId === variantId && r.warehouseId === warehouseId)
      .reduce((n, r) => n + r.quantity, 0);
    return (row?.available ?? 0) + own;
  }

  const remainders = lines.map((line) => {
    const allocated = warehouses.reduce((n, w) => n + parseQty(qty[cellKey(line.orderLineId, w.id)] ?? ""), 0);
    return { orderLineId: line.orderLineId, variantId: line.variantId, remaining: line.remaining - allocated };
  });

  const invalid = remainders.some((r) => r.remaining < 0);

  function handleSubmit() {
    if (invalid) return;
    const allocations: AllocationPlanEntry[] = [];
    for (const line of lines) {
      for (const w of warehouses) {
        const quantity = parseQty(qty[cellKey(line.orderLineId, w.id)] ?? "");
        if (!Number.isInteger(quantity) || quantity <= 0) continue;
        allocations.push({ orderLineId: line.orderLineId, variantId: line.variantId, warehouseId: w.id, quantity });
      }
    }
    const backorders: BackorderPlanEntry[] = remainders
      .filter((r) => r.remaining > 0)
      .map((r) => ({ orderLineId: r.orderLineId, variantId: r.variantId, quantity: r.remaining }));
    onSubmit(allocations, backorders);
  }

  const nonInteger = Object.values(qty).some((v) => v.trim() !== "" && (!Number.isInteger(parseQty(v)) || parseQty(v) < 0));

  return (
    <Card title="Manual override">
      <p className="mb-3 text-sm text-slate-600">
        Quantities replace this order&apos;s unshipped reservations. Backorder remainder must be zero or positive. Available
        includes this order&apos;s own reserved stock at that warehouse.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-2 py-1">Line</th>
              <th className="px-2 py-1 text-right">Remaining</th>
              {warehouses.map((w) => (
                <th key={w.id} className="px-2 py-1">
                  {w.name}
                </th>
              ))}
              <th className="px-2 py-1 text-right">Backorder</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const rem = remainders.find((r) => r.orderLineId === line.orderLineId)?.remaining ?? 0;
              return (
                <tr key={line.orderLineId} className="border-t border-slate-100">
                  <td className="px-2 py-2">
                    <div className="font-medium">{line.productName}</div>
                    <div className="text-xs text-slate-500">{line.variantLabel ?? line.variantId}</div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{line.remaining}</td>
                  {warehouses.map((w) => {
                    const key = cellKey(line.orderLineId, w.id);
                    const avail = availableFor(line.variantId, w.id);
                    return (
                      <td key={w.id} className="px-2 py-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={qty[key] ?? ""}
                          onChange={(e) => setQty((prev) => ({ ...prev, [key]: e.target.value }))}
                          aria-label={`Qty at ${w.name} for ${line.productName}`}
                        />
                        <p className="mt-1 text-xs text-slate-500">Avail {avail}</p>
                      </td>
                    );
                  })}
                  <td className={`px-2 py-2 text-right tabular-nums ${rem < 0 ? "font-medium text-rose-700" : rem > 0 ? "text-amber-700" : ""}`}>
                    {rem}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lines.length === 0 ? <p className="text-sm text-slate-500">No unshipped stock-tracked remainder to override.</p> : null}
      {invalid ? <p className="mt-2 text-sm text-rose-700">Allocated quantity exceeds remaining units on at least one line.</p> : null}
      {nonInteger ? <p className="mt-2 text-sm text-rose-700">Quantities must be whole numbers ≥ 0.</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={busy || invalid || nonInteger || lines.length === 0}>
          {busy ? "Saving…" : "Submit override"}
        </Button>
      </div>
    </Card>
  );
}
