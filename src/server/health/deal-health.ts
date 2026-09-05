import type {
  HealthFlag,
  HealthFlagType,
  HealthSettings,
  QuoteStage,
} from "@/contracts/atharva";

export interface HealthQuoteInput {
  quoteId: string;
  stage: QuoteStage;
  lastBusinessActivityAt: string;
  currentEffectiveDiscountPct: string;
  salesRepId: string;
  comparableConfirmedDiscounts: Array<{
    quoteId: string;
    confirmedAt: string;
    effectiveDiscountPct: string;
  }>;
}

export interface HealthOrderInput {
  orderId: string;
  promisedDate?: string;
  undeliveredGoodsQty: number;
  unallocatedGoodsQty: number;
  paid: boolean;
}

export interface HealthEvaluationInput {
  quotes: HealthQuoteInput[];
  orders: HealthOrderInput[];
  settings: HealthSettings;
  now: string;
}

export interface HealthCandidate {
  fingerprint: string;
  type: HealthFlagType;
  quoteId?: string;
  orderId?: string;
  reason: string;
}

function daysBetween(earlier: string, later: string): number {
  return (Date.parse(later) - Date.parse(earlier)) / 86_400_000;
}

function number(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new RangeError(`${field} must be numeric.`);
  return parsed;
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

export function findHealthCandidates(
  input: HealthEvaluationInput,
): HealthCandidate[] {
  const candidates: HealthCandidate[] = [];

  for (const quote of input.quotes) {
    if (
      ["PENDING_APPROVAL", "APPROVED", "CONFIRMED", "REJECTED"].includes(
        quote.stage,
      )
    )
      continue;
    if (
      daysBetween(quote.lastBusinessActivityAt, input.now) >
      input.settings.stalledAfterDays
    ) {
      candidates.push({
        fingerprint: `STALLED_QUOTE:${quote.quoteId}`,
        type: "STALLED_QUOTE",
        quoteId: quote.quoteId,
        reason: `Quote has had no meaningful activity for more than ${input.settings.stalledAfterDays} days.`,
      });
    }

    const currentDiscount = number(
      quote.currentEffectiveDiscountPct,
      "current discount",
    );
    const prior = quote.comparableConfirmedDiscounts
      .filter(
        (record) =>
          record.quoteId !== quote.quoteId &&
          Date.parse(record.confirmedAt) <= Date.parse(input.now),
      )
      .map((record) =>
        number(record.effectiveDiscountPct, "historical discount"),
      );
    if (prior.length >= input.settings.anomalyMinimumSamples) {
      const average =
        prior.reduce((sum, value) => sum + value, 0) / prior.length;
      const threshold =
        average +
        number(
          input.settings.anomalyMarginAboveAveragePct,
          "anomaly threshold",
        );
      if (currentDiscount > threshold) {
        candidates.push({
          fingerprint: `DISCOUNT_ANOMALY:${quote.quoteId}`,
          type: "DISCOUNT_ANOMALY",
          quoteId: quote.quoteId,
          reason: `Discount ${currentDiscount.toFixed(2)}% exceeds historical average ${average.toFixed(2)}% by more than the configured margin.`,
        });
      }
    }
  }

  for (const order of input.orders) {
    if (order.undeliveredGoodsQty <= 0) continue;
    const overdue =
      order.promisedDate && dateOnly(input.now) > dateOnly(order.promisedDate);
    const earlyRisk =
      order.unallocatedGoodsQty > 0 &&
      order.promisedDate &&
      daysBetween(input.now, `${order.promisedDate}T00:00:00.000Z`) <= 3;
    if (order.paid || overdue || earlyRisk) {
      candidates.push({
        fingerprint: `DELIVERY_RISK:${order.orderId}`,
        type: "DELIVERY_RISK",
        orderId: order.orderId,
        reason: order.paid
          ? "Payment is complete but goods remain undelivered."
          : overdue
            ? "Promised delivery date has passed with goods remaining."
            : "Goods remain insufficiently allocated near the promised delivery date.",
      });
    }
  }

  return candidates;
}

export function reconcileHealthFlags(
  existing: HealthFlag[],
  candidates: HealthCandidate[],
  detectedAt: string,
): HealthFlag[] {
  const byFingerprint = new Map(
    existing.map((flag) => [
      `${flag.type}:${flag.quoteId ?? flag.orderId}`,
      flag,
    ]),
  );
  const activeFingerprints = new Set(
    candidates.map((candidate) => candidate.fingerprint),
  );
  const result = existing.map((flag) => {
    const fingerprint = `${flag.type}:${flag.quoteId ?? flag.orderId}`;
    if (activeFingerprints.has(fingerprint)) {
      return flag.status === "RESOLVED"
        ? { ...flag, status: "ACTIVE" as const, resolvedAt: undefined }
        : flag;
    }
    return flag.status === "RESOLVED"
      ? flag
      : { ...flag, status: "RESOLVED" as const, resolvedAt: detectedAt };
  });

  for (const candidate of candidates) {
    if (byFingerprint.has(candidate.fingerprint)) continue;
    result.push({
      id: `health-${candidate.type.toLowerCase()}-${candidate.quoteId ?? candidate.orderId}`,
      type: candidate.type,
      status: "ACTIVE",
      quoteId: candidate.quoteId,
      orderId: candidate.orderId,
      reason: candidate.reason,
      detectedAt,
    });
  }
  return result;
}
