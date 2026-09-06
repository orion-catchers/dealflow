import { describe, expect, it } from "vitest";
import { priceQuote } from "./pricing";

const line = {
  productId: "product-laptop",
  variantId: "variant-laptop",
  category: "Hardware",
  description: "Laptop",
  quantity: 10,
  unitPrice: "50000.00",
  unitCost: "40000.00",
  taxPct: "0",
  discountPct: "12",
  billingInterval: "ONE_TIME" as const,
  stockTracked: true,
};

describe("priceQuote", () => {
  it("applies a 50% line discount before tax (qty 2 × 18000)", () => {
    const result = priceQuote({
      currency: "INR",
      orderDiscountPct: "0",
      lines: [
        {
          productId: "product-demo",
          variantId: "variant-demo",
          category: "HARDWARE",
          description: "Workstation",
          quantity: 2,
          unitPrice: "18000.00",
          unitCost: "9000.00",
          taxPct: "18",
          discountPct: "50",
          billingInterval: "ONE_TIME",
          stockTracked: true,
        },
      ],
    });
    expect(result.lines[0]).toMatchObject({
      undiscountedAmount: "36000.00",
      discountAmount: "18000.00",
      taxAmount: "3240.00",
      totalAmount: "21240.00",
    });
    expect(result.totals.oneTimeTotal).toBe("21240.00");
    expect(result.totals.taxTotal).toBe("3240.00");
  });

  it("stacks line and order discounts on the same subtotal", () => {
    const result = priceQuote({
      currency: "INR",
      orderDiscountPct: "10",
      lines: [
        {
          ...line,
          quantity: 2,
          unitPrice: "18000.00",
          unitCost: "9000.00",
          taxPct: "0",
          discountPct: "50",
        },
      ],
    });
    expect(result.lines[0].discountAmount).toBe("19800.00");
    expect(result.lines[0].totalAmount).toBe("16200.00");
  });

  it("calculates one-time totals, cost, profit, and margin", () => {
    const result = priceQuote({
      currency: "INR",
      lines: [line],
      orderDiscountPct: "0",
    });

    expect(result.lines[0]).toMatchObject({
      undiscountedAmount: "500000.00",
      discountAmount: "60000.00",
      totalAmount: "440000.00",
      marginAmount: "40000.00",
    });
    expect(result.totals).toMatchObject({
      oneTimeTotal: "440000.00",
      taxTotal: "0.00",
      costTotal: "400000.00",
      marginTotal: "40000.00",
      marginPct: "9.09",
    });
  });

  it("keeps recurring intervals separate and applies sequential discounts", () => {
    const result = priceQuote({
      currency: "INR",
      orderDiscountPct: "10",
      lines: [
        {
          ...line,
          billingInterval: "MONTHLY",
          unitPrice: "1000.00",
          unitCost: "400.00",
          quantity: 1,
        },
        {
          ...line,
          billingInterval: "YEARLY",
          unitPrice: "12000.00",
          unitCost: "4000.00",
          quantity: 1,
        },
      ],
    });

    expect(result.totals.recurringTotals).toEqual({
      MONTHLY: "792.00",
      YEARLY: "9504.00",
    });
    expect(result.lines[0].totalAmount).toBe("792.00");
  });

  it("rejects invalid quantities, discounts, and empty quotes", () => {
    expect(() =>
      priceQuote({ currency: "INR", lines: [], orderDiscountPct: "0" }),
    ).toThrow();
    expect(() =>
      priceQuote({
        currency: "INR",
        lines: [{ ...line, quantity: 0 }],
        orderDiscountPct: "0",
      }),
    ).toThrow();
    expect(() =>
      priceQuote({
        currency: "INR",
        lines: [{ ...line, discountPct: "101" }],
        orderDiscountPct: "0",
      }),
    ).toThrow();
  });
});
