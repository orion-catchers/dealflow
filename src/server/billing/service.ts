import type { Actor } from "@/contracts/harsh";
import type {
  BillingInitResult,
  ConfirmedOrderForBilling,
  CreditNoteRecord,
  DueBillingResult,
  InvoiceRecord,
  InvoiceStatus,
  IsoDate,
  PaymentRecord,
  PlanRef,
  SubscriptionChangeRecord,
  SubscriptionPlanRecord,
  SubscriptionRecord,
  SubscriptionStatus,
} from "@/contracts/ruchir";
import { parseInput } from "@/features/catalog/api";
import { ApiFailure } from "@/lib/api/respond";
import { getCatalogService } from "@/server/catalog/service";
import { requireRole } from "@/server/lib/auth/dev-actor";
import {
  dueBillingBodySchema,
  paymentBodySchema,
  planCreateSchema,
  planPatchSchema,
  subscriptionPatchSchema,
} from "./api";
import { addInterval } from "./engine/calendar";
import { fromCents, toCents } from "./engine/money";
import { prorate } from "./engine/proration";
import {
  executeDueBilling,
  executeInitialize,
  executePayment,
  InMemoryBillingRepository,
  periodAmount,
  type BillingRepository,
  type BillingStore,
  type StoredSubscription,
} from "./repository";

const INTERNAL_ROLES = ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"] as const;
const MUTATION_ROLES = ["FINANCE", "ADMIN"] as const;
const PLAN_ROLES = ["ADMIN"] as const;

export class BillingService {
  constructor(
    private readonly repo: BillingRepository,
    private readonly listCatalogPlans?: (actor: Actor) => Promise<PlanRef[]>,
  ) {}

  private assertRead(actor: Actor) {
    if (!actor.active) throw new ApiFailure("FORBIDDEN", "Inactive account");
    if (actor.role === "CUSTOMER") return;
    requireRole(actor, ...INTERNAL_ROLES);
  }

  private assertMutate(actor: Actor) {
    if (!actor.active) throw new ApiFailure("FORBIDDEN", "Inactive account");
    requireRole(actor, ...MUTATION_ROLES);
  }

  private async scopedCustomerIds(store: BillingStore, actor: Actor): Promise<string[] | null> {
    if (actor.role !== "CUSTOMER") return null;
    const ids = await store.customerIdsForActor(actor);
    if (ids.length === 0) throw new ApiFailure("FORBIDDEN", "Customer has no account");
    return ids;
  }

  private async ensureInvoiceVisible(store: BillingStore, actor: Actor, invoice: InvoiceRecord): Promise<void> {
    const ids = await this.scopedCustomerIds(store, actor);
    if (ids && !ids.includes(invoice.customerId)) throw new ApiFailure("NOT_FOUND", "Invoice not found");
  }

  private async ensureSubVisible(store: BillingStore, actor: Actor, sub: StoredSubscription): Promise<void> {
    const ids = await this.scopedCustomerIds(store, actor);
    if (ids && !ids.includes(sub.customerId)) throw new ApiFailure("NOT_FOUND", "Subscription not found");
  }

  async initializeOnStore(order: ConfirmedOrderForBilling, requestKey: string): Promise<BillingInitResult> {
    return this.repo.withTransaction((tx) => executeInitialize(tx, order, requestKey));
  }

  async listPlanRefs(actor: Actor): Promise<PlanRef[]> {
    this.assertRead(actor);
    const db = await this.repo.listPlans();
    const map = new Map<string, PlanRef>();
    for (const p of db) map.set(p.id, { id: p.id, name: p.name, interval: p.interval });
    if (actor.role !== "CUSTOMER") {
      const catalog = await (this.listCatalogPlans ?? ((a: Actor) => getCatalogService().listPlans(a)))(actor);
      for (const p of catalog) {
        if (!map.has(p.id)) map.set(p.id, { id: p.id, name: p.name, interval: p.interval });
      }
    }
    return [...map.values()];
  }

  async listPlans(actor: Actor): Promise<SubscriptionPlanRecord[]> {
    this.assertRead(actor);
    return this.repo.listPlans();
  }

  async createPlan(actor: Actor, raw: unknown): Promise<SubscriptionPlanRecord> {
    requireRole(actor, ...PLAN_ROLES);
    const input = parseInput(planCreateSchema, raw);
    return this.repo.withTransaction(async (tx) => {
      const existing = (await tx.listPlans()).find((p) => p.code === input.code);
      if (existing) throw new ApiFailure("CONFLICT", `Plan code '${input.code}' already exists`);
      return tx.savePlan({
        id: await tx.nextId("plan"),
        code: input.code,
        name: input.name,
        interval: input.interval,
        cancelPolicy: input.cancelPolicy,
        listPrice: input.listPrice ?? "0.00",
        archivedAt: null,
      });
    });
  }

