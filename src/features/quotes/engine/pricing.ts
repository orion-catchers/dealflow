import type {
  BillingInterval,
  Currency,
  PricedDealLine,
  PricingResult,
  DealLineInput,
} from "@/contracts/atharva";

export interface PricingInput {
  currency: Currency;
  lines: Array<DealLineInput & { lineId?: string }>;
  orderDiscountPct: string;
}

interface ParsedLine {
  input: DealLineInput & { lineId?: string };
  unitPriceCents: bigint;
  unitCostCents: bigint;
  taxPct: number;
  discountPct: number;
  undiscountedCents: bigint;
}

function parsePercentage(value: string, field: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new RangeError(`${field} must be a percentage from 0 to 100.`);
  }

  return parsed;
}

function parseMoney(value: string, field: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new RangeError(`${field} must be a finite, nonnegative amount.`);
  }

  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function money(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

function percentage(value: number): string {
  return value.toFixed(2);
}

function roundedProduct(cents: bigint, percentageValue: number): bigint {
  return BigInt(Math.round(Number(cents) * percentageValue));
}

function effectiveDiscount(linePct: number, orderPct: number): number {
  return 100 * (1 - (1 - linePct / 100) * (1 - orderPct / 100));
}

function intervalTotal(
  totals: Partial<Record<Exclude<BillingInterval, "ONE_TIME">, bigint>>,
  interval: BillingInterval,
  amount: bigint,
) {
  if (interval !== "ONE_TIME") {
    totals[interval] = (totals[interval] ?? 0n) + amount;
  }
}

export function priceQuote({
  currency,
  lines,
  orderDiscountPct,
}: PricingInput): PricingResult {
  if (lines.length === 0) {
    throw new RangeError("At least one quote line is required.");
  }

  const orderPct = parsePercentage(orderDiscountPct, "order discount");
  const parsedLines: ParsedLine[] = lines.map((line, index) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new RangeError(
        `Quantity for line ${index + 1} must be a positive integer.`,
      );
    }

    const unitPriceCents = parseMoney(
      line.unitPrice,
      `Unit price for line ${index + 1}`,
    );
    const unitCostCents = parseMoney(
      line.unitCost,
      `Unit cost for line ${index + 1}`,
    );
    const taxPct = parsePercentage(line.taxPct, `Tax for line ${index + 1}`);
    const discountPct = parsePercentage(
      line.discountPct,
      `Discount for line ${index + 1}`,
    );

    return {
      input: line,
      unitPriceCents,
      unitCostCents,
      taxPct,
      discountPct,
      undiscountedCents: unitPriceCents * BigInt(line.quantity),
    };
  });

  const recurringTotals: Partial<
    Record<Exclude<BillingInterval, "ONE_TIME">, bigint>
  > = {};
  let oneTimeTotalCents = 0n;
  let taxTotalCents = 0n;
  let costTotalCents = 0n;
  let marginTotalCents = 0n;
  let totalUndiscountedCents = 0n;

  const pricedLines: PricedDealLine[] = parsedLines.map((line, index) => {
    const effectiveDiscountPct = effectiveDiscount(line.discountPct, orderPct);
    const discountCents = roundedProduct(
      line.undiscountedCents,
      effectiveDiscountPct / 100,
    );
    const subtotalCents = line.undiscountedCents - discountCents;
    const taxCents = roundedProduct(subtotalCents, line.taxPct / 100);
    const totalCents = subtotalCents + taxCents;
    const costCents = line.unitCostCents * BigInt(line.input.quantity);
    const marginCents = subtotalCents - costCents;

    totalUndiscountedCents += line.undiscountedCents;
    taxTotalCents += taxCents;
    costTotalCents += costCents;
    marginTotalCents += marginCents;
    if (line.input.billingInterval === "ONE_TIME") {
      oneTimeTotalCents += totalCents;
    } else {
      intervalTotal(recurringTotals, line.input.billingInterval, totalCents);
    }

    return {
      ...line.input,
      lineId: line.input.lineId ?? `line-${index + 1}`,
      priceSnapshot: line.input.unitPrice,
      costSnapshot: line.input.unitCost,
      undiscountedAmount: money(line.undiscountedCents),
      discountAmount: money(discountCents),
      taxAmount: money(taxCents),
      totalAmount: money(totalCents),
      marginAmount: money(marginCents),
      marginPct:
        subtotalCents === 0n
          ? "0.00"
          : percentage((Number(marginCents) / Number(subtotalCents)) * 100),
    };
  });

  if (totalUndiscountedCents === 0n) {
    throw new RangeError("A quote cannot have a zero undiscounted total.");
  }

  const totalRevenueCents =
    oneTimeTotalCents +
    Object.values(recurringTotals).reduce(
      (sum, value) => sum + (value ?? 0n),
      0n,
    );

  return {
    lines: pricedLines,
    totals: {
      currency,
      oneTimeTotal: money(oneTimeTotalCents),
      recurringTotals: Object.fromEntries(
        Object.entries(recurringTotals).map(([interval, amount]) => [
          interval,
          money(amount ?? 0n),
        ]),
      ),
      taxTotal: money(taxTotalCents),
      costTotal: money(costTotalCents),
      marginTotal: money(marginTotalCents),
      marginPct:
        totalRevenueCents === 0n
          ? "0.00"
          : percentage(
              (Number(marginTotalCents) /
                Number(totalRevenueCents - taxTotalCents)) *
                100,
            ),
    },
    orderDiscountPct,
    effectiveDiscountPct: percentage(
      totalUndiscountedCents === 0n
        ? 0
        : (Number(
            parsedLines.reduce(
              (sum, line) =>
                sum +
                roundedProduct(
                  line.undiscountedCents,
                  effectiveDiscount(line.discountPct, orderPct) / 100,
                ),
              0n,
            ),
          ) /
            Number(totalUndiscountedCents)) *
            100,
    ),
  };
}
