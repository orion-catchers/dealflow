import { describe, expect, it } from "vitest";
import { prorate } from "./proration";

const period = { periodStart: "2026-09-01", periodEnd: "2026-10-01" };

describe("prorate", () => {
  it("Sep 1–Oct 1, unit 920, +2 units on Sep 16 => 15/30 × 1840 = 920.00", () => {
    expect(prorate({ ...period, currentPeriodAmount: "920.00", newPeriodAmount: "2760.00", effectiveDate: "2026-09-16" })).toEqual({
      remainingDays: 15,
      periodDays: 30,
      adjustmentAmount: "920.00",
    });
  });

  it("decrease yields a negative adjustment", () => {
    expect(prorate({ ...period, currentPeriodAmount: "2760.00", newPeriodAmount: "920.00", effectiveDate: "2026-09-16" }).adjustmentAmount).toBe("-920.00");
  });

  it("boundary days: first day charges the full delta, last day charges nothing", () => {
    expect(prorate({ ...period, currentPeriodAmount: "0.00", newPeriodAmount: "300.00", effectiveDate: "2026-09-01" }).adjustmentAmount).toBe("300.00");
    expect(prorate({ ...period, currentPeriodAmount: "0.00", newPeriodAmount: "300.00", effectiveDate: "2026-10-01" }).adjustmentAmount).toBe("0.00");
    expect(prorate({ ...period, currentPeriodAmount: "0.00", newPeriodAmount: "300.00", effectiveDate: "2026-10-15" }).remainingDays).toBe(0);
  });

  it("rounds half away from zero to cents", () => {
    expect(prorate({ ...period, currentPeriodAmount: "0.00", newPeriodAmount: "100.00", effectiveDate: "2026-09-24" }).adjustmentAmount).toBe("23.33");
    expect(prorate({ ...period, currentPeriodAmount: "100.00", newPeriodAmount: "0.00", effectiveDate: "2026-09-24" }).adjustmentAmount).toBe("-23.33");
    expect(prorate({ ...period, currentPeriodAmount: "0.00", newPeriodAmount: "0.15", effectiveDate: "2026-09-16" }).adjustmentAmount).toBe("0.08");
  });
});
