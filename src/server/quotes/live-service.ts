import { Prisma } from "@/generated/prisma/client";
import type {
  ApprovalDecisionKind,
  BillingInterval as PrismaBillingInterval,
  DiscountTier,
  QuoteStage,
  Role,
} from "@/generated/prisma/client";
import type {
  Currency,
  PricedDealLine,
  Quote,
  DealLineInput,
  DealRevision,
} from "@/contracts/atharva";
import type { Actor } from "@/contracts/harsh";
import { priceQuote } from "@/features/quotes/engine/pricing";
import { evaluatePolicy } from "@/server/governance/policy-evaluation";
import { getLivePolicyService, snapshotForTier } from "@/server/governance/live-policy-service";
import { ApiFailure } from "@/lib/api/respond";
import { prisma, type Db, type Tx } from "@/server/lib/db";
import { requireRole } from "@/server/lib/auth/dev-actor";
import { ACTOR_ID_TO_EMAIL } from "@/server/lib/auth/actor-helpers";
import { recordPrismaAudit } from "@/server/audit/prisma-repository";
import { initializeBilling } from "@/server/billing/initialize";
import { initializeFulfillment } from "@/server/inventory/initialize";
import type { ConfirmedOrderForBilling } from "@/contracts/ruchir";
import type { OrderForFulfillment } from "@/contracts/harsh";

type Client = Db | Tx;
type ExpectedRevision = number | string;

function revisionEquals(current: { id: string; revisionNumber: number }, expected: ExpectedRevision): boolean {
  if (typeof expected === "number") return current.revisionNumber === expected;
  const raw = expected.trim();
  if (!raw) return false;
  if (current.id === raw) return true;
  const numeric = raw.replace(/^r/i, "");
  return String(current.revisionNumber) === raw || String(current.revisionNumber) === numeric;
}

export interface DealLineDraft {
  productId: string;
  variantId?: string;
  quantity: number;
  discountPct?: number | string;
}

export interface QuoteCreateInput {
  customerId: string;
  currency?: Currency;
  orderDiscountPct?: number | string;
  promisedDate?: string | null;
  lines: DealLineDraft[];
}

export interface DealRevisionInput {
  expectedRevision: ExpectedRevision;
  orderDiscountPct?: number | string;
  promisedDate?: string | null;
  lines?: DealLineDraft[];
}

export interface DealLineMutationInput {
  expectedRevision: ExpectedRevision;
  action: "ADD" | "REMOVE" | "REPLACE";
  line?: DealLineDraft;
  lineId?: string;
  lines?: DealLineDraft[];
  orderDiscountPct?: number | string;
  promisedDate?: string | null;
}

export interface ApprovalMutationInput {
  revisionId: string;
  decision: "APPROVE" | "REJECT" | "RETURN";
  reason: string;
  requestKey?: string;
}

export interface ConfirmOrderInput {
  expectedRevision: ExpectedRevision;
  requestKey: string;
}

export interface SendQuoteInput {
  expectedRevision: ExpectedRevision;
  customerTier?: "BRONZE" | "SILVER" | "GOLD";
}

export interface ConfirmOrderResult {
  orderId: string;
  sourceQuoteId: string;
  sourceRevisionId: string;
  customerId: string;
  status: "PENDING_FULFILLMENT";
  billingInitialization: "PENDING" | "CONNECTED";
  fulfillmentInitialization: "PENDING" | "CONNECTED";
  replayed: boolean;
}

type RevisionInclude = {
  policyVersion: {
    id: string;
    createdAt: Date;
    policyCeilings: Array<{
      tier: DiscountTier;
      categoryId: string | null;
      ceilingPct: Prisma.Decimal;
      category: { code: string; name: string } | null;
    }>;
    chainSteps: Array<{ stepIndex: number; role: Role }>;
  };
  lines: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    planId: string | null;
    billingKind: "ONE_TIME" | "RECURRING";
    interval: PrismaBillingInterval | null;
    quantity: number;
    unitPrice: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    lineDiscountPct: Prisma.Decimal;
    effectiveDiscountPct: Prisma.Decimal;
    ceilingPct: Prisma.Decimal;
    excessPct: Prisma.Decimal;
    excessAmount: Prisma.Decimal;
    taxPct: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    categoryId: string;
    stockTracked: boolean;
    position: number;
    product: { name: string; category: { code: string; name: string } };
    variant: { name: string } | null;
  }>;
  approvalSteps: Array<{
    stepIndex: number;
    role: Role;
    status: "PENDING" | "APPROVED" | "BLOCKED";
    decisionId: string | null;
  }>;
  acceptances: Array<{ id: string; actorId: string; createdAt: Date }>;
};

const revisionInclude = {
  policyVersion: {
    include: {
      policyCeilings: { include: { category: true } },
      chainSteps: { orderBy: { stepIndex: "asc" as const } },
    },
  },
  lines: {
    orderBy: { position: "asc" as const },
    include: {
      product: { include: { category: true } },
      variant: { select: { name: true } },
    },
  },
  approvalSteps: { orderBy: { stepIndex: "asc" as const } },
  acceptances: { orderBy: { createdAt: "asc" as const } },
} as const;

const quoteInclude = {
  customer: { select: { id: true, name: true, discountTier: true, currency: true } },
  rep: { select: { id: true, name: true } },
  currentRevision: { include: revisionInclude },
  revisions: {
    orderBy: { revisionNumber: "asc" as const },
    include: revisionInclude,
  },
} as const;

type RevisionRow = RevisionInclude & {
  id: string;
  quoteId: string;
  revisionNumber: number;
  riskLevel: "NONE" | "MANAGER" | "FINANCE";
  weightedExcessPct: Prisma.Decimal;
  worstLineExcessPct: Prisma.Decimal;
  evaluationReasons: unknown;
  approvalStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  orderDiscountPct: Prisma.Decimal;
  currency: string;
  promisedDate: Date | null;
  oneTimeSubtotal: Prisma.Decimal;
  oneTimeTax: Prisma.Decimal;
  oneTimeTotal: Prisma.Decimal;
  recurringMonthly: Prisma.Decimal;
  recurringQuarterly: Prisma.Decimal;
  recurringYearly: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  marginPct: Prisma.Decimal;
  createdById: string;
  createdAt: Date;
};

type QuoteRow = {
  id: string;
  dealId: string | null;
  customerId: string;
  repId: string;
  teamId: string | null;
  stage: QuoteStage;
  currentRevisionId: string | null;
  lastActivityAt: Date;
  customer: { id: string; name: string; discountTier: DiscountTier; currency: string };
  rep: { id: string; name: string };
  currentRevision: RevisionRow | null;
  revisions: RevisionRow[];
};

function decimal(value: Prisma.Decimal | { toString(): string } | number): string {
  return value.toString();
}

function dateOnly(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

function dateValue(value: string | null | undefined): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiFailure("INVALID_INPUT", "promisedDate must be YYYY-MM-DD.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiFailure("INVALID_INPUT", "promisedDate is not a valid calendar date.");
  }
  return parsed;
}

