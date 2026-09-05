import { Prisma } from "@/generated/prisma/client";

type Decimal = InstanceType<typeof Prisma.Decimal>;

const D = (value: string | number) => new Prisma.Decimal(value);

export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function roundPct(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function effectivePct(linePct: Decimal, orderPct: Decimal): Decimal {
  const lineFactor = D(1).minus(linePct.div(100));
  const orderFactor = D(1).minus(orderPct.div(100));
  return roundPct(D(100).times(D(1).minus(lineFactor.times(orderFactor))));
}

export type TierCeiling = { tier: string; ceilingPct: string };
export type CategoryCeiling = {
  tier: string;
  categorySym: string;
  ceilingPct: string;
};

export function ceilingFor(
  tier: string,
  categorySym: string | null,
  tierCeilings: TierCeiling[],
  categoryCeilings: CategoryCeiling[],
): Decimal {
  const tierRow = tierCeilings.find((row) => row.tier === tier);
  if (!tierRow) {
    throw new Error(`Missing tier ceiling for ${tier}`);
  }
  let ceiling = D(tierRow.ceilingPct);
  if (categorySym) {
    const categoryRow = categoryCeilings.find(
      (row) => row.tier === tier && row.categorySym === categorySym,
    );
    if (categoryRow) {
      const categoryCeiling = D(categoryRow.ceilingPct);
      if (categoryCeiling.lt(ceiling)) {
        ceiling = categoryCeiling;
      }
    }
  }
  return ceiling;
}

export type EvaluatedLineInput = {
  qty: number;
  unitPrice: string;
  unitCost: string;
  taxPct: string;
  linePct: string;
  categorySym: string;
  billingKind: "ONE_TIME" | "RECURRING";
  interval?: "MONTHLY" | "QUARTERLY" | "YEARLY";
};

export type EvaluatedLine = {
  qty: number;
  unitPrice: Decimal;
  unitCost: Decimal;
  taxPct: Decimal;
  lineDiscountPct: Decimal;
  effectiveDiscountPct: Decimal;
  ceilingPct: Decimal;
  excessPct: Decimal;
  excessAmount: Decimal;
  lineSubtotal: Decimal;
  taxAmount: Decimal;
  lineTotal: Decimal;
  billingKind: "ONE_TIME" | "RECURRING";
  interval?: "MONTHLY" | "QUARTERLY" | "YEARLY";
  categorySym: string;
};

export type RevisionTotals = {
  riskLevel: "NONE" | "MANAGER" | "FINANCE";
  weightedExcessPct: Decimal;
  worstLineExcessPct: Decimal;
  oneTimeSubtotal: Decimal;
  oneTimeTax: Decimal;
  oneTimeTotal: Decimal;
  recurringMonthly: Decimal;
  recurringQuarterly: Decimal;
  recurringYearly: Decimal;
  totalCost: Decimal;
  marginPct: Decimal;
  lines: EvaluatedLine[];
};

export type PolicyThresholds = {
  managerWorstExcessPct: string;
  managerWeightedExcessPct: string;
  financeWorstExcessPct: string;
  financeWeightedExcessPct: string;
};

export function evaluateRevision(
  tier: string,
  lines: EvaluatedLineInput[],
  orderPct: string,
  tierCeilings: TierCeiling[],
  categoryCeilings: CategoryCeiling[],
  thresholds: PolicyThresholds,
): RevisionTotals {
  const orderDiscount = D(orderPct);
  const evaluatedLines: EvaluatedLine[] = [];
  let undiscountedTotal = D(0);
  let excessAmountTotal = D(0);
  let worstLineExcess = D(0);
  let oneTimeSubtotal = D(0);
  let oneTimeTax = D(0);
  let recurringMonthly = D(0);
  let recurringQuarterly = D(0);
  let recurringYearly = D(0);
  let totalCost = D(0);

  for (const line of lines) {
    const unitPrice = D(line.unitPrice);
    const unitCost = D(line.unitCost);
    const taxPct = D(line.taxPct);
    const lineDiscountPct = D(line.linePct);
    const effective = effectivePct(lineDiscountPct, orderDiscount);
    const ceiling = ceilingFor(
      tier,
      line.categorySym,
      tierCeilings,
      categoryCeilings,
    );
    const excess = roundPct(Decimal.max(D(0), effective.minus(ceiling)));
    const undiscounted = unitPrice.times(line.qty);
    const excessAmount = roundMoney(undiscounted.times(excess).div(100));
    const lineSubtotal = roundMoney(
      unitPrice.times(line.qty).times(D(1).minus(effective.div(100))),
    );
    const taxAmount = roundMoney(lineSubtotal.times(taxPct).div(100));
    const lineTotal = roundMoney(lineSubtotal.plus(taxAmount));

    undiscountedTotal = undiscountedTotal.plus(undiscounted);
    excessAmountTotal = excessAmountTotal.plus(excessAmount);
    if (excess.gt(worstLineExcess)) {
      worstLineExcess = excess;
    }
    totalCost = totalCost.plus(unitCost.times(line.qty));

    if (line.billingKind === "ONE_TIME") {
      oneTimeSubtotal = oneTimeSubtotal.plus(lineSubtotal);
      oneTimeTax = oneTimeTax.plus(taxAmount);
    } else if (line.interval === "MONTHLY") {
      recurringMonthly = recurringMonthly.plus(lineSubtotal);
    } else if (line.interval === "QUARTERLY") {
      recurringQuarterly = recurringQuarterly.plus(lineSubtotal);
    } else if (line.interval === "YEARLY") {
      recurringYearly = recurringYearly.plus(lineSubtotal);
    }

    evaluatedLines.push({
      qty: line.qty,
      unitPrice,
      unitCost,
      taxPct,
      lineDiscountPct,
      effectiveDiscountPct: effective,
      ceilingPct: ceiling,
      excessPct: excess,
      excessAmount,
      lineSubtotal,
      taxAmount,
      lineTotal,
      billingKind: line.billingKind,
      interval: line.interval,
      categorySym: line.categorySym,
    });
  }

  const weightedExcessPct =
    undiscountedTotal.eq(0)
      ? D(0)
      : roundPct(excessAmountTotal.div(undiscountedTotal).times(100));

  const financeWorst = D(thresholds.financeWorstExcessPct);
  const financeWeighted = D(thresholds.financeWeightedExcessPct);
  let riskLevel: RevisionTotals["riskLevel"] = "NONE";
  if (worstLineExcess.gt(financeWorst) || weightedExcessPct.gt(financeWeighted)) {
    riskLevel = "FINANCE";
  } else if (worstLineExcess.gt(0)) {
    riskLevel = "MANAGER";
  }

  const oneTimeTotal = roundMoney(oneTimeSubtotal.plus(oneTimeTax));
  const revenueBase = oneTimeSubtotal
    .plus(recurringMonthly)
    .plus(recurringQuarterly)
    .plus(recurringYearly);
  const marginPct = revenueBase.eq(0)
    ? D(0)
    : roundPct(revenueBase.minus(totalCost).div(revenueBase).times(100));

  return {
    riskLevel,
    weightedExcessPct,
    worstLineExcessPct: worstLineExcess,
    oneTimeSubtotal: roundMoney(oneTimeSubtotal),
    oneTimeTax: roundMoney(oneTimeTax),
    oneTimeTotal,
    recurringMonthly: roundMoney(recurringMonthly),
    recurringQuarterly: roundMoney(recurringQuarterly),
    recurringYearly: roundMoney(recurringYearly),
    totalCost: roundMoney(totalCost),
    marginPct,
    lines: evaluatedLines,
  };
}

/** Recurring columns store untaxed subtotals by interval; tax is not rolled into them. */
export function assertDemoTotals(
  label: string,
  totals: RevisionTotals,
  expected: {
    oneTimeTotal: string;
    recurringMonthly: string;
    riskLevel: RevisionTotals["riskLevel"];
    worstLineExcessPct?: string;
  },
): void {
  const failures: string[] = [];
  if (!totals.oneTimeTotal.eq(D(expected.oneTimeTotal))) {
    failures.push(
      `${label} oneTimeTotal expected ${expected.oneTimeTotal}, got ${totals.oneTimeTotal.toFixed(2)}`,
    );
  }
  if (!totals.recurringMonthly.eq(D(expected.recurringMonthly))) {
    failures.push(
      `${label} recurringMonthly expected ${expected.recurringMonthly}, got ${totals.recurringMonthly.toFixed(2)}`,
    );
  }
  if (totals.riskLevel !== expected.riskLevel) {
    failures.push(
      `${label} riskLevel expected ${expected.riskLevel}, got ${totals.riskLevel}`,
    );
  }
  if (
    expected.worstLineExcessPct !== undefined &&
    !totals.worstLineExcessPct.eq(D(expected.worstLineExcessPct))
  ) {
    failures.push(
      `${label} worstLineExcessPct expected ${expected.worstLineExcessPct}, got ${totals.worstLineExcessPct.toFixed(2)}`,
    );
  }
  if (failures.length > 0) {
    throw new Error(`Seed math assertion failed:\n${failures.join("\n")}`);
  }
}

const Decimal = Prisma.Decimal;
