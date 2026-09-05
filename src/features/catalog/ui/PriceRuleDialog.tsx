"use client";
/**
 * Add / edit a price rule via PUT /api/price-lists/[listId]/rules (body `id` → update).
 * Used by the product editor (product locked) and the price-list manager (list locked).
 * Enforces fixedPrice XOR discountPct client-side; the server refines the same rule.
 */
import { useEffect, useMemo, useState } from "react";
import type { PriceList, PriceRule, Product, Variant } from "@/contracts/harsh";
import { Button, Dialog, ErrorState, Input, Select } from "@/dev-adapter/ui";
import { api } from "@/lib/api/client";
import { FormField, tierLabel } from "./form";
import { normalizeMoney, useApi, useMutation } from "./useApi";

type Mode = "FIXED" | "DISCOUNT";

interface RuleForm {
  priceListId: string;
  productId: string;
  variantId: string;
  mode: Mode;
  fixedPrice: string;
  discountPct: string;
  minQty: string;
}

function fromRule(rule: PriceRule | null, defaults: { listId?: string; productId?: string }): RuleForm {
  if (rule) {
    return {
      priceListId: rule.priceListId,
      productId: rule.productId,
      variantId: rule.variantId ?? "",
      mode: rule.fixedPrice !== undefined ? "FIXED" : "DISCOUNT",
      fixedPrice: rule.fixedPrice ?? "",
      discountPct: rule.discountPct !== undefined ? String(rule.discountPct) : "",
      minQty: rule.minQty !== undefined ? String(rule.minQty) : "",
    };
  }
  return { priceListId: defaults.listId ?? "", productId: defaults.productId ?? "", variantId: "", mode: "FIXED", fixedPrice: "", discountPct: "", minQty: "" };
}

export function priceListLabel(pl: PriceList): string {
  return `${pl.name} (${pl.currency}${pl.tier ? ` · ${tierLabel(pl.tier)}` : " · explicit assignment"})`;
}

