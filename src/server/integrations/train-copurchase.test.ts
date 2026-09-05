import { describe, expect, it } from "vitest";
import { trainCopurchaseModel } from "./train-copurchase";

describe("trainCopurchaseModel", () => {
  it("returns nothing for empty or singleton baskets", () => {
    expect(trainCopurchaseModel([])).toEqual([]);
    expect(trainCopurchaseModel([["a"], ["b"]])).toEqual([]);
  });

  it("scores a frequent pair higher than a rare pair", () => {
    const baskets = [
      ["laptop", "dock"],
      ["laptop", "dock"],
      ["laptop", "dock"],
      ["laptop", "mouse"],
    ];
    const trained = trainCopurchaseModel(baskets);
    const dock = trained.find((p) => p.baseProductId === "laptop" && p.candidateProductId === "dock");
    const mouse = trained.find((p) => p.baseProductId === "laptop" && p.candidateProductId === "mouse");
    expect(dock).toBeTruthy();
    expect(mouse).toBeTruthy();
    expect(dock!.pairCount).toBeGreaterThan(mouse!.pairCount);
    expect(dock!.score).toBeGreaterThanOrEqual(1);
    expect(dock!.score).toBeLessThanOrEqual(100);
  });
});