  async patchPlan(actor: Actor, id: string, raw: unknown): Promise<SubscriptionPlanRecord> {
    requireRole(actor, ...PLAN_ROLES);
    const input = parseInput(planPatchSchema, raw);
    return this.repo.withTransaction(async (tx) => {
      const plan = await tx.getPlan(id);
      if (!plan) throw new ApiFailure("NOT_FOUND", "Plan not found");
      if (input.name !== undefined) plan.name = input.name;
      if (input.interval !== undefined) plan.interval = input.interval;
      if (input.cancelPolicy !== undefined) plan.cancelPolicy = input.cancelPolicy;
      if (input.listPrice !== undefined) plan.listPrice = input.listPrice;
      if (input.archived === true) plan.archivedAt = tx.now();
      if (input.archived === false) plan.archivedAt = null;
      return tx.savePlan(plan);
    });
  }

  async listSubscriptions(
    actor: Actor,
    filter?: { status?: SubscriptionStatus },
  ): Promise<SubscriptionRecord[]> {
    this.assertRead(actor);
    const ids = await this.scopedCustomerIds(this.repo, actor);
    const rows = await this.repo.listSubscriptions({
      customerId: ids?.[0],
      status: filter?.status,
    });
    return ids ? rows.filter((s) => ids.includes(s.customerId)) : rows;
  }

  async getSubscription(actor: Actor, id: string): Promise<SubscriptionRecord & { changes: SubscriptionChangeRecord[] }> {
    this.assertRead(actor);
    const sub = await this.repo.getSubscription(id);
    if (!sub) throw new ApiFailure("NOT_FOUND", "Subscription not found");
    await this.ensureSubVisible(this.repo, actor, sub);
    const changes = await this.repo.listChanges(id);
    return { ...sub, changes };
  }

  async patchSubscription(actor: Actor, id: string, raw: unknown): Promise<SubscriptionRecord> {
    this.assertMutate(actor);
    const input = parseInput(subscriptionPatchSchema, raw);
    return this.repo.withTransaction(async (tx) => {
      await tx.lockSubscription(id);
      const sub = await tx.getSubscription(id);
      if (!sub) throw new ApiFailure("NOT_FOUND", "Subscription not found");
      const asOf = input.effectiveDate ?? tx.today();

      const actorUserId = await tx.resolveActorUserId(actor);
      if (input.pause) return pauseSubscription(tx, sub, asOf, input.requestKey);
      if (input.resume) return resumeSubscription(tx, sub, asOf, input.requestKey);
      if (input.cancel) return cancelSubscription(tx, actorUserId, sub, asOf, input.requestKey);
      if (input.quantity !== undefined) {
        return changeQuantity(tx, actorUserId, sub, input.quantity, asOf, input.requestKey);
      }
      if (input.planId) return changePlan(tx, sub, input.planId, asOf, input.requestKey);
      throw new ApiFailure("INVALID_INPUT", "No subscription change specified");
    });
  }

  async listInvoices(
    actor: Actor,
    filter?: { status?: InvoiceStatus; subscriptionId?: string },
  ): Promise<InvoiceRecord[]> {
    this.assertRead(actor);
    const ids = await this.scopedCustomerIds(this.repo, actor);
    const rows = await this.repo.listInvoices({
      customerId: ids?.length === 1 ? ids[0] : undefined,
      status: filter?.status,
      subscriptionId: filter?.subscriptionId,
    });
    return ids ? rows.filter((i) => ids.includes(i.customerId)) : rows;
  }

  async getInvoice(actor: Actor, id: string): Promise<InvoiceRecord> {
    this.assertRead(actor);
    const invoice = await this.repo.getInvoice(id);
    if (!invoice) throw new ApiFailure("NOT_FOUND", "Invoice not found");
    await this.ensureInvoiceVisible(this.repo, actor, invoice);
    return invoice;
  }

  async listCreditNotes(actor: Actor): Promise<CreditNoteRecord[]> {
    this.assertRead(actor);
    const ids = await this.scopedCustomerIds(this.repo, actor);
    const notes = await this.repo.listCreditNotes({ customerId: ids?.[0] });
    return ids ? notes.filter((n) => ids.includes(n.customerId)) : notes;
  }

