"use client";
/**
 * Add / edit a product variant (Screen 17). POST /api/products/[id]/variants for new,
 * PATCH /api/products/[id]/variants/[variantId] for edits. Stays open on failure.
 */
import { useEffect, useState } from "react";
import type { Variant, VariantAttribute } from "@/contracts/harsh";
import { Button, Dialog, ErrorState, Input } from "@/dev-adapter/ui";
import { api } from "@/lib/api/client";
import { CheckboxField, FormField } from "./form";
import { normalizeMoney, useMutation } from "./useApi";

interface VariantForm {
  label: string;
  attributes: VariantAttribute[];
  extraPrice: string;
  extraCost: string;
  sku: string;
  active: boolean;
}

function fromVariant(v: Variant | null): VariantForm {
  return v
    ? { label: v.label, attributes: v.attributes.map((a) => ({ ...a })), extraPrice: v.extraPrice, extraCost: v.extraCost, sku: v.sku, active: v.active }
    : { label: "", attributes: [{ name: "", value: "" }], extraPrice: "0.00", extraCost: "0.00", sku: "", active: true };
}

export function VariantDialog({
  open,
  productId,
  variant,
  onClose,
  onSaved,
}: {
  open: boolean;
  productId: string;
  /** Existing variant to edit; null creates a new one. */
  variant: Variant | null;
  onClose: () => void;
  onSaved: (saved: Variant) => void;
}) {
  const [form, setForm] = useState<VariantForm>(() => fromVariant(variant));
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const mutation = useMutation();
  const resetMutation = mutation.reset;

  useEffect(() => {
    if (open) {
      setForm(fromVariant(variant));
      setClientErrors({});
      resetMutation();
    }
  }, [open, variant, resetMutation]);

  const errors = { ...mutation.fieldErrors, ...clientErrors };

  function setAttr(i: number, patch: Partial<VariantAttribute>) {
    setForm((f) => ({ ...f, attributes: f.attributes.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }));
  }

  async function submit() {
    const errs: Record<string, string> = {};
    if (!form.label.trim()) errs.label = "Label is required";
    if (!form.sku.trim()) errs.sku = "SKU is required";
    const extraPrice = normalizeMoney(form.extraPrice);
    const extraCost = normalizeMoney(form.extraCost);
    if (extraPrice === null) errs.extraPrice = "Enter a money amount like 2000.00";
    if (extraCost === null) errs.extraCost = "Enter a money amount like 1500.00";
    const attributes = form.attributes.filter((a) => a.name.trim() || a.value.trim()).map((a) => ({ name: a.name.trim(), value: a.value.trim() }));
    attributes.forEach((a, i) => {
      if (!a.name || !a.value) errs[`attributes.${i}`] = "Attribute needs both a name and a value";
    });
    setClientErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const body = { label: form.label.trim(), attributes, extraPrice, extraCost, sku: form.sku.trim(), active: form.active };
    const saved = await mutation.run(() =>
      variant
        ? api<Variant>(`/api/products/${productId}/variants/${variant.id}`, { method: "PATCH", json: body })
        : api<Variant>(`/api/products/${productId}/variants`, { method: "POST", json: body }),
    );
    if (saved) onSaved(saved);
  }

  return (
    <Dialog
      open={open}
      onClose={() => !mutation.pending && onClose()}
      title={variant ? `Edit variant · ${variant.label}` : "Add variant"}
      footer={
        <>
          <Button variant="secondary" disabled={mutation.pending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={mutation.pending} onClick={submit}>
            {mutation.pending ? "Saving…" : variant ? "Save changes" : "Add variant"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Label" htmlFor="variant-label" error={errors.label} hint="e.g. 16GB / 512GB">
          <Input id="variant-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} disabled={mutation.pending} />
        </FormField>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Attributes</span>
            <Button variant="ghost" type="button" disabled={mutation.pending} onClick={() => setForm({ ...form, attributes: [...form.attributes, { name: "", value: "" }] })}>
              + Add attribute
            </Button>
          </div>
          {form.attributes.length === 0 ? <p className="text-xs text-slate-500">No attributes — this variant is identified by its label only.</p> : null}
          <div className="space-y-2">
            {form.attributes.map((a, i) => (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <Input placeholder="Name (e.g. RAM)" value={a.name} onChange={(e) => setAttr(i, { name: e.target.value })} disabled={mutation.pending} aria-label={`Attribute ${i + 1} name`} />
                  <span className="text-slate-400">=</span>
                  <Input placeholder="Value (e.g. 16GB)" value={a.value} onChange={(e) => setAttr(i, { value: e.target.value })} disabled={mutation.pending} aria-label={`Attribute ${i + 1} value`} />
                  <Button
                    variant="ghost"
                    type="button"
                    aria-label="Remove attribute"
                    disabled={mutation.pending}
                    onClick={() => setForm({ ...form, attributes: form.attributes.filter((_, idx) => idx !== i) })}
                  >
                    ×
                  </Button>
                </div>
                {errors[`attributes.${i}`] || errors[`attributes.${i}.name`] || errors[`attributes.${i}.value`] ? (
                  <p className="mt-1 text-xs text-rose-700">{errors[`attributes.${i}`] ?? errors[`attributes.${i}.name`] ?? errors[`attributes.${i}.value`]}</p>
                ) : null}
              </div>
            ))}
          </div>
          {errors.attributes ? <p className="mt-1 text-xs text-rose-700">{errors.attributes}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Extra price (added to base price)" htmlFor="variant-extra-price" error={errors.extraPrice}>
            <Input id="variant-extra-price" inputMode="decimal" value={form.extraPrice} onChange={(e) => setForm({ ...form, extraPrice: e.target.value })} disabled={mutation.pending} />
          </FormField>
          <FormField label="Extra cost (added to base cost)" htmlFor="variant-extra-cost" error={errors.extraCost}>
            <Input id="variant-extra-cost" inputMode="decimal" value={form.extraCost} onChange={(e) => setForm({ ...form, extraCost: e.target.value })} disabled={mutation.pending} />
          </FormField>
        </div>

        <FormField label="SKU" htmlFor="variant-sku" error={errors.sku} hint="Must be unique across all variants">
          <Input id="variant-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} disabled={mutation.pending} />
        </FormField>

        {variant ? <CheckboxField id="variant-active" label="Active" checked={form.active} onChange={(v) => setForm({ ...form, active: v })} disabled={mutation.pending} /> : null}

        {mutation.errorMessage && Object.keys(mutation.fieldErrors).length === 0 ? <ErrorState message={mutation.errorMessage} /> : null}
        {mutation.errorMessage && Object.keys(mutation.fieldErrors).length > 0 ? <p className="text-xs text-rose-700">Fix the highlighted fields and try again.</p> : null}
      </div>
    </Dialog>
  );
}
