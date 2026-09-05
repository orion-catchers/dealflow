import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paidInvoiceFromStripeEvent, verifyStripeSignature } from "./stripe";

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
          },
        },
      }),
    ).toEqual({ invoiceId: "inv_1", amount: "500.00", reference: "pi_1" });
  });

  it("ignores other event types", () => {
    expect(paidInvoiceFromStripeEvent({ type: "customer.created" })).toBeNull();
  });
});
