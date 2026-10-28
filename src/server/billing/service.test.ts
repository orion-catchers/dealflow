import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/contracts/harsh";
import type { ConfirmedOrderForBilling } from "@/contracts/ruchir";
import { ApiFailure } from "@/lib/api/respond";
import { BillingService, InMemoryBillingRepository } from "./service";

const admin: Actor = { id: "admin-dev", role: "ADMIN", active: true };
const finance: Actor = { id: "finance-farah", role: "FINANCE", active: true };
const rep: Actor = { id: "rep-arjun", role: "SALES_REP", active: true };
const neha: Actor = { id: "customer-neha", role: "CUSTOMER", customerId: "customer-acme", active: true };

async function expectFailure(p: Promise<unknown>, code: ApiFailure["code"]) {
  await expect(p).rejects.toBeInstanceOf(ApiFailure);
  await expect(p).rejects.toMatchObject({ code });
}

function order(overrides?: Partial<ConfirmedOrderForBilling>): ConfirmedOrderForBilling {
  return {
    orderId: "order-1",
    customerId: "customer-acme",
    currency: "INR",
    confirmedAt: "2026-09-01",
    lines: [
      {
        orderLineId: "ol-hw",
        description: "Nexa ProBook 15",
        quantity: 10,
        unitPrice: "50000.00",
        discountPct: 12,
        taxPct: 0,
        lineTotal: "440000.00",
        billingKind: "ONE_TIME",
        interval: null,
        planId: null,
      },
      {
        orderLineId: "ol-sub",
        description: "Support Seat",
        quantity: 1,
        unitPrice: "920.00",
        discountPct: 0,
        taxPct: 0,
        lineTotal: "920.00",
        billingKind: "RECURRING",
        interval: "MONTHLY",
        planId: "plan-support-monthly",
      },
    ],
    ...overrides,
  };
}

let repo: InMemoryBillingRepository;
let svc: BillingService;

beforeEach(() => {
  repo = new InMemoryBillingRepository();
  svc = new BillingService(repo);
});

describe("initializeBilling", () => {
  it("creates a one-time invoice and subscriptions without a first recurring invoice", async () => {
    const result = await svc.initializeOnStore(order(), "init-1");
    expect(result.replayed).toBe(false);
    expect(result.oneTimeInvoice?.kind).toBe("ONE_TIME");
    expect(result.oneTimeInvoice?.total).toBe("440000.00");
    expect(result.subscriptions).toHaveLength(1);
    expect(result.subscriptions[0]?.nextBillingDate).toBe("2026-10-01");
    const invoices = await svc.listInvoices(finance);
    expect(invoices.filter((i) => i.kind === "RECURRING")).toHaveLength(0);
  });

  it("replays the same requestKey", async () => {
    const first = await svc.initializeOnStore(order(), "init-1");
    const second = await svc.initializeOnStore(order(), "init-1");
    expect(second.replayed).toBe(true);
    expect(second.oneTimeInvoice?.id).toBe(first.oneTimeInvoice?.id);
    expect(second.subscriptions[0]?.id).toBe(first.subscriptions[0]?.id);
  });
});

describe("due billing", () => {
  it("is idempotent on requestKey and unique per period", async () => {
    await svc.initializeOnStore(order(), "init-1");
    const first = await svc.runDueBilling(finance, { requestKey: "due-1", asOf: "2026-09-01" });
    expect(first.replayed).toBe(false);
    expect(first.invoices).toHaveLength(1);
    expect(first.invoices[0]?.kind).toBe("RECURRING");
    expect(first.invoices[0]?.total).toBe("920.00");
    const replay = await svc.runDueBilling(finance, { requestKey: "due-1", asOf: "2026-09-01" });
    expect(replay.replayed).toBe(true);
    expect(replay.invoices[0]?.id).toBe(first.invoices[0]?.id);
    const secondKey = await svc.runDueBilling(finance, { requestKey: "due-2", asOf: "2026-09-01" });
    expect(secondKey.invoices).toHaveLength(0);
    const listed = await svc.listInvoices(finance);
    expect(listed.filter((i) => i.kind === "RECURRING")).toHaveLength(1);
  });

  it("bills recurring lines at the accepted effective discount (line + order)", async () => {
    // 100.00 list, 0% line discount, 10% order discount: the accepted line total is 90.00.
    // The confirmation payload carries the effective percentage, and billing applies it once.
    await svc.initializeOnStore(
      order({
        lines: [
          {
            orderLineId: "ol-monthly",
            description: "Monthly seat",
            quantity: 1,
            unitPrice: "100.00",
            discountPct: 10,
            taxPct: 0,
            lineTotal: "90.00",
            billingKind: "RECURRING",
            interval: "MONTHLY",
            planId: "plan-support-monthly",
          },
        ],
      }),
      "init-effective",
    );
    const due = await svc.runDueBilling(finance, { requestKey: "due-effective", asOf: "2026-09-01" });
    expect(due.invoices).toHaveLength(1);
    expect(due.invoices[0]?.total).toBe("90.00");
    expect(due.invoices[0]?.lines[0]?.lineTotal).toBe("90.00");
  });

  it("rejects impossible asOf dates", async () => {
    await expectFailure(svc.runDueBilling(finance, { requestKey: "due-bad", asOf: "2026-13-01" }), "INVALID_INPUT");
  });
});

