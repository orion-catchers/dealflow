"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FulfillmentListItem, FulfillmentStatus, StockListItem } from "@/contracts/harsh";
import { Button, Card, DataTable, EmptyState, ErrorState, PageHeader, Select, StatusBadge, type Column } from "@/dev-adapter/ui";
import { useApi } from "./useApi";

const STATUSES: FulfillmentStatus[] = ["PENDING", "PARTIAL", "ALLOCATED", "SHIPPED", "DELIVERED", "CANCELLED"];

function fmtDate(value: string | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export function FulfillmentList() {
  const [tab, setTab] = useState<"orders" | "stock">("orders");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("ALL");

  const orders = useApi<FulfillmentListItem[]>("/api/fulfillment");
  const stock = useApi<StockListItem[]>("/api/stock");

  const filteredOrders = useMemo(() => {
    const rows = orders.data ?? [];
    if (statusFilter === "ALL") return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [orders.data, statusFilter]);

  const warehouses = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of stock.data ?? []) map.set(row.warehouseId, row.warehouseName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [stock.data]);

  const filteredStock = useMemo(() => {
    const rows = stock.data ?? [];
    if (warehouseFilter === "ALL") return rows;
    return rows.filter((r) => r.warehouseId === warehouseFilter);
  }, [stock.data, warehouseFilter]);

  const summary = useMemo(() => {
    const rows = orders.data ?? [];
    const counts: Record<"PENDING" | "PARTIAL" | "ALLOCATED" | "SHIPPED", number> = {
      PENDING: 0,
      PARTIAL: 0,
      ALLOCATED: 0,
      SHIPPED: 0,
    };
    let backorderedUnits = 0;
    for (const r of rows) {
      if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
      backorderedUnits += r.backorderedUnits;
    }
    return { counts, backorderedUnits };
  }, [orders.data]);

  const orderColumns: Column<FulfillmentListItem>[] = [
    {
      key: "orderId",
      header: "Order",
      render: (row) => (
        <Link href={`/fulfillment/${row.orderId}`} className="font-medium text-blue-700 hover:underline">
          {row.orderId}
        </Link>
      ),
    },
    { key: "customer", header: "Customer", render: (row) => row.customerName },
    { key: "confirmed", header: "Confirmed", render: (row) => fmtDate(row.confirmedAt) },
    { key: "promised", header: "Promised", render: (row) => fmtDate(row.promisedDate) },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "tracked", header: "Stock-tracked", align: "right", render: (row) => row.stockTrackedUnits },
    { key: "allocated", header: "Allocated", align: "right", render: (row) => row.allocatedUnits },
    { key: "shipped", header: "Shipped", align: "right", render: (row) => row.shippedUnits },
    { key: "delivered", header: "Delivered", align: "right", render: (row) => row.deliveredUnits },
    {
      key: "backordered",
      header: "Backordered",
      align: "right",
      render: (row) => (
        <span className={row.backorderedUnits > 0 ? "font-medium text-amber-700" : undefined}>{row.backorderedUnits}</span>
      ),
    },
    { key: "shipments", header: "Shipments", align: "right", render: (row) => row.shipmentCount },
  ];

  const stockColumns: Column<StockListItem>[] = [
    { key: "warehouse", header: "Warehouse", render: (row) => row.warehouseName },
    { key: "product", header: "Product", render: (row) => row.productName },
    { key: "variant", header: "Variant", render: (row) => row.variantLabel },
    { key: "sku", header: "SKU", render: (row) => row.sku },
    { key: "onHand", header: "On hand", align: "right", render: (row) => row.onHand },
    { key: "reserved", header: "Reserved", align: "right", render: (row) => row.reserved },
    { key: "available", header: "Available", align: "right", render: (row) => row.available },
    { key: "threshold", header: "Threshold", align: "right", render: (row) => row.reorderThreshold },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.belowThreshold ? "LOW" : "OK"} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Fulfillment and Stock"
        description="On-hand, reserved, and available quantities; ready orders and backorder states."
        actions={<StatusBadge status="DEV FIXTURE" label="DEV FIXTURE data" />}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" variant={tab === "orders" ? "primary" : "secondary"} onClick={() => setTab("orders")}>
          Orders
        </Button>
        <Button type="button" variant={tab === "stock" ? "primary" : "secondary"} onClick={() => setTab("stock")}>
          Stock
        </Button>
      </div>

      {tab === "orders" ? (
        <div className="space-y-4">
          {orders.error ? <ErrorState message={orders.error} onRetry={() => void orders.reload()} /> : null}

          <div className="grid gap-2 sm:grid-cols-5">
            {(["PENDING", "PARTIAL", "ALLOCATED", "SHIPPED"] as const).map((s) => (
              <Card key={s} className="py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{s}</p>
                <p className="text-lg font-semibold tabular-nums">{summary.counts[s]}</p>
              </Card>
            ))}
            <Card className="py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Backordered units</p>
              <p className="text-lg font-semibold tabular-nums text-amber-700">{summary.backorderedUnits}</p>
            </Card>
          </div>

          <div className="max-w-xs">
            <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="ALL">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </div>

          {!orders.loading && !orders.error && (orders.data?.length ?? 0) === 0 ? (
            <EmptyState message="No fulfillment orders yet." />
          ) : (
            <DataTable
              columns={orderColumns}
              rows={filteredOrders}
              loading={orders.loading}
              emptyMessage="No orders match this status."
              rowKey={(row) => row.orderId}
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {stock.error ? <ErrorState message={stock.error} onRetry={() => void stock.reload()} /> : null}

          <div className="max-w-xs">
            <label className="mb-1 block text-xs font-medium text-slate-600">Warehouse</label>
            <Select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} aria-label="Filter by warehouse">
              <option value="ALL">All warehouses</option>
              {warehouses.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </div>

          {!stock.loading && !stock.error && (stock.data?.length ?? 0) === 0 ? (
            <EmptyState message="No stock levels recorded." />
          ) : (
            <DataTable
              columns={stockColumns}
              rows={filteredStock}
              loading={stock.loading}
              emptyMessage="No stock rows for this warehouse."
              rowKey={(row) => `${row.warehouseId}:${row.variantId}`}
            />
          )}
        </div>
      )}
    </div>
  );
}
