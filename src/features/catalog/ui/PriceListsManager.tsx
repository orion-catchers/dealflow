"use client";
/**
 * Manage Price Lists (Screen 17 companion). GET /api/price-lists + each list's rules for
 * counts; POST to create; PATCH `{active}` to archive/re-activate (with confirmation).
 * Expanding a row shows its rules with add/edit/delete via the shared PriceRuleDialog.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Currency, CustomerTier, PriceList, PriceRule, Product, Variant } from "@/contracts/harsh";
import { Button, Card, DataTable, Dialog, EmptyState, ErrorState, Input, Money, PageHeader, Select, StatusBadge, type Column } from "@/dev-adapter/ui";
import { api } from "@/lib/api/client";
import { CURRENCY_OPTIONS, FormField, TIER_OPTIONS, tierLabel } from "./form";
import { PriceRuleDialog } from "./PriceRuleDialog";
import { useApi, useApiMany, useMutation } from "./useApi";

export function PriceListsManager() {
  const lists = useApi<PriceList[]>("/api/price-lists");
  const rulePaths = useMemo(() => (lists.data ? lists.data.map((pl) => `/api/price-lists/${pl.id}/rules`) : null), [lists.data]);
  const rules = useApiMany<PriceRule[]>(rulePaths);
  const products = useApi<Product[]>("/api/products?includeArchived=1");

  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [toggling, setToggling] = useState<PriceList | null>(null);
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; listId: string; rule: PriceRule | null }>({ open: false, listId: "", rule: null });
  const [deletingRule, setDeletingRule] = useState<PriceRule | null>(null);
  const toggleMutation = useMutation();
  const deleteMutation = useMutation();

  const rulesByList = useMemo(() => {
    const m = new Map<string, PriceRule[]>();
    (lists.data ?? []).forEach((pl, i) => m.set(pl.id, rules.data?.[i] ?? []));
    return m;
  }, [lists.data, rules.data]);
  const productById = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);

  // Variant labels for rules that target a variant: fetch detail for the referenced products only.
  const variantProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of (rules.data ?? []).flat()) if (r.variantId) ids.add(r.productId);
    return [...ids].sort();
  }, [rules.data]);
  const variantDetails = useApiMany<{ product: Product; variants: Variant[] }>(rules.data ? variantProductIds.map((id) => `/api/products/${id}`) : null);
  const variantById = useMemo(() => {
    const m = new Map<string, Variant>();
    for (const d of variantDetails.data ?? []) for (const v of d.variants) m.set(v.id, v);
    return m;
  }, [variantDetails.data]);

  function reloadAll() {
    lists.reload();
    rules.reload();
  }

  async function confirmToggle() {
    if (!toggling) return;
    const result = await toggleMutation.run(() => api<PriceList>(`/api/price-lists/${toggling.id}`, { method: "PATCH", json: { active: !toggling.active } }));
    if (result === undefined) return;
    setToggling(null);
    lists.reload();
  }

  async function confirmDeleteRule() {
    if (!deletingRule) return;
    const result = await deleteMutation.run(() => api<{ deleted: true }>(`/api/price-lists/${deletingRule.priceListId}/rules/${deletingRule.id}`, { method: "DELETE" }));
    if (result === undefined) return;
    setDeletingRule(null);
    rules.reload();
  }

  const error = lists.error ?? rules.error;
  const expandedList = expanded ? (lists.data ?? []).find((pl) => pl.id === expanded) ?? null : null;

  const listColumns: Column<PriceList>[] = [
    {
      key: "name",
      header: "Name",
      render: (pl) => (
        <div>
          <button
            type="button"
            className="text-left font-medium hover:underline"
            onClick={() => setExpanded(expanded === pl.id ? null : pl.id)}
            aria-expanded={expanded === pl.id}
          >
            {pl.name}
          </button>
        </div>
      ),
    },
    { key: "currency", header: "Currency", render: (pl) => pl.currency },
    {
      key: "tier",
      header: "Tier",
      render: (pl) => (pl.tier ? <StatusBadge status={pl.tier} label={tierLabel(pl.tier)} /> : <span className="text-slate-500">Explicit assignment only</span>),
    },
    { key: "status", header: "Status", render: (pl) => <StatusBadge status={pl.active ? "ACTIVE" : "INACTIVE"} /> },
    { key: "rules", header: "Rules", align: "right", render: (pl) => (rules.loading ? "…" : rules.error ? "?" : (rulesByList.get(pl.id) ?? []).length) },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (pl) => (
        <div className="flex justify-end gap-1">
          <Button variant="secondary" onClick={() => setExpanded(expanded === pl.id ? null : pl.id)}>
            {expanded === pl.id ? "Hide rules" : "Rules"}
          </Button>
          <Button variant={pl.active ? "danger" : "primary"} onClick={() => setToggling(pl)}>
            {pl.active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Price lists"
        description="A customer resolves to exactly one list (tier/currency default or explicit override). Rules inside a list set fixed prices or discounts per product or variant."
        actions={
          <>
            <StatusBadge status="DEV FIXTURE" label="DEV FIXTURE data" />
            <Link href="/products" className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
              ← Products
            </Link>
            <Button onClick={() => setCreateOpen(true)}>New Price List</Button>
          </>
        }
      />

      {error ? (
        <ErrorState message={`Could not load price lists: ${error}`} onRetry={reloadAll} />
      ) : !lists.loading && (lists.data?.length ?? 0) === 0 ? (
        <EmptyState message="No price lists yet. Create one to start adding rules." />
      ) : (
        <DataTable columns={listColumns} rows={lists.data ?? []} loading={lists.loading} rowKey={(pl) => pl.id} />
      )}
      {products.error ? <p className="mt-2 text-xs text-rose-700">Product names unavailable: {products.error}</p> : null}

      {expandedList ? (
        <div className="mt-6">
          <RulesPanel
            list={expandedList}
            rules={rulesByList.get(expandedList.id) ?? []}
            loading={rules.loading}
            productById={productById}
            variantById={variantById}
            onAdd={() => setRuleDialog({ open: true, listId: expandedList.id, rule: null })}
            onEdit={(r) => setRuleDialog({ open: true, listId: expandedList.id, rule: r })}
            onDelete={(r) => setDeletingRule(r)}
            onClose={() => setExpanded(null)}
          />
        </div>
      ) : !lists.loading && (lists.data?.length ?? 0) > 0 ? (
        <p className="mt-3 text-xs text-slate-500">Select a price list (click its name or “Rules”) to view and edit its rules.</p>
      ) : null}

      <CreatePriceListDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(pl) => {
          setCreateOpen(false);
          reloadAll();
          setExpanded(pl.id);
        }}
      />

      <PriceRuleDialog
        open={ruleDialog.open}
        rule={ruleDialog.rule}
        priceLists={lists.data ?? []}
        lockedListId={ruleDialog.listId}
        products={products.data ?? []}
        onClose={() => setRuleDialog({ open: false, listId: "", rule: null })}
        onSaved={() => {
          setRuleDialog({ open: false, listId: "", rule: null });
          rules.reload();
        }}
      />

      <Dialog
        open={toggling !== null}
        onClose={() => {
          if (!toggleMutation.pending) {
            setToggling(null);
            toggleMutation.reset();
          }
        }}
        title={toggling?.active ? "Deactivate price list" : "Activate price list"}
        footer={
          <>
            <Button variant="secondary" disabled={toggleMutation.pending} onClick={() => setToggling(null)}>
              Cancel
            </Button>
            <Button variant={toggling?.active ? "danger" : "primary"} disabled={toggleMutation.pending} onClick={confirmToggle}>
              {toggleMutation.pending ? "Working…" : toggling?.active ? "Deactivate" : "Activate"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          {toggling?.active ? (
            <p>
              Deactivate <strong>{toggling.name}</strong>? Customers who resolve to it fall back to base prices until another list applies. Its rules are kept; lists are never deleted.
            </p>
          ) : (
            <p>
              Activate <strong>{toggling?.name}</strong>? Its rules apply again to matching customers.
            </p>
          )}
          {toggleMutation.errorMessage ? <ErrorState message={toggleMutation.errorMessage} /> : null}
        </div>
      </Dialog>

      <Dialog
        open={deletingRule !== null}
        onClose={() => {
          if (!deleteMutation.pending) {
            setDeletingRule(null);
            deleteMutation.reset();
          }
        }}
        title="Delete price rule"
        footer={
          <>
            <Button variant="secondary" disabled={deleteMutation.pending} onClick={() => setDeletingRule(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={deleteMutation.pending} onClick={confirmDeleteRule}>
              {deleteMutation.pending ? "Deleting…" : "Delete rule"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Delete the rule for <strong>{deletingRule ? productById.get(deletingRule.productId)?.name ?? deletingRule.productId : ""}</strong>
            {deletingRule?.variantId ? ` (${variantById.get(deletingRule.variantId)?.label ?? deletingRule.variantId})` : ""}? Customers on this list fall back to the base price.
          </p>
          {deleteMutation.errorMessage ? <ErrorState message={deleteMutation.errorMessage} /> : null}
        </div>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rules panel (expanded row)
// ---------------------------------------------------------------------------

function RulesPanel({
  list,
  rules,
  loading,
  productById,
  variantById,
  onAdd,
  onEdit,
  onDelete,
  onClose,
}: {
  list: PriceList;
  rules: PriceRule[];
  loading: boolean;
  productById: Map<string, Product>;
  variantById: Map<string, Variant>;
  onAdd: () => void;
  onEdit: (r: PriceRule) => void;
  onDelete: (r: PriceRule) => void;
  onClose: () => void;
}) {
  const columns: Column<PriceRule>[] = [
    {
      key: "product",
      header: "Product",
      render: (r) => {
        const p = productById.get(r.productId);
        return p ? (
          <Link href={`/products/${p.id}`} className="hover:underline">
            {p.name}
            {p.archivedAt ? " (archived)" : ""}
          </Link>
        ) : (
          r.productId
        );
      },
    },
    { key: "variant", header: "Variant", render: (r) => (r.variantId ? variantById.get(r.variantId)?.label ?? r.variantId : <span className="text-slate-500">All variants</span>) },
    {
      key: "price",
      header: "Fixed price / discount",
      align: "right",
      render: (r) =>
        r.fixedPrice !== undefined ? <Money amount={r.fixedPrice} currency={list.currency} /> : r.discountPct !== undefined ? `${r.discountPct}% off` : <span className="text-slate-400">no effect</span>,
    },
    { key: "minQty", header: "Min qty", align: "right", render: (r) => r.minQty ?? 1 },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="secondary" onClick={() => onEdit(r)}>
            Edit
          </Button>
          <Button variant="danger" onClick={() => onDelete(r)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">
            Rules in {list.name} ({rules.length})
          </h3>
          <p className="text-xs text-slate-500">
            {list.currency} · {list.tier ? `default for ${tierLabel(list.tier)} customers` : "explicit assignment only"}
            {list.active ? "" : " · list inactive"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={onAdd}>
            Add Rule
          </Button>
        </div>
      </div>
      {!loading && rules.length === 0 ? <EmptyState message="No rules — customers on this list pay base prices." /> : <DataTable columns={columns} rows={rules} loading={loading} rowKey={(r) => r.id} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

function CreatePriceListDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (pl: PriceList) => void }) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<Currency>("INR");
  const [tier, setTier] = useState<CustomerTier | "">("");
  const [clientError, setClientError] = useState<string | null>(null);
  const mutation = useMutation();
  const errors = mutation.fieldErrors;

  function close() {
    if (mutation.pending) return;
    onClose();
    setName("");
    setCurrency("INR");
    setTier("");
    setClientError(null);
    mutation.reset();
  }

  async function submit() {
    if (!name.trim()) {
      setClientError("Name is required");
      return;
    }
    setClientError(null);
    const created = await mutation.run(() => api<PriceList>("/api/price-lists", { method: "POST", json: { name: name.trim(), currency, tier: tier === "" ? null : tier } }));
    if (!created) return;
    onCreated(created);
    setName("");
    setTier("");
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New price list"
      footer={
        <>
          <Button variant="secondary" disabled={mutation.pending} onClick={close}>
            Cancel
          </Button>
          <Button disabled={mutation.pending} onClick={submit}>
            {mutation.pending ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Name" htmlFor="pl-name" error={clientError ?? errors.name}>
          <Input id="pl-name" value={name} disabled={mutation.pending} onChange={(e) => setName(e.target.value)} placeholder="USD — Gold" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Currency" htmlFor="pl-currency" error={errors.currency}>
            <Select id="pl-currency" value={currency} disabled={mutation.pending} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Default for tier" htmlFor="pl-tier" error={errors.tier} hint="None = only customers explicitly assigned to this list use it.">
            <Select id="pl-tier" value={tier} disabled={mutation.pending} onChange={(e) => setTier(e.target.value as CustomerTier | "")}>
              <option value="">None (explicit assignment)</option>
              {TIER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {mutation.errorMessage && Object.keys(errors).length === 0 ? <ErrorState message={mutation.errorMessage} /> : null}
      </div>
    </Dialog>
  );
}