  async recordPayment(actor: Actor, raw: unknown): Promise<PaymentRecord> {
    this.assertMutate(actor);
    const input = parseInput(paymentBodySchema, raw);
    return this.repo.withTransaction(async (tx) => {
      const recordedById = await tx.resolveActorUserId(actor);
      return executePayment(tx, { ...input, recordedById });
    });
  }

  async runDueBilling(actor: Actor, raw: unknown): Promise<DueBillingResult> {
    this.assertMutate(actor);
    const input = parseInput(dueBillingBodySchema, raw);
    const asOf = input.asOf ?? this.repo.today();
    return this.repo.withTransaction((tx) => executeDueBilling(tx, input.requestKey, asOf));
  }
}

async function changeQuantity(
  tx: BillingStore,
  actorUserId: string,
  sub: StoredSubscription,
  quantity: number,
  asOf: IsoDate,
  requestKey: string,
): Promise<StoredSubscription> {
  const claim = await tx.claimRequest("CREDIT_APPLY", requestKey, actorUserId);
  if (claim.replayed) return (await tx.getSubscription(sub.id))!;
  if (sub.status !== "ACTIVE" || sub.pausedAt) {
    throw new ApiFailure("INVALID_INPUT", "Quantity can only change on an active subscription");
  }
  const before = sub.quantity;
  const currentAmt = periodAmount(before, sub.unitPrice, sub.discountPct, sub.taxPct);
  const nextAmt = periodAmount(quantity, sub.unitPrice, sub.discountPct, sub.taxPct);
  const result = prorate({
    currentPeriodAmount: currentAmt,
    newPeriodAmount: nextAmt,
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    effectiveDate: asOf,
  });
  let adjustmentInvoiceId: string | null = null;
  const adj = toCents(result.adjustmentAmount);
  if (adj > 0) {
    const invoice = await tx.createInvoice({
      customerId: sub.customerId,
      customerName: sub.customerName,
      orderId: sub.orderId,
      subscriptionId: sub.id,
      kind: "ADJUSTMENT",
      currency: sub.currency,
      issueDate: asOf,
      periodStart: asOf,
      periodEnd: sub.currentPeriodEnd,
      dueDate: sub.currentPeriodEnd,
      lines: [
        {
          description: `Quantity ${before} → ${quantity}`,
          quantity: 1,
          unitPrice: result.adjustmentAmount,
          discountPct: 0,
          taxPct: 0,
          lineTotal: result.adjustmentAmount,
        },
      ],
    });
    adjustmentInvoiceId = invoice.id;
  } else if (adj < 0) {
    const target = await tx.findRecurringInvoice(sub.id, sub.currentPeriodStart);
    if (target) {
      const note = await tx.saveCreditNote({
        id: await tx.nextId("cn"),
        customerId: sub.customerId,
        sourceInvoiceId: target.id,
        reason: "PRORATION",
        amount: fromCents(-adj),
        issuedById: actorUserId,
        appliedAmount: "0.00",
        createdAt: tx.now(),
      });
      if (toCents(target.outstanding) > 0) {
        const applyAmt = Math.min(-adj, toCents(target.outstanding));
        await tx.applyCredit({
          id: await tx.nextId("capp"),
          creditNoteId: note.id,
          invoiceId: target.id,
          amount: fromCents(applyAmt),
          requestKeyId: claim.claimId,
        });
        const after = await tx.getInvoice(target.id);
        if (after) await tx.rewriteInvoiceStatus(target.id, after.status);
      }
    }
  }
  sub.quantity = quantity;
  await tx.saveSubscription(sub);
  await tx.saveChange({
    id: await tx.nextId("schg"),
    subscriptionId: sub.id,
    kind: "QUANTITY",
    beforeQuantity: before,
    afterQuantity: quantity,
    beforePlanId: null,
    afterPlanId: null,
    effectiveDate: asOf,
    remainingDays: result.remainingDays,
    periodDays: result.periodDays,
    adjustmentAmount: result.adjustmentAmount,
    adjustmentInvoiceId,
    createdAt: tx.now(),
  });
  await tx.completeRequest(claim.claimId, "INVOICE", sub.id, { subscriptionId: sub.id });
  return sub;
}

