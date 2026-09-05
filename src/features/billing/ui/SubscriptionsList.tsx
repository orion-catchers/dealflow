"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SubscriptionPlanRecord, SubscriptionRecord } from "@/contracts/ruchir";
import { Button, DataTable, ErrorState, Input, PageHeader, Select, StatusBadge, type Column } from "@/dev-adapter/ui";
import { useApi, useMutation } from "@/features/catalog/ui/useApi";
import { api } from "@/lib/api/client";

export function SubscriptionsList() {
  const subs = useApi<SubscriptionRecord[]>("/api/subscriptions");
  const plans = useApi<SubscriptionPlanRecord[]>("/api/plans?full=1");
  const mutation = useMutation();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [interval, setInterval] = useState<"MONTHLY" | "QUARTERLY" | "YEARLY">("MONTHLY");
  const [cancelPolicy, setCancelPolicy] = useState<"IMMEDIATE" | "PERIOD_END">("PERIOD_END");
  const [notice, setNotice] = useState<string | null>(null);

  const columns: Column<SubscriptionRecord>[] = useMemo(
    () => [
      {
        key: "id",
        header: "Subscription",
        render: (row) => (
          <Link href={`/subscriptions/${row.id}`} className="font-medium text-blue-700 hover:underline">
            {`${row.planName} · ${row.customerName}`}
          </Link>
        ),
      },
      { key: "customer", header: "Customer", render: (row) => row.customerName },
      { key: "plan", header: "Plan", render: (row) => row.planName },
      { key: "qty", header: "Qty", align: "right", render: (row) => String(row.quantity) },
      { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
      { key: "next", header: "Next bill", render: (row) => row.nextBillingDate ?? "—" },
    ],
    [],
  );

  async function createPlan() {
    setNotice(null);
    const result = await mutation.run(() =>
      api<SubscriptionPlanRecord>("/api/plans", {
        method: "POST",
        json: { code, name, interval, cancelPolicy },
      }),
    );
    if (result) {
      setNotice(`Created ${result.name}`);
      setCode("");
      setName("");
      plans.reload();
    }
  }

  return (
    <div>
      <PageHeader title="Subscriptions" description="Recurring billing schedules and plan setup." />
      {subs.error ? <ErrorState message={subs.error} onRetry={subs.reload} /> : null}
      <DataTable
        columns={columns}
        rows={subs.data ?? []}
        loading={subs.loading}
        emptyMessage="No subscriptions"
        rowKey={(row) => row.id}
      />

      <h2 className="mt-8 mb-3 text-base font-semibold text-slate-900">Plans</h2>
      {plans.error ? <ErrorState message={plans.error} onRetry={plans.reload} /> : null}
      {mutation.errorMessage ? <p className="mb-3 text-sm text-rose-700">{mutation.errorMessage}</p> : null}
      {notice ? <p className="mb-3 text-sm text-emerald-700">{notice}</p> : null}
      <DataTable
        columns={[
          { key: "code", header: "Code", render: (p) => p.code },
          { key: "name", header: "Name", render: (p) => p.name },
          { key: "interval", header: "Interval", render: (p) => p.interval },
          { key: "cancel", header: "Cancel", render: (p) => p.cancelPolicy },
          {
            key: "arch",
            header: "Status",
            render: (p) => <StatusBadge status={p.archivedAt ? "ARCHIVED" : "ACTIVE"} />,
          },
        ]}
        rows={plans.data ?? []}
        loading={plans.loading}
        emptyMessage="No plans"
        rowKey={(p) => p.id}
      />
      <div className="mt-4 grid max-w-3xl grid-cols-1 gap-2 sm:grid-cols-5">
        <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={interval} onChange={(e) => setInterval(e.target.value as typeof interval)}>
          <option value="MONTHLY">Monthly</option>
          <option value="QUARTERLY">Quarterly</option>
          <option value="YEARLY">Yearly</option>
        </Select>
        <Select value={cancelPolicy} onChange={(e) => setCancelPolicy(e.target.value as typeof cancelPolicy)}>
          <option value="PERIOD_END">Period end</option>
          <option value="IMMEDIATE">Immediate</option>
        </Select>
        <Button type="button" disabled={mutation.pending || !code || !name} onClick={() => void createPlan()}>
          Add plan
        </Button>
      </div>
    </div>
  );
}
