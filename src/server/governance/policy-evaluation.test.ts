import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "./policy-evaluation";
import type { PolicySnapshot, PricedDealLine } from "@/contracts/atharva";

const policy: PolicySnapshot = {
  policyVersionId: "policy-1",
  capturedAt: "2026-09-05T00:00:00.000Z",
  rules: {
    tierId: "tier-gold",
    tierName: "Gold",
    defaultCeilingPct: "15",
    categoryCeilingsPct: { Hardware: "15", Services: "10" },
    managerThresholdPct: "0",
    financeWorstLineThresholdPct: "5",
    financeWeightedThresholdPct: "3",
    minimumHistorySamples: 3,
  },
};

function line(overrides: Partial<PricedDealLine> = {}): PricedDealLine {
  return {
    lineId: "line-1",
    productId: "product-1",
    category: "Hardware",
    description: "Laptop",
    quantity: 1,
    unitPrice: "100.00",
    unitCost: "50.00",
    taxPct: "0",
    discountPct: "12",
    billingInterval: "ONE_TIME",
    stockTracked: true,
    priceSnapshot: "100.00",
    costSnapshot: "50.00",
    undiscountedAmount: "100.00",
    discountAmount: "12.00",
    taxAmount: "0.00",
    totalAmount: "88.00",
    marginAmount: "38.00",
    marginPct: "43.18",
    ...overrides,
  };
}

describe("evaluatePolicy", () => {
  it("allows an official Gold hardware discount within the ceiling", () => {
    const result = evaluatePolicy({
      lines: [line()],
      orderDiscountPct: "0",
      policySnapshot: policy,
    });
    expect(result).toMatchObject({
      status: "NOT_REQUIRED",
      riskLevel: "NONE",
      requiredApprovalChain: [],
    });
  });

  it("routes a small breach to Manager and a large breach to Finance", () => {
    const manager = evaluatePolicy({
      lines: [line({ discountPct: "16" })],
      orderDiscountPct: "0",
      policySnapshot: policy,
    });
    expect(manager.requiredApprovalChain).toEqual(["MANAGER"]);

    const finance = evaluatePolicy({
      lines: [line({ discountPct: "21" })],
      orderDiscountPct: "0",
      policySnapshot: policy,
    });
    expect(finance.requiredApprovalChain).toEqual(["MANAGER", "FINANCE"]);
  });

  it("uses the Bronze default ceiling so a 12% hardware discount needs Manager and Finance", () => {
    const result = evaluatePolicy({
      lines: [line({ discountPct: "12" })],
      orderDiscountPct: "0",
      policySnapshot: {
        ...policy,
        rules: {
          ...policy.rules,
          tierId: "bronze",
          tierName: "Bronze",
          defaultCeilingPct: "5",
          categoryCeilingsPct: { Hardware: "15" },
        },
      },
    });
    expect(result.status).toBe("PENDING");
    expect(result.requiredApprovalChain).toEqual(["MANAGER", "FINANCE"]);
  });

  it("never lets a category ceiling exceed the default ceiling", () => {
    const result = evaluatePolicy({
      lines: [line({ discountPct: "16" })],
      orderDiscountPct: "0",
      policySnapshot: {
        ...policy,
        rules: {
          ...policy.rules,
          defaultCeilingPct: "15",
          categoryCeilingsPct: { Hardware: "40" },
        },
      },
    });
    expect(result.requiredApprovalChain).toEqual(["MANAGER"]);
  });

  it("keeps recurring interval risk separate and cannot be bypassed by order discount", () => {
    const result = evaluatePolicy({
      lines: [
        line({
          lineId: "monthly",
          billingInterval: "MONTHLY",
          category: "Services",
          discountPct: "0",
        }),
        line({
          lineId: "yearly",
          billingInterval: "YEARLY",
          category: "Services",
          discountPct: "16",
        }),
      ],
      orderDiscountPct: "5",
      policySnapshot: policy,
    });
    expect(result.requiredApprovalChain).toEqual(["MANAGER", "FINANCE"]);
    expect(result.breaches.map((breach) => breach.lineId)).toEqual(["yearly"]);
  });

  it("does not change aggregate risk when an identical line is split", () => {
    const whole = evaluatePolicy({
      lines: [line({ undiscountedAmount: "200.00", quantity: 2 })],
      orderDiscountPct: "0",
      policySnapshot: policy,
    });
    const split = evaluatePolicy({
      lines: [
        line({ lineId: "a", undiscountedAmount: "100.00" }),
        line({ lineId: "b", undiscountedAmount: "100.00" }),
      ],
      orderDiscountPct: "0",
      policySnapshot: policy,
    });
    expect(split.weightedExcessPct).toBe(whole.weightedExcessPct);
    expect(split.worstLineExcessPct).toBe(whole.worstLineExcessPct);
  });
});
