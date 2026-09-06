import type {
  BillingInitResult,
  ConfirmedOrderForBilling,
  CreditNoteRecord,
  InvoiceKind,
  InvoiceLineRecord,
  InvoiceRecord,
  InvoiceStatus,
  IsoDate,
  IsoTimestamp,
  PaymentMethod,
  PaymentRecord,
  SubscriptionChangeRecord,
  SubscriptionPlanRecord,
  SubscriptionRecord,
  SubscriptionStatus,
} from "@/contracts/ruchir";
import type { Actor, Money, Pct } from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";
import { addDays, addInterval, anchorDayOf, periodFrom } from "./engine/calendar";
import { lineAmounts } from "./engine/line-total";
import { fromCents, sumMoney, toCents } from "./engine/money";
import { invoiceStatus } from "./engine/status";

export type RequestScopeName = "BILLING_INIT" | "PAYMENT" | "DUE_BILLING" | "CREDIT_APPLY";

export type StoredSubscription = SubscriptionRecord & {
  taxPct: Pct;
  discountPct: Pct;
  description: string;
  currency: string;
};

export type InvoiceDraft = {
  id?: string;
  customerId: string;
  customerName: string;
  orderId: string | null;
  subscriptionId: string | null;
  kind: InvoiceKind;
  currency: string;
  issueDate: IsoDate;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  dueDate: IsoDate;
  lines: Omit<InvoiceLineRecord, "id">[];
};

export type ClaimResult =
  | { replayed: true; payload: unknown }
  | { replayed: false; claimId: string };

export interface BillingStore {
  now(): IsoTimestamp;
  today(): IsoDate;
  nextId(prefix: string): Promise<string>;

  claimRequest(scope: RequestScopeName, key: string, actorId?: string): Promise<ClaimResult>;
  completeRequest(claimId: string, resultKind: string, resultId: string, payload: unknown): Promise<void>;

  lockInvoice(id: string): Promise<void>;
  lockSubscription(id: string): Promise<void>;

  customerIdsForActor(actor: Actor): Promise<string[]>;
  getCustomerName(customerId: string): Promise<string | null>;
  resolveActorUserId(actor: Actor): Promise<string>;

  listPlans(): Promise<SubscriptionPlanRecord[]>;
  getPlan(id: string): Promise<SubscriptionPlanRecord | null>;
  savePlan(plan: SubscriptionPlanRecord): Promise<SubscriptionPlanRecord>;

  listSubscriptions(filter?: { customerId?: string; status?: SubscriptionStatus }): Promise<StoredSubscription[]>;
  getSubscription(id: string): Promise<StoredSubscription | null>;
  findSubscriptionBySourceLine(orderLineId: string): Promise<StoredSubscription | null>;
  saveSubscription(sub: StoredSubscription): Promise<StoredSubscription>;
  saveChange(change: SubscriptionChangeRecord): Promise<SubscriptionChangeRecord>;
  listChanges(subscriptionId: string): Promise<SubscriptionChangeRecord[]>;

  listInvoices(filter?: {
    customerId?: string;
    status?: InvoiceStatus;
    subscriptionId?: string;
    orderId?: string;
  }): Promise<InvoiceRecord[]>;
  getInvoice(id: string): Promise<InvoiceRecord | null>;
  findOneTimeInvoice(orderId: string): Promise<InvoiceRecord | null>;
  findRecurringInvoice(subscriptionId: string, periodStart: IsoDate): Promise<InvoiceRecord | null>;
  createInvoice(draft: InvoiceDraft): Promise<InvoiceRecord>;
  rewriteInvoiceStatus(id: string, status: InvoiceStatus): Promise<void>;

  listPayments(invoiceId: string): Promise<PaymentRecord[]>;
  getPaymentByRequestKey(requestKey: string): Promise<PaymentRecord | null>;
  savePayment(payment: Omit<PaymentRecord, "replayed"> & { requestKey: string; requestKeyId: string }): Promise<PaymentRecord>;

