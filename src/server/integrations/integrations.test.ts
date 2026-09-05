import { describe, expect, it } from "vitest";
import { convertMoney } from "./fx";
import { sendMail } from "./mail";
import { parseCarrierQuoteBody } from "./carrier";
import { applyCourierRateCard } from "../inventory/engine/rate-card";

describe("fx", () => {
  it("keeps INR unchanged", () => {
    expect(convertMoney("100.00", "INR", "INR")).toBe("100.00");
  });

  it("converts USD into INR with the default rate", () => {
    expect(Number(convertMoney("1.00", "USD", "INR"))).toBeGreaterThan(80);
  });

  it("rejects negative amounts", () => {
    expect(() => convertMoney("-1.00", "INR", "USD")).toThrow();
  });

  it("rejects unknown currencies", () => {
    expect(() => convertMoney("1.00", "INR", "GBP" as "EUR")).toThrow();
  });
});

describe("mail", () => {
  it("logs in non-production when no provider is set", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_WEBHOOK_URL;
    const result = await sendMail({ to: "a@b.c", subject: "t", text: "hello" });
    expect(result.mode).toBe("LOG");
  });
});

describe("courier rate card", () => {
  it("fills per-kg when the warehouse only has a flat shipment cost", () => {
    const priced = applyCourierRateCard({
      id: "w1",
      name: "Main",
      code: "MAIN",
      shippingCostPerShipment: "250.00",
      active: true,
    });
    expect(priced.shippingCostPerKg).toBe("12.00");
  });

  it("keeps an existing per-kg rate", () => {
    const priced = applyCourierRateCard({
      id: "warehouse-east",
      name: "East",
      code: "EAST",
      shippingCostPerShipment: "850.00",
      shippingCostPerKg: "99.00",
      active: true,
    });
    expect(priced.shippingCostPerKg).toBe("99.00");
  });
});

describe("carrier quote parser", () => {
  it("reads amount and currency from a live payload", () => {
    expect(parseCarrierQuoteBody({ amount: "425.50", currency: "inr" })).toEqual({ amount: "425.50", currency: "INR" });
  });

  it("rejects a non-money amount", () => {
    expect(() => parseCarrierQuoteBody({ amount: "n/a" })).toThrow();
  });
});
