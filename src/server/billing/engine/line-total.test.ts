import { describe, expect, it } from "vitest";
import { lineAmounts, sumAmounts } from "./line-total";

describe("lineAmounts", () => {
  it("applies discount then tax, rounding each to cents", () => {
    expect(lineAmounts({ quantity: 10, unitPrice: "1000.00", discountPct: 10, taxPct: 0 })).toEqual({ subtotal: "9000.00", tax: "0.00", total: "9000.00" });
    expect(lineAmounts({ quantity: 10, unitPrice: "1000.00", discountPct: 8, taxPct: 0 })).toEqual({ subtotal: "9200.00", tax: "0.00", total: "9200.00" });
    expect(lineAmounts({ quantity: 3, unitPrice: "333.33", discountPct: 0, taxPct: 18 })).toEqual({ subtotal: "999.99", tax: "180.00", total: "1179.99" });
  });

  it("sums per-line rounded amounts", () => {
    const half = lineAmounts({ quantity: 1, unitPrice: "0.50", discountPct: 0, taxPct: 18 });
    expect(sumAmounts([half, half])).toEqual({ subtotal: "1.00", tax: "0.18", total: "1.18" });
  });
});