function percentage(value: number | string | undefined, field: string): string {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new ApiFailure("INVALID_INPUT", `${field} must be between 0 and 100.`);
  }
  return parsed.toFixed(2);
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function lineInterval(line: RevisionRow["lines"][number]): "ONE_TIME" | "MONTHLY" | "QUARTERLY" | "YEARLY" {
  return line.billingKind === "ONE_TIME" ? "ONE_TIME" : line.interval!;
}

function policySnapshotFromStoredRevision(row: RevisionRow) {
  const raw = jsonObject(row.evaluationReasons);
  const stored = raw.policySnapshot;
  return stored && typeof stored === "object"
    ? stored as DealRevision["evaluation"]["policySnapshot"]
    : snapshotForTier(row.policyVersion as never, "GOLD");
}

function toPricedLine(line: RevisionRow["lines"][number]): PricedDealLine {
  const undiscounted = new Prisma.Decimal(line.unitPrice).times(line.quantity);
  const discountAmount = undiscounted.minus(line.lineSubtotal);
  return {
    lineId: line.id,
    productId: line.productId,
    variantId: line.variantId ?? undefined,
    category: line.product.category.name,
    description: line.variant ? `${line.product.name} · ${line.variant.name}` : line.product.name,
    quantity: line.quantity,
    unitPrice: money(line.unitPrice),
    unitCost: money(line.unitCost),
    taxPct: decimal(line.taxPct),
    discountPct: decimal(line.lineDiscountPct),
    billingInterval: lineInterval(line),
    stockTracked: line.stockTracked,
    priceSnapshot: money(line.unitPrice),
    costSnapshot: money(line.unitCost),
    undiscountedAmount: money(undiscounted),
    discountAmount: money(discountAmount),
    taxAmount: money(line.taxAmount),
    totalAmount: money(line.lineTotal),
    marginAmount: money(line.lineSubtotal.minus(new Prisma.Decimal(line.unitCost).times(line.quantity))),
    marginPct: line.lineSubtotal.isZero()
      ? "0.00"
      : line.lineSubtotal.minus(new Prisma.Decimal(line.unitCost).times(line.quantity))
          .div(line.lineSubtotal).times(100).toFixed(2),
  };
}

function toRevision(row: RevisionRow): DealRevision {
  const lines = row.lines.map(toPricedLine);
  const raw = jsonObject(row.evaluationReasons);
  const storedEvaluation = raw.evaluation && typeof raw.evaluation === "object"
    ? raw.evaluation as DealRevision["evaluation"]
    : {
        status: row.approvalStatus === "NOT_REQUIRED" ? "NOT_REQUIRED" : "PENDING",
        riskLevel: row.riskLevel,
        requiredApprovalChain: row.approvalSteps.map((step) => step.role === "SALES_MANAGER" ? "MANAGER" : "FINANCE"),
        breaches: Array.isArray(raw.breaches) ? raw.breaches : [],
        weightedExcessPct: decimal(row.weightedExcessPct),
        worstLineExcessPct: decimal(row.worstLineExcessPct),
        reasons: Array.isArray(raw.reasons) ? raw.reasons : [],
        policySnapshot: policySnapshotFromStoredRevision(row),
      };
  const recurringTotals: Partial<Record<"MONTHLY" | "QUARTERLY" | "YEARLY", string>> = {};
  if (!new Prisma.Decimal(row.recurringMonthly).isZero()) recurringTotals.MONTHLY = money(row.recurringMonthly);
  if (!new Prisma.Decimal(row.recurringQuarterly).isZero()) recurringTotals.QUARTERLY = money(row.recurringQuarterly);
  if (!new Prisma.Decimal(row.recurringYearly).isZero()) recurringTotals.YEARLY = money(row.recurringYearly);
  return {
    id: row.id,
    quoteId: row.quoteId,
    revisionNumber: row.revisionNumber,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdById,
    currency: row.currency as Currency,
    promisedDate: dateOnly(row.promisedDate),
    lines,
    pricing: {
      lines,
      totals: {
        currency: row.currency as Currency,
        oneTimeTotal: money(row.oneTimeTotal),
        recurringTotals,
        taxTotal: lines.reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0)).toFixed(2),
        costTotal: money(row.totalCost),
        marginTotal: lines.reduce((sum, line) => sum.plus(line.marginAmount), new Prisma.Decimal(0)).toFixed(2),
        marginPct: decimal(row.marginPct),
      },
      orderDiscountPct: decimal(row.orderDiscountPct),
      effectiveDiscountPct: lines.length
        ? row.lines.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.effectiveDiscountPct).times(new Prisma.Decimal(line.unitPrice).times(line.quantity))), new Prisma.Decimal(0))
            .div(lines.reduce((sum, line) => sum.plus(line.undiscountedAmount), new Prisma.Decimal(0))).toFixed(2)
        : "0.00",
    },
    evaluation: storedEvaluation as DealRevision["evaluation"],
    approvalStatus: row.approvalStatus,
    customerAcceptedAt: row.acceptances[0] ? row.acceptances[0].createdAt.toISOString() : undefined,
    customerAcceptedBy: row.acceptances[0]?.actorId,
  };
}

function toQuote(row: QuoteRow): Quote {
  const revisions = row.revisions.map(toRevision);
  const current = row.currentRevision ?? revisions.find((revision) => revision.id === row.currentRevisionId);
  if (!current) throw new ApiFailure("CONFLICT", `Quote ${row.id} has no current revision.`);
  return {
    id: row.id,
    customerId: row.customerId,
    salesRepId: row.repId,
    stage: row.stage,
    currentRevisionId: current.id,
    currentRevisionNumber: current.revisionNumber,
    lastBusinessActivityAt: row.lastActivityAt.toISOString(),
    revisions,
  };
}

function quoteStageForEvaluation(status: "NOT_REQUIRED" | "PENDING", draftStage: QuoteStage = "DRAFT"): QuoteStage {
  if (draftStage === "UNDER_NEGOTIATION") return status === "PENDING" ? "PENDING_APPROVAL" : "UNDER_NEGOTIATION";
  return draftStage;
}

function roleForApproval(role: "MANAGER" | "FINANCE"): Role {
  return role === "MANAGER" ? "SALES_MANAGER" : "FINANCE";
}

function approvalRoleForActor(actor: Actor): Role {
  if (actor.role === "ADMIN") return "ADMIN";
  return actor.role as Role;
}

async function updateDealLifecycle(
  tx: Tx,
  dealId: string | null,
  data: { status?: QuoteStage; lastActivityAt: Date },
) {
  if (!dealId) return;
  await tx.deal.update({ where: { id: dealId }, data });
}

export class LiveQuoteService {
  constructor(private readonly db: Db = prisma) {}

