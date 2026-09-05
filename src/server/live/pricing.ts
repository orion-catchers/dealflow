import { randomUUID } from "node:crypto";
import type { Actor, DataState, Evaluation, Line, Product, Quote, QuoteRevision } from "@/contracts/application";
import type { PricedCandidate } from "@/contracts/krishna";
import { priceQuote } from "@/features/quotes/engine/pricing";
import { evaluatePolicy } from "@/server/governance/policy-evaluation";
import type { PolicySnapshot } from "@/contracts/atharva";
import { requireValue } from "@/server/errors";

export const money = (n: number | string) => (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toFixed(2);

export function event(actor: Actor, text: string, revision?: string) {
  return { id: randomUUID(), at: new Date().toISOString(), actor: actor.name, text, revision };
}

export function snapshot(q: Quote): QuoteRevision {
  return structuredClone({
    revision: q.revision,
    lines: q.lines,
    totals: q.totals,
    orderDiscountPct: q.orderDiscountPct,
    promisedDate: q.promisedDate,
    evaluation: q.evaluation,
    at: q.at,
  });
}

export function newRevision(q: Quote, actor: Actor, text: string) {
  requireValue(q.stage !== "CONFIRMED", "Confirmed quotations are locked");
  q.history.push(snapshot(q));
  q.revision = `r${Number(q.revision.slice(1) || "1") + 1}`;
  q.at = new Date().toISOString();
  q.acceptedAt = undefined;
  q.events.push(event(actor, text, q.revision));
}

export function resolvedPrice(s: DataState, q: Quote, p: Product, variantId: string) {
  const c = s.customers.find((customer) => customer.id === q.customerId)!;
  const rule = s.priceRules.find((r) => r.productId === p.id && r.tier === c.tier && r.currency === q.currency);
  return money(Number(rule?.price ?? p.price) + Number(p.variants.find((v) => v.id === variantId)?.extraPrice ?? 0));
}

export function makeLine(s: DataState, q: Quote, productId: string, variantId: string, quantity: number): Line {
  const p = s.products.find((product) => product.id === productId);
  requireValue(p?.active, "Choose an active product");
  requireValue(p.variants.some((v) => v.id === variantId), "Choose a valid variant");
  requireValue(Number.isFinite(quantity) && quantity > 0 && quantity <= 1e6, "Quantity must be positive");
  return {
    id: randomUUID(),
    productId,
    variantId,
    description: `${p.name} · ${p.variants.find((v) => v.id === variantId)!.name}`,
    quantity,
    discountPct: 0,
    unitPrice: resolvedPrice(s, q, p, variantId),
    unitCost: p.cost,
    taxPct: p.taxPct,
    tax: "0.00",
    net: "0.00",
    total: "0.00",
    profit: "0.00",
    interval: p.interval,
    stockTracked: p.stockTracked,
  };
}

function policySnapshot(state: DataState): PolicySnapshot {
  return {
    policyVersionId: "live",
    capturedAt: new Date().toISOString().slice(0, 10),
    rules: {
      tierId: "gold",
      tierName: "Gold",
      defaultCeilingPct: String(state.policy.tierLimits.Gold ?? 15),
      categoryCeilingsPct: {
        HARDWARE: String(state.policy.categoryLimits.Hardware ?? 15),
        SERVICES: String(state.policy.categoryLimits.Services ?? 10),
      },
      managerThresholdPct: "0",
      financeWorstLineThresholdPct: String(state.policy.financeExcess),
      financeWeightedThresholdPct: String(state.policy.financeWeighted),
      totalDiscountBudgetPct: state.policy.budget,
      minimumHistorySamples: state.healthSettings.minimumHistory,
    },
  };
}

export function applyAtharvaEvaluation(state: DataState, quote: Quote) {
  if (quote.lines.length === 0) {
    quote.totals = [];
    quote.evaluation = { status: "NOT_REQUIRED", chain: [], step: 0, reasons: [], worstExcess: 0 };
    return;
  }
  for (const l of quote.lines) {
    const p = state.products.find((product) => product.id === l.productId);
    requireValue(p, "Product missing");
    l.unitPrice = resolvedPrice(state, quote, p, l.variantId);
  }
  const priced = priceQuote({
    currency: "INR",
    orderDiscountPct: String(quote.orderDiscountPct),
    lines: quote.lines.map((l) => {
      const product = state.products.find((p) => p.id === l.productId);
      return {
        lineId: l.id,
        productId: l.productId,
        variantId: l.variantId || undefined,
        category: product?.category === "Services" ? "SERVICES" : "HARDWARE",
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        unitCost: l.unitCost,
        taxPct: String(l.taxPct),
        discountPct: String(l.discountPct),
        billingInterval: l.interval,
        stockTracked: l.stockTracked,
      };
    }),
  });
  const byId = new Map(priced.lines.map((l) => [l.lineId, l]));
  for (const l of quote.lines) {
    const row = byId.get(l.id);
    if (!row) continue;
    l.net = money(Number(row.undiscountedAmount) - Number(row.discountAmount));
    l.tax = row.taxAmount;
    l.total = row.totalAmount;
    l.profit = row.marginAmount;
  }
  const groups = new Map<Line["interval"], Line[]>();
  for (const l of quote.lines) {
    const list = groups.get(l.interval) ?? [];
    list.push(l);
    groups.set(l.interval, list);
  }
  quote.totals = [...groups.entries()].map(([interval, lines]) => {
    const net = lines.reduce((n, l) => n + Number(l.net), 0);
    const tax = lines.reduce((n, l) => n + Number(l.tax), 0);
    const total = lines.reduce((n, l) => n + Number(l.total), 0);
    const profit = lines.reduce((n, l) => n + Number(l.profit), 0);
    return {
      interval,
      net: money(net),
      tax: money(tax),
      total: money(total),
      profit: money(profit),
      marginPct: net === 0 ? 0 : Number(((profit / net) * 100).toFixed(2)),
    };
  });
  const evaluation = evaluatePolicy({
    lines: priced.lines,
    orderDiscountPct: String(quote.orderDiscountPct),
    policySnapshot: policySnapshot(state),
  });
  const chain: Evaluation["chain"] = evaluation.requiredApprovalChain.map((level) =>
    level === "FINANCE" ? "FINANCE_OPS" : "SALES_MANAGER",
  );
  quote.evaluation = {
    status: evaluation.status === "PENDING" ? "PENDING" : "NOT_REQUIRED",
    chain,
    step: 0,
    reasons: evaluation.reasons,
    worstExcess: Number(evaluation.worstLineExcessPct),
  };
}

export function candidatePreview(s: DataState, q: Quote, p: Product, ruleId: string): PricedCandidate {
  const copy = structuredClone(q);
  const line = makeLine(s, copy, p.id, p.variants[0].id, 1);
  copy.lines.push(line);
  applyAtharvaEvaluation(s, copy);
  const priced = copy.lines.at(-1)!;
  const before = q.totals.find((t) => t.interval === p.interval);
  const after = copy.totals.find((t) => t.interval === p.interval)!;
  return {
    ruleId,
    productId: p.id,
    variantId: p.variants[0].id,
    name: p.name,
    active: p.active,
    compatible: true,
    quoteId: q.id,
    revision: q.revision,
    currency: q.currency,
    quantity: 1,
    interval: p.interval,
    candidateMarginPct: Number(priced.net) === 0 ? -100 : (Number(priced.profit) / Number(priced.net)) * 100,
    incrementalProfit: money(Number(after.profit) - Number(before?.profit ?? 0)),
    marginChangePoints: before ? Number((after.marginPct - before.marginPct).toFixed(2)) : null,
  };
}