  listCreditNotes(filter?: { customerId?: string; sourceInvoiceId?: string }): Promise<CreditNoteRecord[]>;
  saveCreditNote(note: CreditNoteRecord): Promise<CreditNoteRecord>;
  applyCredit(input: {
    id: string;
    creditNoteId: string;
    invoiceId: string;
    amount: Money;
    requestKeyId: string;
  }): Promise<void>;
}

export interface BillingRepository extends BillingStore {
  withTransaction<T>(fn: (tx: BillingStore) => Promise<T>): Promise<T>;
  reset(): void;
}

const clone = <T>(v: T): T => structuredClone(v);

type RequestRow = {
  id: string;
  scope: string;
  key: string;
  actorId: string | null;
  completedAt: IsoTimestamp | null;
  payload: unknown;
};

type StoredInvoice = {
  id: string;
  customerId: string;
  customerName: string;
  orderId: string | null;
  subscriptionId: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  currency: string;
  issueDate: IsoDate;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  dueDate: IsoDate;
  subtotal: Money;
  taxTotal: Money;
  total: Money;
  lines: InvoiceLineRecord[];
};

type StoredPayment = Omit<PaymentRecord, "replayed"> & { requestKey: string; requestKeyId: string };
type StoredCreditApp = { id: string; creditNoteId: string; invoiceId: string; amount: Money };

interface State {
  customers: Map<string, string>;
  plans: Map<string, SubscriptionPlanRecord>;
  subscriptions: Map<string, StoredSubscription>;
  changes: Map<string, SubscriptionChangeRecord>;
  invoices: Map<string, StoredInvoice>;
  payments: Map<string, StoredPayment>;
  credits: Map<string, CreditNoteRecord>;
  creditApps: Map<string, StoredCreditApp>;
  requests: Map<string, RequestRow>;
  counters: Map<string, number>;
}

function requestMapKey(scope: string, key: string): string {
  return `${scope}:${key}`;
}

function hydrateInvoice(inv: StoredInvoice, payments: StoredPayment[], apps: StoredCreditApp[]): InvoiceRecord {
  if (inv.status === "VOID") {
    return {
      ...clone(inv),
      paidAmount: "0.00",
      creditedAmount: "0.00",
      outstanding: "0.00",
      payments: [],
    };
  }
  const paid = sumMoney(payments.filter((p) => p.invoiceId === inv.id).map((p) => p.amount));
  const credited = sumMoney(apps.filter((a) => a.invoiceId === inv.id).map((a) => a.amount));
  const outstandingCents = Math.max(0, toCents(inv.total) - toCents(paid) - toCents(credited));
  const invoicePayments = payments
    .filter((p) => p.invoiceId === inv.id)
    .map((p) => ({ ...clone(p), replayed: false as const }));
  return {
    ...clone(inv),
    status: invoiceStatus(inv.total, paid, credited),
    paidAmount: paid,
    creditedAmount: credited,
    outstanding: fromCents(outstandingCents),
    payments: invoicePayments,
  };
}

function seedState(): State {
  const customers = new Map<string, string>([
    ["customer-acme", "Acme Studio"],
    ["customer-beta", "Beta Corp"],
    ["customer-gamma", "Gamma Labs"],
  ]);
  const plans = new Map<string, SubscriptionPlanRecord>([
    [
      "plan-support-monthly",
      {
        id: "plan-support-monthly",
        code: "SUP-M",
        name: "Support Monthly",
        interval: "MONTHLY",
        cancelPolicy: "PERIOD_END",
        listPrice: "1000.00",
        archivedAt: null,
      },
    ],
    [
      "plan-support-quarterly",
      {
        id: "plan-support-quarterly",
        code: "SUP-Q",
        name: "Support Quarterly",
        interval: "QUARTERLY",
        cancelPolicy: "PERIOD_END",
        listPrice: "0.00",
        archivedAt: null,
      },
    ],
    [
      "plan-support-yearly",
      {
        id: "plan-support-yearly",
        code: "SUP-Y",
        name: "Support Yearly",
        interval: "YEARLY",
        cancelPolicy: "PERIOD_END",
        listPrice: "0.00",
        archivedAt: null,
      },
    ],
    [
      "plan-backup-monthly",
      {
        id: "plan-backup-monthly",
        code: "BKP-M",
        name: "Backup Monthly",
        interval: "MONTHLY",
        cancelPolicy: "IMMEDIATE",
        listPrice: "500.00",
        archivedAt: null,
      },
    ],
  ]);
  return {
    customers,
    plans,
    subscriptions: new Map(),
    changes: new Map(),
    invoices: new Map(),
    payments: new Map(),
    credits: new Map(),
    creditApps: new Map(),
    requests: new Map(),
    counters: new Map(),
  };
}

