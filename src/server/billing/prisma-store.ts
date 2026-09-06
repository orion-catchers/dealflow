import { randomUUID } from "node:crypto";
import type { Actor, Money } from "@/contracts/harsh";
import type {
  CreditNoteRecord,
  InvoiceKind,
  InvoiceLineRecord,
  InvoiceRecord,
  InvoiceStatus,
  IsoDate,
  PaymentRecord,
  SubscriptionChangeRecord,
  SubscriptionPlanRecord,
  SubscriptionStatus,
} from "@/contracts/ruchir";
import { harshFixtures } from "@/fixtures/harsh";
import { Prisma, type RequestResultKind, type RequestScope } from "@/generated/prisma/client";
import { ApiFailure } from "@/lib/api/respond";
import { prismaUserIdForActor } from "@/server/lib/auth/resolve-user";
import { prisma, type Db, type Tx } from "@/server/lib/db";
import { parseDate } from "./engine/calendar";
import { lineAmounts } from "./engine/line-total";
import { fromCents, toCents } from "./engine/money";
import { invoiceStatus } from "./engine/status";
import type {
  BillingRepository,
  BillingStore,
  ClaimResult,
  InvoiceDraft,
  RequestScopeName,
  StoredSubscription,
} from "./repository";

type Client = Db | Tx;

function moneyOf(value: { toString(): string } | null | undefined): Money {
  if (value == null) return "0.00";
  const raw = value.toString();
  const n = Number(raw);
  if (Number.isFinite(n)) return n.toFixed(2);
  return fromCents(toCents(raw.includes(".") ? raw : `${raw}.00`));
}

function isoDateOf(value: Date): IsoDate {
  if (value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0) {
    return value.toISOString().slice(0, 10);
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOf(iso: IsoDate): Date {
  const { year, month, day } = parseDate(iso);
  return new Date(Date.UTC(year, month - 1, day));
}

function asScope(scope: RequestScopeName): RequestScope {
  return scope;
}

function asResultKind(kind: string): RequestResultKind {
  if (kind === "PAYMENT" || kind === "INVOICE" || kind === "SUBSCRIPTION_SET" || kind === "CREDIT_APPLICATION") {
    return kind;
  }
  return "INVOICE";
}

const invoiceInclude = {
  customer: { select: { name: true } },
  lines: { orderBy: { createdAt: "asc" as const } },
  payments: { include: { recordedBy: { select: { name: true, role: true } } }, orderBy: { createdAt: "asc" as const } },
  creditApps: true,
} as const;

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

function toPaymentRecord(
  row: InvoiceRow["payments"][number],
  replayed = false,
): PaymentRecord {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    amount: moneyOf(row.amount),
    method: row.method,
    reference: row.reference,
    paidOn: isoDateOf(row.paidOn),
    recordedById: row.recordedById,
    recordedByName: row.recordedBy?.name,
    createdAt: row.createdAt.toISOString(),
    replayed,
  };
}

function toInvoiceRecord(row: InvoiceRow): InvoiceRecord {
  const lines: InvoiceLineRecord[] = row.lines.map((line) => ({
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    unitPrice: moneyOf(line.unitPrice),
    discountPct: Number(line.discountPct.toString()),
    taxPct: Number(line.taxPct.toString()),
    lineTotal: moneyOf(line.lineTotal),
  }));
  if (row.status === "VOID") {
    return {
      id: row.id,
      customerId: row.customerId,
      customerName: row.customer.name,
      orderId: row.orderId,
      subscriptionId: row.subscriptionId,
      kind: row.kind,
      status: "VOID",
      currency: row.currency,
      issueDate: isoDateOf(row.issueDate),
      periodStart: row.periodStart ? isoDateOf(row.periodStart) : null,
      periodEnd: row.periodEnd ? isoDateOf(row.periodEnd) : null,
      dueDate: isoDateOf(row.dueDate),
      subtotal: moneyOf(row.subtotal),
      taxTotal: moneyOf(row.taxTotal),
      total: moneyOf(row.total),
      paidAmount: "0.00",
      creditedAmount: "0.00",
      outstanding: "0.00",
      lines,
      payments: row.payments.map((payment) => toPaymentRecord(payment)),
    };
  }
  const paidCents = row.payments.reduce((acc, p) => acc + toCents(moneyOf(p.amount)), 0);
  const creditedCents = row.creditApps.reduce((acc, a) => acc + toCents(moneyOf(a.amount)), 0);
  const paid = fromCents(paidCents);
  const credited = fromCents(creditedCents);
  const total = moneyOf(row.total);
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer.name,
    orderId: row.orderId,
    subscriptionId: row.subscriptionId,
    kind: row.kind,
    status: invoiceStatus(total, paid, credited),
    currency: row.currency,
    issueDate: isoDateOf(row.issueDate),
    periodStart: row.periodStart ? isoDateOf(row.periodStart) : null,
    periodEnd: row.periodEnd ? isoDateOf(row.periodEnd) : null,
    dueDate: isoDateOf(row.dueDate),
    subtotal: moneyOf(row.subtotal),
    taxTotal: moneyOf(row.taxTotal),
    total,
    paidAmount: paid,
    creditedAmount: credited,
    outstanding: fromCents(Math.max(0, toCents(total) - paidCents - creditedCents)),
    lines,
    payments: row.payments.map((payment) => toPaymentRecord(payment)),
  };
}

