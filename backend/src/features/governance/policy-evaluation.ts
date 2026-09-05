import type {
  ApprovalLevel,
  BillingInterval,
  PolicyBreach,
  PolicyEvaluation,
  PolicySnapshot,
  PricedQuoteLine,
} from "../../contracts/atharva";

export interface PolicyEvaluationInput {
  lines: PricedQuoteLine[];
  orderDiscountPct: string;
  policySnapshot: PolicySnapshot;
}

interface IntervalRisk {
  interval: BillingInterval;
  breaches: PolicyBreach[];
  weightedExcessPct: number;
  worstLineExcessPct: number;
  requiresManager: boolean;
  requiresFinance: boolean;
}

const INTERVAL_LABELS: Record<BillingInterval, string> = {
  ONE_TIME: "one-time",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  YEARLY: "yearly",
};

function parsePercentage(value: string, fieldName: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new RangeError(`${fieldName} must be a percentage from 0 to 100.`);
  }

  return parsed;
}

function parseNonNegativeAmount(value: string, fieldName: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new RangeError(`${fieldName} must be a finite, nonnegative amount.`);
  }

  return parsed;
}

function decimal(value: number): string {
  return value.toFixed(2);
}

function ceilingForLine(
  line: PricedQuoteLine,
  snapshot: PolicySnapshot,
): number {
  const defaultCeiling = parsePercentage(
    snapshot.rules.defaultCeilingPct,
    "default policy ceiling",
  );
  const categoryCeiling = line.category
    ? snapshot.rules.categoryCeilingsPct[line.category]
    : undefined;

  if (!categoryCeiling) {
    return defaultCeiling;
  }

  return parsePercentage(categoryCeiling, `ceiling for ${line.category}`);
}

function evaluateInterval(
  interval: BillingInterval,
  lines: PricedQuoteLine[],
  orderDiscountPct: number,
  policySnapshot: PolicySnapshot,
): IntervalRisk {
  const breaches: PolicyBreach[] = [];
  let totalUndiscountedAmount = 0;
  let totalExcessAmount = 0;
  let worstLineExcessPct = 0;

  for (const line of lines) {
    const lineDiscountPct = parsePercentage(
      line.discountPct,
      `discount for line ${line.lineId}`,
    );
    const undiscountedAmount = parseNonNegativeAmount(
      line.undiscountedAmount,
      `undiscounted amount for line ${line.lineId}`,
    );
    const ceilingPct = ceilingForLine(line, policySnapshot);
    const effectiveDiscountPct =
      100 * (1 - (1 - lineDiscountPct / 100) * (1 - orderDiscountPct / 100));
    const excessPointsPct = Math.max(0, effectiveDiscountPct - ceilingPct);
    const excessAmount = (undiscountedAmount * excessPointsPct) / 100;

    totalUndiscountedAmount += undiscountedAmount;
    totalExcessAmount += excessAmount;
    worstLineExcessPct = Math.max(worstLineExcessPct, excessPointsPct);

    if (excessPointsPct > 0) {
      breaches.push({
        lineId: line.lineId,
        reason: `${line.description} exceeds the ${decimal(ceilingPct)}% ${
          line.category ?? "configured"
        } ceiling for ${INTERVAL_LABELS[interval]} terms.`,
        excessPointsPct: decimal(excessPointsPct),
        excessAmount: decimal(excessAmount),
      });
    }
  }

  const weightedExcessPct = totalUndiscountedAmount
    ? (totalExcessAmount / totalUndiscountedAmount) * 100
    : 0;
  const requiresManager = breaches.length > 0;
  const requiresFinance =
    worstLineExcessPct >
      parsePercentage(
        policySnapshot.rules.financeWorstLineThresholdPct,
        "Finance worst-line threshold",
      ) ||
    weightedExcessPct >
      parsePercentage(
        policySnapshot.rules.financeWeightedThresholdPct,
        "Finance weighted threshold",
      );

  return {
    interval,
    breaches,
    weightedExcessPct,
    worstLineExcessPct,
    requiresManager,
    requiresFinance,
  };
}

function approvalChain(
  requiresManager: boolean,
  requiresFinance: boolean,
): ApprovalLevel[] {
  if (requiresFinance) {
    return ["MANAGER", "FINANCE"];
  }

  return requiresManager ? ["MANAGER"] : [];
}

export function evaluatePolicy({
  lines,
  orderDiscountPct: orderDiscountValue,
  policySnapshot,
}: PolicyEvaluationInput): PolicyEvaluation {
  if (lines.length === 0) {
    throw new RangeError(
      "At least one quote line is required for policy evaluation.",
    );
  }

  const orderDiscountPct = parsePercentage(
    orderDiscountValue,
    "order discount",
  );
  const groupedLines = new Map<BillingInterval, PricedQuoteLine[]>();

  for (const line of lines) {
    const currentLines = groupedLines.get(line.billingInterval) ?? [];
    currentLines.push(line);
    groupedLines.set(line.billingInterval, currentLines);
  }

  const intervalRisks = Array.from(groupedLines, ([interval, intervalLines]) =>
    evaluateInterval(interval, intervalLines, orderDiscountPct, policySnapshot),
  );
  const requiresManager = intervalRisks.some((risk) => risk.requiresManager);
  const requiresFinance = intervalRisks.some((risk) => risk.requiresFinance);
  const breaches = intervalRisks.flatMap((risk) => risk.breaches);
  const weightedExcessPct = Math.max(
    ...intervalRisks.map((risk) => risk.weightedExcessPct),
  );
  const worstLineExcessPct = Math.max(
    ...intervalRisks.map((risk) => risk.worstLineExcessPct),
  );
  const requiredApprovalChain = approvalChain(requiresManager, requiresFinance);
  const reasons = breaches.map((breach) => breach.reason);

  if (requiresFinance) {
    reasons.push(
      "Finance approval is required because a line or interval group exceeds the Finance threshold.",
    );
  } else if (requiresManager) {
    reasons.push("Manager approval is required for the policy breach.");
  } else {
    reasons.push(
      "All line and order discounts are within configured ceilings.",
    );
  }

  return {
    status: requiredApprovalChain.length ? "PENDING" : "NOT_REQUIRED",
    riskLevel: requiresFinance
      ? "FINANCE"
      : requiresManager
        ? "MANAGER"
        : "NONE",
    requiredApprovalChain,
    breaches,
    weightedExcessPct: decimal(weightedExcessPct),
    worstLineExcessPct: decimal(worstLineExcessPct),
    reasons,
    policySnapshot,
  };
}