export class InMemoryBillingRepository implements BillingRepository {
  private state: State;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly clock: () => IsoTimestamp;

  constructor(opts?: { clock?: () => IsoTimestamp }) {
    this.clock = opts?.clock ?? (() => new Date().toISOString());
    this.state = seedState();
  }

  reset(): void {
    this.state = seedState();
  }

  now(): IsoTimestamp {
    return this.clock();
  }

  today(): IsoDate {
    return this.now().slice(0, 10);
  }

  async nextId(prefix: string): Promise<string> {
    const n = (this.state.counters.get(prefix) ?? 0) + 1;
    this.state.counters.set(prefix, n);
    return `${prefix}-${n}`;
  }

  withTransaction<T>(fn: (tx: BillingStore) => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const snapshot = clone(this.state);
      try {
        return await fn(this);
      } catch (e) {
        this.state = snapshot;
        throw e;
      }
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  async claimRequest(scope: RequestScopeName, key: string, actorId?: string): Promise<ClaimResult> {
    const mapKey = requestMapKey(scope, key);
    const existing = this.state.requests.get(mapKey);
    if (existing?.completedAt) {
      if (actorId && existing.actorId && existing.actorId !== actorId) {
        throw new ApiFailure("CONFLICT", "Request key belongs to another actor");
      }
      return { replayed: true, payload: existing.payload };
    }
    if (existing) throw new ApiFailure("CONFLICT", "Request already in progress");
    const id = await this.nextId("req");
    this.state.requests.set(mapKey, { id, scope, key, actorId: actorId ?? null, completedAt: null, payload: null });
    return { replayed: false, claimId: id };
  }

  async completeRequest(claimId: string, _resultKind: string, _resultId: string, payload: unknown): Promise<void> {
    for (const row of this.state.requests.values()) {
      if (row.id === claimId) {
        row.completedAt = this.now();
        row.payload = clone(payload);
        return;
      }
    }
    throw new ApiFailure("NOT_FOUND", "Request key not found");
  }

  async lockInvoice(id: string): Promise<void> {
    void id;
  }
  async lockSubscription(id: string): Promise<void> {
    void id;
  }

  async customerIdsForActor(actor: Actor): Promise<string[]> {
    return actor.customerId ? [actor.customerId] : [];
  }

  async getCustomerName(customerId: string): Promise<string | null> {
    return this.state.customers.get(customerId) ?? null;
  }

  async resolveActorUserId(actor: Actor): Promise<string> {
    return actor.id;
  }

  async listPlans(): Promise<SubscriptionPlanRecord[]> {
    return [...this.state.plans.values()].map(clone);
  }

  async getPlan(id: string): Promise<SubscriptionPlanRecord | null> {
    const p = this.state.plans.get(id);
    return p ? clone(p) : null;
  }

  async savePlan(plan: SubscriptionPlanRecord): Promise<SubscriptionPlanRecord> {
    this.state.plans.set(plan.id, clone(plan));
    return clone(plan);
  }

  async listSubscriptions(filter?: { customerId?: string; status?: SubscriptionStatus }): Promise<StoredSubscription[]> {
    return [...this.state.subscriptions.values()]
      .filter((s) => !filter?.customerId || s.customerId === filter.customerId)
      .filter((s) => !filter?.status || s.status === filter.status)
      .map(clone);
  }

  async getSubscription(id: string): Promise<StoredSubscription | null> {
    const s = this.state.subscriptions.get(id);
    return s ? clone(s) : null;
  }

  async findSubscriptionBySourceLine(orderLineId: string): Promise<StoredSubscription | null> {
    for (const s of this.state.subscriptions.values()) {
      if (s.sourceOrderLineId === orderLineId) return clone(s);
    }
    return null;
  }

  async saveSubscription(sub: StoredSubscription): Promise<StoredSubscription> {
    this.state.subscriptions.set(sub.id, clone(sub));
    return clone(sub);
  }

  async saveChange(change: SubscriptionChangeRecord): Promise<SubscriptionChangeRecord> {
    this.state.changes.set(change.id, clone(change));
    return clone(change);
  }

  async listChanges(subscriptionId: string): Promise<SubscriptionChangeRecord[]> {
    return [...this.state.changes.values()].filter((c) => c.subscriptionId === subscriptionId).map(clone);
  }

  private assemble(inv: StoredInvoice): InvoiceRecord {
    return hydrateInvoice(inv, [...this.state.payments.values()], [...this.state.creditApps.values()]);
  }

  async listInvoices(filter?: {
    customerId?: string;
    status?: InvoiceStatus;
    subscriptionId?: string;
    orderId?: string;
  }): Promise<InvoiceRecord[]> {
    return [...this.state.invoices.values()]
      .map((inv) => this.assemble(inv))
      .filter((inv) => !filter?.customerId || inv.customerId === filter.customerId)
      .filter((inv) => !filter?.status || inv.status === filter.status)
      .filter((inv) => !filter?.subscriptionId || inv.subscriptionId === filter.subscriptionId)
      .filter((inv) => !filter?.orderId || inv.orderId === filter.orderId);
  }

  async getInvoice(id: string): Promise<InvoiceRecord | null> {
    const inv = this.state.invoices.get(id);
    return inv ? this.assemble(inv) : null;
  }

  async findOneTimeInvoice(orderId: string): Promise<InvoiceRecord | null> {
    for (const inv of this.state.invoices.values()) {
      if (inv.kind === "ONE_TIME" && inv.orderId === orderId && inv.status !== "VOID") return this.assemble(inv);
    }
    return null;
  }

  async findRecurringInvoice(subscriptionId: string, periodStart: IsoDate): Promise<InvoiceRecord | null> {
    for (const inv of this.state.invoices.values()) {
      if (
        inv.kind === "RECURRING" &&
        inv.subscriptionId === subscriptionId &&
        inv.periodStart === periodStart &&
        inv.status !== "VOID"
      ) {
        return this.assemble(inv);
      }
    }
    return null;
  }

  async createInvoice(draft: InvoiceDraft): Promise<InvoiceRecord> {
    if (draft.kind === "ONE_TIME" && draft.orderId) {
      const existing = await this.findOneTimeInvoice(draft.orderId);
      if (existing) throw new ApiFailure("CONFLICT", "One-time invoice already exists for this order");
    }
    if (draft.kind === "RECURRING" && draft.subscriptionId && draft.periodStart) {
      const existing = await this.findRecurringInvoice(draft.subscriptionId, draft.periodStart);
      if (existing) return existing;
    }
    const id = draft.id ?? (await this.nextId("inv"));
    let subtotalCents = 0;
    let taxCents = 0;
    const lines: InvoiceLineRecord[] = [];
    for (const line of draft.lines) {
      const amounts = lineAmounts({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct,
        taxPct: line.taxPct,
      });
      const total = line.lineTotal && line.lineTotal !== "0.00" ? line.lineTotal : amounts.total;
      const totalCents = toCents(total);
      const lineSubtotalCents =
        line.taxPct > 0 ? Math.round((totalCents * 100) / (100 + line.taxPct)) : totalCents;
      const lineTaxCents = totalCents - lineSubtotalCents;
      subtotalCents += lineSubtotalCents;
      taxCents += lineTaxCents;
      lines.push({
        id: await this.nextId("iline"),
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct,
        taxPct: line.taxPct,
        lineTotal: total,
      });
    }
    const stored: StoredInvoice = {
      id,
      customerId: draft.customerId,
      customerName: draft.customerName,
      orderId: draft.orderId,
      subscriptionId: draft.subscriptionId,
      kind: draft.kind,
      status: "UNPAID",
      currency: draft.currency,
      issueDate: draft.issueDate,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      dueDate: draft.dueDate,
      subtotal: fromCents(subtotalCents),
      taxTotal: fromCents(taxCents),
      total: fromCents(subtotalCents + taxCents),
      lines,
    };
    this.state.invoices.set(id, stored);
    return this.assemble(stored);
  }

  async rewriteInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
    const inv = this.state.invoices.get(id);
    if (inv) inv.status = status;
  }

