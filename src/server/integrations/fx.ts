import type { Currency, Money } from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";

/** Units of INR per 1 unit of the named currency. Override with DEALFLOW_FX_JSON. */
const DEFAULT_TO_INR: Record<Currency, number> = { INR: 1, USD: 83.5, EUR: 90 };

export function ratesToInr(): Record<Currency, number> {
  const raw = process.env.DEALFLOW_FX_JSON;
  if (!raw) return { ...DEFAULT_TO_INR };
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return {
      INR: Number(parsed.INR) || 1,
      USD: Number(parsed.USD) || DEFAULT_TO_INR.USD,
      EUR: Number(parsed.EUR) || DEFAULT_TO_INR.EUR,
    };
  } catch {
    return { ...DEFAULT_TO_INR };
  }
}

export function convertMoney(amount: Money, from: Currency, to: Currency): Money {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) throw new ApiFailure("INVALID_INPUT", "amount must be non-negative money");
  const rates = ratesToInr();
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) throw new ApiFailure("INVALID_INPUT", "Unknown currency");
  const inr = n * fromRate;
  const out = inr / toRate;
  return (Math.round(out * 100) / 100).toFixed(2);
}
