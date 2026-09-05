"use client";
/**
 * Customer master (supplementary config; Harsh owns Customer records).
 * GET /api/customers, POST to create, PATCH /api/customers/[id] to edit (`null` clears
 * optional fields). The customer schema has no team field, so no sales-team select.
 */
import { useEffect, useMemo, useState } from "react";
import type { Currency, Customer, CustomerTier, PriceList } from "@/contracts/harsh";
import { Button, DataTable, Dialog, EmptyState, ErrorState, Input, PageHeader, Select, StatusBadge, type Column } from "@/dev-adapter/ui";
// DEV FIXTURE: rep names come from the fixture user list. Ruchir's users API replaces this
// lookup (same `{ id, name }` shape) once it is live.
import { fixtureUsers } from "@/fixtures/harsh-dev";
import { api } from "@/lib/api/client";
import { CURRENCY_OPTIONS, CheckboxField, FormField, TIER_OPTIONS, tierLabel } from "./form";
import { useApi, useMutation } from "./useApi";

const REP_OPTIONS = fixtureUsers.filter((u) => u.role === "SALES_REP" || u.role === "SALES_MANAGER");
const userName = (id: string | undefined) => (id ? fixtureUsers.find((u) => u.id === id)?.name ?? id : undefined);

export function CustomersMaster() {
  const customers = useApi<Customer[]>("/api/customers");
  const priceLists = useApi<PriceList[]>("/api/price-lists");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; customer: Customer | null }>({ open: false, customer: null });

  const listById = useMemo(() => new Map((priceLists.data ?? []).map((pl) => [pl.id, pl])), [priceLists.data]);

  const filtered = useMemo(() => {
    const rows = customers.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => [c.name, c.contactName, c.contactEmail, c.tier, userName(c.assignedRepId)].some((v) => v?.toLowerCase().includes(q)));
  }, [customers.data, search]);

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      render: (c) => (
        <div>
          <div className="font-medium">{c.name}</div>
          <div className="text-xs text-slate-500">{c.id}</div>
        </div>
      ),
    },
    { key: "contact", header: "Contact", render: (c) => c.contactName ?? <span className="text-slate-400">—</span> },
    { key: "email", header: "Email", render: (c) => (c.contactEmail ? <a className="text-blue-700 hover:underline" href={`mailto:${c.contactEmail}`}>{c.contactEmail}</a> : <span className="text-slate-400">—</span>) },
    { key: "tier", header: "Tier", render: (c) => <StatusBadge status={c.tier} label={tierLabel(c.tier)} /> },
    { key: "currency", header: "Currency", render: (c) => c.currency },
    { key: "rep", header: "Assigned rep", render: (c) => userName(c.assignedRepId) ?? <span className="text-slate-400">Unassigned</span> },
    {
      key: "priceList",
      header: "Price list override",
      render: (c) => (c.priceListId ? listById.get(c.priceListId)?.name ?? c.priceListId : <span className="text-slate-500">Tier/currency default</span>),
    },
    { key: "active", header: "Status", render: (c) => <StatusBadge status={c.active ? "ACTIVE" : "INACTIVE"} /> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (c) => (
        <Button variant="secondary" onClick={() => setDialog({ open: true, customer: c })}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Tier and currency pick the default price list; an override pins a specific list."
        actions={
          <>
            <StatusBadge status="DEV FIXTURE" label="DEV FIXTURE data" />
            <Button onClick={() => setDialog({ open: true, customer: null })}>New Customer</Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="w-72">
          <Input placeholder="Search name, contact, email, tier, rep…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customers" />
        </div>
        <span className="ml-auto text-xs text-slate-500">{customers.data ? `${filtered.length} of ${customers.data.length} customers` : null}</span>
      </div>

      {customers.error ? (
        <ErrorState message={`Could not load customers: ${customers.error}`} onRetry={customers.reload} />
      ) : !customers.loading && (customers.data?.length ?? 0) === 0 ? (
        <EmptyState message="No customers yet. Create the first one with “New Customer”." />
      ) : (
        <DataTable columns={columns} rows={filtered} loading={customers.loading} rowKey={(c) => c.id} emptyMessage="No customers match your search." />
      )}
      {priceLists.error ? <p className="mt-2 text-xs text-rose-700">Price list names unavailable: {priceLists.error}</p> : null}

      <CustomerDialog
        open={dialog.open}
        customer={dialog.customer}
        priceLists={priceLists.data ?? []}
        onClose={() => setDialog({ open: false, customer: null })}
        onSaved={() => {
          setDialog({ open: false, customer: null });
          customers.reload();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit dialog
// ---------------------------------------------------------------------------

interface CustomerForm {
  name: string;
  contactName: string;
  contactEmail: string;
  tier: CustomerTier;
  currency: Currency;
  assignedRepId: string;
  priceListId: string;
  active: boolean;
}

function fromCustomer(c: Customer | null): CustomerForm {
  return c
    ? {
        name: c.name,
        contactName: c.contactName ?? "",
        contactEmail: c.contactEmail ?? "",
        tier: c.tier,
        currency: c.currency,
        assignedRepId: c.assignedRepId ?? "",
        priceListId: c.priceListId ?? "",
        active: c.active,
      }
    : { name: "", contactName: "", contactEmail: "", tier: "BRONZE", currency: "INR", assignedRepId: "", priceListId: "", active: true };
}

function CustomerDialog({
  open,
  customer,
  priceLists,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  priceLists: PriceList[];
  onClose: () => void;
  onSaved: (c: Customer) => void;
}) {
  const [form, setForm] = useState<CustomerForm>(() => fromCustomer(customer));
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const mutation = useMutation();
  const resetMutation = mutation.reset;

  useEffect(() => {
    if (open) {
      setForm(fromCustomer(customer));
      setClientErrors({});
      resetMutation();
    }
  }, [open, customer, resetMutation]);

  const errors = { ...mutation.fieldErrors, ...clientErrors };
  const busy = mutation.pending;
  const set = (patch: Partial<CustomerForm>) => setForm((f) => ({ ...f, ...patch }));

  async function submit() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) errs.contactEmail = "Enter a valid email address";
    setClientErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const contactName = form.contactName.trim();
    const contactEmail = form.contactEmail.trim();

    let saved: Customer | undefined;
    if (customer) {
      // PATCH semantics: `null` clears optional fields.
      const patch = {
        name: form.name.trim(),
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        tier: form.tier,
        currency: form.currency,
        assignedRepId: form.assignedRepId || null,
        priceListId: form.priceListId || null,
        active: form.active,
      };
      saved = await mutation.run(() => api<Customer>(`/api/customers/${customer.id}`, { method: "PATCH", json: patch }));
    } else {
      const body: Record<string, unknown> = { name: form.name.trim(), tier: form.tier, currency: form.currency, active: form.active };
      if (contactName) body.contactName = contactName;
      if (contactEmail) body.contactEmail = contactEmail;
      if (form.assignedRepId) body.assignedRepId = form.assignedRepId;
      if (form.priceListId) body.priceListId = form.priceListId;
      saved = await mutation.run(() => api<Customer>("/api/customers", { method: "POST", json: body }));
    }
    if (saved) onSaved(saved);
  }

  const listOptions = priceLists.filter((pl) => pl.active || pl.id === form.priceListId);
  const mismatch = form.priceListId ? listOptions.find((pl) => pl.id === form.priceListId && pl.currency !== form.currency) : undefined;

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={customer ? `Edit customer · ${customer.name}` : "New customer"}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? "Saving…" : customer ? "Save changes" : "Create customer"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Company name" htmlFor="c-name" error={errors.name}>
          <Input id="c-name" value={form.name} disabled={busy} onChange={(e) => set({ name: e.target.value })} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Contact name" htmlFor="c-contact" error={errors.contactName}>
            <Input id="c-contact" value={form.contactName} disabled={busy} onChange={(e) => set({ contactName: e.target.value })} />
          </FormField>
          <FormField label="Contact email" htmlFor="c-email" error={errors.contactEmail}>
            <Input id="c-email" type="email" value={form.contactEmail} disabled={busy} onChange={(e) => set({ contactEmail: e.target.value })} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Tier" htmlFor="c-tier" error={errors.tier}>
            <Select id="c-tier" value={form.tier} disabled={busy} onChange={(e) => set({ tier: e.target.value as CustomerTier })}>
              {TIER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Currency" htmlFor="c-currency" error={errors.currency}>
            <Select id="c-currency" value={form.currency} disabled={busy} onChange={(e) => set({ currency: e.target.value as Currency })}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label="Assigned sales rep" htmlFor="c-rep" error={errors.assignedRepId} hint="DEV FIXTURE user list; Ruchir's users API replaces it.">
          <Select id="c-rep" value={form.assignedRepId} disabled={busy} onChange={(e) => set({ assignedRepId: e.target.value })}>
            <option value="">Unassigned</option>
            {REP_OPTIONS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.role.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Price list override"
          htmlFor="c-pricelist"
          error={errors.priceListId}
          hint={mismatch ? `Warning: ${mismatch.name} is in ${mismatch.currency}, but this customer is billed in ${form.currency}.` : "Leave empty to use the tier/currency default list."}
        >
          <Select id="c-pricelist" value={form.priceListId} disabled={busy} onChange={(e) => set({ priceListId: e.target.value })}>
            <option value="">Tier/currency default</option>
            {listOptions.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name} ({pl.currency}
                {pl.tier ? ` · ${tierLabel(pl.tier)}` : ""}){pl.active ? "" : " — inactive"}
              </option>
            ))}
          </Select>
        </FormField>
        <CheckboxField id="c-active" label="Active" checked={form.active} disabled={busy} onChange={(v) => set({ active: v })} />

        {mutation.errorMessage ? <ErrorState message={Object.keys(mutation.fieldErrors).length > 0 ? "Save failed — fix the highlighted fields and try again." : mutation.errorMessage} /> : null}
      </div>
    </Dialog>
  );
}