  async listPayments(invoiceId: string): Promise<PaymentRecord[]> {
    return [...this.state.payments.values()]
      .filter((p) => p.invoiceId === invoiceId)
      .map((p) => ({ ...clone(p), replayed: false }));
  }

  async getPaymentByRequestKey(requestKey: string): Promise<PaymentRecord | null> {
    for (const p of this.state.payments.values()) {
      if (p.requestKey === requestKey) return { ...clone(p), replayed: true };
    }
    return null;
  }

  async savePayment(
    payment: Omit<PaymentRecord, "replayed"> & { requestKey: string; requestKeyId: string },
  ): Promise<PaymentRecord> {
    this.state.payments.set(payment.id, clone(payment));
    return { ...clone(payment), replayed: false };
  }

  async listCreditNotes(filter?: { customerId?: string; sourceInvoiceId?: string }): Promise<CreditNoteRecord[]> {
    return [...this.state.credits.values()]
      .filter((c) => !filter?.customerId || c.customerId === filter.customerId)
      .filter((c) => !filter?.sourceInvoiceId || c.sourceInvoiceId === filter.sourceInvoiceId)
      .map((c) => {
        const applied = sumMoney(
          [...this.state.creditApps.values()].filter((a) => a.creditNoteId === c.id).map((a) => a.amount),
        );
        return { ...clone(c), appliedAmount: applied };
      });
  }

