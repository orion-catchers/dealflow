import { Decimal } from "decimal.js";
import type { Money, Pct } from "@/contracts/ruchir";
import { fromCents, toCents } from "./money";

export interface LineAmounts {
  subtotal: Money;
  tax: Money;
  total: Money;
}

/**
 * Combined line + order discount for one line, unrounded: 100 × (1 − (1 − line/100)(1 − order/100)).
 * DealLine.effectiveDiscountPct is not used because quote writes can store the quote-wide average there.
 */
export function combinedDiscountPct(linePct: Decimal.Value, orderPct: Decimal.Value): number {
  const kept = new Decimal(100).minus(linePct).times(new Decimal(100).minus(orderPct)).div(100);
  return new Decimal(100).minus(kept).toNumber();
}

/**
 * subtotal = gross − discount, where the discount is rounded half-up to cents (as the quote engine
 * does); tax = subtotal × taxPct, rounded half-up to cents.
 */
export function lineAmounts(input: { quantity: number; unitPrice: Money; discountPct: Pct; taxPct: Pct }): LineAmounts {
  const gross = new Decimal(input.quantity).times(toCents(input.unitPrice));
  const discount = gross.times(input.discountPct).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const subtotal = gross.minus(discount).toNumber();
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
