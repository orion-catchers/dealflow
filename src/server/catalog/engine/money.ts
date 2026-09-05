/**
 * Money helpers for the catalog engine. Money travels as decimal strings
 * (blueprint §7); arithmetic happens on `Number` and is re-serialized with
 * `.toFixed(2)`. Pure — no imports from repositories.
 */
import type { Money } from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";

export const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Parse a decimal-string money value, rejecting anything that is not finite and ≥ 0. */
export function parseMoney(value: Money | undefined, field: string): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ApiFailure("INVALID_INPUT", `${field} must be a finite, non-negative money amount (got '${value}')`);
  }
  return n;
}

/** Serialize a number as decimal-string money with two fractional digits. */
export function toMoney(n: number, field = "amount"): Money {
  if (!Number.isFinite(n) || n < 0) {
    throw new ApiFailure("INVALID_INPUT", `${field} must be a finite, non-negative money amount`);
  }
  // Guard against -0 and floating drift such as 2199.9999999.
  return (Math.round(n * 100) / 100 + 0).toFixed(2);
}