describe("payments", () => {
  it("rejects overpay and replays the same key", async () => {
    const init = await svc.initializeOnStore(order(), "init-1");
    const invoiceId = init.oneTimeInvoice!.id;
    await expectFailure(
      svc.recordPayment(finance, {
        invoiceId,
        amount: "440000.01",
        method: "BANK_TRANSFER",
        reference: "NEFT-1",
        paidOn: "2026-09-02",
        requestKey: "pay-over",
      }),
      "INVALID_INPUT",
    );
    const first = await svc.recordPayment(finance, {
      invoiceId,
      amount: "100000.00",
      method: "BANK_TRANSFER",
      reference: "NEFT-2",
      paidOn: "2026-09-02",
      requestKey: "pay-1",
    });
    expect(first.replayed).toBe(false);
    const after = await svc.getInvoice(finance, invoiceId);
    expect(after.status).toBe("PARTIALLY_PAID");
    const replay = await svc.recordPayment(finance, {
      invoiceId,
      amount: "100000.00",
      method: "BANK_TRANSFER",
      reference: "NEFT-2",
      paidOn: "2026-09-02",
      requestKey: "pay-1",
    });
    expect(replay.replayed).toBe(true);
    expect(replay.id).toBe(first.id);
    const rest = await svc.recordPayment(finance, {
      invoiceId,
      amount: "340000.00",
      method: "BANK_TRANSFER",
      reference: "NEFT-3",
      paidOn: "2026-09-03",
      requestKey: "pay-2",
    });
    expect(rest.replayed).toBe(false);
    expect((await svc.getInvoice(finance, invoiceId)).status).toBe("PAID");
  });

  it("rejects replay of another actor's payment key", async () => {
    const init = await svc.initializeOnStore(order(), "init-1");
    const invoiceId = init.oneTimeInvoice!.id;
    await svc.recordPayment(finance, {
      invoiceId,
      amount: "100.00",
      method: "BANK_TRANSFER",
      reference: "NEFT-x",
      paidOn: "2026-09-02",
      requestKey: "pay-shared",
    });
    await expectFailure(
      svc.recordPayment(admin, {
        invoiceId,
        amount: "100.00",
        method: "BANK_TRANSFER",
        reference: "NEFT-x",
        paidOn: "2026-09-02",
        requestKey: "pay-shared",
      }),
      "CONFLICT",
    );
  });

  it("rejects the same key used for a different payment", async () => {
    const init = await svc.initializeOnStore(order(), "init-1");
    const invoiceId = init.oneTimeInvoice!.id;
    await svc.recordPayment(finance, {
      invoiceId,
      amount: "100.00",
      method: "CASH",
      reference: "a",
      paidOn: "2026-09-02",
      requestKey: "pay-mismatch",
    });
    await expectFailure(
      svc.recordPayment(finance, {
        invoiceId,
        amount: "100.00",
        method: "CASH",
        reference: "b",
        paidOn: "2026-09-03",
        requestKey: "pay-mismatch",
      }),
      "CONFLICT",
    );
  });

  it("replays an identical retry that omits the reference", async () => {
    const init = await svc.initializeOnStore(order(), "init-1");
    const payload = {
      invoiceId: init.oneTimeInvoice!.id,
      amount: "100.00",
      method: "CASH",
      paidOn: "2026-09-02",
      requestKey: "pay-no-ref",
    };
    const first = await svc.recordPayment(finance, payload);
    const retry = await svc.recordPayment(finance, payload);
    expect(retry.replayed).toBe(true);
    expect(retry.id).toBe(first.id);
    expect(retry.reference).toBe("PAY-pay-no-ref");
  });

  it("lets a customer pay their own invoice and hides another customer's invoice", async () => {
    const init = await svc.initializeOnStore(order(), "init-1");
    const paid = await svc.recordPayment(neha, {
      invoiceId: init.oneTimeInvoice!.id,
      amount: "10.00",
      method: "CARD",
      reference: "CARD-PREVIEW-4242",
      paidOn: "2026-09-02",
      requestKey: "pay-cust",
    });
    expect(paid.amount).toBe("10.00");
    const invoice = await svc.getInvoice(finance, init.oneTimeInvoice!.id);
    expect(invoice.paidAmount).toBe("10.00");
    expect(invoice.payments).toHaveLength(1);
    const other: Actor = { id: "customer-beta-user", role: "CUSTOMER", customerId: "customer-beta", active: true };
    await expectFailure(
      svc.recordPayment(other, {
        invoiceId: init.oneTimeInvoice!.id,
        amount: "5.00",
        method: "CASH",
        reference: "x",
        paidOn: "2026-09-02",
        requestKey: "pay-other",
      }),
      "NOT_FOUND",
    );
  });
});