const subInclude = {
  customer: { select: { name: true } },
  plan: { select: { name: true } },
  pendingPlan: { select: { name: true } },
  sourceOrderLine: {
    select: {
      orderId: true,
      taxPct: true,
      lineDiscountPct: true,
      product: { select: { name: true } },
      order: { select: { currency: true } },
    },
  },
} as const;

type SubRow = Prisma.SubscriptionGetPayload<{ include: typeof subInclude }>;

function toStoredSub(row: SubRow): StoredSubscription {
  return {
    id: row.id,
    sourceOrderLineId: row.sourceOrderLineId,
    orderId: row.sourceOrderLine.orderId,
    customerId: row.customerId,
    customerName: row.customer.name,
    planId: row.planId,
    planName: row.plan.name,
    status: row.status,
    quantity: row.quantity,
    unitPrice: moneyOf(row.unitPrice),
    interval: row.interval,
    anchorDay: row.anchorDay,
    currentPeriodStart: isoDateOf(row.currentPeriodStart),
    currentPeriodEnd: isoDateOf(row.currentPeriodEnd),
    nextBillingDate: row.nextBillingDate ? isoDateOf(row.nextBillingDate) : null,
    cancelPolicy: row.cancelPolicy,
    cancelEffectiveDate: row.cancelEffectiveDate ? isoDateOf(row.cancelEffectiveDate) : null,
    pausedAt: row.pausedAt ? row.pausedAt.toISOString() : null,
    pendingPlanId: row.pendingPlanId,
    pendingPlanName: row.pendingPlan?.name ?? null,
    pendingPlanEffectiveDate: row.pendingPlanEffectiveDate ? isoDateOf(row.pendingPlanEffectiveDate) : null,
    taxPct: Number(row.sourceOrderLine.taxPct.toString()),
    discountPct: Number(row.sourceOrderLine.lineDiscountPct.toString()),
    description: row.sourceOrderLine.product.name,
    currency: row.sourceOrderLine.order.currency,
  };
}

function toPlan(row: {
  id: string;
  code: string;
  name: string;
  interval: SubscriptionPlanRecord["interval"];
  cancelPolicy: SubscriptionPlanRecord["cancelPolicy"];
  listPrice: unknown;
  archivedAt: Date | null;
}): SubscriptionPlanRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    interval: row.interval,
    cancelPolicy: row.cancelPolicy,
    listPrice: moneyOf(row.listPrice ?? 0),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

const FIXTURE_CUSTOMER_EMAIL: Record<string, string> = Object.fromEntries(
  harshFixtures.customers.map((c) => [c.sym, c.contactEmail]),
);