async function changePlan(
  tx: BillingStore,
  sub: StoredSubscription,
  planId: string,
  asOf: IsoDate,
  requestKey: string,
): Promise<StoredSubscription> {
  const claim = await tx.claimRequest("CREDIT_APPLY", `${requestKey}:plan`);
  if (claim.replayed) return (await tx.getSubscription(sub.id))!;
  const plan = await tx.getPlan(planId);
  if (!plan || plan.archivedAt) throw new ApiFailure("NOT_FOUND", "Plan not found");
  if (plan.interval === sub.interval) {
    const before = sub.planId;
    sub.planId = plan.id;
    sub.planName = plan.name;
    sub.cancelPolicy = plan.cancelPolicy;
    await tx.saveSubscription(sub);
    await tx.saveChange({
      id: await tx.nextId("schg"),
      subscriptionId: sub.id,
      kind: "PLAN",
      beforeQuantity: null,
      afterQuantity: null,
      beforePlanId: before,
      afterPlanId: plan.id,
      effectiveDate: asOf,
      remainingDays: null,
      periodDays: null,
      adjustmentAmount: null,
      adjustmentInvoiceId: null,
      createdAt: tx.now(),
    });
  } else {
    sub.pendingPlanId = plan.id;
    sub.pendingPlanName = plan.name;
    sub.pendingPlanEffectiveDate = sub.currentPeriodEnd;
    await tx.saveSubscription(sub);
    await tx.saveChange({
      id: await tx.nextId("schg"),
      subscriptionId: sub.id,
      kind: "PLAN",
      beforeQuantity: null,
      afterQuantity: null,
      beforePlanId: sub.planId,
      afterPlanId: plan.id,
      effectiveDate: sub.currentPeriodEnd,
      remainingDays: null,
      periodDays: null,
      adjustmentAmount: null,
      adjustmentInvoiceId: null,
      createdAt: tx.now(),
    });
  }
  await tx.completeRequest(claim.claimId, "SUBSCRIPTION_SET", sub.id, { subscriptionId: sub.id });
  return sub;
}

async function pauseSubscription(
  tx: BillingStore,
  sub: StoredSubscription,
  asOf: IsoDate,
  requestKey: string,
): Promise<StoredSubscription> {
  const claim = await tx.claimRequest("CREDIT_APPLY", `${requestKey}:pause`);
  if (claim.replayed) return (await tx.getSubscription(sub.id))!;
  if (sub.status !== "ACTIVE") throw new ApiFailure("INVALID_INPUT", "Only an active subscription can be paused");
  sub.status = "PAUSED";
  sub.pausedAt = tx.now();
  sub.nextBillingDate = null;
  await tx.saveSubscription(sub);
  await tx.saveChange({
    id: await tx.nextId("schg"),
    subscriptionId: sub.id,
    kind: "PAUSE",
    beforeQuantity: null,
    afterQuantity: null,
    beforePlanId: null,
    afterPlanId: null,
    effectiveDate: asOf,
    remainingDays: null,
    periodDays: null,
    adjustmentAmount: null,
    adjustmentInvoiceId: null,
    createdAt: tx.now(),
  });
  await tx.completeRequest(claim.claimId, "SUBSCRIPTION_SET", sub.id, { subscriptionId: sub.id });
  return sub;
}

async function resumeSubscription(
  tx: BillingStore,
  sub: StoredSubscription,
  asOf: IsoDate,
  requestKey: string,
): Promise<StoredSubscription> {
  const claim = await tx.claimRequest("CREDIT_APPLY", `${requestKey}:resume`);
  if (claim.replayed) return (await tx.getSubscription(sub.id))!;
  if (sub.status !== "PAUSED") throw new ApiFailure("INVALID_INPUT", "Only a paused subscription can be resumed");
  const periodEnd = addInterval({ date: asOf, interval: sub.interval, anchorDay: sub.anchorDay });
  sub.status = "ACTIVE";
  sub.pausedAt = null;
  sub.currentPeriodStart = asOf;
  sub.currentPeriodEnd = periodEnd;
  sub.nextBillingDate = addInterval({ date: asOf, interval: sub.interval, anchorDay: sub.anchorDay });
  await tx.saveSubscription(sub);
  await tx.saveChange({
    id: await tx.nextId("schg"),
    subscriptionId: sub.id,
    kind: "RESUME",
    beforeQuantity: null,
    afterQuantity: null,
    beforePlanId: null,
    afterPlanId: null,
    effectiveDate: asOf,
    remainingDays: null,
    periodDays: null,
    adjustmentAmount: null,
    adjustmentInvoiceId: null,
    createdAt: tx.now(),
  });
  await tx.completeRequest(claim.claimId, "SUBSCRIPTION_SET", sub.id, { subscriptionId: sub.id });
  return sub;
}