  async saveCreditNote(note: CreditNoteRecord): Promise<CreditNoteRecord> {
    this.state.credits.set(note.id, clone(note));
    return clone(note);
  }

  async applyCredit(input: {
    id: string;
    creditNoteId: string;
    invoiceId: string;
    amount: Money;
    requestKeyId: string;
  }): Promise<void> {
    this.state.creditApps.set(input.id, {
      id: input.id,
      creditNoteId: input.creditNoteId,
      invoiceId: input.invoiceId,
      amount: input.amount,
    });
  }
}

export function periodAmount(quantity: number, unitPrice: Money, discountPct: Pct, taxPct: Pct): Money {
  return lineAmounts({ quantity, unitPrice, discountPct, taxPct }).total;
}

export async function executeInitialize(
  store: BillingStore,
  order: ConfirmedOrderForBilling,
  requestKey: string,
): Promise<BillingInitResult> {
  if (!order.orderId) throw new ApiFailure("INVALID_INPUT", "orderId is required");
  if (!requestKey.trim()) throw new ApiFailure("INVALID_INPUT", "requestKey is required");

  const claim = await store.claimRequest("BILLING_INIT", requestKey);
  if (claim.replayed) {
    const payload = claim.payload as BillingInitResult;
    return { ...payload, replayed: true };
  }

  const customerName = (await store.getCustomerName(order.customerId)) ?? "Customer";
  const oneTimeLines = order.lines.filter((l) => l.billingKind === "ONE_TIME");
  const recurringLines = order.lines.filter((l) => l.billingKind === "RECURRING");

  let oneTimeInvoice: InvoiceRecord | null = null;
  if (oneTimeLines.length > 0) {
    const existing = await store.findOneTimeInvoice(order.orderId);
    if (existing) {
      oneTimeInvoice = existing;
    } else {
      oneTimeInvoice = await store.createInvoice({
        customerId: order.customerId,
        customerName,
        orderId: order.orderId,
        subscriptionId: null,
        kind: "ONE_TIME",
        currency: order.currency,
        issueDate: order.confirmedAt,
        periodStart: null,
        periodEnd: null,
        dueDate: addDays(order.confirmedAt, 15),
        lines: oneTimeLines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountPct: l.discountPct,
          taxPct: l.taxPct,
          lineTotal: l.lineTotal,
        })),
      });
    }
  }

  const subscriptions: SubscriptionRecord[] = [];
  for (const line of recurringLines) {
    if (!line.planId || !line.interval) {
      throw new ApiFailure("INVALID_INPUT", `Recurring line ${line.orderLineId} needs planId and interval`);
    }
    const existing = await store.findSubscriptionBySourceLine(line.orderLineId);
    if (existing) {
      subscriptions.push(existing);
      continue;
    }
    const plan = await store.getPlan(line.planId);
    if (!plan) throw new ApiFailure("NOT_FOUND", `Plan not found: ${line.planId}`);
    const anchorDay = anchorDayOf(order.confirmedAt);
    const period = periodFrom({ start: order.confirmedAt, interval: line.interval, anchorDay });
    const saved = await store.saveSubscription({
      id: await store.nextId("sub"),
      sourceOrderLineId: line.orderLineId,
      orderId: order.orderId,
      customerId: order.customerId,
      customerName,
      planId: plan.id,
      planName: plan.name,
      status: "ACTIVE",
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      interval: line.interval,
      anchorDay,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      nextBillingDate: period.end,
      cancelPolicy: plan.cancelPolicy,
      cancelEffectiveDate: null,
      pausedAt: null,
      pendingPlanId: null,
      pendingPlanName: null,
      pendingPlanEffectiveDate: null,
      taxPct: line.taxPct,
      discountPct: line.discountPct,
      description: line.description,
      currency: order.currency,
    });
    subscriptions.push(saved);
  }

  const result: BillingInitResult = {
    orderId: order.orderId,
    oneTimeInvoice,
    subscriptions,
    replayed: false,
  };
  await store.completeRequest(claim.claimId, "SUBSCRIPTION_SET", order.orderId, result);
  return result;
}

