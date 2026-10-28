"use client";

import { useState, type FormEvent } from "react";
import type { Customer } from "@/contracts/harsh";
import type { UserAdminRow } from "@/contracts/ruchir";
import { Button, Card, DataTable, ErrorState, Input, PageHeader, Select, StatusBadge, type Column } from "@/dev-adapter/ui";
import { api } from "@/lib/api/client";
import { useApi, useMutation } from "@/features/catalog/ui/useApi";

const ROLES: Array<{ value: UserAdminRow["role"]; label: string }> = [
  { value: "SALES_REP", label: "Sales rep" },
  { value: "SALES_MANAGER", label: "Sales manager" },
  { value: "FINANCE", label: "Finance" },
  { value: "ADMIN", label: "Admin" },
  { value: "CUSTOMER", label: "Customer portal user" },
];

type Invited = { user: UserAdminRow; inviteUrl?: string };

export function UsersAdmin() {
  const list = useApi<UserAdminRow[]>("/api/admin/users");
  const customers = useApi<Customer[]>("/api/customers");
  const mutation = useMutation();
  const [notice, setNotice] = useState<string | null>(null);
  const [invited, setInvited] = useState<Invited | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserAdminRow["role"]>("SALES_REP");
  const [customerId, setCustomerId] = useState("");

  async function setStatus(user: UserAdminRow, status: UserAdminRow["status"]) {
    setNotice(null);
    const result = await mutation.run(() =>
      api<UserAdminRow>(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        json: { status },
      }),
    );
    if (result) {
      setNotice(status === "ACTIVE" ? `Activated ${user.email}` : `Disabled ${user.email}; their sessions have ended`);
      list.reload();
    }
  }

  async function resend(user: UserAdminRow) {
    setNotice(null);
    const result = await mutation.run(() => api<Invited>(`/api/admin/users/${user.id}/invite`, { method: "POST" }));
    if (result) setInvited(result);
  }

  async function withdraw(user: UserAdminRow) {
    setNotice(null);
    setInvited(null);
    const result = await mutation.run(() => api(`/api/admin/users/${user.id}`, { method: "DELETE" }));
    if (result) {
      setNotice(`Withdrew the invitation for ${user.email}`);
      list.reload();
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setInvited(null);
    const result = await mutation.run(() =>
      api<Invited>("/api/admin/users", {
        method: "POST",
        json: { name, email, role, customerIds: role === "CUSTOMER" && customerId ? [customerId] : [] },
      }),
    );
    if (result) {
      setInvited(result);
      setName("");
      setEmail("");
      setCustomerId("");
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
          <span className="flex gap-2">
            <Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => void resend(u)}>
              Resend invite
            </Button>
            <Button type="button" variant="ghost" disabled={mutation.pending} onClick={() => void withdraw(u)}>
              Withdraw
            </Button>
          </span>
        ) : u.status === "ACTIVE" ? (
          <Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => void setStatus(u, "DISABLED")}>
            Disable
          </Button>
        ) : (
          <Button type="button" disabled={mutation.pending} onClick={() => void setStatus(u, "ACTIVE")}>
            Activate
          </Button>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users and roles"
        description="Invite people into this workspace. Each invitee sets a password from a one-time link that is valid for 7 days."
      />
      <Card>
        <form className="form-grid" onSubmit={(event) => void invite(event)} aria-label="Invite a person">
          <label>
            Full name
            <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
          </label>
          <label>
            Work email
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
          </label>
          <label>
            Role
            <Select value={role} onChange={(e) => setRole(e.target.value as UserAdminRow["role"])} aria-label="Role">
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </label>
          {role === "CUSTOMER" ? (
            <label>
              Customer account
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer account">
                <option value="">Select a customer…</option>
                {(customers.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <div>
            <Button type="submit" disabled={mutation.pending || (role === "CUSTOMER" && !customerId)}>
              {mutation.pending ? "Inviting…" : "Send invitation"}
            </Button>
          </div>
        </form>
      </Card>
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : null}
      {mutation.errorMessage ? <p className="mb-3 text-sm text-rose-700">{mutation.errorMessage}</p> : null}
      {notice ? <p className="mb-3 text-sm text-emerald-700">{notice}</p> : null}
      {invited ? (
        <div className="notice" role="status">
          {invited.inviteUrl ? (
            <>
              Invited {invited.user.email}. Email delivery is not configured, so send them this one-time link yourself:{" "}
              <code className="break-all">{invited.inviteUrl}</code>
            </>
          ) : (
            <>Invitation emailed to {invited.user.email}. They appear as PENDING until they set a password.</>
          )}
        </div>
      ) : null}
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