  async list(actor: Actor): Promise<Quote[]> {
    requireRole(actor, "ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "CUSTOMER");
    const where = await this.quoteScope(actor, this.db);
    const rows = await this.db.quote.findMany({
      where,
      include: quoteInclude,
      orderBy: { lastActivityAt: "desc" },
    });
    return rows.map((row) => toQuote(row as unknown as QuoteRow));
  }

  async get(actor: Actor, quoteId: string): Promise<Quote> {
    const row = await this.loadVisibleQuote(actor, quoteId, this.db);
    return toQuote(row);
  }

  async create(actor: Actor, input: QuoteCreateInput): Promise<Quote> {
    requireRole(actor, "ADMIN", "SALES_REP", "SALES_MANAGER");
    if (!input.lines?.length) throw new ApiFailure("INVALID_INPUT", "A quote must contain at least one line.");
    const actorId = await this.resolveActorUserId(actor, this.db);
    const customer = await this.resolveCustomer(input.customerId, this.db);
    if (actor.role === "SALES_REP" && customer.assignedRepId !== actorId) {
      throw new ApiFailure("FORBIDDEN", "Sales reps may only quote their assigned customers.");
    }
    return this.db.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          customerId: customer.id,
          repId: actor.role === "SALES_REP" ? actorId : customer.assignedRepId,
          teamId: customer.teamId,
        },
      });
      const quote = await tx.quote.create({
        data: {
          dealId: deal.id,
          customerId: customer.id,
          repId: actor.role === "SALES_REP" ? actorId : customer.assignedRepId,
          teamId: customer.teamId,
        },
      });
      const revision = await this.writeRevision(tx, { ...quote, currentRevision: null }, actorId, {
        expectedRevision: 0,
        lines: input.lines,
        orderDiscountPct: input.orderDiscountPct,
        promisedDate: input.promisedDate,
        stage: "DRAFT",
      });
      await tx.quote.update({ where: { id: quote.id }, data: { currentRevisionId: revision.id } });
      await recordPrismaAudit(tx, {
        entityType: "Quote",
        entityId: quote.id,
        revisionId: revision.id,
        actorId,
        action: "QUOTE_CREATED",
        metadata: { revisionNumber: 1 },
      });
      return toQuote(await tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude }) as unknown as QuoteRow);
    });
  }

  async revise(actor: Actor, quoteId: string, input: DealRevisionInput): Promise<Quote> {
    requireRole(actor, "ADMIN", "SALES_REP", "SALES_MANAGER");
    const actorId = await this.resolveActorUserId(actor, this.db);
    return this.db.$transaction(async (tx) => {
      const quote = await this.lockVisibleQuote(actor, quoteId, tx);
      this.assertExpectedRevision(quote, input.expectedRevision);
      if (quote.stage === "CONFIRMED") throw new ApiFailure("CONFLICT", "Confirmed quotes cannot be edited.");
      const current = quote.currentRevision!;
      const lines = input.lines ?? current.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId ?? undefined,
        quantity: line.quantity,
        discountPct: Number(line.lineDiscountPct),
      }));
      await this.writeRevision(tx, quote, actorId, {
        expectedRevision: current.revisionNumber,
        lines,
        orderDiscountPct: input.orderDiscountPct ?? decimal(current.orderDiscountPct),
        promisedDate: input.promisedDate === undefined ? dateOnly(current.promisedDate) : input.promisedDate,
        stage: quote.stage === "UNDER_NEGOTIATION" ? "UNDER_NEGOTIATION" : "DRAFT",
      });
      return toQuote(await tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude }) as unknown as QuoteRow);
    });
  }

  async mutateLines(actor: Actor, quoteId: string, input: DealLineMutationInput): Promise<Quote> {
    const quote = await this.get(actor, quoteId);
    const current = quote.revisions.find((revision) => revision.id === quote.currentRevisionId)!;
    let lines: DealLineDraft[] = current.lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      discountPct: line.discountPct,
    }));
    if (input.action === "ADD") {
      if (!input.line) throw new ApiFailure("INVALID_INPUT", "line is required for ADD.");
      lines.push(input.line);
    } else if (input.action === "REMOVE") {
      if (!input.lineId) throw new ApiFailure("INVALID_INPUT", "lineId is required for REMOVE.");
      const before = lines.length;
      lines = lines.filter((_, index) => current.lines[index]?.lineId !== input.lineId);
      if (lines.length === before) throw new ApiFailure("NOT_FOUND", "Quote line not found.");
    } else {
      if (!input.lines) throw new ApiFailure("INVALID_INPUT", "lines is required for REPLACE.");
      lines = input.lines;
    }
    if (!lines.length) throw new ApiFailure("INVALID_INPUT", "A quote must contain at least one line.");
    return this.revise(actor, quoteId, {
      expectedRevision: input.expectedRevision,
      lines,
      orderDiscountPct: input.orderDiscountPct,
      promisedDate: input.promisedDate,
    });
  }

  async submit(actor: Actor, quoteId: string, expectedRevision: ExpectedRevision): Promise<Quote> {
    requireRole(actor, "ADMIN", "SALES_REP", "SALES_MANAGER");
    const actorId = await this.resolveActorUserId(actor, this.db);
    return this.db.$transaction(async (tx) => {
      const quote = await this.lockVisibleQuote(actor, quoteId, tx);
      this.assertExpectedRevision(quote, expectedRevision);
      if (!["DRAFT", "UNDER_NEGOTIATION"].includes(quote.stage)) {
        throw new ApiFailure("CONFLICT", "Only draft or negotiating quotes can be submitted.");
      }
      const stage = quote.currentRevision!.approvalStatus === "NOT_REQUIRED" ? "APPROVED" : "PENDING_APPROVAL";
      const lastActivityAt = new Date();
      await tx.quote.update({ where: { id: quote.id }, data: { stage, lastActivityAt } });
      await updateDealLifecycle(tx, quote.dealId, { status: stage, lastActivityAt });
      await recordPrismaAudit(tx, {
        entityType: "Quote",
        entityId: quote.id,
        revisionId: quote.currentRevisionId!,
        actorId,
        action: "QUOTE_SUBMITTED",
        metadata: { stage },
      });
      return toQuote(await tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude }) as unknown as QuoteRow);
    });
  }

  async send(actor: Actor, quoteId: string, input: SendQuoteInput): Promise<Quote> {
    requireRole(actor, "ADMIN", "SALES_REP", "SALES_MANAGER");
    const actorId = await this.resolveActorUserId(actor, this.db);
    return this.db.$transaction(async (tx) => {
      const quote = await this.lockVisibleQuote(actor, quoteId, tx);
      this.assertExpectedRevision(quote, input.expectedRevision);
      if (quote.stage !== "APPROVED") throw new ApiFailure("CONFLICT", "Only approved quotes can be sent.");
      if (input.customerTier) {
        const discountTier: DiscountTier = input.customerTier === "BRONZE" ? "STANDARD" : input.customerTier;
        await tx.customer.update({ where: { id: quote.customerId }, data: { discountTier } });
      }
      const lastActivityAt = new Date();
      await tx.quote.update({ where: { id: quote.id }, data: { stage: "UNDER_NEGOTIATION", lastActivityAt } });
      await updateDealLifecycle(tx, quote.dealId, { status: "UNDER_NEGOTIATION", lastActivityAt });
      await recordPrismaAudit(tx, {
        entityType: "Quote",
        entityId: quote.id,
        revisionId: quote.currentRevisionId!,
        actorId,
        action: "QUOTE_SENT",
        metadata: {},
      });
      return toQuote(await tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude }) as unknown as QuoteRow);
    });
  }

  async accept(actor: Actor, quoteId: string, expectedRevision: ExpectedRevision) {
    requireRole(actor, "CUSTOMER");
    const actorId = await this.resolveActorUserId(actor, this.db);
    return this.db.$transaction(async (tx) => {
      const quote = await this.lockVisibleQuote(actor, quoteId, tx);
      await this.assertCustomerMembership(actor, quote.customerId, tx);
      this.assertExpectedRevision(quote, expectedRevision);
      const revision = quote.currentRevision!;
      if (!["APPROVED", "UNDER_NEGOTIATION"].includes(quote.stage)) {
        throw new ApiFailure("CONFLICT", "Quote is not ready for customer acceptance.");
      }
      if (revision.approvalStatus === "PENDING" || revision.approvalStatus === "REJECTED" || revision.approvalStatus === "SUPERSEDED") {
        throw new ApiFailure("CONFLICT", "The current revision is not eligible for acceptance.");
      }
      const existing = revision.acceptances.find((item) => item.actorId === actorId);
      if (existing) return { acceptanceId: existing.id, revisionId: revision.id, replayed: true };
      const acceptance = await tx.customerAcceptance.create({
        data: { revisionId: revision.id, actorId },
      });
      const lastActivityAt = new Date();
      await tx.quote.update({ where: { id: quote.id }, data: { lastActivityAt } });
      await updateDealLifecycle(tx, quote.dealId, { lastActivityAt });
      await recordPrismaAudit(tx, {
        entityType: "CustomerAcceptance",
        entityId: acceptance.id,
        revisionId: revision.id,
        actorId,
        action: "CUSTOMER_ACCEPTED",
        metadata: { quoteId: quote.id },
      });
      return { acceptanceId: acceptance.id, revisionId: revision.id, replayed: false };
    });
  }

  async propose(
    actor: Actor,
    quoteId: string,
    input: {
      expectedRevision: ExpectedRevision;
      requestKey: string;
      body: string;
      lineChanges: Array<{ lineId: string; quantity?: number; discountPct?: number; comment?: string }>;
      requestedDeliveryDate?: string;
    },
  ) {
    requireRole(actor, "CUSTOMER");
    if (!input.requestKey.trim()) throw new ApiFailure("INVALID_INPUT", "requestKey is required.");
    if (!input.body.trim() && !input.lineChanges.some((line) => line.comment?.trim() || line.quantity !== undefined || line.discountPct !== undefined) && !input.requestedDeliveryDate) {
      throw new ApiFailure("INVALID_INPUT", "Proposal body or a requested change is required.");
    }
    const actorId = await this.resolveActorUserId(actor, this.db);
    return this.db.$transaction(async (tx) => {
      const quote = await this.lockVisibleQuote(actor, quoteId, tx);
      await this.assertCustomerMembership(actor, quote.customerId, tx);
      this.assertExpectedRevision(quote, input.expectedRevision);
      if (quote.stage === "CONFIRMED" || quote.stage === "REJECTED") throw new ApiFailure("CONFLICT", "This quote cannot receive a proposal.");
      const current = quote.currentRevision!;
      const fingerprint = JSON.stringify({
        quoteId,
        expectedRevision: input.expectedRevision,
        body: input.body.trim(),
        lineChanges: input.lineChanges,
        requestedDeliveryDate: input.requestedDeliveryDate ?? null,
      });
      const prior = await tx.auditEvent.findFirst({
        where: {
          actorId,
          action: "CUSTOMER_PROPOSAL",
          metadata: { path: ["requestKey"], equals: input.requestKey },
        },
        orderBy: { createdAt: "desc" },
      });
      if (prior) {
        const meta = jsonObject(prior.metadata);
        if (meta.fingerprint !== fingerprint || meta.quoteId !== quoteId) {
          throw new ApiFailure("CONFLICT", "Request key belongs to another proposal.");
        }
        return {
          proposalId: String(meta.proposalId ?? ""),
          proposedRevisionId: String(meta.proposedRevisionId ?? current.id),
          replayed: true,
        };
      }
      const numeric = input.lineChanges.filter((line) => line.quantity !== undefined || line.discountPct !== undefined);
      const nextLines = current.lines.map((line) => {
        const change = numeric.find((item) => item.lineId === line.id);
        return {
          productId: line.productId,
          variantId: line.variantId ?? undefined,
          quantity: change?.quantity ?? line.quantity,
          discountPct: change?.discountPct ?? Number(line.lineDiscountPct),
        };
      });
      let revision = current;
      if (numeric.length || input.requestedDeliveryDate) {
        const created = await this.writeRevision(tx, quote, actorId, {
          expectedRevision: current.revisionNumber,
          lines: nextLines,
          orderDiscountPct: current.orderDiscountPct.toString(),
          promisedDate: input.requestedDeliveryDate ?? dateOnly(current.promisedDate),
          stage: "UNDER_NEGOTIATION",
        });
        revision = created;
      }
      const message = await tx.portalMessage.create({
        data: {
          quoteId,
          baseRevisionId: current.id,
          authorId: actorId,
          body: input.body.trim() || "Customer proposed updated terms.",
          status: "OPEN",
          proposedPromisedDate: input.requestedDeliveryDate ? dateValue(input.requestedDeliveryDate) : null,
          spawnedRevisionId: revision.id === current.id ? null : revision.id,
        },
      });
      await recordPrismaAudit(tx, {
        entityType: "PortalMessage",
        entityId: message.id,
        revisionId: revision.id,
        actorId,
        action: "CUSTOMER_PROPOSAL",
        metadata: {
          quoteId,
          requestKey: input.requestKey,
          fingerprint,
          proposalId: message.id,
          proposedRevisionId: revision.id,
          baseRevisionId: current.id,
        },
      });
      return { proposalId: message.id, proposedRevisionId: revision.id, replayed: false };
    });
  }

  async decideApproval(actor: Actor, input: ApprovalMutationInput): Promise<Quote> {
    requireRole(actor, "ADMIN", "SALES_MANAGER", "FINANCE");
    const trimmed = input.reason.trim();
    if (!trimmed) throw new ApiFailure("INVALID_INPUT", "Reason is required.");
    const actorId = await this.resolveActorUserId(actor, this.db);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "QuoteRevision" WHERE id = ${input.revisionId} FOR UPDATE`;
      const revision = await tx.dealRevision.findUnique({
        where: { id: input.revisionId },
        include: {
          quote: { include: { customer: { select: { id: true, name: true, discountTier: true, currency: true } }, rep: { select: { id: true, name: true } } } },
          ...revisionInclude,
        },
      });
      if (!revision) throw new ApiFailure("NOT_FOUND", "Revision not found.");
      if (revision.quote.currentRevisionId !== revision.id) throw new ApiFailure("CONFLICT", "Approval must target the current quote revision.");
      if (revision.approvalStatus !== "PENDING") throw new ApiFailure("CONFLICT", "This revision is not awaiting approval.");
      if (revision.createdById === actorId) throw new ApiFailure("FORBIDDEN", "You cannot approve a revision you authored.");
      if (input.requestKey) {
        const prior = await tx.auditEvent.findFirst({
          where: {
            entityType: "DealRevision",
            entityId: revision.id,
            action: "APPROVAL_DECISION",
            metadata: { path: ["requestKey"], equals: input.requestKey },
          },
        });
        if (prior) return toQuote(await tx.quote.findUniqueOrThrow({ where: { id: revision.quote.id }, include: quoteInclude }) as unknown as QuoteRow);
      }
      const pending = [...revision.approvalSteps].sort((a, b) => a.stepIndex - b.stepIndex).find((step) => step.status === "PENDING");
      if (!pending) throw new ApiFailure("CONFLICT", "No pending approval step.");
      if (actor.role !== "ADMIN" && actor.role !== pending.role) {
        throw new ApiFailure("FORBIDDEN", `Role ${actor.role} may not act on this step.`);
      }
      const decision = await tx.approvalDecision.create({
        data: {
          revisionId: revision.id,
          actorId,
          actorRole: approvalRoleForActor(actor),
          stepIndex: pending.stepIndex,
          kind: input.decision as ApprovalDecisionKind,
          reason: trimmed,
        },
      });
      if (input.decision === "APPROVE") {
        await tx.dealApprovalStep.update({
          where: { revisionId_stepIndex: { revisionId: revision.id, stepIndex: pending.stepIndex } },
          data: { status: "APPROVED", decisionId: decision.id },
        });
        const remaining = revision.approvalSteps.some((step) => step.stepIndex !== pending.stepIndex && step.status === "PENDING");
        if (!remaining) {
          await tx.dealRevision.update({ where: { id: revision.id }, data: { approvalStatus: "APPROVED" } });
          const lastActivityAt = new Date();
          await tx.quote.update({ where: { id: revision.quote.id }, data: { stage: "APPROVED", lastActivityAt } });
          await updateDealLifecycle(tx, revision.quote.dealId, { status: "APPROVED", lastActivityAt });
        }
      } else if (input.decision === "REJECT") {
        await tx.dealRevision.update({ where: { id: revision.id }, data: { approvalStatus: "REJECTED" } });
        const lastActivityAt = new Date();
        await tx.quote.update({ where: { id: revision.quote.id }, data: { stage: "REJECTED", lastActivityAt } });
        await updateDealLifecycle(tx, revision.quote.dealId, { status: "REJECTED", lastActivityAt });
        await tx.dealApprovalStep.updateMany({
          where: { revisionId: revision.id, status: "PENDING" },
          data: { status: "BLOCKED" },
        });
      } else {
        const lastActivityAt = new Date();
        await tx.quote.update({ where: { id: revision.quote.id }, data: { stage: "UNDER_NEGOTIATION", lastActivityAt } });
        await updateDealLifecycle(tx, revision.quote.dealId, { status: "UNDER_NEGOTIATION", lastActivityAt });
      }
      await recordPrismaAudit(tx, {
        entityType: "DealRevision",
        entityId: revision.id,
        revisionId: revision.id,
        actorId,
        action: "APPROVAL_DECISION",
        reason: trimmed,
        requestKey: input.requestKey,
        metadata: { requestKey: input.requestKey, decision: input.decision, stepIndex: pending.stepIndex },
      });
      return toQuote(await tx.quote.findUniqueOrThrow({ where: { id: revision.quote.id }, include: quoteInclude }) as unknown as QuoteRow);
    });
  }

  async confirm(actor: Actor, quoteId: string, input: ConfirmOrderInput): Promise<ConfirmOrderResult> {
    requireRole(actor, "CUSTOMER");
    if (!input.requestKey.trim()) throw new ApiFailure("INVALID_INPUT", "requestKey is required.");
    const actorId = await this.resolveActorUserId(actor, this.db);
    return this.db.$transaction(async (tx) => {
      const request = await tx.requestKey.findUnique({
        where: { scope_key: { scope: "CONFIRM_ORDER", key: input.requestKey } },
      });
      if (request?.completedAt && request.resultPayload) {
        const payload = request.resultPayload as unknown as ConfirmOrderResult;
        if (payload.sourceQuoteId !== quoteId) {
          throw new ApiFailure("CONFLICT", "Request key belongs to another confirmation.");
        }
        return { ...payload, replayed: true };
      }
      if (request) throw new ApiFailure("CONFLICT", "Confirmation request is already in progress.");
      const quote = await this.lockVisibleQuote(actor, quoteId, tx);
      await this.assertCustomerMembership(actor, quote.customerId, tx);
      this.assertExpectedRevision(quote, input.expectedRevision);
      const revision = quote.currentRevision!;
      const existingOrder = await tx.order.findUnique({ where: { sourceRevisionId: revision.id } });
      if (existingOrder) {
        const fulfillmentInitialization = await initializeFulfillment(tx, {
          orderId: existingOrder.id,
          sourceQuoteId: quote.id,
          sourceRevisionId: revision.id,
          customerId: quote.customerId,
          status: "PENDING_FULFILLMENT",
          billingInitialization: "CONNECTED",
          fulfillmentInitialization: "PENDING",
        });
        const payload: ConfirmOrderResult = {
          orderId: existingOrder.id,
          sourceQuoteId: quote.id,
          sourceRevisionId: revision.id,
          customerId: quote.customerId,
          status: "PENDING_FULFILLMENT",
          billingInitialization: "CONNECTED",
          fulfillmentInitialization,
          replayed: true,
        };
        await tx.requestKey.create({
          data: {
            scope: "CONFIRM_ORDER",
            key: input.requestKey,
            actorId,
            resultKind: "ORDER",
            resultId: existingOrder.id,
            resultPayload: payload as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        return payload;
      }
      let acceptance = revision.acceptances.find((row) => row.actorId === actorId);
      if (!acceptance) {
        acceptance = await tx.customerAcceptance.create({
          data: { revisionId: revision.id, actorId },
        });
      }
      if (revision.approvalStatus === "PENDING" || revision.approvalStatus === "REJECTED" || revision.approvalStatus === "SUPERSEDED") {
        throw new ApiFailure("CONFLICT", "The current revision is not approved for confirmation.");
      }
      if (quote.stage === "CONFIRMED") throw new ApiFailure("CONFLICT", "Quote is already confirmed.");
      const claim = await tx.requestKey.create({
        data: { scope: "CONFIRM_ORDER", key: input.requestKey, actorId },
      });
      const order = await tx.order.create({
        data: {
          dealId: quote.dealId,
          sourceRevisionId: revision.id,
          acceptanceId: acceptance.id,
          customerId: quote.customerId,
          repId: quote.repId,
          teamId: quote.teamId,
          currency: revision.currency,
          promisedDate: revision.promisedDate,
          lines: {
            create: revision.lines.map((line) => ({
              sourceDealLineId: line.id,
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
        include: {
          lines: {
            include: {
              product: { select: { name: true } },
              variant: { select: { name: true, shippingWeight: true } },
              sourceDealLine: { include: { product: { select: { name: true } }, variant: { select: { name: true } } } },
            },
          },
          customer: { select: { name: true } },
        },
      });
      const lastActivityAt = new Date();
      await tx.quote.update({ where: { id: quote.id }, data: { stage: "CONFIRMED", lastActivityAt } });
      await updateDealLifecycle(tx, quote.dealId, { status: "CONFIRMED", lastActivityAt });
      const billingInput: ConfirmedOrderForBilling = {
        orderId: order.id,
        customerId: order.customerId,
        currency: revision.currency,
        confirmedAt: order.createdAt.toISOString().slice(0, 10),
        lines: order.lines.map((line) => {
          const dealLine = revision.lines.find((item) => item.id === line.sourceDealLineId);
          const productName = dealLine?.product.name ?? line.product.name;
          const variantName = dealLine?.variant?.name ?? line.variant?.name;
          return {
            orderLineId: line.id,
            description: variantName ? `${productName} · ${variantName}` : productName,
            quantity: dealLine?.quantity ?? line.quantity,
            unitPrice: money(dealLine?.unitPrice ?? line.unitPrice),
            discountPct: Number((dealLine?.lineDiscountPct ?? line.lineDiscountPct).toString()),
            taxPct: Number((dealLine?.taxPct ?? line.taxPct).toString()),
            lineTotal: money(dealLine?.lineTotal ?? line.lineTotal),
            billingKind: (dealLine?.billingKind ?? line.billingKind) === "RECURRING" ? "RECURRING" : "ONE_TIME",
            interval: dealLine?.interval ?? line.interval,
            planId: dealLine?.planId ?? line.planId,
          };
        }),
      };
      await initializeBilling(tx, billingInput, input.requestKey);
      const fulfillmentInput: OrderForFulfillment = {
        orderId: order.id,
        customerId: order.customerId,
        customerName: order.customer.name,
        repId: order.repId,
        currency: (revision.currency === "USD" || revision.currency === "EUR" ? revision.currency : "INR") as "INR" | "USD" | "EUR",
        promisedDate: dateOnly(revision.promisedDate),
        confirmedAt: order.createdAt.toISOString(),
        lines: order.lines.map((line) => {
          const dealLine = revision.lines.find((item) => item.id === line.sourceDealLineId);
          return {
            orderLineId: line.id,
            productId: dealLine?.productId ?? line.productId,
            productName: dealLine?.product.name ?? line.product.name,
            variantId: dealLine?.variantId ?? line.variantId ?? undefined,
            variantLabel: dealLine?.variant?.name ?? line.variant?.name,
            quantity: line.quantity,
            stockTracked: dealLine?.stockTracked ?? line.stockTracked,
            isSubscription: (dealLine?.billingKind ?? line.billingKind) === "RECURRING",
            shippingWeightKg: line.variant?.shippingWeight ? Number(line.variant.shippingWeight.toString()) : undefined,
          };
        }),
      };
      void fulfillmentInput;
      const orderReady = {
        orderId: order.id,
        sourceQuoteId: quote.id,
        sourceRevisionId: revision.id,
        customerId: quote.customerId,
        status: "PENDING_FULFILLMENT" as const,
        billingInitialization: "CONNECTED" as const,
        fulfillmentInitialization: "PENDING" as const,
      };
      const fulfillmentInitialization = await initializeFulfillment(tx, orderReady);
      const payload: ConfirmOrderResult = {
        ...orderReady,
        fulfillmentInitialization,
        replayed: false,
      };
      await tx.requestKey.update({
        where: { id: claim.id },
        data: { resultKind: "ORDER", resultId: order.id, resultPayload: payload as unknown as Prisma.InputJsonValue, completedAt: new Date() },
      });
      await recordPrismaAudit(tx, {
        entityType: "Order",
        entityId: order.id,
        revisionId: revision.id,
        actorId,
        action: "ORDER_CONFIRMED",
        metadata: { quoteId: quote.id, requestKey: input.requestKey, fulfillmentInitialization: "PENDING", billingInitialization: "CONNECTED" },
      });
      return payload;
    });
  }

  async dashboard(actor: Actor) {
    requireRole(actor, "ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE");
    const where = await this.quoteScope(actor, this.db);
    const [pendingApprovals, openQuotes, atRiskDeals, recentEvents] = await Promise.all([
      this.db.dealRevision.count({ where: { approvalStatus: "PENDING", quote: where } }),
      this.db.quote.count({ where: { ...where, stage: { notIn: ["CONFIRMED", "REJECTED"] } } }),
      this.db.healthFlag.count({
        where: {
          resolvedAt: null,
          OR: [{ quote: where }, { order: { sourceRevision: { quote: where } } }],
        },
      }),
      this.db.auditEvent.findMany({ where: { actorId: actor.role === "SALES_REP" ? await this.resolveActorUserId(actor, this.db) : undefined }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    return {
      pendingApprovals,
      openQuotes,
      atRiskDeals,
      recentEvents: recentEvents.map((event) => ({
        id: event.id,
        label: event.action,
        occurredAt: event.createdAt.toISOString(),
        quoteId: event.entityType === "Quote" ? event.entityId : undefined,
        orderId: event.entityType === "Order" ? event.entityId : undefined,
      })),
    };
  }

  async portalQuote(actor: Actor, quoteId: string) {
    requireRole(actor, "CUSTOMER");
    const row = await this.loadVisibleQuote(actor, quoteId, this.db);
    const quote = toQuote(row);
    const current = quote.revisions.find((revision) => revision.id === quote.currentRevisionId)!;
    return {
      quoteId: quote.id,
      customerId: quote.customerId,
      stage: quote.stage,
      current: {
        revision: current.id,
        revisionNumber: current.revisionNumber,
        currency: current.currency,
        promisedDate: current.promisedDate ?? null,
        approvalStatus: current.approvalStatus,
        lines: current.lines.map((line) => ({
          id: line.lineId,
          description: line.description,
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          discountPct: line.discountPct,
          unitPrice: line.unitPrice,
          taxPct: line.taxPct,
          taxAmount: line.taxAmount,
          totalAmount: line.totalAmount,
          billingInterval: line.billingInterval,
        })),
        totals: current.pricing.totals,
      },
      history: quote.revisions.map((revision) => ({
        revision: revision.id,
        revisionNumber: revision.revisionNumber,
        approvalStatus: revision.approvalStatus,
        createdAt: revision.createdAt,
      })),
    };
  }

  private async writeRevision(
    tx: Tx,
    quote: {
      id: string;
      dealId: string | null;
      customerId: string;
      repId: string;
      currentRevision: RevisionRow | null;
      currentRevisionId: string | null;
      teamId?: string | null;
    },
    actorId: string,
    input: {
      expectedRevision: number;
      lines: DealLineDraft[];
      orderDiscountPct?: number | string;
      promisedDate?: string | null;
      stage: QuoteStage;
    },
  ): Promise<RevisionRow> {
    const customer = await this.resolveCustomer(quote.customerId, tx);
    const current = quote.currentRevision;
    if (input.expectedRevision !== (current?.revisionNumber ?? 0)) {
      throw new ApiFailure("CONFLICT", "Quote revision is stale.", { currentRevision: current?.revisionNumber ?? 0 });
    }
    if (!input.lines.length) throw new ApiFailure("INVALID_INPUT", "A revision must contain at least one line.");
    const policyRow = await tx.policyVersion.findFirst({
      include: {
        policyCeilings: { include: { category: true } },
        chainSteps: { orderBy: { stepIndex: "asc" as const } },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!policyRow) throw new ApiFailure("INVALID_INPUT", "No published policy version exists.");
    const policySnapshot = snapshotForTier(policyRow, customer.discountTier);
    const resolvedLines: Array<DealLineInput & { categoryId: string; planId: string | null }> = [];
    for (const [index, draft] of input.lines.entries()) {
      if (!Number.isInteger(draft.quantity) || draft.quantity <= 0) {
        throw new ApiFailure("INVALID_INPUT", `Line ${index + 1} quantity must be a positive integer.`);
      }
      const catalog = await this.resolveCatalogLine(customer, draft, tx);
      resolvedLines.push({
        productId: catalog.productId,
        variantId: catalog.variantId,
        category: catalog.category,
        description: catalog.description,
        quantity: draft.quantity,
        unitPrice: catalog.unitPrice,
        unitCost: catalog.unitCost,
        taxPct: catalog.taxPct,
        discountPct: percentage(draft.discountPct, `Line ${index + 1} discount`),
        billingInterval: catalog.billingInterval as DealLineInput["billingInterval"],
        stockTracked: catalog.stockTracked,
        categoryId: catalog.categoryId,
        planId: catalog.planId,
      });
    }
    const priced = priceQuote({
      currency: customer.currency as Currency,
      lines: resolvedLines.map((line) => ({ ...line, lineId: crypto.randomUUID() })),
      orderDiscountPct: percentage(input.orderDiscountPct, "orderDiscountPct"),
    });
    const evaluation = evaluatePolicy({
      lines: priced.lines,
      orderDiscountPct: priced.orderDiscountPct,
      policySnapshot,
    });
    const revision = await tx.dealRevision.create({
      data: {
        quoteId: quote.id,
        dealId: quote.dealId,
        revisionNumber: input.expectedRevision + 1,
        policyVersionId: policyRow.id,
        riskLevel: evaluation.riskLevel,
        weightedExcessPct: evaluation.weightedExcessPct,
        worstLineExcessPct: evaluation.worstLineExcessPct,
        evaluationReasons: {
          evaluation,
          policySnapshot,
          reasons: evaluation.reasons,
          breaches: evaluation.breaches,
        } as unknown as Prisma.InputJsonValue,
        approvalStatus: evaluation.status === "PENDING" ? "PENDING" : "NOT_REQUIRED",
        orderDiscountPct: priced.orderDiscountPct,
        currency: priced.totals.currency,
        promisedDate: dateValue(input.promisedDate),
        oneTimeSubtotal: priced.lines.filter((line) => line.billingInterval === "ONE_TIME")
          .reduce((sum, line) => sum.plus(line.undiscountedAmount).minus(line.discountAmount), new Prisma.Decimal(0)),
        oneTimeTax: priced.lines.filter((line) => line.billingInterval === "ONE_TIME")
          .reduce((sum, line) => sum.plus(line.taxAmount), new Prisma.Decimal(0)),
        oneTimeTotal: priced.totals.oneTimeTotal,
        recurringMonthly: priced.totals.recurringTotals.MONTHLY ?? "0.00",
        recurringQuarterly: priced.totals.recurringTotals.QUARTERLY ?? "0.00",
        recurringYearly: priced.totals.recurringTotals.YEARLY ?? "0.00",
        totalCost: priced.totals.costTotal,
        marginPct: priced.totals.marginPct,
        createdById: actorId,
        lines: {
          create: priced.lines.map((line, position) => {
            const breach = evaluation.breaches.find((item) => item.lineId === line.lineId);
            const category = line.category
              ? policySnapshot.rules.categoryCeilingsPct[line.category]
              : undefined;
            const ceiling = category ? Math.min(Number(policySnapshot.rules.defaultCeilingPct), Number(category)) : Number(policySnapshot.rules.defaultCeilingPct);
            return {
              productId: line.productId,
              variantId: line.variantId ?? null,
              planId: resolvedLines[position]!.planId,
              billingKind: line.billingInterval === "ONE_TIME" ? "ONE_TIME" : "RECURRING",
              interval: line.billingInterval === "ONE_TIME" ? null : line.billingInterval,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              unitCost: line.unitCost,
              lineDiscountPct: line.discountPct,
              effectiveDiscountPct: priced.effectiveDiscountPct,
              ceilingPct: ceiling.toFixed(2),
              excessPct: breach?.excessPointsPct ?? "0.00",
              excessAmount: breach?.excessAmount ?? "0.00",
              taxPct: line.taxPct,
              lineSubtotal: new Prisma.Decimal(line.undiscountedAmount).minus(line.discountAmount),
              taxAmount: line.taxAmount,
              lineTotal: line.totalAmount,
              categoryId: resolvedLines[position]!.categoryId,
              stockTracked: line.stockTracked,
              position,
            };
          }),
        },
        approvalSteps: {
          create: evaluation.requiredApprovalChain.map((level, stepIndex) => ({
            stepIndex,
            role: roleForApproval(level),
          })),
        },
      },
      include: revisionInclude,
    });
    // DealLine.categoryId is a foreign key and needs the catalog category row.
    // The nested create above is replaced with explicit line writes below when
    // the generated client rejects undefined category IDs.
    if (current && current.approvalStatus !== "NOT_REQUIRED") {
      await tx.dealRevision.update({
        where: { id: current.id },
        data: { approvalStatus: "SUPERSEDED", supersededAt: new Date() },
      });
    }
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        currentRevisionId: revision.id,
        stage: quoteStageForEvaluation(evaluation.status, input.stage),
        lastActivityAt: new Date(),
      },
    });
    await updateDealLifecycle(tx, quote.dealId, {
      status: quoteStageForEvaluation(evaluation.status, input.stage),
      lastActivityAt: new Date(),
    });
    await recordPrismaAudit(tx, {
      entityType: "DealRevision",
      entityId: revision.id,
      revisionId: revision.id,
      actorId,
      action: "REVISION_EVALUATED",
      metadata: {
        quoteId: quote.id,
        revisionNumber: revision.revisionNumber,
        policyVersionId: policyRow.id,
        riskLevel: evaluation.riskLevel,
      },
    });
    return revision as unknown as RevisionRow;
  }

  private async resolveCatalogLine(customer: { id: string; priceListId: string; currency: string }, draft: DealLineDraft, db: Client) {
    const product = await db.product.findUnique({
      where: { id: await this.resolveProductId(draft.productId, db) },
      include: { category: true, defaultPlan: true },
    });
    if (!product || product.archivedAt) throw new ApiFailure("NOT_FOUND", `Product ${draft.productId} is not available.`);
    const variant = draft.variantId
      ? await db.variant.findUnique({ where: { id: await this.resolveVariantId(draft.variantId, db) } })
      : null;
    if (draft.variantId && (!variant || variant.productId !== product.id || variant.archivedAt)) {
      throw new ApiFailure("NOT_FOUND", `Variant ${draft.variantId} is not available on product ${draft.productId}.`);
    }
    const tier = (await db.customer.findUniqueOrThrow({ where: { id: customer.id }, select: { discountTier: true } })).discountTier;
    const specific = variant
      ? await db.priceRule.findFirst({ where: { priceListId: customer.priceListId, productId: product.id, variantId: variant.id, tier, currency: customer.currency, active: true } })
      : null;
    const generic = await db.priceRule.findFirst({ where: { priceListId: customer.priceListId, productId: product.id, variantId: null, tier, currency: customer.currency, active: true } });
    const unitPrice = new Prisma.Decimal(specific?.unitPrice ?? generic?.unitPrice ?? product.basePrice).plus(variant?.extraPrice ?? 0);
    return {
      productId: product.id,
      variantId: variant?.id,
      category: product.category.name,
      description: variant ? `${product.name} · ${variant.name}` : product.name,
      unitPrice: unitPrice.toFixed(2),
      unitCost: (variant?.cost ?? product.baseCost).toString(),
      taxPct: product.taxPct.toString(),
      billingInterval: product.defaultPlan ? product.defaultPlan.interval : "ONE_TIME",
      stockTracked: product.stockTracked,
      planId: product.defaultPlanId,
      categoryId: product.categoryId,
    };
  }

  private async loadVisibleQuote(actor: Actor, quoteId: string, db: Client): Promise<QuoteRow> {
    const where = await this.quoteScope(actor, db);
    const row = await db.quote.findFirst({ where: { id: quoteId, ...where }, include: quoteInclude });
    if (!row) throw new ApiFailure("NOT_FOUND", "Quote not found.");
    return row as unknown as QuoteRow;
  }

  private async lockVisibleQuote(actor: Actor, quoteId: string, db: Tx): Promise<QuoteRow> {
    await db.$queryRaw`SELECT id FROM "Quote" WHERE id = ${quoteId} FOR UPDATE`;
    return this.loadVisibleQuote(actor, quoteId, db);
  }

  private async quoteScope(actor: Actor, db: Client): Promise<Record<string, unknown>> {
    if (actor.role === "CUSTOMER") {
      const customerIds = await this.customerIdsForActor(actor, db);
      return { customerId: { in: customerIds } };
    }
    if (actor.role === "SALES_REP") {
      return { repId: await this.resolveActorUserId(actor, db) };
    }
    if (actor.role === "SALES_MANAGER") {
      const id = await this.resolveActorUserId(actor, db);
      const user = await db.user.findUnique({ where: { id }, select: { teamId: true } });
      if (!user?.teamId) throw new ApiFailure("FORBIDDEN", "Sales manager has no assigned team.");
      return { teamId: user.teamId };
    }
    return {};
  }

  private assertExpectedRevision(quote: QuoteRow, expected: ExpectedRevision) {
    const current = quote.currentRevision;
    if (!current || !revisionEquals(current, expected)) {
      throw new ApiFailure("CONFLICT", "Quote revision is stale. Reload and review the current revision.", {
        currentRevision: current?.revisionNumber,
        currentRevisionId: current?.id,
      });
    }
  }

  private async resolveActorUserId(actor: Actor, db: Client): Promise<string> {
    const email = ACTOR_ID_TO_EMAIL[actor.id];
    const row = email
      ? await db.user.findUnique({ where: { email }, select: { id: true } })
      : await db.user.findUnique({ where: { id: actor.id }, select: { id: true } });
    if (!row) throw new ApiFailure("UNAUTHENTICATED", "Actor is not a database user.");
    return row.id;
  }

  private async customerIdsForActor(actor: Actor, db: Client): Promise<string[]> {
    const userId = await this.resolveActorUserId(actor, db);
    const memberships = await db.customerMembership.findMany({ where: { userId }, select: { customerId: true } });
    if (!memberships.length) throw new ApiFailure("FORBIDDEN", "Customer has no active customer membership.");
    return memberships.map((membership) => membership.customerId);
  }

  private async assertCustomerMembership(actor: Actor, customerId: string, db: Client) {
    const ids = await this.customerIdsForActor(actor, db);
    if (!ids.includes(customerId)) throw new ApiFailure("FORBIDDEN", "Customer cannot access this quote.");
  }

  private async resolveCustomer(id: string, db: Client) {
    const direct = await db.customer.findUnique({ where: { id } });
    if (direct) return direct;
    const fixture = (await import("@/fixtures/harsh")).harshFixtures.customers.find((customer) => customer.sym === id);
    if (fixture) {
    const mapped = await db.customer.findFirst({ where: { contactEmail: fixture.contactEmail } });
      if (mapped) return mapped;
    }
    throw new ApiFailure("NOT_FOUND", `Customer ${id} not found.`);
  }

  private async resolveProductId(id: string, db: Client): Promise<string> {
    if (await db.product.findUnique({ where: { id }, select: { id: true } })) return id;
    const fixture = (await import("@/fixtures/harsh")).harshFixtures.products.find((product) => product.sym === id);
    if (!fixture) return id;
    const mapped = await db.product.findUnique({ where: { sku: fixture.sku }, select: { id: true } });
    return mapped?.id ?? id;
  }

  private async resolveVariantId(id: string, db: Client): Promise<string> {
    if (await db.variant.findUnique({ where: { id }, select: { id: true } })) return id;
    const fixture = (await import("@/fixtures/harsh")).harshFixtures.variants.find((variant) => variant.sym === id);
    if (!fixture) return id;
    const mapped = await db.variant.findUnique({ where: { sku: fixture.sku }, select: { id: true } });
    return mapped?.id ?? id;
  }
}

let instance: LiveQuoteService | undefined;
export function getLiveQuoteService(): LiveQuoteService {
  return (instance ??= new LiveQuoteService());
}