describe("customer payments outside demo mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a customer-recorded card payment in production unless the host is a demo", async () => {
    const init = await svc.initializeOnStore(order(), "init-1");
    vi.stubEnv("NODE_ENV", "production");
    const pay = (requestKey: string) =>
      svc.recordPayment(neha, {
        invoiceId: init.oneTimeInvoice!.id,
        amount: "10.00",
        method: "CARD",
        reference: "CARD-PREVIEW-4242",
        paidOn: "2026-09-02",
        requestKey,
      });
    await expectFailure(pay("pay-prod"), "FORBIDDEN");
    expect((await svc.getInvoice(finance, init.oneTimeInvoice!.id)).payments).toHaveLength(0);
    vi.stubEnv("DEALFLOW_DEMO_MODE", "1");
    expect((await pay("pay-demo")).amount).toBe("10.00");
  });
});

describe("proration and cancel", () => {
  it("Sep 1–Oct 1 unit 920 +2 units on Sep 16 equals 920.00", async () => {
    const init = await svc.initializeOnStore(order(), "init-1");
    const subId = init.subscriptions[0]!.id;
    await svc.runDueBilling(finance, { requestKey: "due-1", asOf: "2026-09-01" });
    const updated = await svc.patchSubscription(finance, subId, {
      requestKey: "qty-1",
      quantity: 3,
      effectiveDate: "2026-09-16",
    });
    expect(updated.quantity).toBe(3);
    const invoices = await svc.listInvoices(finance, { subscriptionId: subId });
    const adjustment = invoices.find((i) => i.kind === "ADJUSTMENT");
    expect(adjustment?.total).toBe("920.00");
  });

  it("does not credit a cancel when the subscription was never invoiced", async () => {
    const init = await svc.initializeOnStore(
      order({
        lines: [
          {
            orderLineId: "ol-backup",
            description: "Backup",
            quantity: 1,
            unitPrice: "100.00",
            discountPct: 0,
            taxPct: 0,
            lineTotal: "100.00",
            billingKind: "RECURRING",
            interval: "MONTHLY",
            planId: "plan-backup-monthly",
          },
        ],
      }),
      "init-backup",
    );
    const subId = init.subscriptions[0]!.id;
    await svc.patchSubscription(finance, subId, {
      requestKey: "cancel-1",
      cancel: true,
      effectiveDate: "2026-09-01",
    });
    const notes = await svc.listCreditNotes(finance);
    expect(notes).toHaveLength(0);
    expect((await svc.getSubscription(finance, subId)).status).toBe("CANCELLED");
  });

  it("pause stops due billing; resume starts a new cycle", async () => {
    const init = await svc.initializeOnStore(order(), "init-1");
    const subId = init.subscriptions[0]!.id;
    await svc.patchSubscription(finance, subId, { requestKey: "pause-1", pause: true, effectiveDate: "2026-09-01" });
    const pausedDue = await svc.runDueBilling(finance, { requestKey: "due-paused", asOf: "2026-09-01" });
    expect(pausedDue.invoices).toHaveLength(0);
    await svc.patchSubscription(finance, subId, { requestKey: "resume-1", resume: true, effectiveDate: "2026-09-20" });
    const resumed = await svc.getSubscription(finance, subId);
    expect(resumed.status).toBe("ACTIVE");
    expect(resumed.currentPeriodStart).toBe("2026-09-20");
    expect(resumed.nextBillingDate).toBe(resumed.currentPeriodEnd);
  });
});