export class PrismaBillingStore implements BillingStore {
  constructor(private readonly db: Client) {}

  now(): string {
    return new Date().toISOString();
  }

  today(): IsoDate {
    return this.now().slice(0, 10);
  }

  async nextId(prefix: string): Promise<string> {
    void prefix;
    return randomUUID();
  }

  async claimRequest(scope: RequestScopeName, key: string, actorId?: string): Promise<ClaimResult> {
    const existing = await this.db.requestKey.findUnique({
      where: { scope_key: { scope: asScope(scope), key } },
    });
    if (existing?.completedAt && existing.resultPayload != null) {
      if (actorId && existing.actorId && existing.actorId !== actorId) {
        throw new ApiFailure("CONFLICT", "Request key belongs to another actor");
      }
      return { replayed: true, payload: existing.resultPayload };
    }
    if (existing) throw new ApiFailure("CONFLICT", "Request already in progress");
    const row = await this.db.requestKey.create({
      data: { scope: asScope(scope), key, actorId: actorId ?? null },
    });
    return { replayed: false, claimId: row.id };
  }

  async completeRequest(claimId: string, resultKind: string, resultId: string, payload: unknown): Promise<void> {
    await this.db.requestKey.update({
      where: { id: claimId },
      data: {
        resultKind: asResultKind(resultKind),
        resultId,
        resultPayload: payload as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
  }

  async lockInvoice(id: string): Promise<void> {
    await this.db.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
  }

  async lockSubscription(id: string): Promise<void> {
    await this.db.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${id} FOR UPDATE`;
  }

  async customerIdsForActor(actor: Actor): Promise<string[]> {
    const userId = await prismaUserIdForActor(actor);
    if (userId) {
      const memberships = await this.db.customerMembership.findMany({ where: { userId } });
      if (memberships.length > 0) return memberships.map((m) => m.customerId);
    }
    if (!actor.customerId) return [];
    const email = FIXTURE_CUSTOMER_EMAIL[actor.customerId];
    if (email) {
      const customer = await this.db.customer.findFirst({ where: { contactEmail: email } });
      if (customer) return [customer.id];
    }
    return [actor.customerId];
  }

  async getCustomerName(customerId: string): Promise<string | null> {
    const row = await this.db.customer.findUnique({ where: { id: customerId }, select: { name: true } });
    return row?.name ?? null;
  }

  async resolveActorUserId(actor: Actor): Promise<string> {
    const id = await prismaUserIdForActor(actor);
    if (!id) throw new ApiFailure("UNAUTHENTICATED", "Actor is not a database user");
    return id;
  }

  async listPlans(): Promise<SubscriptionPlanRecord[]> {
    const rows = await this.db.subscriptionPlan.findMany({ orderBy: { name: "asc" } });
    return rows.map(toPlan);
  }

  async getPlan(id: string): Promise<SubscriptionPlanRecord | null> {
    const row = await this.db.subscriptionPlan.findUnique({ where: { id } });
    return row ? toPlan(row) : null;
  }

  async savePlan(plan: SubscriptionPlanRecord): Promise<SubscriptionPlanRecord> {
    const data = {
      name: plan.name,
      interval: plan.interval,
      cancelPolicy: plan.cancelPolicy,
      archivedAt: plan.archivedAt ? new Date(plan.archivedAt) : null,
    };
    const row = await this.db.subscriptionPlan.upsert({
      where: { id: plan.id },
      create: { id: plan.id, code: plan.code, ...data },
      update: data,
    });
    await this.db.$executeRaw`UPDATE "SubscriptionPlan" SET "listPrice" = CAST(${plan.listPrice} AS DECIMAL(14, 2)) WHERE "id" = ${plan.id}`;
    return { ...toPlan(row), listPrice: plan.listPrice };
  }

  async listSubscriptions(filter?: { customerId?: string; status?: SubscriptionStatus }): Promise<StoredSubscription[]> {
    const rows = await this.db.subscription.findMany({
      where: {
        customerId: filter?.customerId,
        status: filter?.status,
      },
      include: subInclude,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toStoredSub);
  }

  async getSubscription(id: string): Promise<StoredSubscription | null> {
    const row = await this.db.subscription.findUnique({ where: { id }, include: subInclude });
    return row ? toStoredSub(row) : null;
  }

  async findSubscriptionBySourceLine(orderLineId: string): Promise<StoredSubscription | null> {
    const row = await this.db.subscription.findUnique({
      where: { sourceOrderLineId: orderLineId },
      include: subInclude,
    });
    return row ? toStoredSub(row) : null;
  }

  async saveSubscription(sub: StoredSubscription): Promise<StoredSubscription> {
    if (!(sub.currentPeriodStart < sub.currentPeriodEnd) || (sub.nextBillingDate && sub.nextBillingDate < sub.currentPeriodEnd)) {
      throw new ApiFailure("INVALID_INPUT", "Subscription period is not ordered", {
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        nextBillingDate: sub.nextBillingDate,
      });
    }
    await this.db.subscription.upsert({
      where: { id: sub.id },
      create: {
        id: sub.id,
        sourceOrderLineId: sub.sourceOrderLineId,
        customerId: sub.customerId,
        planId: sub.planId,
        status: sub.status,
        quantity: sub.quantity,
        unitPrice: sub.unitPrice,
        interval: sub.interval,
        anchorDay: sub.anchorDay,
        currentPeriodStart: dateOf(sub.currentPeriodStart),
        currentPeriodEnd: dateOf(sub.currentPeriodEnd),
        nextBillingDate: sub.nextBillingDate ? dateOf(sub.nextBillingDate) : null,
        cancelPolicy: sub.cancelPolicy,
        cancelEffectiveDate: sub.cancelEffectiveDate ? dateOf(sub.cancelEffectiveDate) : null,
        pausedAt: sub.pausedAt ? new Date(sub.pausedAt) : null,
        pendingPlanId: sub.pendingPlanId,
        pendingPlanEffectiveDate: sub.pendingPlanEffectiveDate ? dateOf(sub.pendingPlanEffectiveDate) : null,
      },
      update: {
        planId: sub.planId,
        status: sub.status,
        quantity: sub.quantity,
        unitPrice: sub.unitPrice,
        interval: sub.interval,
        currentPeriodStart: dateOf(sub.currentPeriodStart),
        currentPeriodEnd: dateOf(sub.currentPeriodEnd),
        nextBillingDate: sub.nextBillingDate ? dateOf(sub.nextBillingDate) : null,
        cancelPolicy: sub.cancelPolicy,
        cancelEffectiveDate: sub.cancelEffectiveDate ? dateOf(sub.cancelEffectiveDate) : null,
        pausedAt: sub.pausedAt ? new Date(sub.pausedAt) : null,
        pendingPlanId: sub.pendingPlanId,
        pendingPlanEffectiveDate: sub.pendingPlanEffectiveDate ? dateOf(sub.pendingPlanEffectiveDate) : null,
      },
    });
    const saved = await this.getSubscription(sub.id);
    if (!saved) throw new ApiFailure("NOT_FOUND", "Subscription not found after save");
    return saved;
  }

  async saveChange(change: SubscriptionChangeRecord): Promise<SubscriptionChangeRecord> {
    await this.db.subscriptionChange.create({
      data: {
        id: change.id,
        subscriptionId: change.subscriptionId,
        kind: change.kind,
        beforeQuantity: change.beforeQuantity,
        afterQuantity: change.afterQuantity,
        beforePlanId: change.beforePlanId,
        afterPlanId: change.afterPlanId,
        effectiveDate: dateOf(change.effectiveDate),
        remainingDays: change.remainingDays,
        periodDays: change.periodDays,
        adjustmentAmount: change.adjustmentAmount,
        adjustmentInvoiceId: change.adjustmentInvoiceId,
      },
    });
    return change;
  }

  async listChanges(subscriptionId: string): Promise<SubscriptionChangeRecord[]> {
    const rows = await this.db.subscriptionChange.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      subscriptionId: row.subscriptionId,
      kind: row.kind,
      beforeQuantity: row.beforeQuantity,
      afterQuantity: row.afterQuantity,
      beforePlanId: row.beforePlanId,
      afterPlanId: row.afterPlanId,
      effectiveDate: isoDateOf(row.effectiveDate),
      remainingDays: row.remainingDays,
      periodDays: row.periodDays,
      adjustmentAmount: row.adjustmentAmount ? moneyOf(row.adjustmentAmount) : null,
      adjustmentInvoiceId: row.adjustmentInvoiceId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listInvoices(filter?: {
    customerId?: string;
    status?: InvoiceStatus;
    subscriptionId?: string;
    orderId?: string;
  }): Promise<InvoiceRecord[]> {
    const rows = await this.db.invoice.findMany({
      where: {
        customerId: filter?.customerId,
        subscriptionId: filter?.subscriptionId,
        orderId: filter?.orderId,
      },
      include: invoiceInclude,
      orderBy: { issueDate: "desc" },
    });
    const records = rows.map(toInvoiceRecord);
    return filter?.status ? records.filter((r) => r.status === filter.status) : records;
  }

  async getInvoice(id: string): Promise<InvoiceRecord | null> {
    const row = await this.db.invoice.findUnique({ where: { id }, include: invoiceInclude });
    return row ? toInvoiceRecord(row) : null;
  }

  async findOneTimeInvoice(orderId: string): Promise<InvoiceRecord | null> {
    const row = await this.db.invoice.findFirst({
      where: { orderId, kind: "ONE_TIME", status: { not: "VOID" } },
      include: invoiceInclude,
    });
    return row ? toInvoiceRecord(row) : null;
  }

  async findRecurringInvoice(subscriptionId: string, periodStart: IsoDate): Promise<InvoiceRecord | null> {
    const row = await this.db.invoice.findFirst({
      where: {
        subscriptionId,
        kind: "RECURRING",
        periodStart: dateOf(periodStart),
        status: { not: "VOID" },
      },
      include: invoiceInclude,
    });
    return row ? toInvoiceRecord(row) : null;
  }

  async createInvoice(draft: InvoiceDraft): Promise<InvoiceRecord> {
    const lines = draft.lines.map((line) => {
      const amounts = lineAmounts({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct,
        taxPct: line.taxPct,
      });
      const total = line.lineTotal && line.lineTotal !== "0.00" ? line.lineTotal : amounts.total;
      const totalCents = toCents(total);
      const subtotalCents =
        line.taxPct > 0 ? Math.round((totalCents * 100) / (100 + line.taxPct)) : totalCents;
      return {
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct,
        taxPct: line.taxPct,
        lineTotal: total,
        subtotal: fromCents(subtotalCents),
        tax: fromCents(totalCents - subtotalCents),
      };
    });
    const subtotalCents = lines.reduce((acc, l) => acc + toCents(l.subtotal), 0);
    const taxCents = lines.reduce((acc, l) => acc + toCents(l.tax), 0);
    const row = await this.db.invoice.create({
      data: {
        ...(draft.id ? { id: draft.id } : {}),
        customerId: draft.customerId,
        orderId: draft.orderId,
        subscriptionId: draft.subscriptionId,
        kind: draft.kind as InvoiceKind,
        currency: draft.currency,
        issueDate: dateOf(draft.issueDate),
        periodStart: draft.periodStart ? dateOf(draft.periodStart) : null,
        periodEnd: draft.periodEnd ? dateOf(draft.periodEnd) : null,
        dueDate: dateOf(draft.dueDate),
        subtotal: fromCents(subtotalCents),
        taxTotal: fromCents(taxCents),
        total: fromCents(subtotalCents + taxCents),
        lines: {
          create: lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountPct: line.discountPct,
            taxPct: line.taxPct,
            lineTotal: line.lineTotal,
          })),
        },
      },
      include: invoiceInclude,
    });
    return toInvoiceRecord(row);
  }

  async rewriteInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
    await this.db.invoice.update({ where: { id }, data: { status } });
  }

  async listPayments(invoiceId: string): Promise<PaymentRecord[]> {
    const rows = await this.db.payment.findMany({
      where: { invoiceId },
      include: { recordedBy: { select: { name: true, role: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      invoiceId: row.invoiceId,
      amount: moneyOf(row.amount),
      method: row.method,
      reference: row.reference,
      paidOn: isoDateOf(row.paidOn),
      recordedById: row.recordedById,
      recordedByName: row.recordedBy.name,
      createdAt: row.createdAt.toISOString(),
      replayed: false,
    }));
  }

  async getPaymentByRequestKey(requestKey: string): Promise<PaymentRecord | null> {
    const key = await this.db.requestKey.findUnique({
      where: { scope_key: { scope: "PAYMENT", key: requestKey } },
      include: { payments: true },
    });
    const row = key?.payments[0];
    if (!row) return null;
    return {
      id: row.id,
      invoiceId: row.invoiceId,
      amount: moneyOf(row.amount),
      method: row.method,
      reference: row.reference,
      paidOn: isoDateOf(row.paidOn),
      recordedById: row.recordedById,
      createdAt: row.createdAt.toISOString(),
      replayed: true,
    };
  }

  async savePayment(
    payment: Omit<PaymentRecord, "replayed"> & { requestKey: string; requestKeyId: string },
  ): Promise<PaymentRecord> {
    const row = await this.db.payment.create({
      data: {
        id: payment.id,
        invoiceId: payment.invoiceId,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        paidOn: dateOf(payment.paidOn),
        recordedById: payment.recordedById,
        requestKeyId: payment.requestKeyId,
      },
    });
    return {
      id: row.id,
      invoiceId: row.invoiceId,
      amount: moneyOf(row.amount),
      method: row.method,
      reference: row.reference,
      paidOn: isoDateOf(row.paidOn),
      recordedById: row.recordedById,
      createdAt: row.createdAt.toISOString(),
      replayed: false,
    };
  }

  async listCreditNotes(filter?: { customerId?: string; sourceInvoiceId?: string }): Promise<CreditNoteRecord[]> {
    const rows = await this.db.creditNote.findMany({
      where: {
        customerId: filter?.customerId,
        sourceInvoiceId: filter?.sourceInvoiceId,
      },
      include: { applications: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      sourceInvoiceId: row.sourceInvoiceId,
      reason: row.reason,
      amount: moneyOf(row.amount),
      issuedById: row.issuedById,
      appliedAmount: fromCents(row.applications.reduce((acc, a) => acc + toCents(moneyOf(a.amount)), 0)),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async saveCreditNote(note: CreditNoteRecord): Promise<CreditNoteRecord> {
    await this.db.creditNote.create({
      data: {
        id: note.id,
        customerId: note.customerId,
        sourceInvoiceId: note.sourceInvoiceId,
        reason: note.reason,
        amount: note.amount,
        issuedById: note.issuedById,
      },
    });
    return note;
  }

  async applyCredit(input: {
    id: string;
    creditNoteId: string;
    invoiceId: string;
    amount: Money;
    requestKeyId: string;
  }): Promise<void> {
    await this.db.creditApplication.create({
      data: {
        id: input.id,
        creditNoteId: input.creditNoteId,
        invoiceId: input.invoiceId,
        amount: input.amount,
        requestKeyId: input.requestKeyId,
      },
    });
  }
}

export class PrismaBillingRepository extends PrismaBillingStore implements BillingRepository {
  constructor(private readonly client: Db = prisma) {
    super(client);
  }

  async withTransaction<T>(fn: (tx: BillingStore) => Promise<T>): Promise<T> {
    return this.client.$transaction((tx) => fn(new PrismaBillingStore(tx)));
  }

  reset(): void {
    throw new Error("Prisma billing repository cannot reset; use a local database.");
  }
}