export async function executeDueBilling(
  store: BillingStore,
  requestKey: string,
  asOf: IsoDate,
): Promise<{ invoices: InvoiceRecord[]; replayed: boolean }> {
  const claim = await store.claimRequest("DUE_BILLING", requestKey);
  if (claim.replayed) {
    const payload = claim.payload as { invoices: InvoiceRecord[] };
    return { invoices: payload.invoices, replayed: true };
  }

  const active = (await store.listSubscriptions({ status: "ACTIVE" })).filter((s) => !s.pausedAt);
  const due: StoredSubscription[] = [];
  for (const sub of active) {
    const missingCurrent =
      sub.currentPeriodStart <= asOf && !(await store.findRecurringInvoice(sub.id, sub.currentPeriodStart));
    const timeToAdvance = Boolean(sub.nextBillingDate && sub.nextBillingDate <= asOf);
    if (missingCurrent || timeToAdvance) due.push(sub);
  }

  const invoices: InvoiceRecord[] = [];
  for (const sub of due) {
    await store.lockSubscription(sub.id);
    const current = (await store.getSubscription(sub.id))!;
    while (current.status === "ACTIVE" && !current.pausedAt && current.currentPeriodStart <= asOf) {
      if (current.cancelEffectiveDate && current.currentPeriodStart >= current.cancelEffectiveDate) {
        current.status = "CANCELLED";
        current.nextBillingDate = null;
        await store.saveSubscription(current);
        break;
      }
      if (
        current.pendingPlanId &&
        current.pendingPlanEffectiveDate &&
        current.pendingPlanEffectiveDate <= current.currentPeriodStart
      ) {
        const nextPlan = await store.getPlan(current.pendingPlanId);
        if (nextPlan) {
          current.planId = nextPlan.id;
          current.planName = nextPlan.name;
          current.interval = nextPlan.interval;
          current.cancelPolicy = nextPlan.cancelPolicy;
          current.pendingPlanId = null;
          current.pendingPlanName = null;
          current.pendingPlanEffectiveDate = null;
        }
      }

      const existing = await store.findRecurringInvoice(current.id, current.currentPeriodStart);
      if (!existing) {
        const amounts = lineAmounts({
          quantity: current.quantity,
          unitPrice: current.unitPrice,
          discountPct: current.discountPct,
          taxPct: current.taxPct,
        });
        const issueDate = asOf <= current.currentPeriodEnd ? asOf : current.currentPeriodEnd;
        const dueDate = current.currentPeriodEnd < issueDate ? issueDate : current.currentPeriodEnd;
        const invoice = await store.createInvoice({
          customerId: current.customerId,
          customerName: current.customerName,
          orderId: current.orderId,
          subscriptionId: current.id,
          kind: "RECURRING",
          currency: current.currency,
          issueDate,
          periodStart: current.currentPeriodStart,
          periodEnd: current.currentPeriodEnd,
          dueDate,
          lines: [
            {
              description: current.description,
              quantity: current.quantity,
              unitPrice: current.unitPrice,
              discountPct: current.discountPct,
              taxPct: current.taxPct,
              lineTotal: amounts.total,
            },
          ],
        });
        invoices.push(invoice);
        current.nextBillingDate = current.currentPeriodEnd;
        await store.saveSubscription(current);
        if (current.currentPeriodEnd > asOf) break;
        continue;
      }

      if (current.currentPeriodEnd > asOf) break;

      const nextStart = current.currentPeriodEnd;
      const nextEnd = addInterval({ date: nextStart, interval: current.interval, anchorDay: current.anchorDay });
      current.currentPeriodStart = nextStart;
      current.currentPeriodEnd = nextEnd;
      if (current.cancelEffectiveDate && nextStart >= current.cancelEffectiveDate) {
        current.status = "CANCELLED";
        current.nextBillingDate = null;
        await store.saveSubscription(current);
        break;
      }
      current.nextBillingDate = nextEnd;
      await store.saveSubscription(current);
    }
  }

  const result = { invoices, replayed: false };
  await store.completeRequest(claim.claimId, "INVOICE", invoices[0]?.id ?? requestKey, result);
  return result;
}