/** Simulates a payment that commits after the credit was read but before the invoice lock is granted. */
function injectPaymentOnLock(invoiceId: string, amount: string) {
  return vi.spyOn(repo, "lockInvoice").mockImplementation(async () => {
    await repo.savePayment({
      id: `pay-race-${invoiceId}`,
      invoiceId,
      amount,
      method: "BANK_TRANSFER",
      reference: "RACE",
      paidOn: "2026-09-16",
      recordedById: "finance-farah",
      createdAt: "2026-09-16T00:00:00.000Z",
      requestKey: "pay-race",
      requestKeyId: "req-race",
    });
  });
}

describe("subscription lifecycle regressions", () => {
  it("choosing the current interval clears an earlier scheduled plan change", async () => {
    const init = await svc.initializeOnStore(order(), "init-1");
    const subId = init.subscriptions[0]!.id;
    await svc.patchSubscription(finance, subId, { requestKey: "plan-yearly", planId: "plan-support-yearly" });
    expect((await svc.getSubscription(finance, subId)).pendingPlanId).toBe("plan-support-yearly");
    await svc.patchSubscription(finance, subId, { requestKey: "plan-same", planId: "plan-backup-monthly" });
    const changed = await svc.getSubscription(finance, subId);
    expect(changed.planId).toBe("plan-backup-monthly");
    expect(changed.pendingPlanId).toBeNull();
    expect(changed.pendingPlanName).toBeNull();
    expect(changed.pendingPlanEffectiveDate).toBeNull();
    await svc.runDueBilling(finance, { requestKey: "due-renew", asOf: "2026-10-01" });
    const renewed = await svc.getSubscription(finance, subId);
    expect(renewed.planId).toBe("plan-backup-monthly");
    expect(renewed.interval).toBe("MONTHLY");
  });

  it("the first period after an interval change runs a full new interval", async () => {
    const init = await svc.initializeOnStore(order({ confirmedAt: "2026-01-01" }), "init-jan");
    const subId = init.subscriptions[0]!.id;
    await svc.patchSubscription(finance, subId, { requestKey: "plan-year", planId: "plan-support-yearly" });
    await svc.runDueBilling(finance, { requestKey: "due-feb", asOf: "2026-02-01" });
    const sub = await svc.getSubscription(finance, subId);
    expect(sub.interval).toBe("YEARLY");
    expect(sub.currentPeriodStart).toBe("2026-02-01");
    expect(sub.currentPeriodEnd).toBe("2027-02-01");
    expect(sub.nextBillingDate).toBe("2027-02-01");
    const firstYearly = (await svc.listInvoices(finance, { subscriptionId: subId })).find(
      (i) => i.periodStart === "2026-02-01",
    );
    expect(firstYearly?.periodEnd).toBe("2027-02-01");
  });

  it("a paused subscription with a scheduled period-end cancellation finishes cancelling without being invoiced", async () => {
    const init = await svc.initializeOnStore(order(), "init-1");
    const subId = init.subscriptions[0]!.id;
    await svc.patchSubscription(finance, subId, { requestKey: "pause-c", pause: true, effectiveDate: "2026-09-01" });
    await svc.patchSubscription(finance, subId, { requestKey: "cancel-c", cancel: true, effectiveDate: "2026-09-01" });
    await svc.runDueBilling(finance, { requestKey: "due-early", asOf: "2026-09-15" });
    expect((await svc.getSubscription(finance, subId)).status).toBe("PAUSED");
    const due = await svc.runDueBilling(finance, { requestKey: "due-end", asOf: "2026-10-01" });
    expect(due.invoices).toHaveLength(0);
    const cancelled = await svc.getSubscription(finance, subId);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.nextBillingDate).toBeNull();
    const recurring = (await svc.listInvoices(finance, { subscriptionId: subId })).filter((i) => i.kind === "RECURRING");
    expect(recurring).toHaveLength(0);
  });

  it("rejects a quantity change dated outside the current billing period without mutating anything", async () => {
    const init = await svc.initializeOnStore(order(), "init-1");
    const subId = init.subscriptions[0]!.id;
    await expectFailure(
      svc.patchSubscription(finance, subId, { requestKey: "qty-future", quantity: 3, effectiveDate: "2026-10-02" }),
      "INVALID_INPUT",
    );
    await expectFailure(
      svc.patchSubscription(finance, subId, { requestKey: "qty-past", quantity: 3, effectiveDate: "2026-08-31" }),
      "INVALID_INPUT",
    );
    const sub = await svc.getSubscription(finance, subId);
    expect(sub.quantity).toBe(1);
    expect(sub.changes).toHaveLength(0);
    expect(await svc.listInvoices(finance, { subscriptionId: subId })).toHaveLength(0);
    const retried = await svc.patchSubscription(finance, subId, {
      requestKey: "qty-future",
      quantity: 3,
      effectiveDate: "2026-09-16",
    });
    expect(retried.quantity).toBe(3);
  });

  it("caps a quantity-decrease credit at the balance re-read after locking the invoice", async () => {
    const init = await svc.initializeOnStore(
      order({
        lines: [
          {
            orderLineId: "ol-seats",
            description: "Support Seat",
            quantity: 3,
            unitPrice: "920.00",
            discountPct: 0,
            taxPct: 0,
            lineTotal: "2760.00",
            billingKind: "RECURRING",
            interval: "MONTHLY",
            planId: "plan-support-monthly",
          },
        ],
      }),
      "init-seats",
    );
    const subId = init.subscriptions[0]!.id;
    await svc.runDueBilling(finance, { requestKey: "due-seats", asOf: "2026-09-01" });
    const recurring = (await svc.listInvoices(finance, { subscriptionId: subId })).find((i) => i.kind === "RECURRING")!;
    const lock = injectPaymentOnLock(recurring.id, "2660.00");
    // Proration credit is 920.00, but only 100.00 is still outstanding after the racing payment.
    await svc.patchSubscription(finance, subId, { requestKey: "qty-down", quantity: 1, effectiveDate: "2026-09-16" });
    expect(lock).toHaveBeenCalledWith(recurring.id);
    const invoice = await svc.getInvoice(finance, recurring.id);
    expect(invoice.paidAmount).toBe("2660.00");
    expect(invoice.creditedAmount).toBe("100.00");
    expect(invoice.outstanding).toBe("0.00");
  });

  it("caps an immediate-cancel credit at the balance re-read after locking the invoice", async () => {
    const init = await svc.initializeOnStore(
      order({
        lines: [
          {
            orderLineId: "ol-backup",
            description: "Backup",
            quantity: 1,
            unitPrice: "100.00",
            discountPct: 0,
            taxPct: 0,
            lineTotal: "100.00",
            billingKind: "RECURRING",
            interval: "MONTHLY",
            planId: "plan-backup-monthly",
          },
        ],
      }),
      "init-backup-race",
    );
    const subId = init.subscriptions[0]!.id;
    await svc.runDueBilling(finance, { requestKey: "due-backup", asOf: "2026-09-01" });
    const recurring = (await svc.listInvoices(finance, { subscriptionId: subId })).find((i) => i.kind === "RECURRING")!;
    const lock = injectPaymentOnLock(recurring.id, "90.00");
    // Unused time is 50.00, but only 10.00 is still outstanding after the racing payment.
    await svc.patchSubscription(finance, subId, { requestKey: "cancel-race", cancel: true, effectiveDate: "2026-09-16" });
    expect(lock).toHaveBeenCalledWith(recurring.id);
    const invoice = await svc.getInvoice(finance, recurring.id);
    expect(invoice.paidAmount).toBe("90.00");
    expect(invoice.creditedAmount).toBe("10.00");
    expect(invoice.outstanding).toBe("0.00");
  });
});

describe("permissions", () => {
  it("lets internal roles read and customers see only their invoices", async () => {
    await svc.initializeOnStore(order(), "init-1");
    expect((await svc.listInvoices(rep)).length).toBeGreaterThan(0);
    expect((await svc.listInvoices(neha)).every((i) => i.customerId === "customer-acme")).toBe(true);
    await expectFailure(svc.runDueBilling(rep, { requestKey: "due-rep", asOf: "2026-09-01" }), "FORBIDDEN");
  });

  it("restricts plan writes to admin", async () => {
    await expectFailure(
      svc.createPlan(finance, { code: "X", name: "X", interval: "MONTHLY", cancelPolicy: "PERIOD_END" }),
      "FORBIDDEN",
    );
    const plan = await svc.createPlan(admin, {
      code: "NEW-M",
      name: "New Monthly",
      interval: "MONTHLY",
      cancelPolicy: "PERIOD_END",
    });
    expect(plan.code).toBe("NEW-M");
  });
});
