import { beforeEach, describe, expect, it } from "vitest";
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
        amount: "200.00",
        method: "CASH",
        reference: "b",
        paidOn: "2026-09-02",
        requestKey: "pay-mismatch",
      }),
      "CONFLICT",
    );
  });

  it("forbids customers from recording payments", async () => {
    const init = await svc.initializeOnStore(order(), "init-1");
    await expectFailure(
      svc.recordPayment(neha, {
        invoiceId: init.oneTimeInvoice!.id,
        amount: "10.00",
        method: "CASH",
        reference: "x",
        paidOn: "2026-09-02",
        requestKey: "pay-cust",
      }),
      "FORBIDDEN",
    );
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