export async function executePayment(
  store: BillingStore,
  input: {
    invoiceId: string;
    amount: Money;
    method: PaymentMethod;
    reference: string;
    paidOn: IsoDate;
    requestKey: string;
    recordedById: string;
  },
): Promise<PaymentRecord> {
  const claim = await store.claimRequest("PAYMENT", input.requestKey, input.recordedById);
  if (claim.replayed) {
    const payload = claim.payload as PaymentRecord;
    if (
      payload.invoiceId !== input.invoiceId ||
      toCents(payload.amount) !== toCents(input.amount) ||
      payload.method !== input.method ||
      payload.reference !== input.reference ||
      payload.paidOn !== input.paidOn
    ) {
      throw new ApiFailure("CONFLICT", "Request key was used for a different payment");
    }
    return { ...payload, replayed: true };
  }

  await store.lockInvoice(input.invoiceId);
  const invoice = await store.getInvoice(input.invoiceId);
  if (!invoice) throw new ApiFailure("NOT_FOUND", "Invoice not found");
  if (invoice.status === "VOID") throw new ApiFailure("INVALID_INPUT", "Cannot pay a void invoice");

  const amount = toCents(input.amount);
  if (amount <= 0) throw new ApiFailure("INVALID_INPUT", "Payment amount must be positive");
  const outstanding = toCents(invoice.outstanding);
  if (amount > outstanding) {
    throw new ApiFailure("INVALID_INPUT", "Payment exceeds outstanding balance", {
      outstanding: invoice.outstanding,
    });
  }

  const payment: Omit<PaymentRecord, "replayed"> & { requestKey: string; requestKeyId: string } = {
    id: await store.nextId("pay"),
    invoiceId: invoice.id,
    amount: fromCents(amount),
    method: input.method,
    reference: input.reference,
    paidOn: input.paidOn,
    recordedById: input.recordedById,
    createdAt: store.now(),
    requestKey: input.requestKey,
    requestKeyId: claim.claimId,
  };
  const saved = await store.savePayment(payment);
  const after = await store.getInvoice(invoice.id);
  if (after) await store.rewriteInvoiceStatus(invoice.id, after.status);
  await store.completeRequest(claim.claimId, "PAYMENT", saved.id, saved);
  return saved;
}

