"use client";

import { useState } from "react";
import type { UserAdminRow } from "@/contracts/ruchir";
import { Button, DataTable, ErrorState, PageHeader, StatusBadge, type Column } from "@/dev-adapter/ui";
import { api } from "@/lib/api/client";
import { useApi, useMutation } from "@/features/catalog/ui/useApi";

export function UsersAdmin() {
  const list = useApi<UserAdminRow[]>("/api/admin/users");
  const mutation = useMutation();
  const [notice, setNotice] = useState<string | null>(null);

  async function activate(user: UserAdminRow) {
    setNotice(null);
    const result = await mutation.run(() =>
      api<UserAdminRow>(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        json: { status: "ACTIVE" },
      }),
    );
    if (result) {
      setNotice(`Activated ${user.email}`);
      list.reload();
    }
  }

  const columns: Array<Column<UserAdminRow>> = [
    { key: "name", header: "Name", render: (u) => u.name },
    { key: "email", header: "Email", render: (u) => u.email },
    { key: "role", header: "Role", render: (u) => <StatusBadge status={u.role} /> },
    { key: "status", header: "Status", render: (u) => <StatusBadge status={u.status} /> },
    {
      key: "actions",
      header: "",
      render: (u) =>
        u.status === "PENDING" ? (
          <Button type="button" disabled={mutation.pending} onClick={() => void activate(u)}>
            Activate
          </Button>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users and roles"
        description="Admin activation of pending signups. Krishna owns the public signup form."
      />
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : null}
      {mutation.errorMessage ? <p className="mb-3 text-sm text-rose-700">{mutation.errorMessage}</p> : null}
      {notice ? <p className="mb-3 text-sm text-emerald-700">{notice}</p> : null}
      <DataTable
        columns={columns}
        rows={list.data ?? []}
        loading={list.loading}
        emptyMessage="No users"
        rowKey={(u) => u.id}
      />
    </div>
  );
}
