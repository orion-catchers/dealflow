"use client";
/**
 * LOCAL DEVELOPMENT ADAPTER for Krishna's shared UI kit (blueprint §6).
 *
 * Same props as the agreed interfaces:
 *   PageHeader(title, description?, actions?)
 *   StatusBadge(status, label?)
 *   DataTable(columns, rows, loading, emptyMessage)
 *   Money(amount, currency)
 *   Dialog(open, onClose, title, children, footer?)
 *   AppShell(children)
 *
 * When Krishna's components land in `src/components/ui` and `src/components/shell`,
 * replace imports of `@/dev-adapter/ui` with the real ones. Do NOT extend this into a
 * competing theme.
 */
import Link from "next/link";
import React from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  PARTIAL: "bg-orange-100 text-orange-800",
  ALLOCATED: "bg-blue-100 text-blue-800",
  SHIPPED: "bg-indigo-100 text-indigo-800",
  DELIVERED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-200 text-slate-700",
  OPEN: "bg-amber-100 text-amber-800",
  FULFILLED: "bg-emerald-100 text-emerald-800",
  RESERVED: "bg-blue-100 text-blue-800",
  PLANNED: "bg-slate-100 text-slate-700",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  INACTIVE: "bg-slate-200 text-slate-700",
  ARCHIVED: "bg-slate-200 text-slate-700",
  LOW: "bg-rose-100 text-rose-800",
  OK: "bg-emerald-100 text-emerald-800",
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  UNDER_NEGOTIATION: "bg-violet-100 text-violet-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-rose-100 text-rose-800",
  NOT_REQUIRED: "bg-slate-100 text-slate-700",
  SUPERSEDED: "bg-slate-200 text-slate-600",
  "DEV FIXTURE": "bg-yellow-100 text-yellow-900",
  LIVE: "bg-emerald-100 text-emerald-800",
  "NOT CONNECTED": "bg-rose-100 text-rose-800",
  UNPAID: "bg-rose-100 text-rose-800",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  VOID: "bg-slate-200 text-slate-700",
  RETURNED: "bg-orange-100 text-orange-800",
  APPROVE: "bg-emerald-100 text-emerald-800",
  REJECT: "bg-rose-100 text-rose-800",
  RETURN: "bg-amber-100 text-amber-800",
  MANAGER: "bg-blue-100 text-blue-800",
  FINANCE: "bg-violet-100 text-violet-800",
  NONE: "bg-slate-100 text-slate-700",
  PAUSED: "bg-amber-100 text-amber-800",
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const cls = STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label ?? status.replaceAll("_", " ")}
    </span>
  );
}

export interface Column<Row> {
  key: string;
  header: string;
  render: (row: Row) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}

export function DataTable<Row>({
  columns,
  rows,
  loading,
  emptyMessage,
  rowKey,
}: {
  columns: Column<Row>[];
  rows: Row[];
  loading?: boolean;
  emptyMessage?: string;
  rowKey: (row: Row, index: number) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-6 text-center text-slate-500"
              >
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-6 text-center text-slate-500"
              >
                {emptyMessage ?? "No records"}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className="border-t border-slate-100 hover:bg-slate-50"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 align-top ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className ?? ""}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Money({
  amount,
  currency,
}: {
  amount: string | number;
  currency: string;
}) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const formatted = Number.isFinite(n)
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(n)
    : String(amount);
  return <span className="tabular-nums">{formatted}</span>;
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const base =
    "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary:
      "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    ghost: "text-slate-700 hover:bg-slate-100",
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-4 ${className}`}
    >
      {title ? (
        <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>
      ) : null}
      {children}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      {message}
      {onRetry ? (
        <button type="button" onClick={onRetry} className="ml-3 underline">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

/** Minimal internal shell. Krishna's AppShell replaces this by import change. */
const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/customers", label: "Customers" },
  { href: "/warehouses", label: "Warehouses" },
  { href: "/fulfillment", label: "Fulfillment" },
  { href: "/reports", label: "Reports" },
  { href: "/quotes", label: "Quotes" },
  { href: "/health", label: "Deal Health" },
  { href: "/policies", label: "Policies" },
  { href: "/approvals", label: "Approvals" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/billing", label: "Billing" },
  { href: "/invoices", label: "Invoices" },
  { href: "/users", label: "Users" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-2">
          <Link href="/" className="font-semibold text-slate-900">
            DealFlow360
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-xs text-slate-500">
            dev adapter shell · Krishna&apos;s AppShell replaces this
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
