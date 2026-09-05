import { randomUUID } from "node:crypto";
import type { Actor, CanonicalPort, DataState, Order, Quote, TransactionPort } from "@/contracts/application";
import type { PricedCandidate } from "@/contracts/krishna";
import { AppError, requireValue } from "@/server/errors";
import { prisma } from "@/server/lib/db";
import { initializeBilling } from "@/server/billing/initialize";
import { initializeFulfillment } from "@/server/inventory/initialize";
import { latestPolicyVersionId } from "./state";
import { prismaCustomerId, prismaUserId } from "./ids";
import { applyAtharvaEvaluation, candidatePreview, event, makeLine, newRevision } from "./pricing";

export type Dirty = {
  quotes: Map<string, Quote>;
  confirm?: { order: Order; actor: Actor };
  rules: boolean;
  messages: boolean;
};

function markQuote(dirty: Dirty, quote: Quote) {
  dirty.quotes.set(quote.id, quote);
}

export function liveCanonical(state: DataState, dirty?: Dirty, actorHint?: Actor): CanonicalPort {
  return {
    priceCandidate: (quote, product, ruleId) =>
      product.active
        ? candidatePreview(state, quote, product, ruleId)
        : ({
            ruleId,
            productId: product.id,
            variantId: product.variants[0]?.id ?? "",
            name: product.name,
            active: false,
            compatible: false,
            quoteId: quote.id,
            revision: quote.revision,
            currency: quote.currency,
            quantity: 1,
            interval: product.interval,
            candidateMarginPct: 0,
            incrementalProfit: "0.00",
            marginChangePoints: null,
          } satisfies PricedCandidate),
    addLine(quote, productId, variantId, quantity, actor) {
      newRevision(quote, actor, "Added a quotation line");
      quote.lines.push(makeLine(state, quote, productId, variantId, Math.round(quantity)));
      applyAtharvaEvaluation(state, quote);
      quote.stage = quote.sent ? "UNDER_NEGOTIATION" : "DRAFT";
      dirty && markQuote(dirty, quote);
      return quote;
    },
    revise(quote, changes, actor) {
      newRevision(quote, actor, "Customer counterproposal received");
      for (const change of changes) {
        const line = quote.lines.find((l) => l.id === change.lineId);
        if (!line) continue;
        if (change.quantity !== undefined) line.quantity = Math.round(change.quantity);
        if (change.discountPct !== undefined) line.discountPct = change.discountPct;
      }
      applyAtharvaEvaluation(state, quote);
      quote.stage = "UNDER_NEGOTIATION";
      dirty && markQuote(dirty, quote);
      return quote;
    },
    confirm(quote, actor) {
      const existing = state.orders.find((o) => o.quoteId === quote.id && o.revision === quote.revision);
      if (existing) return existing;
      requireValue(
        ["APPROVED", "NOT_REQUIRED"].includes(quote.evaluation.status) && !quote.dateReviewPending,
        "Approval or date review required",
      );
      const order: Order = {
        id: `pending-${randomUUID()}`,
        quoteId: quote.id,
        revision: quote.revision,
        customerId: quote.customerId,
        currency: quote.currency,
        lines: structuredClone(quote.lines),
        totals: structuredClone(quote.totals),
        status: "PENDING",
        promisedDate: quote.promisedDate,
        allocations: [],
        backorders: [],
        events: [event(actor, "Customer accepted this revision", quote.revision)],
      };
      state.orders.push(order);
      quote.stage = "CONFIRMED";
      quote.orderId = order.id;
      quote.acceptedAt = new Date().toISOString();
      quote.events.push(event(actor, "Customer accepted; order created", quote.revision));
      if (dirty) {
        markQuote(dirty, quote);
        dirty.confirm = { order, actor: actorHint ?? actor };
      }
      return order;
    },
  };
}

