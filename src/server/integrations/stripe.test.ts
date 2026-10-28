import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paidInvoiceFromStripeEvent, stripeCreatedDate, verifyStripeSignature } from "./stripe";

// 2026-09-30 23:59:30 UTC, just before midnight: a retry after midnight must still derive the same paidOn.
const CREATED_BEFORE_MIDNIGHT = Date.UTC(2026, 8, 30, 23, 59, 30) / 1000;

describe("Stripe signature", () => {
  it("accepts a timely v1 HMAC", () => {
    const secret = "whsec_test";
    const payload = "{\"id\":\"evt_1\"}";
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
    expect(verifyStripeSignature(payload, `t=${t},v1=${v1}`, secret)).toBe(true);
  });

  it("rejects a wrong secret", () => {
    const payload = "{}";
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", "a").update(`${t}.${payload}`).digest("hex");
    expect(verifyStripeSignature(payload, `t=${t},v1=${v1}`, "b")).toBe(false);
  });
});

describe("Stripe paid event parse", () => {
  it("reads checkout.session.completed", () => {
    expect(
      paidInvoiceFromStripeEvent({
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_1",
            payment_status: "paid",
            amount_total: 50000,
            payment_intent: "pi_1",
            metadata: { invoiceId: "inv_1" },
            currency: "inr",
            created: CREATED_BEFORE_MIDNIGHT,
          },
        },
      }),
    ).toEqual({ invoiceId: "inv_1", amount: "500.00", reference: "pi_1", currency: "inr", paidOn: "2026-09-30" });
  });

  it("derives paidOn from the object's created time in UTC, not processing time", () => {
    expect(stripeCreatedDate(CREATED_BEFORE_MIDNIGHT)).toBe("2026-09-30");
    expect(stripeCreatedDate(CREATED_BEFORE_MIDNIGHT + 60)).toBe("2026-10-01");
    expect(stripeCreatedDate(undefined)).toBeNull();
  });

  it("ignores a settlement without a currency or created time", () => {
    expect(
      paidInvoiceFromStripeEvent({
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_2", amount_received: 100, metadata: { invoiceId: "inv_2" }, created: CREATED_BEFORE_MIDNIGHT } },
      }),
    ).toBeNull();
  });

  it("ignores other event types", () => {
    expect(paidInvoiceFromStripeEvent({ type: "customer.created" })).toBeNull();
  });
});
