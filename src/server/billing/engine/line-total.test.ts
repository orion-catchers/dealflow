import { describe, expect, it } from "vitest";
import { combinedDiscountPct, lineAmounts, sumAmounts } from "./line-total";

describe("lineAmounts", () => {
  it("applies discount then tax, rounding each to cents", () => {
    expect(lineAmounts({ quantity: 10, unitPrice: "1000.00", discountPct: 10, taxPct: 0 })).toEqual({ subtotal: "9000.00", tax: "0.00", total: "9000.00" });
    expect(lineAmounts({ quantity: 10, unitPrice: "1000.00", discountPct: 8, taxPct: 0 })).toEqual({ subtotal: "9200.00", tax: "0.00", total: "9200.00" });
    expect(lineAmounts({ quantity: 3, unitPrice: "333.33", discountPct: 0, taxPct: 18 })).toEqual({ subtotal: "999.99", tax: "180.00", total: "1179.99" });
  });

  it("rounds the discount half-up to cents, as the quote engine does", () => {
    expect(lineAmounts({ quantity: 1, unitPrice: "0.05", discountPct: 90, taxPct: 0 })).toEqual({ subtotal: "0.00", tax: "0.00", total: "0.00" });
    // 10% line + 10% order on 10.50: discount 1.995 → 2.00, matching the accepted quote total 8.50.
    expect(lineAmounts({ quantity: 1, unitPrice: "10.50", discountPct: combinedDiscountPct(10, 10), taxPct: 0 })).toEqual({ subtotal: "8.50", tax: "0.00", total: "8.50" });
  });

  it("sums per-line rounded amounts", () => {
    const half = lineAmounts({ quantity: 1, unitPrice: "0.50", discountPct: 0, taxPct: 18 });
    expect(sumAmounts([half, half])).toEqual({ subtotal: "1.00", tax: "0.18", total: "1.18" });
  });
});
