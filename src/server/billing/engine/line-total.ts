import { Decimal } from "decimal.js";
import type { Money, Pct } from "@/contracts/ruchir";
import { fromCents, toCents } from "./money";

export interface LineAmounts {
  subtotal: Money;
  tax: Money;
  total: Money;
}

/** subtotal = qty × unit × (1 − discount); tax = subtotal × taxPct; each rounded half-up to cents. */
export function lineAmounts(input: { quantity: number; unitPrice: Money; discountPct: Pct; taxPct: Pct }): LineAmounts {
  const subtotal = new Decimal(input.quantity)
    .times(toCents(input.unitPrice))
    .times(new Decimal(100).minus(input.discountPct))
    .div(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  const tax = new Decimal(subtotal).times(input.taxPct).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
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