export function liveTransactionPort(state: DataState, dirty: Dirty): TransactionPort {
  const requests = new Map<string, { fingerprint: string; result: unknown }>();
  return {
    quote: (id) => state.quotes.find((q) => q.id === id),
    customerQuote: (id, customerId) => state.quotes.find((q) => q.id === id && q.customerId === customerId && q.sent),
    product: (id) => state.products.find((p) => p.id === id),
    rules: () => state.rules,
    saveRules: (rules) => {
      state.rules = structuredClone(rules);
      dirty.rules = true;
    },
    appendProposal: (proposal) => {
      state.proposals.push(proposal);
      dirty.messages = true;
    },
    appendMessage: (message) => {
      state.messages.push(message);
      dirty.messages = true;
    },
    replay(scope, key, fingerprint, perform) {
      const full = `${scope}:${key}`;
      const prior = requests.get(full);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new AppError(409, "KEY_REUSE", "This operation key was used with different terms");
        return structuredClone(prior.result) as ReturnType<typeof perform>;
      }
      const result = perform();
      requests.set(full, { fingerprint, result: structuredClone(result) });
      return result;
    },
    canonical: liveCanonical(state, dirty),
  };
}

function toDbStage(stage: string): "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "UNDER_NEGOTIATION" | "CONFIRMED" | "REJECTED" {
  if (stage === "PENDING_APPROVAL") return "PENDING_APPROVAL";
  if (stage === "APPROVED") return "APPROVED";
  if (stage === "CONFIRMED") return "CONFIRMED";
  if (stage === "REJECTED") return "REJECTED";
  if (stage === "UNDER_NEGOTIATION" || stage === "SENT") return "UNDER_NEGOTIATION";
  return "DRAFT";
}

export async function persistWorkspace(state: DataState, dirty: Dirty) {
  if (dirty.rules) {
    for (const rule of state.rules) {
      if (!rule.candidateProductId) continue;
      await prisma.recommendationRule.upsert({
        where: {
          baseProductId_candidateProductId: {
            baseProductId: rule.baseProductId || rule.candidateProductId,
            candidateProductId: rule.candidateProductId,
          },
        },
        create: {
          baseProductId: rule.baseProductId || rule.candidateProductId,
          candidateProductId: rule.candidateProductId,
          copurchaseScore: rule.coPurchaseScore,
          promotionTag: rule.promotionLabel,
          minMarginPct: rule.minimumMarginPct,
          status: rule.active ? "ACTIVE" : "ARCHIVED",
        },
        update: {
          copurchaseScore: rule.coPurchaseScore,
          promotionTag: rule.promotionLabel,
          minMarginPct: rule.minimumMarginPct,
          status: rule.active ? "ACTIVE" : "ARCHIVED",
        },
      });
    }
  }

  if (dirty.messages) {
    for (const message of state.messages) {
      const existing = await prisma.portalMessage.findUnique({ where: { id: message.id } });
      if (existing) continue;
      const quote = await prisma.quote.findUnique({ where: { id: message.quoteId }, include: { currentRevision: true } });
      if (!quote?.currentRevision) continue;
      const authorId = await prismaUserId(message.senderId).catch(() => quote.repId);
      const lineExists = message.lineId
        ? await prisma.quoteLine.findUnique({ where: { id: message.lineId } })
        : null;
      await prisma.portalMessage.create({
        data: {
          id: message.id,
          quoteId: message.quoteId,
          baseRevisionId: quote.currentRevision.id,
          lineId: lineExists ? message.lineId : null,
          authorId,
          body: message.text,
          proposedPromisedDate: message.requestedDate ? new Date(`${message.requestedDate}T00:00:00Z`) : undefined,
        },
      });
    }
  }

  for (const quote of dirty.quotes.values()) {
    await persistQuote(state, quote);
  }

  if (dirty.confirm) {
    await persistConfirmation(state, dirty.confirm.order, dirty.confirm.actor);
  }
}

