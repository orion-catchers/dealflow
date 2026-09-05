import type { Recommendation, RecommendationInput } from '../../contracts/krishna.ts';

const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Qualification and ranking only; canonical pricing remains Atharva-owned. */
export function rankRecommendations(input: RecommendationInput): Recommendation[] {
  const present = new Set(input.presentProductIds);
  const excluded = new Set([...present, ...input.dismissedProductIds]);
  const rules = new Map(input.rules.map(rule => [rule.id, rule]));
  if (rules.size !== input.rules.length) throw new Error('Duplicate recommendation rule IDs');

  const qualified = input.candidates.flatMap(candidate => {
    const rule = rules.get(candidate.ruleId);
    if (!rule?.active || rule.candidateProductId !== candidate.productId) return [];
    if (rule.baseProductId !== null && !present.has(rule.baseProductId)) return [];
    if (excluded.has(candidate.productId) || !candidate.active || !candidate.compatible) return [];
    // Reject stale or differently priced previews instead of guessing current terms.
    if (candidate.quoteId !== input.quoteId || candidate.revision !== input.revision || candidate.currency !== input.currency) return [];
    if (!Number.isFinite(rule.minimumMarginPct) || rule.minimumMarginPct < 0 || rule.minimumMarginPct > 100) return [];
    if (!Number.isFinite(rule.coPurchaseScore) || rule.coPurchaseScore < 0) return [];
    if (!Number.isFinite(candidate.quantity) || candidate.quantity <= 0) return [];
    if (!Number.isFinite(candidate.candidateMarginPct) || candidate.candidateMarginPct > 100 || candidate.candidateMarginPct < rule.minimumMarginPct) return [];
    if (candidate.marginChangePoints !== null && !Number.isFinite(candidate.marginChangePoints)) return [];
    if (!/^-?\d+(\.\d+)?$/.test(candidate.incrementalProfit)) return [];
    if (!['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY'].includes(candidate.interval)) return [];
    return [{ candidate, rule }];
  });

  // Promotions first, then co-purchase score, then stable IDs. No cross-period
  // profit comparison: monthly and one-time profit are not interchangeable.
  qualified.sort((a, b) =>
    Number(Boolean(b.rule.promotionLabel)) - Number(Boolean(a.rule.promotionLabel)) ||
    b.rule.coPurchaseScore - a.rule.coPurchaseScore ||
    compareId(a.candidate.productId, b.candidate.productId) ||
    compareId(a.candidate.variantId, b.candidate.variantId) || compareId(a.rule.id, b.rule.id));

  const seen = new Set<string>();
  return qualified.flatMap(({ candidate: c, rule }) => {
    if (seen.has(c.productId)) return [];
    seen.add(c.productId);
    return [{
      productId: c.productId, variantId: c.variantId, name: c.name, quantity: c.quantity,
      reason: rule.baseProductId === null ? 'Eligible configured fallback' : 'Configured pairing with a product in this quote',
      promotionLabel: rule.promotionLabel,
      impact: {
        currency: c.currency, interval: c.interval, incrementalProfit: c.incrementalProfit,
        candidateMarginPct: c.candidateMarginPct, marginChangePoints: c.marginChangePoints,
      },
    }];
  });
}
