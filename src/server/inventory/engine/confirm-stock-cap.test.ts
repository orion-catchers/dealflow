import { describe, expect, it } from "vitest";
import { confirmStockShortages } from "./confirm-stock-cap";

describe("confirmStockShortages", () => {
  it("allows services and untracked lines", () => {
    expect(
      confirmStockShortages(
        [{ variantId: null, quantity: 99, stockTracked: false }],
        new Map(),
      ),
    ).toEqual([]);
  });

  it("blocks when requested quantity exceeds available", () => {
    const shortages = confirmStockShortages(
      [
        { variantId: "v1", quantity: 6, stockTracked: true },
        { variantId: "v1", quantity: 4, stockTracked: true },
      ],
      new Map([["v1", 9]]),
    );
    expect(shortages).toEqual([{ variantId: "v1", requested: 10, available: 9 }]);
  });

  it("treats missing stock rows as zero available", () => {
    const shortages = confirmStockShortages(
      [{ variantId: "missing", quantity: 1, stockTracked: true }],
      new Map(),
    );
    expect(shortages[0]?.available).toBe(0);
  });
});