export async function persistQuote(state: DataState, quote: Quote) {
  const customerId = await prismaCustomerId(quote.customerId);
  const repId = await prismaUserId(quote.repId);
  const policyVersionId = await latestPolicyVersionId();
  const revisionNumber = Number(quote.revision.replace(/^r/, "")) || 1;
  const stage = toDbStage(quote.stage);

  let row = await prisma.quote.findUnique({ where: { id: quote.id } });
  if (!row) {
    row = await prisma.quote.create({
      data: { id: quote.id, customerId, repId, stage, lastActivityAt: new Date(quote.at) },
    });
  } else {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { customerId, stage, lastActivityAt: new Date(quote.at) },
    });
  }

  const existingRev = await prisma.quoteRevision.findUnique({
    where: { quoteId_revisionNumber: { quoteId: row.id, revisionNumber } },
  });
  if (existingRev) {
    await prisma.quoteRevision.update({
      where: { id: existingRev.id },
      data: {
        approvalStatus:
          quote.evaluation.status === "PENDING"
            ? "PENDING"
            : quote.evaluation.status === "REJECTED"
              ? "REJECTED"
              : quote.evaluation.status === "APPROVED"
                ? "APPROVED"
                : quote.evaluation.status === "SUPERSEDED"
                  ? "SUPERSEDED"
                  : "NOT_REQUIRED",
      },
    });
    return;
  }

  if (row.currentRevisionId) {
    await prisma.quoteRevision.update({
      where: { id: row.currentRevisionId },
      data: { supersededAt: new Date(), approvalStatus: "SUPERSEDED" },
    });
  }

  const oneTime = quote.totals.find((t) => t.interval === "ONE_TIME");
  const monthly = quote.totals.find((t) => t.interval === "MONTHLY");
  const quarterly = quote.totals.find((t) => t.interval === "QUARTERLY");
  const yearly = quote.totals.find((t) => t.interval === "YEARLY");
  const risk =
    quote.evaluation.chain.includes("FINANCE_OPS") ? "FINANCE" : quote.evaluation.chain.includes("SALES_MANAGER") ? "MANAGER" : "NONE";

  const revision = await prisma.quoteRevision.create({
    data: {
      quoteId: row.id,
      revisionNumber,
      policyVersionId,
      riskLevel: risk,
      weightedExcessPct: quote.evaluation.worstExcess,
      worstLineExcessPct: quote.evaluation.worstExcess,
      evaluationReasons: { reasons: quote.evaluation.reasons, breaches: [] },
      approvalStatus:
        quote.evaluation.status === "PENDING"
          ? "PENDING"
          : quote.evaluation.status === "REJECTED"
            ? "REJECTED"
            : quote.evaluation.status === "APPROVED"
              ? "APPROVED"
              : "NOT_REQUIRED",
      orderDiscountPct: quote.orderDiscountPct,
      currency: quote.currency,
      promisedDate: quote.promisedDate ? new Date(`${quote.promisedDate}T00:00:00Z`) : null,
      oneTimeSubtotal: oneTime?.net ?? "0.00",
      oneTimeTax: oneTime?.tax ?? "0.00",
      oneTimeTotal: oneTime?.total ?? "0.00",
      recurringMonthly: monthly?.total ?? "0.00",
      recurringQuarterly: quarterly?.total ?? "0.00",
      recurringYearly: yearly?.total ?? "0.00",
      totalCost: quote.lines.reduce((n, l) => n + Number(l.unitCost) * l.quantity, 0).toFixed(2),
      marginPct: oneTime?.marginPct ?? 0,
      createdById: repId,
    },
  });

  await prisma.quote.update({ where: { id: row.id }, data: { currentRevisionId: revision.id } });

  const chain = quote.evaluation.chain;
  for (let i = 0; i < chain.length; i++) {
    await prisma.quoteRevisionApprovalStep.create({
      data: {
        revisionId: revision.id,
        stepIndex: i,
        role: chain[i] === "FINANCE_OPS" ? "FINANCE" : "SALES_MANAGER",
        status: i < quote.evaluation.step ? "APPROVED" : i === quote.evaluation.step ? "PENDING" : "BLOCKED",
      },
    });
  }

  for (const [index, line] of quote.lines.entries()) {
    const product = await prisma.product.findUnique({ where: { id: line.productId } });
    if (!product) continue;
    await prisma.quoteLine.create({
      data: {
        revisionId: revision.id,
        productId: line.productId,
        variantId: line.variantId || null,
        planId: product.defaultPlanId,
        billingKind: line.interval === "ONE_TIME" ? "ONE_TIME" : "RECURRING",
        interval: line.interval === "ONE_TIME" ? null : line.interval,
        quantity: Math.max(1, Math.round(line.quantity)),
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
        lineDiscountPct: line.discountPct,
        effectiveDiscountPct: 100 * (1 - (1 - line.discountPct / 100) * (1 - quote.orderDiscountPct / 100)),
        ceilingPct: 0,
        excessPct: 0,
        excessAmount: "0.00",
        taxPct: line.taxPct,
        lineSubtotal: line.net,
        taxAmount: line.tax,
        lineTotal: line.total,
        categoryId: product.categoryId,
        stockTracked: line.stockTracked,
        position: index,
      },
    });
  }
}

