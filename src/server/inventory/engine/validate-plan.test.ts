import { describe, expect, it } from "vitest";
import type { Reservation } from "@/contracts/harsh";
import { orderBetaCompeting, stockLevels, warehouses } from "@/fixtures/harsh-dev";
import { validatePlan } from "./validate-plan";

const remaining = new Map([["ol-1002-1", 4]]);

describe("validatePlan", () => {
  it("accepts a plan that exactly covers the remainder within stock", () => {
    const errors = validatePlan({
      order: orderBetaCompeting,
      allocations: [{ orderLineId: "ol-1002-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-east", quantity: 3 }],
      backorders: [{ orderLineId: "ol-1002-1", variantId: "var-laptop-16-512", quantity: 1 }],
      stockLevels,
      warehouses,
      ownReservations: [],
      remainingByLine: remaining,
    });
    expect(errors).toEqual([]);
  });

  it("flags quantity mismatch (422-class) and shortage (409-class) separately", () => {
    const errors = validatePlan({
      order: orderBetaCompeting,
      allocations: [{ orderLineId: "ol-1002-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-east", quantity: 5 }],
      backorders: [],
      stockLevels,
      warehouses,
      ownReservations: [],
      remainingByLine: remaining,
    });
    expect(errors.map((e) => e.code)).toEqual(["LINE_QUANTITY_MISMATCH", "INSUFFICIENT_STOCK"]);
    expect(errors.map((e) => e.kind)).toEqual(["INVALID", "SHORTAGE"]);
  });

  it("credits the order's own unshipped reservations so re-using a warehouse does not double-count", () => {
    const own: Reservation[] = [
      { id: "r1", orderId: orderBetaCompeting.orderId, orderLineId: "ol-1002-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 4, status: "RESERVED", createdAt: "x" },
    ];
    const levels = stockLevels.map((l) =>
      l.warehouseId === "warehouse-main" && l.variantId === "var-laptop-16-512" ? { ...l, reserved: 6 } : l,
    ); // Main fully reserved (4 by this order, 2 by others)
    const withoutCredit = validatePlan({
      order: orderBetaCompeting,
      allocations: [{ orderLineId: "ol-1002-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 4 }],
      backorders: [],
      stockLevels: levels,
      warehouses,
      ownReservations: [],
      remainingByLine: remaining,
    });
    expect(withoutCredit.some((e) => e.code === "INSUFFICIENT_STOCK")).toBe(true);
    const withCredit = validatePlan({
      order: orderBetaCompeting,
      allocations: [{ orderLineId: "ol-1002-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 4 }],
      backorders: [],
      stockLevels: levels,
      warehouses,
      ownReservations: own,
      remainingByLine: remaining,
    });
    expect(withCredit).toEqual([]);
  });

  it("rejects unknown lines, variant mismatch, inactive warehouses and bad quantities", () => {
    const errors = validatePlan({
      order: orderBetaCompeting,
      allocations: [
        { orderLineId: "nope", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 1 },
        { orderLineId: "ol-1002-1", variantId: "var-dock-std", warehouseId: "warehouse-main", quantity: 1 },
        { orderLineId: "ol-1002-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 0 },
        { orderLineId: "ol-1002-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-east", quantity: 4 },
      ],
      backorders: [],
      stockLevels,
      warehouses: warehouses.map((w) => (w.id === "warehouse-east" ? { ...w, active: false } : w)),
      ownReservations: [],
      remainingByLine: remaining,
    });
    const codes = errors.map((e) => e.code);
    expect(codes).toContain("UNKNOWN_LINE");
    expect(codes).toContain("VARIANT_MISMATCH");
    expect(codes).toContain("BAD_QUANTITY");
    expect(codes).toContain("WAREHOUSE_INACTIVE");
  });

  it("allowPartial (consolidate): planned may be below remaining but not above", () => {
    const base = {
      order: orderBetaCompeting,
      backorders: [],
      stockLevels,
      warehouses,
      ownReservations: [],
      remainingByLine: remaining,
      allowPartial: true,
    };
    expect(validatePlan({ ...base, allocations: [{ orderLineId: "ol-1002-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 2 }] })).toEqual([]);
    expect(
      validatePlan({ ...base, allocations: [{ orderLineId: "ol-1002-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 5 }] }).map((e) => e.code),
    ).toEqual(["LINE_QUANTITY_EXCEEDS_REMAINING"]);
  });
});
