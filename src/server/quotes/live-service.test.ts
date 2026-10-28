import { describe, expect, it } from "vitest";
import { portalPricingTotals } from "./live-service";

describe("portalPricingTotals", () => {
  it("returns only customer-facing totals and omits cost and margin", () => {
    const totals = portalPricingTotals({
      currency: "INR",
      oneTimeTotal: "1000.00",
      recurringTotals: { MONTHLY: "250.00" },
      taxTotal: "180.00",
      costTotal: "600.00",
      marginTotal: "400.00",
      marginPct: "40.00",
    });

    expect(totals).toEqual({
      currency: "INR",
      oneTimeTotal: "1000.00",
      recurringTotals: { MONTHLY: "250.00" },
      taxTotal: "180.00",
    });
    expect(totals).not.toHaveProperty("costTotal");
    expect(totals).not.toHaveProperty("marginTotal");
    expect(totals).not.toHaveProperty("marginPct");
  });
});
