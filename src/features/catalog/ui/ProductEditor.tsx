"use client";
/**
 * Screen 17 — Product and Price List editor (blueprint §5 row 17).
 *
 * `productId === null` → create (POST /api/products, then router.push to the new id).
 * Otherwise edit: PATCH /api/products/[id], variants (POST/PATCH/DELETE=deactivate), the
 * product's price rules across every price list, and a live "resolved price for customer"
 * preview from POST /api/catalog/resolve. "Saved" appears only after the server responds OK.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Customer, PlanRef, PriceList, PriceRule, Product, ProductCategory, ResolvedPrice, TaxRate, Unit, Variant } from "@/contracts/harsh";
import { Button, Card, DataTable, Dialog, EmptyState, ErrorState, Input, Money, PageHeader, Select, StatusBadge, type Column } from "@/dev-adapter/ui";
import { api } from "@/lib/api/client";
import { CATEGORY_OPTIONS, CheckboxField, FormField, TEXTAREA_CLASS, UNIT_OPTIONS, tierLabel } from "./form";
import { PriceRuleDialog } from "./PriceRuleDialog";
import { marginPct, normalizeMoney, useApi, useApiMany, useMutation } from "./useApi";
import { VariantDialog } from "./VariantDialog";

const CURRENCY = "INR";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProductEditor({ productId }: { productId: string | null }) {
  const detail = useApi<{ product: Product; variants: Variant[] }>(productId ? `/api/products/${productId}` : null);
  const taxRates = useApi<TaxRate[]>("/api/tax-rates");
  const plans = useApi<PlanRef[]>("/api/plans");
  const [previewKey, setPreviewKey] = useState(0);
  const bumpPreview = useCallback(() => setPreviewKey((k) => k + 1), []);

  const isNew = productId === null;
  const product = detail.data?.product;

  if (!isNew && detail.error) {
    return (
      <div>
        <PageHeader title="Product" actions={<BackLink />} />
        <ErrorState message={`Could not load product: ${detail.error}`} onRetry={detail.reload} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isNew ? "New product" : product ? product.name : "Product"}
        description={isNew ? "General info first; variants and price rules become available after the first save." : product ? `Updated ${new Date(product.updatedAt).toLocaleString()}` : undefined}
        actions={
          <>
            <StatusBadge status="LIVE" label="LIVE catalog" />
            {product?.archivedAt ? <StatusBadge status="ARCHIVED" /> : product ? <StatusBadge status={product.active ? "ACTIVE" : "INACTIVE"} /> : null}
            <BackLink />
          </>
        }
      />

      {!isNew && detail.loading && !product ? (
        <div className="py-6 text-sm text-slate-500">Loading product…</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <GeneralInfoForm
              key={product?.id ?? "new"}
              product={product ?? null}
              taxRates={taxRates}
              plans={plans}
              onSaved={() => {
                detail.reload();
                bumpPreview();
              }}
            />
            {product ? (
              <>
                <VariantsSection
                  product={product}
                  variants={detail.data?.variants ?? []}
                  onChanged={() => {
                    detail.reload();
                    bumpPreview();
                  }}
                />
                <ProductRulesSection product={product} variants={detail.data?.variants ?? []} onChanged={bumpPreview} />
              </>
            ) : null}
          </div>
          <div className="space-y-6">
            {product ? <ResolvePreviewCard product={product} variants={detail.data?.variants ?? []} refreshKey={previewKey} /> : <Card title="Resolved price preview">
              <p className="text-sm text-slate-500">Save the product to preview how it prices for a customer.</p>
            </Card>}
          </div>
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/products" className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
      ← Products
    </Link>
  );
}

// ---------------------------------------------------------------------------
// General info form
// ---------------------------------------------------------------------------

interface ProductForm {
  name: string;
  category: ProductCategory;
  unit: Unit;
  description: string;
  basePrice: string;
  baseCost: string;
  taxRateId: string;
  stockTracked: boolean;
  shippingWeightKg: string;
  isSubscription: boolean;
  planId: string;
  active: boolean;
}

function fromProduct(p: Product | null): ProductForm {
  return p
    ? {
        name: p.name,
        category: p.category,
        unit: p.unit,
        description: p.description,
        basePrice: p.basePrice,
        baseCost: p.baseCost,
        taxRateId: p.taxRateId,
        stockTracked: p.stockTracked,
        shippingWeightKg: p.shippingWeightKg !== undefined ? String(p.shippingWeightKg) : "",
        isSubscription: p.isSubscription,
        planId: p.planId ?? "",
        active: p.active,
      }
    : {
        name: "",
        category: "HARDWARE",
        unit: "UNIT",
        description: "",
        basePrice: "",
        baseCost: "",
        taxRateId: "",
        stockTracked: true,
        shippingWeightKg: "",
        isSubscription: false,
        planId: "",
        active: true,
      };
}

function GeneralInfoForm({
  product,
  taxRates,
  plans,
  onSaved,
}: {
  product: Product | null;
  taxRates: ReturnType<typeof useApi<TaxRate[]>>;
  plans: ReturnType<typeof useApi<PlanRef[]>>;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ProductForm>(() => fromProduct(product));
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const mutation = useMutation();
  const errors = { ...mutation.fieldErrors, ...clientErrors };
  const busy = mutation.pending;

  const update = (patch: Partial<ProductForm>) => {
    setSavedAt(null);
    setForm((f) => ({ ...f, ...patch }));
  };

  const margin = useMemo(() => {
    const p = normalizeMoney(form.basePrice);
    const c = normalizeMoney(form.baseCost);
    return p && c ? marginPct(p, c) : null;
  }, [form.basePrice, form.baseCost]);

  async function submit() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    const basePrice = normalizeMoney(form.basePrice);
    const baseCost = normalizeMoney(form.baseCost);
    if (basePrice === null) errs.basePrice = "Enter a money amount like 50000.00";
    if (baseCost === null) errs.baseCost = "Enter a money amount like 40000.00";
    if (!form.taxRateId) errs.taxRateId = "Choose a tax rate";
    let shippingWeightKg: number | undefined;
    if (form.stockTracked && form.shippingWeightKg.trim() !== "") {
      const w = Number(form.shippingWeightKg);
      if (!Number.isFinite(w) || w < 0) errs.shippingWeightKg = "Weight must be a non-negative number";
      else shippingWeightKg = w;
    }
    if (form.isSubscription && !form.planId) errs.planId = "Subscription products need a plan";
    setClientErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const common = {
      name: form.name.trim(),
      category: form.category,
      unit: form.unit,
      description: form.description.trim(),
      basePrice: basePrice!,
      baseCost: baseCost!,
      taxRateId: form.taxRateId,
      stockTracked: form.stockTracked,
      isSubscription: form.isSubscription,
      active: form.active,
    };

    if (product) {
      // PATCH: `null` clears optional fields. planId must be cleared on non-subscription products.
      const patch = {
        ...common,
        planId: form.isSubscription ? form.planId : null,
        shippingWeightKg: form.stockTracked && shippingWeightKg !== undefined ? shippingWeightKg : null,
      };
      const saved = await mutation.run(() => api<Product>(`/api/products/${product.id}`, { method: "PATCH", json: patch }));
      if (!saved) return;
      setSavedAt(new Date());
      onSaved();
    } else {
      // POST: omit optional keys entirely; sending planId on a non-subscription product is rejected.
      const body: Record<string, unknown> = { ...common };
      if (form.isSubscription) body.planId = form.planId;
      if (form.stockTracked && shippingWeightKg !== undefined) body.shippingWeightKg = shippingWeightKg;
      const created = await mutation.run(() => api<Product>("/api/products", { method: "POST", json: body }));
      if (!created) return;
      router.push(`/products/${created.id}`);
    }
  }

  const activeTaxRates = (taxRates.data ?? []).filter((t) => t.active || t.id === form.taxRateId);

  return (
    <Card title="General info">
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Name" htmlFor="p-name" error={errors.name} className="md:col-span-2">
          <Input id="p-name" value={form.name} disabled={busy} onChange={(e) => update({ name: e.target.value })} />
        </FormField>

        <FormField label="Category" htmlFor="p-category" error={errors.category} hint="Category drives discount ceilings; billing behavior is set by the subscription flag.">
          <Select id="p-category" value={form.category} disabled={busy} onChange={(e) => update({ category: e.target.value as ProductCategory })}>
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Unit" htmlFor="p-unit" error={errors.unit}>
          <Select id="p-unit" value={form.unit} disabled={busy} onChange={(e) => update({ unit: e.target.value as Unit })}>
            {UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Description" htmlFor="p-description" error={errors.description} className="md:col-span-2">
          <textarea id="p-description" className={TEXTAREA_CLASS} rows={3} value={form.description} disabled={busy} onChange={(e) => update({ description: e.target.value })} />
        </FormField>

        <FormField label={`Base price (${CURRENCY})`} htmlFor="p-price" error={errors.basePrice}>
          <Input id="p-price" inputMode="decimal" placeholder="50000.00" value={form.basePrice} disabled={busy} onChange={(e) => update({ basePrice: e.target.value })} />
        </FormField>

        <FormField label={`Base cost (${CURRENCY})`} htmlFor="p-cost" error={errors.baseCost} hint={margin !== null ? `Margin at base price: ${margin.toFixed(1)}%` : undefined}>
          <Input id="p-cost" inputMode="decimal" placeholder="40000.00" value={form.baseCost} disabled={busy} onChange={(e) => update({ baseCost: e.target.value })} />
        </FormField>

        <FormField label="Tax rate" htmlFor="p-tax" error={errors.taxRateId}>
          <Select id="p-tax" value={form.taxRateId} disabled={busy || taxRates.loading} onChange={(e) => update({ taxRateId: e.target.value })}>
            <option value="">{taxRates.loading ? "Loading tax rates…" : "Select a tax rate…"}</option>
            {activeTaxRates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.ratePct}%{t.active ? "" : " (inactive)"}
              </option>
            ))}
          </Select>
          {taxRates.error ? (
            <p className="mt-1 text-xs text-rose-700">
              Tax rates failed to load: {taxRates.error}{" "}
              <button type="button" className="underline" onClick={taxRates.reload}>
                Retry
              </button>
            </p>
          ) : null}
        </FormField>

        <div className="flex flex-col justify-end gap-2 pb-1">
          <CheckboxField id="p-active" label="Active (visible in the quote builder)" checked={form.active} disabled={busy} onChange={(v) => update({ active: v })} />
        </div>

        <div className="rounded-md border border-slate-200 p-3 md:col-span-2">
          <CheckboxField id="p-stock" label="Stock-tracked (physical good handled by fulfillment)" checked={form.stockTracked} disabled={busy} onChange={(v) => update({ stockTracked: v })} />
          {form.stockTracked ? (
            <div className="mt-3 max-w-xs">
              <FormField label="Shipping weight (kg per unit, optional)" htmlFor="p-weight" error={errors.shippingWeightKg}>
                <Input id="p-weight" inputMode="decimal" placeholder="2.1" value={form.shippingWeightKg} disabled={busy} onChange={(e) => update({ shippingWeightKg: e.target.value })} />
              </FormField>
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-slate-200 p-3 md:col-span-2">
          <CheckboxField
            id="p-subscription"
            label="Subscription (recurring; billed against a plan)"
            checked={form.isSubscription}
            disabled={busy}
            onChange={(v) => update({ isSubscription: v, planId: v ? form.planId : "" })}
          />
          {form.isSubscription ? (
            <div className="mt-3 max-w-md">
              <FormField label="Plan" htmlFor="p-plan" error={errors.planId} hint="Plans come from the live billing catalog.">
                <Select id="p-plan" value={form.planId} disabled={busy || plans.loading} onChange={(e) => update({ planId: e.target.value })}>
                  <option value="">{plans.loading ? "Loading plans…" : "Select a plan…"}</option>
                  {(plans.data ?? []).map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name} · {pl.interval}
                    </option>
                  ))}
                </Select>
                {plans.error ? (
                  <p className="mt-1 text-xs text-rose-700">
                    Plans failed to load: {plans.error}{" "}
                    <button type="button" className="underline" onClick={plans.reload}>
                      Retry
                    </button>
                  </p>
                ) : null}
              </FormField>
            </div>
          ) : null}
        </div>
      </div>

      {mutation.errorMessage ? (
        <div className="mt-4">
          <ErrorState message={Object.keys(mutation.fieldErrors).length > 0 ? "Save failed — fix the highlighted fields and try again." : `Save failed: ${mutation.errorMessage}`} />
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3 border-t border-slate-200 pt-3">
        <Button disabled={busy} onClick={submit}>
          {busy ? "Saving…" : product ? "Save changes" : "Create product"}
        </Button>
        {savedAt ? <span className="text-sm text-emerald-700">Saved {savedAt.toLocaleTimeString()}</span> : null}
        {product?.archivedAt ? <span className="text-xs text-slate-500">This product is archived; restore it from the dashboard to make it active.</span> : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

function VariantsSection({ product, variants, onChanged }: { product: Product; variants: Variant[]; onChanged: () => void }) {
  const [dialog, setDialog] = useState<{ open: boolean; variant: Variant | null }>({ open: false, variant: null });
  const [deactivating, setDeactivating] = useState<Variant | null>(null);
  const mutation = useMutation();

  async function confirmDeactivate() {
    if (!deactivating) return;
    const result = await mutation.run(() => api<Variant>(`/api/products/${product.id}/variants/${deactivating.id}`, { method: "DELETE" }));
    if (result === undefined) return;
    setDeactivating(null);
    onChanged();
  }

  const columns: Column<Variant>[] = [
    {
      key: "label",
      header: "Variant",
      render: (v) => (
        <div>
          <div className="font-medium">{v.label}</div>
        </div>
      ),
    },
    {
      key: "attributes",
      header: "Attributes",
      render: (v) =>
        v.attributes.length === 0 ? (
          <span className="text-slate-400">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {v.attributes.map((a, i) => (
              <span key={`${a.name}-${i}`} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                {a.name}={a.value}
              </span>
            ))}
          </div>
        ),
    },
    { key: "extraPrice", header: "Extra price", align: "right", render: (v) => <Money amount={v.extraPrice} currency={CURRENCY} /> },
    { key: "extraCost", header: "Extra cost", align: "right", render: (v) => <Money amount={v.extraCost} currency={CURRENCY} /> },
    { key: "sku", header: "SKU", render: (v) => <code className="text-xs">{v.sku}</code> },
    { key: "status", header: "Status", render: (v) => <StatusBadge status={v.active ? "ACTIVE" : "INACTIVE"} /> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (v) => (
        <div className="flex justify-end gap-1">
          <Button variant="secondary" onClick={() => setDialog({ open: true, variant: v })}>
            Edit
          </Button>
          {v.active ? (
            <Button variant="danger" onClick={() => setDeactivating(v)}>
              Deactivate
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Variants ({variants.length})</h3>
        <Button variant="secondary" disabled={Boolean(product.archivedAt)} onClick={() => setDialog({ open: true, variant: null })}>
          Add Variant
        </Button>
      </div>
      {variants.length === 0 ? (
        <EmptyState message="No variants. Quotes will use the product's base price and cost." />
      ) : (
        <DataTable columns={columns} rows={variants} rowKey={(v) => v.id} />
      )}
      {product.archivedAt ? <p className="mt-2 text-xs text-slate-500">Variants cannot be added to an archived product.</p> : null}

      <VariantDialog
        open={dialog.open}
        productId={product.id}
        variant={dialog.variant}
        onClose={() => setDialog({ open: false, variant: null })}
        onSaved={() => {
          setDialog({ open: false, variant: null });
          onChanged();
        }}
      />

      <Dialog
        open={deactivating !== null}
        onClose={() => {
          if (!mutation.pending) {
            setDeactivating(null);
            mutation.reset();
          }
        }}
        title="Deactivate variant"
        footer={
          <>
            <Button variant="secondary" disabled={mutation.pending} onClick={() => setDeactivating(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={mutation.pending} onClick={confirmDeactivate}>
              {mutation.pending ? "Working…" : "Deactivate"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Deactivate <strong>{deactivating?.label}</strong> ({deactivating?.sku})? Variants are never deleted because stock and order lines reference them; it can be re-activated from Edit.
          </p>
          {mutation.errorMessage ? <ErrorState message={mutation.errorMessage} /> : null}
        </div>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Price rules for this product (across all lists)
// ---------------------------------------------------------------------------

function ProductRulesSection({ product, variants, onChanged }: { product: Product; variants: Variant[]; onChanged: () => void }) {
  const lists = useApi<PriceList[]>("/api/price-lists");
  const rulePaths = useMemo(() => (lists.data ? lists.data.map((pl) => `/api/price-lists/${pl.id}/rules`) : null), [lists.data]);
  const rules = useApiMany<PriceRule[]>(rulePaths);
  const [dialog, setDialog] = useState<{ open: boolean; rule: PriceRule | null }>({ open: false, rule: null });
  const [deleting, setDeleting] = useState<PriceRule | null>(null);
  const mutation = useMutation();

  const listById = useMemo(() => new Map((lists.data ?? []).map((pl) => [pl.id, pl])), [lists.data]);
  const variantById = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const productRules = useMemo(() => (rules.data ?? []).flat().filter((r) => r.productId === product.id), [rules.data, product.id]);

  function reloadAll() {
    rules.reload();
    onChanged();
  }

  async function confirmDelete() {
    if (!deleting) return;
    const result = await mutation.run(() => api<{ deleted: true; ruleId: string }>(`/api/price-lists/${deleting.priceListId}/rules/${deleting.id}`, { method: "DELETE" }));
    if (result === undefined) return;
    setDeleting(null);
    reloadAll();
  }

  const columns: Column<PriceRule>[] = [
    {
      key: "list",
      header: "Price list",
      render: (r) => {
        const pl = listById.get(r.priceListId);
        return pl ? (
          <div>
            <div className="font-medium">{pl.name}</div>
            <div className="text-xs text-slate-500">
              {pl.currency} · {pl.tier ? tierLabel(pl.tier) : "explicit assignment"}
              {pl.active ? "" : " · inactive"}
            </div>
          </div>
        ) : (
          r.priceListId
        );
      },
    },
    {
      key: "variant",
      header: "Variant",
      render: (r) => (r.variantId ? variantById.get(r.variantId)?.label ?? r.variantId : <span className="text-slate-500">All variants</span>),
    },
    {
      key: "price",
      header: "Fixed price / discount",
      align: "right",
      render: (r) =>
        r.fixedPrice !== undefined ? <Money amount={r.fixedPrice} currency={CURRENCY} /> : r.discountPct !== undefined ? `${r.discountPct}% off` : <span className="text-slate-400">no effect</span>,
    },
    { key: "minQty", header: "Min qty", align: "right", render: (r) => r.minQty ?? 1 },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="secondary" onClick={() => setDialog({ open: true, rule: r })}>
            Edit
          </Button>
          <Button variant="danger" onClick={() => setDeleting(r)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const error = lists.error ?? rules.error;
  const loading = lists.loading || rules.loading;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Price rules for this product</h3>
        <div className="flex gap-2">
          <Link href="/price-lists" className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Manage Price Lists
          </Link>
          <Button variant="secondary" disabled={!lists.data || lists.data.length === 0} onClick={() => setDialog({ open: true, rule: null })}>
            Add Rule
          </Button>
        </div>
      </div>
      {error ? (
        <ErrorState
          message={`Could not load price rules: ${error}`}
          onRetry={() => {
            lists.reload();
            rules.reload();
          }}
        />
      ) : !loading && productRules.length === 0 ? (
        <EmptyState message="No price rules. Every customer pays the base price (plus variant extras) for this product." />
      ) : (
        <DataTable columns={columns} rows={productRules} loading={loading} rowKey={(r) => r.id} />
      )}

      <PriceRuleDialog
        open={dialog.open}
        rule={dialog.rule}
        priceLists={lists.data ?? []}
        lockedProduct={product}
        onClose={() => setDialog({ open: false, rule: null })}
        onSaved={() => {
          setDialog({ open: false, rule: null });
          reloadAll();
        }}
      />

      <Dialog
        open={deleting !== null}
        onClose={() => {
          if (!mutation.pending) {
            setDeleting(null);
            mutation.reset();
          }
        }}
        title="Delete price rule"
        footer={
          <>
            <Button variant="secondary" disabled={mutation.pending} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={mutation.pending} onClick={confirmDelete}>
              {mutation.pending ? "Deleting…" : "Delete rule"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Delete this rule from <strong>{deleting ? listById.get(deleting.priceListId)?.name ?? deleting.priceListId : ""}</strong>? Customers on that list fall back to the base price for{" "}
            {deleting?.variantId ? `variant ${variantById.get(deleting.variantId)?.label ?? deleting.variantId}` : "all variants"}.
          </p>
          {mutation.errorMessage ? <ErrorState message={mutation.errorMessage} /> : null}
        </div>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Resolved price preview
// ---------------------------------------------------------------------------

function ResolvePreviewCard({ product, variants, refreshKey }: { product: Product; variants: Variant[]; refreshKey: number }) {
  const customers = useApi<Customer[]>("/api/customers");
  const [customerId, setCustomerId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [result, setResult] = useState<ResolvedPrice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId && customers.data && customers.data.length > 0) setCustomerId(customers.data[0].id);
  }, [customers.data, customerId]);

  // Drop a variant selection that no longer exists (e.g. after a reload).
  useEffect(() => {
    if (variantId && !variants.some((v) => v.id === variantId)) setVariantId("");
  }, [variants, variantId]);

  useEffect(() => {
    if (!customerId) return;
    const qty = Number(quantity);
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<ResolvedPrice>("/api/catalog/resolve", {
      method: "POST",
      json: { customerId, productId: product.id, ...(variantId ? { variantId } : {}), ...(Number.isFinite(qty) && qty > 0 ? { quantity: qty } : {}) },
    })
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Resolve failed");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, variantId, quantity, product.id, refreshKey]);

  const margin = result ? marginPct(result.unitPrice, result.unitCost) : null;

  return (
    <Card title="Resolved price for customer">
      <p className="mb-3 text-xs text-slate-500">Live call to POST /api/catalog/resolve — the same boundary the quote builder uses. Refreshes after every save.</p>
      <div className="space-y-3">
        <FormField label="Customer" htmlFor="rp-customer">
          <Select id="rp-customer" value={customerId} disabled={customers.loading} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">{customers.loading ? "Loading customers…" : "Select a customer…"}</option>
            {(customers.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {tierLabel(c.tier)} · {c.currency}
              </option>
            ))}
          </Select>
          {customers.error ? (
            <p className="mt-1 text-xs text-rose-700">
              Customers failed to load: {customers.error}{" "}
              <button type="button" className="underline" onClick={customers.reload}>
                Retry
              </button>
            </p>
          ) : null}
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Variant" htmlFor="rp-variant" className="col-span-2">
            <Select id="rp-variant" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              <option value="">Base product (no variant)</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                  {v.active ? "" : " (inactive)"}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Qty" htmlFor="rp-qty">
            <Input id="rp-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </FormField>
        </div>
      </div>

      <div className="mt-4">
        {!customerId ? (
          <EmptyState message="Pick a customer to resolve a price." />
        ) : error ? (
          <ErrorState message={error} />
        ) : !result ? (
          <div className="text-sm text-slate-500">Resolving…</div>
        ) : (
          <dl className={`grid grid-cols-2 gap-x-3 gap-y-2 text-sm ${loading ? "opacity-60" : ""}`}>
            <dt className="text-slate-500">Unit price</dt>
            <dd className="text-right font-semibold">
              <Money amount={result.unitPrice} currency={result.currency} />
            </dd>
            <dt className="text-slate-500">Unit cost</dt>
            <dd className="text-right">
              <Money amount={result.unitCost} currency={result.currency} />
            </dd>
            <dt className="text-slate-500">Margin</dt>
            <dd className={`text-right tabular-nums ${margin !== null && margin < 0 ? "text-rose-700" : ""}`}>{margin === null ? "—" : `${margin.toFixed(1)}%`}</dd>
            <dt className="text-slate-500">Tax</dt>
            <dd className="text-right tabular-nums">{result.taxPct}%</dd>
            <dt className="text-slate-500">Basis</dt>
            <dd className="text-right">
              <StatusBadge status={result.priceSource.basis} label={result.priceSource.basis === "BASE" ? "Base price" : result.priceSource.basis === "FIXED" ? "Fixed price rule" : "Discount rule"} />
            </dd>
            <dt className="text-slate-500">Price list</dt>
            <dd className="text-right text-xs text-slate-700">
              {result.priceSource.priceListId}
              {result.priceSource.ruleId ? <div className="text-slate-500">rule {result.priceSource.ruleId}</div> : null}
            </dd>
            <dt className="text-slate-500">Plan</dt>
            <dd className="text-right">{result.isSubscription ? result.planId ?? "—" : <span className="text-slate-400">not a subscription</span>}</dd>
            {result.variantLabel ? (
              <>
                <dt className="text-slate-500">Variant</dt>
                <dd className="text-right">{result.variantLabel}</dd>
              </>
            ) : null}
          </dl>
        )}
      </div>
      {priceListNote(product)}
    </Card>
  );
}

function priceListNote(product: Product) {
  return product.archivedAt ? <p className="mt-3 text-xs text-slate-500">Archived products still resolve here so existing quotes can be inspected.</p> : null;
}
