"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { InvoiceRecord, InvoiceStatus } from "@/contracts/ruchir";
import { DataTable, ErrorState, Money, PageHeader, Select, StatusBadge, type Column } from "@/dev-adapter/ui";
import { useApi } from "@/features/catalog/ui/useApi";

const STATUSES: Array<InvoiceStatus | "ALL"> = ["ALL", "UNPAID", "PARTIALLY_PAID", "PAID", "VOID"];

export function InvoicesList() {
  const [status, setStatus] = useState<InvoiceStatus | "ALL">("ALL");
  const path = status === "ALL" ? "/api/invoices" : `/api/invoices?status=${status}`;
  const list = useApi<InvoiceRecord[]>(path);

  const columns: Column<InvoiceRecord>[] = useMemo(
    () => [
      {
        key: "id",
        header: "Invoice",
        render: (row) => (
          <Link href={`/invoices/${row.id}`} className="font-medium text-blue-700 hover:underline">
            {row.id}
          </Link>
        ),
      },
      { key: "customer", header: "Customer", render: (row) => row.customerName },
      { key: "kind", header: "Kind", render: (row) => row.kind },
      { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
      { key: "issue", header: "Issued", render: (row) => row.issueDate },
      {
        key: "total",
        header: "Total",
        align: "right",
        render: (row) => <Money amount={row.total} currency={row.currency} />,
      },
      {
        key: "out",
        header: "Outstanding",
        align: "right",
        render: (row) => <Money amount={row.outstanding} currency={row.currency} />,
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="One-time, recurring, and adjustment invoices."
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus | "ALL")}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        }
      />
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : null}
      <DataTable
        columns={columns}
        rows={list.data ?? []}
        loading={list.loading}
        emptyMessage="No invoices"
        rowKey={(row) => row.id}
      />
    </div>
  );
}
