"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ApprovalListFilter, ApprovalListItem } from "@/contracts/ruchir";
import { Button, DataTable, ErrorState, PageHeader, Select, StatusBadge, type Column } from "@/dev-adapter/ui";
import { useApi } from "@/features/catalog/ui/useApi";

const FILTERS: ApprovalListFilter[] = ["PENDING", "RETURNED", "COMPLETED", "ALL"];

function fmtDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 16).replace("T", " ");
}

function reviewerLabel(role: ApprovalListItem["assignedReviewerRole"]): string {
  if (!role) return "—";
  return role.replaceAll("_", " ");
}

export function ApprovalsList() {
  const [status, setStatus] = useState<ApprovalListFilter>("PENDING");
  const { data, error, loading, reload } = useApi<ApprovalListItem[]>(`/api/approvals?status=${status}`);

  const columns: Column<ApprovalListItem>[] = useMemo(
    () => [
      {
        key: "revision",
        header: "Revision",
        render: (row) => (
          <Link href={`/approvals/${row.revisionId}`} className="font-medium hover:underline">
            {row.revisionId}
          </Link>
        ),
      },
      { key: "quote", header: "Quote", render: (row) => row.quoteId },
      { key: "customer", header: "Customer", render: (row) => row.customerName },
      {
        key: "required",
        header: "Required level",
        render: (row) => <StatusBadge status={row.requiredLevel} />,
      },
      {
        key: "reviewer",
        header: "Current reviewer",
        render: (row) => reviewerLabel(row.assignedReviewerRole),
      },
      {
        key: "listStatus",
        header: "Queue status",
        render: (row) => <StatusBadge status={row.listStatus} />,
      },
      {
        key: "approvalStatus",
        header: "Approval",
        render: (row) => <StatusBadge status={row.approvalStatus} />,
      },
      {
        key: "excess",
        header: "Weighted excess %",
        align: "right",
        render: (row) => row.weightedExcessPct.toFixed(2),
      },
      { key: "created", header: "Created", render: (row) => fmtDate(row.createdAt) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Quote revisions awaiting manager or finance sign-off."
        actions={
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600" htmlFor="approval-filter">
              Show
            </label>
            <Select
              id="approval-filter"
              value={status}
              onChange={(e) => setStatus(e.target.value as ApprovalListFilter)}
              className="w-auto"
            >
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={() => reload()}>
              Refresh
            </Button>
          </div>
        }
      />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      <DataTable
        columns={columns}
        rows={data ?? []}
        loading={loading}
        emptyMessage="No approvals in this queue"
        rowKey={(row) => row.revisionId}
      />
    </div>
  );
}
