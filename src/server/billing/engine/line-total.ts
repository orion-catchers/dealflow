import type { Money, Pct } from "@/contracts/ruchir";
import { fromCents, roundHalfUp, toCents } from "./money";

export interface LineAmounts {
  subtotal: Money;
  tax: Money;
  total: Money;
}

/** subtotal = qty × unit × (1 − discount); tax = subtotal × taxPct; each rounded to cents. */
export function lineAmounts(input: { quantity: number; unitPrice: Money; discountPct: Pct; taxPct: Pct }): LineAmounts {
  const subtotal = roundHalfUp(input.quantity * toCents(input.unitPrice) * (1 - input.discountPct / 100));
  const tax = roundHalfUp((subtotal * input.taxPct) / 100);
  return { subtotal: fromCents(subtotal), tax: fromCents(tax), total: fromCents(subtotal + tax) };
}

export function sumAmounts(lines: LineAmounts[]): LineAmounts {
  let subtotal = 0;
  let tax = 0;
  for (const l of lines) {
    subtotal += toCents(l.subtotal);
    tax += toCents(l.tax);
  }
  return { subtotal: fromCents(subtotal), tax: fromCents(tax), total: fromCents(subtotal + tax) };
}