async function cancelSubscription(
  tx: BillingStore,
  actorUserId: string,
  sub: StoredSubscription,
  asOf: IsoDate,
  requestKey: string,
): Promise<StoredSubscription> {
  const claim = await tx.claimRequest("CREDIT_APPLY", `${requestKey}:cancel`, actorUserId);
  if (claim.replayed) return (await tx.getSubscription(sub.id))!;
  if (sub.status === "CANCELLED") throw new ApiFailure("INVALID_INPUT", "Subscription is already cancelled");

  if (sub.cancelPolicy === "IMMEDIATE") {
    const billed = await tx.findRecurringInvoice(sub.id, sub.currentPeriodStart);
    if (billed) {
      const currentAmt = periodAmount(sub.quantity, sub.unitPrice, sub.discountPct, sub.taxPct);
      const result = prorate({
        currentPeriodAmount: currentAmt,
        newPeriodAmount: "0.00",
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        effectiveDate: asOf,
      });
      const unused = -toCents(result.adjustmentAmount);
      if (unused > 0) {
        const note = await tx.saveCreditNote({
          id: await tx.nextId("cn"),
          customerId: sub.customerId,
          sourceInvoiceId: billed.id,
          reason: "CANCELLATION",
          amount: fromCents(unused),
          issuedById: actorUserId,
          appliedAmount: "0.00",
          createdAt: tx.now(),
        });
        const applyAmt = Math.min(unused, toCents(billed.outstanding));
        if (applyAmt > 0) {
          await tx.applyCredit({
            id: await tx.nextId("capp"),
            creditNoteId: note.id,
            invoiceId: billed.id,
            amount: fromCents(applyAmt),
            requestKeyId: claim.claimId,
          });
          const after = await tx.getInvoice(billed.id);
          if (after) await tx.rewriteInvoiceStatus(billed.id, after.status);
        }
        await tx.saveChange({
          id: await tx.nextId("schg"),
          subscriptionId: sub.id,
          kind: "CANCEL",
          beforeQuantity: sub.quantity,
          afterQuantity: sub.quantity,
          beforePlanId: null,
          afterPlanId: null,
          effectiveDate: asOf,
          remainingDays: result.remainingDays,
          periodDays: result.periodDays,
          adjustmentAmount: result.adjustmentAmount,
          adjustmentInvoiceId: null,
          createdAt: tx.now(),
        });
      }
    } else {
      await tx.saveChange({
        id: await tx.nextId("schg"),
        subscriptionId: sub.id,
        kind: "CANCEL",
        beforeQuantity: sub.quantity,
        afterQuantity: sub.quantity,
        beforePlanId: null,
        afterPlanId: null,
        effectiveDate: asOf,
        remainingDays: null,
        periodDays: null,
        adjustmentAmount: "0.00",
        adjustmentInvoiceId: null,
        createdAt: tx.now(),
      });
    }
    sub.status = "CANCELLED";
    sub.cancelEffectiveDate = asOf;
    sub.nextBillingDate = null;
    sub.pausedAt = null;
  } else {
    sub.cancelEffectiveDate = sub.currentPeriodEnd;
    await tx.saveChange({
      id: await tx.nextId("schg"),
      subscriptionId: sub.id,
      kind: "CANCEL",
      beforeQuantity: sub.quantity,
      afterQuantity: sub.quantity,
      beforePlanId: null,
      afterPlanId: null,
      effectiveDate: sub.currentPeriodEnd,
      remainingDays: null,
      periodDays: null,
      adjustmentAmount: null,
      adjustmentInvoiceId: null,
      createdAt: tx.now(),
    });
  }
  await tx.saveSubscription(sub);
  await tx.completeRequest(claim.claimId, "SUBSCRIPTION_SET", sub.id, { subscriptionId: sub.id });
  return sub;
}

const GLOBAL_KEY = "__dealflow_billing_service__" as const;
type GlobalWithSvc = typeof globalThis & { [GLOBAL_KEY]?: BillingService };

export function getInMemoryBillingService(): BillingService {
  const g = globalThis as GlobalWithSvc;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new BillingService(new InMemoryBillingRepository());
  return g[GLOBAL_KEY];
}

export function setBillingServiceForTests(svc: BillingService | undefined): void {
  const g = globalThis as GlobalWithSvc;
  if (svc) g[GLOBAL_KEY] = svc;
  else delete g[GLOBAL_KEY];
}

export { InMemoryBillingRepository };
