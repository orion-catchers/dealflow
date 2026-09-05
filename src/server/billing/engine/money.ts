import type { Money } from "@/contracts/ruchir";

export const MONEY_PATTERN = /^-?\d+(\.\d{1,2})?$/;

/** Cents as an integer; negative for credits. Exact for every Decimal(14,2) the schema stores. */
export type Cents = number;

export function toCents(value: Money): Cents {
  if (!MONEY_PATTERN.test(value)) throw new Error(`Not a money string: '${value}'`);
  const negative = value.startsWith("-");
  const [whole, frac = ""] = (negative ? value.slice(1) : value).split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function fromCents(cents: Cents): Money {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Round half away from zero, so a 0.5-cent credit and a 0.5-cent charge move symmetrically. */
export function roundHalfUp(value: number): Cents {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function sumMoney(values: Money[]): Money {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0));
}
