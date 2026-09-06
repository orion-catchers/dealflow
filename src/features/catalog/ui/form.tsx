"use client";
/**
 * Form layout helpers shared by the catalog dialogs/forms. These are NOT UI-kit components
 * (blueprint §6 forbids a competing theme) — just label/error layout around the dev-adapter
 * `Input`/`Select`, plus option lists for the contract enums.
 */
import React from "react";
import type { Currency, CustomerTier, ProductCategory, Unit } from "@/contracts/harsh";

export const CATEGORY_OPTIONS: { value: ProductCategory; label: string }[] = [
  { value: "HARDWARE", label: "Hardware" },
  { value: "ACCESSORIES", label: "Accessories" },
  { value: "SERVICES", label: "Services" },
  { value: "SUBSCRIPTIONS", label: "Subscriptions" },
];

export const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: "UNIT", label: "Unit" },
  { value: "SEAT", label: "Seat" },
  { value: "HOUR", label: "Hour" },
  { value: "PACK", label: "Pack" },
  { value: "LICENSE", label: "License" },
];

export const TIER_OPTIONS: { value: CustomerTier; label: string }[] = [
  { value: "BRONZE", label: "Bronze" },
  { value: "SILVER", label: "Silver" },
  { value: "GOLD", label: "Gold" },
];

export const CURRENCY_OPTIONS: Currency[] = ["INR", "USD", "EUR"];

export function categoryLabel(c: ProductCategory): string {
  return CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;
}
export function unitLabel(u: Unit): string {
  return UNIT_OPTIONS.find((o) => o.value === u)?.label ?? u;
}
export function tierLabel(t: CustomerTier | null | undefined): string {
  if (!t) return "—";
  return TIER_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

/** Same look as the dev-adapter `Input`, for multi-line description fields. */
export const TEXTAREA_CLASS =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

/** Label + control + optional field-level error message. */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-rose-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** Checkbox with inline label, matching the compact form density. */
export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
  id,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <label className="catalog-checkbox-field inline-flex items-center gap-2 text-sm text-slate-800" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="catalog-checkbox h-4 w-4 rounded border-slate-300"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