async function persistConfirmation(state: DataState, order: Order, actor: Actor) {
  const quote = state.quotes.find((q) => q.id === order.quoteId);
  if (!quote) return;
  await persistQuote(state, quote);

  const dbQuote = await prisma.quote.findUnique({
    where: { id: quote.id },
    include: { currentRevision: { include: { lines: { include: { product: true } } } } },
  });
  if (!dbQuote?.currentRevision) return;
  const revision = dbQuote.currentRevision;
  const existing = await prisma.order.findUnique({ where: { sourceRevisionId: revision.id } });
  if (existing) {
    quote.orderId = existing.id;
    order.id = existing.id;
    return;
  }

  const actorId = await prismaUserId(actor.id).catch(() => prismaUserId(quote.repId));
  const acceptance = await prisma.customerAcceptance.upsert({
    where: { revisionId_actorId: { revisionId: revision.id, actorId } },
    create: { revisionId: revision.id, actorId },
    update: {},
  });

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.order.create({
      data: {
        sourceRevisionId: revision.id,
        acceptanceId: acceptance.id,
        customerId: dbQuote.customerId,
        repId: dbQuote.repId,
        teamId: dbQuote.teamId,
        currency: revision.currency,
        promisedDate: revision.promisedDate,
        fulfillmentStatus: "PENDING",
        lines: {
          create: revision.lines.map((line) => ({
            sourceQuoteLineId: line.id,
            productId: line.productId,
            variantId: line.variantId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            unitCost: line.unitCost,
            lineDiscountPct: line.lineDiscountPct,
            taxPct: line.taxPct,
            lineTotal: line.lineTotal,
            billingKind: line.billingKind,
            interval: line.interval,
            planId: line.planId,
            stockTracked: line.stockTracked,
          })),
        },
      },
      include: { lines: true },
    });
    await tx.quote.update({ where: { id: dbQuote.id }, data: { stage: "CONFIRMED" } });
    const billingLines = row.lines.map((line) => {
      const source = revision.lines.find((l) => l.id === line.sourceQuoteLineId);
      return {
        orderLineId: line.id,
        description: source?.product.name ?? "Order line",
        quantity: line.quantity,
        unitPrice: String(line.unitPrice),
        discountPct: Number(line.lineDiscountPct),
        taxPct: Number(line.taxPct),
        lineTotal: String(line.lineTotal),
        billingKind: line.billingKind === "RECURRING" ? ("RECURRING" as const) : ("ONE_TIME" as const),
        interval: line.interval,
        planId: line.planId,
      };
    });
    await initializeBilling(
      tx,
      {
        orderId: row.id,
        customerId: row.customerId,
        currency: row.currency,
        confirmedAt: new Date().toISOString().slice(0, 10),
        lines: billingLines,
      },
      `confirm:${row.id}`,
    );
    await initializeFulfillment(tx, {
      orderId: row.id,
      sourceQuoteId: dbQuote.id,
      sourceRevisionId: revision.id,
      customerId: row.customerId,
      status: "PENDING_FULFILLMENT",
      billingInitialization: "CONNECTED",
      fulfillmentInitialization: "PENDING",
    });
    return row;
  });

  order.id = created.id;
  quote.orderId = created.id;
}