export function PriceRuleDialog({
  open,
  onClose,
  onSaved,
  rule,
  priceLists,
  lockedListId,
  products,
  lockedProduct,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (rule: PriceRule) => void;
  /** Existing rule to edit; null creates a new one. */
  rule: PriceRule | null;
  priceLists: PriceList[];
  /** When set (price-list manager) the list cannot be changed. */
  lockedListId?: string;
  /** Selectable products (price-list manager). Ignored when `lockedProduct` is set. */
  products?: Product[];
  /** When set (product editor) the product cannot be changed. */
  lockedProduct?: Product;
}) {
  const [form, setForm] = useState<RuleForm>(() => fromRule(rule, { listId: lockedListId, productId: lockedProduct?.id }));
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const mutation = useMutation();
  const resetMutation = mutation.reset;

  useEffect(() => {
    if (open) {
      setForm(fromRule(rule, { listId: lockedListId, productId: lockedProduct?.id }));
      setClientErrors({});
      resetMutation();
    }
  }, [open, rule, lockedListId, lockedProduct?.id, resetMutation]);

  // Variants for the selected product (drives the "All variants / specific variant" select).
  const productDetail = useApi<{ product: Product; variants: Variant[] }>(open && form.productId ? `/api/products/${form.productId}` : null);
  const variants = useMemo(() => productDetail.data?.variants ?? [], [productDetail.data]);

  const errors = { ...mutation.fieldErrors, ...clientErrors };
  const activeLists = priceLists.filter((pl) => pl.active || pl.id === form.priceListId);
  const productOptions = lockedProduct ? [lockedProduct] : (products ?? []).filter((p) => !p.archivedAt || p.id === form.productId);

  async function submit() {
    const errs: Record<string, string> = {};
    if (!form.priceListId) errs.priceListId = "Choose a price list";
    if (!form.productId) errs.productId = "Choose a product";
    let fixedPrice: string | undefined;
    let discountPct: number | undefined;
    if (form.mode === "FIXED") {
      const m = normalizeMoney(form.fixedPrice);
      if (m === null) errs.fixedPrice = "Enter a money amount like 52000.00";
      else fixedPrice = m;
    } else {
      const n = Number(form.discountPct);
      if (form.discountPct.trim() === "" || !Number.isFinite(n) || n < 0 || n > 100) errs.discountPct = "Enter a percentage between 0 and 100";
      else discountPct = n;
    }
    let minQty: number | undefined;
    if (form.minQty.trim() !== "") {
      const q = Number(form.minQty);
      if (!Number.isInteger(q) || q < 1) errs.minQty = "Minimum quantity must be a whole number ≥ 1";
      else minQty = q;
    }
    setClientErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const body: Record<string, unknown> = { productId: form.productId };
    if (rule) body.id = rule.id;
    if (form.variantId) body.variantId = form.variantId;
    if (fixedPrice !== undefined) body.fixedPrice = fixedPrice;
    if (discountPct !== undefined) body.discountPct = discountPct;
    if (minQty !== undefined) body.minQty = minQty;

    const saved = await mutation.run(() => api<PriceRule>(`/api/price-lists/${form.priceListId}/rules`, { method: "PUT", json: body }));
    if (saved) onSaved(saved);
  }

  const listLocked = Boolean(lockedListId) || Boolean(rule); // rules cannot move between lists
  const busy = mutation.pending;

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={rule ? "Edit price rule" : "Add price rule"}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? "Saving…" : rule ? "Save rule" : "Add rule"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Price list" htmlFor="rule-list" error={errors.priceListId} hint={rule ? "Rules stay in the list they were created in." : undefined}>
          <Select id="rule-list" value={form.priceListId} disabled={busy || listLocked} onChange={(e) => setForm({ ...form, priceListId: e.target.value })}>
            <option value="">Select a price list…</option>
            {activeLists.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {priceListLabel(pl)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Product" htmlFor="rule-product" error={errors.productId}>
          <Select
            id="rule-product"
            value={form.productId}
            disabled={busy || Boolean(lockedProduct) || Boolean(rule)}
            onChange={(e) => setForm({ ...form, productId: e.target.value, variantId: "" })}
          >
            <option value="">Select a product…</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Variant"
          htmlFor="rule-variant"
          error={errors.variantId}
          hint={form.productId && !productDetail.loading && variants.length === 0 ? "This product has no variants; the rule applies to the product." : "Variant-specific rules override product rules."}
        >
          <Select id="rule-variant" value={form.variantId} disabled={busy || !form.productId || productDetail.loading} onChange={(e) => setForm({ ...form, variantId: e.target.value })}>
            <option value="">All variants</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} · {v.sku}
                {v.active ? "" : " (inactive)"}
              </option>
            ))}
          </Select>
          {productDetail.error ? <p className="mt-1 text-xs text-rose-700">Variants unavailable: {productDetail.error}</p> : null}
        </FormField>

        <FormField label="Pricing" htmlFor="rule-mode" hint="Fixed price wins over discount; a rule has exactly one of them.">
          <Select id="rule-mode" value={form.mode} disabled={busy} onChange={(e) => setForm({ ...form, mode: e.target.value as Mode })}>
            <option value="FIXED">Fixed unit price</option>
            <option value="DISCOUNT">Discount % off base price</option>
          </Select>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          {form.mode === "FIXED" ? (
            <FormField label="Fixed price" htmlFor="rule-fixed" error={errors.fixedPrice}>
              <Input id="rule-fixed" inputMode="decimal" placeholder="52000.00" value={form.fixedPrice} disabled={busy} onChange={(e) => setForm({ ...form, fixedPrice: e.target.value })} />
            </FormField>
          ) : (
            <FormField label="Discount %" htmlFor="rule-discount" error={errors.discountPct}>
              <Input id="rule-discount" inputMode="decimal" placeholder="10" value={form.discountPct} disabled={busy} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} />
            </FormField>
          )}
          <FormField label="Minimum quantity (optional)" htmlFor="rule-minqty" error={errors.minQty}>
            <Input id="rule-minqty" inputMode="numeric" placeholder="1" value={form.minQty} disabled={busy} onChange={(e) => setForm({ ...form, minQty: e.target.value })} />
          </FormField>
        </div>

        {mutation.errorMessage ? <ErrorState message={mutation.errorMessage} /> : null}
      </div>
    </Dialog>
  );
}
