"use client";
/**
 * Screen 16 — Product Dashboard (blueprint §5 row 16).
 *
 * Product catalog master dashboard: summary stats, category filter, active/archived
 * filter, text search, table with pricing and status, and archive/restore actions.
 */
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { CatalogDashboardSummary, PlanRef, Product, TaxRate } from "@/contracts/harsh";
import { Button, Card, DataTable, Dialog, EmptyState, ErrorState, Input, Money, PageHeader, Select, StatusBadge, type Column } from "@/dev-adapter/ui";
import { api } from "@/lib/api/client";
import { CATEGORY_OPTIONS, categoryLabel, CheckboxField } from "./form";
import { useApi, useMutation } from "./useApi";

const CURRENCY = "INR";

export function ProductDashboard({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<{ product: Product; action: "archive" | "restore" } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const summary = useApi<CatalogDashboardSummary>("/api/products/summary");
  const products = useApi<Product[]>(`/api/products${showArchived ? "?includeArchived=true" : ""}`);
  const taxRates = useApi<TaxRate[]>("/api/tax-rates");
  const plans = useApi<PlanRef[]>("/api/plans");
  const mutation = useMutation();

  const taxMap = useMemo(() => new Map((taxRates.data ?? []).map((t) => [t.id, t.name])), [taxRates.data]);
  const planMap = useMemo(() => new Map((plans.data ?? []).map((p) => [p.id, p.name])), [plans.data]);

  const filtered = useMemo(() => {
    let list = products.data ?? [];
    if (categoryFilter !== "ALL") list = list.filter((p) => p.category === categoryFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    return list;
  }, [products.data, categoryFilter, search]);

  function reloadAll() {
    products.reload();
    summary.reload();
  }

  async function confirmAction() {
    if (!confirm) return;
    const { product, action } = confirm;
    const path = action === "archive" ? `/api/products/${product.id}` : `/api/products/${product.id}/restore`;
    const method = action === "archive" ? "DELETE" : "POST";
    const result = await mutation.run(() => api<Product>(path, { method }));
    if (result === undefined) return;
    setConfirm(null);
    reloadAll();
  }

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "Product",
      className: "catalog-col-product",
      render: (p) => (
        <div>
          <Link href={`/products/${p.id}`} className="catalog-product-link font-medium text-blue-600 hover:underline">
            {p.name}
          </Link>
          <div className="text-xs text-slate-500 line-clamp-1">{p.description || "No description"}</div>
        </div>
      ),
    },
    { key: "category", header: "Category", className: "catalog-col-category", render: (p) => categoryLabel(p.category) },
    { key: "unit", header: "Unit", className: "catalog-col-unit", render: (p) => p.unit },
    { key: "basePrice", header: "Base price", className: "catalog-col-price", align: "right", render: (p) => <Money amount={p.basePrice} currency={CURRENCY} /> },
    { key: "baseCost", header: "Base cost", className: "catalog-col-cost", align: "right", render: (p) => <Money amount={p.baseCost} currency={CURRENCY} /> },
    {
      key: "tax",
      header: "Tax",
      className: "catalog-col-tax",
      render: (p) => taxMap.get(p.taxRateId) ?? <span className="text-slate-400">—</span>,
    },
    {
      key: "type",
      header: "Type",
      className: "catalog-col-type",
      render: (p) => {
        if (p.isSubscription) {
          return <span className="text-xs text-indigo-700">Subscription ({p.planId ? planMap.get(p.planId) ?? "plan" : "plan"})</span>;
        }
        return p.stockTracked ? <span className="text-xs text-slate-600">Stock-tracked</span> : <span className="text-xs text-slate-400">Standard</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      className: "catalog-col-status",
      render: (p) => (p.archivedAt ? <StatusBadge status="ARCHIVED" /> : p.active ? <StatusBadge status="ACTIVE" /> : <StatusBadge status="INACTIVE" />),
    },
    {
      key: "actions",
      header: "Actions",
      className: "catalog-col-actions",
      align: "right",
      render: (p) => (
        <div className="catalog-row-actions flex justify-end gap-1">
          <Link href={`/products/${p.id}`} className="catalog-action-button catalog-action-button--secondary">
            {readOnly ? "View" : "Edit"}
          </Link>
          {!readOnly && (p.archivedAt ? (
            <Button className="catalog-action-button catalog-action-button--secondary" variant="secondary" onClick={() => setConfirm({ product: p, action: "restore" })}>
              Restore
            </Button>
          ) : (
            <Button className="catalog-action-button catalog-action-button--danger" variant="danger" onClick={() => setConfirm({ product: p, action: "archive" })}>
              Archive
            </Button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="catalog-page catalog-products-page">
      <PageHeader
        title="Product catalog"
        description="All sellable products, subscription services, variants, and pricing."
        actions={
          <div className="catalog-header-actions">
            <StatusBadge status="LIVE" label="LIVE catalog" />
            {!readOnly && <>
            <Link href="/price-lists" className="catalog-button catalog-button--secondary">
              Manage Price Lists
            </Link>
            <Link href="/products/new" className="catalog-button catalog-button--primary">
              New Product
            </Link>
            </>}
          </div>
        }
      />

      <div className="catalog-summary-grid">
        <SummaryCards summary={summary} />
      </div>

      <div className="catalog-product-toolbar mb-3 mt-6 flex flex-wrap items-center gap-3">
        <div className="catalog-search-control w-72">
          <Input placeholder="Search by name or description…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
        </div>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
          <option value="ALL">All categories</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <CheckboxField id="show-archived" label="Show archived" checked={showArchived} onChange={setShowArchived} />
        <span className="catalog-results-count ml-auto text-xs text-slate-500">
          {products.data ? `${filtered.length} of ${products.data.length} products` : null}
        </span>
      </div>

      {products.error ? (
        <ErrorState message={`Could not load products: ${products.error}`} onRetry={products.reload} />
      ) : !products.loading && (products.data?.length ?? 0) === 0 ? (
        <EmptyState message="No products yet. Create the first one with “New Product”." />
      ) : (
        <div className="catalog-table-shell catalog-products-table">
          <DataTable columns={columns} rows={filtered} loading={products.loading} rowKey={(p) => p.id} emptyMessage="No products match your search." />
        </div>
      )}
      {taxRates.error ? <p className="mt-2 text-xs text-rose-700">Tax names unavailable: {taxRates.error}</p> : null}
      {plans.error ? <p className="mt-2 text-xs text-rose-700">Plan names unavailable: {plans.error}</p> : null}

      <Dialog
        open={confirm !== null}
        onClose={() => {
          if (!mutation.pending) {
            setConfirm(null);
            mutation.reset();
          }
        }}
        title={confirm?.action === "archive" ? "Archive product" : "Restore product"}
        footer={
          <>
            <Button variant="secondary" disabled={mutation.pending} onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant={confirm?.action === "archive" ? "danger" : "primary"} disabled={mutation.pending} onClick={confirmAction}>
              {mutation.pending ? "Working…" : confirm?.action === "archive" ? "Archive" : "Restore"}
            </Button>
          </>
        }
      >
        {confirm ? (
          <div className="space-y-3 text-sm text-slate-700">
            {confirm.action === "archive" ? (
              <p>
                Archive <strong>{confirm.product.name}</strong>? It disappears from the catalog and quote builder but stays on existing quotes and orders. You can restore it later.
              </p>
            ) : (
              <p>
                Restore <strong>{confirm.product.name}</strong> to the active catalog?
              </p>
            )}
            {mutation.errorMessage ? <ErrorState message={mutation.errorMessage} /> : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function SummaryCards({ summary }: { summary: ReturnType<typeof useApi<CatalogDashboardSummary>> }) {
  if (summary.error) return <ErrorState message={`Could not load summary: ${summary.error}`} onRetry={summary.reload} />;
  const s = summary.data;
  const tile = (label: string, value: ReactNode, sub?: string) => (
    <Card key={label} className="catalog-summary-card">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{summary.loading || !s ? "…" : value}</div>
      {sub ? <div className="text-xs text-slate-500">{sub}</div> : null}
    </Card>
  );
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {tile("Products", s ? `${s.activeProductCount} / ${s.productCount}` : "", "active / total")}
      {tile("Variants", s?.variantCount ?? "")}
      {tile("Price lists", s?.priceListCount ?? "")}
      {tile("Price rules", s?.priceRuleCount ?? "")}
      {tile("Subscription products", s?.subscriptionProductCount ?? "")}
      <Card className="catalog-summary-card catalog-category-card">
        <div className="text-xs uppercase tracking-wide text-slate-500">By category</div>
        {summary.loading || !s ? (
          <div className="mt-1 text-2xl font-semibold text-slate-900">…</div>
        ) : s.byCategory.length === 0 ? (
          <div className="mt-1 text-sm text-slate-500">No active products</div>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm">
            {s.byCategory.map((c) => (
              <li key={c.category} className="flex justify-between">
                <span className="text-slate-700">{categoryLabel(c.category)}</span>
                <span className="tabular-nums font-medium">{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
