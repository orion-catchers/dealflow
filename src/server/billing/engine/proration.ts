import type { ProrationInput, ProrationResult } from "@/contracts/ruchir";
import { daysBetween } from "./calendar";
import { fromCents, roundHalfUp, toCents } from "./money";

/**
 * adjustment = (newPeriodAmount - currentPeriodAmount) * remainingDays / periodDays.
 * Amounts are full-period totals. Remaining days count from effectiveDate to periodEnd on
 * the half-open period, clamped into [0, periodDays] so a change on the boundary day is 0.
 */
export function prorate(input: ProrationInput): ProrationResult {
  const periodDays = daysBetween(input.periodStart, input.periodEnd);
  if (periodDays <= 0) throw new Error(`Empty period ${input.periodStart}..${input.periodEnd}`);
  const remainingDays = Math.min(periodDays, Math.max(0, daysBetween(input.effectiveDate, input.periodEnd)));
  const delta = toCents(input.newPeriodAmount) - toCents(input.currentPeriodAmount);
  return {
    remainingDays,
    periodDays,
    adjustmentAmount: fromCents(roundHalfUp((delta * remainingDays) / periodDays)),
  };
}
