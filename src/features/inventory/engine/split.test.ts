import { describe, expect, it } from "vitest";
import type { OrderForFulfillment, StockLevel } from "@/contracts/harsh";
import { orderAcmeFlowA, orderBetaCompeting, orderServiceOnly, stockLevels, warehouses } from "@/fixtures/harsh-dev";
import { aggregateDemand } from "./demand";
import { ESTIMATE_NOTE, estimateShipmentCost, previewSplit } from "./split";
import { available, buildWorkingStock, takeFromWorking } from "./availability";

const clone = <T>(v: T): T => structuredClone(v);

describe("availability", () => {
  it("available = onHand - reserved, floored at 0", () => {
    expect(available({ onHand: 6, reserved: 2 })).toBe(4);
    expect(available({ onHand: 1, reserved: 3 })).toBe(0);
  });

  it("working stock never goes negative", () => {
    const ws = buildWorkingStock(stockLevels);
    expect(takeFromWorking(ws, "warehouse-main", "var-laptop-16-512", 10)).toBe(6);
    expect(takeFromWorking(ws, "warehouse-main", "var-laptop-16-512", 1)).toBe(0);
  });
});

describe("aggregateDemand", () => {
  it("skips services/subscriptions and aggregates repeated variant lines", () => {
    const order: OrderForFulfillment = {
      ...clone(orderAcmeFlowA),
      lines: [
        ...clone(orderAcmeFlowA.lines),
        { ...clone(orderAcmeFlowA.lines[0]), orderLineId: "ol-dup", quantity: 3 },
        { ...clone(orderAcmeFlowA.lines[1]), orderLineId: "ol-zero", quantity: 0 },
      ],
    };
    const r = aggregateDemand(order);
    expect(r.skippedLineIds).toEqual(["ol-1001-3", "ol-zero"]);
    expect(r.demand.get("var-laptop-16-512")?.total).toBe(13);
    expect(r.demand.get("var-laptop-16-512")?.lines).toEqual([
      { orderLineId: "ol-1001-1", quantity: 10 },
      { orderLineId: "ol-dup", quantity: 3 },
    ]);
    expect(r.stockTrackedUnits).toBe(23);
  });
});

describe("previewSplit", () => {
  it("one warehouse: Beta 4 laptops → Main only (single-warehouse strategy)", () => {
    const p = previewSplit(orderBetaCompeting, stockLevels, warehouses);
    expect(p.strategy).toBe("SINGLE_WAREHOUSE");
    expect(p.allocations).toEqual([{ orderLineId: "ol-1002-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 4 }]);
    expect(p.backorders).toEqual([]);
    expect(p.shipmentCount).toBe(1);
    // 800 + 20 × (4 × 2.2 kg)
    expect(p.estimatedTotalCost).toBe("976.00");
    expect(p.notes).toContain(ESTIMATE_NOTE);
  });

  it("two warehouses: Acme 10 laptops → Main 6 + East 3 + 1 backorder; docks all from Main; support skipped", () => {
    const p = previewSplit(orderAcmeFlowA, stockLevels, warehouses);
    expect(p.strategy).toBe("MULTI_WAREHOUSE");
    expect(p.skippedLineIds).toEqual(["ol-1001-3"]);
    expect(p.allocations).toEqual([
      { orderLineId: "ol-1001-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 6 },
      { orderLineId: "ol-1001-2", variantId: "var-dock-std", warehouseId: "warehouse-main", quantity: 10 },
      { orderLineId: "ol-1001-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-east", quantity: 3 },
    ]);
    expect(p.backorders).toEqual([{ orderLineId: "ol-1001-1", variantId: "var-laptop-16-512", quantity: 1 }]);
    expect(p.shipmentCount).toBe(2);
    expect(p.warehouses.map((w) => [w.warehouseId, w.totalUnits, w.estimatedCost])).toEqual([
      ["warehouse-main", 16, "1184.00"], // 800 + 20 × (6×2.2 + 10×0.6 = 19.2)
      ["warehouse-east", 3, "1365.00"], // 1200 + 25 × 6.6
    ]);
    expect(p.estimatedTotalCost).toBe("2549.00");
    expect(p.notes.some((n) => n.includes("1 unit(s) backordered"))).toBe(true);
  });

  it("short stock: everything beyond available becomes backorder", () => {
    const order = { ...clone(orderBetaCompeting), lines: [{ ...clone(orderBetaCompeting.lines[0]), quantity: 20 }] };
    const p = previewSplit(order, stockLevels, warehouses);
    const allocated = p.allocations.reduce((a, x) => a + x.quantity, 0);
    expect(allocated).toBe(9);
    expect(p.backorders).toEqual([{ orderLineId: "ol-1002-1", variantId: "var-laptop-16-512", quantity: 11 }]);
  });

  it("repeated product lines: aggregates before comparing but allocations retain both orderLineIds", () => {
    const order: OrderForFulfillment = {
      ...clone(orderBetaCompeting),
      lines: [
        { ...clone(orderBetaCompeting.lines[0]), orderLineId: "l-a", quantity: 4 },
        { ...clone(orderBetaCompeting.lines[0]), orderLineId: "l-b", quantity: 4 },
      ],
    };
    const p = previewSplit(order, stockLevels, warehouses);
    // Demand 8 > Main 6 → greedy: Main 6 (l-a 4, l-b 2), East 2 (l-b 2)
    expect(p.allocations).toEqual([
      { orderLineId: "l-a", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 4 },
      { orderLineId: "l-b", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 2 },
      { orderLineId: "l-b", variantId: "var-laptop-16-512", warehouseId: "warehouse-east", quantity: 2 },
    ]);
    expect(p.backorders).toEqual([]);
  });

  it("service-only order → NO_STOCK_TRACKED_LINES", () => {
    const p = previewSplit(orderServiceOnly, stockLevels, warehouses);
    expect(p.strategy).toBe("NO_STOCK_TRACKED_LINES");
    expect(p.allocations).toEqual([]);
    expect(p.skippedLineIds).toEqual(["ol-1003-1"]);
    expect(p.shipmentCount).toBe(0);
  });

  it("does not mutate the stock levels passed in (preview-without-write)", () => {
    const before = clone(stockLevels);
    previewSplit(orderAcmeFlowA, stockLevels, warehouses);
    expect(stockLevels).toEqual(before);
  });

  it("ignores inactive warehouses and picks the cheaper single warehouse on ties", () => {
    const whs = clone(warehouses);
    const levels: StockLevel[] = [
      { warehouseId: "warehouse-main", variantId: "var-laptop-16-512", onHand: 4, reserved: 0, reorderThreshold: 0 },
      { warehouseId: "warehouse-east", variantId: "var-laptop-16-512", onHand: 4, reserved: 0, reorderThreshold: 0 },
    ];
    const p1 = previewSplit(orderBetaCompeting, levels, whs);
    expect(p1.allocations[0].warehouseId).toBe("warehouse-main"); // 976 < 1420
    whs[0].active = false;
    const p2 = previewSplit(orderBetaCompeting, levels, whs);
    expect(p2.allocations[0].warehouseId).toBe("warehouse-east");
  });

  it("with existing state, plans only the unallocated remainder (consolidation prompt)", () => {
    const p = previewSplit(orderAcmeFlowA, stockLevels, warehouses, {
      reservations: [
        { id: "r1", orderId: orderAcmeFlowA.orderId, orderLineId: "ol-1001-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 6, status: "RESERVED", createdAt: "x" },
        { id: "r2", orderId: orderAcmeFlowA.orderId, orderLineId: "ol-1001-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-east", quantity: 3, status: "RESERVED", createdAt: "x" },
        { id: "r3", orderId: orderAcmeFlowA.orderId, orderLineId: "ol-1001-2", variantId: "var-dock-std", warehouseId: "warehouse-main", quantity: 10, status: "RESERVED", createdAt: "x" },
      ],
      backorders: [
        { id: "b1", orderId: orderAcmeFlowA.orderId, orderLineId: "ol-1001-1", variantId: "var-laptop-16-512", remainingQuantity: 1, status: "OPEN", createdAt: "x", updatedAt: "x" },
      ],
      shipments: [],
    });
    // Stock passed in still shows reserved 0, so 1 unit is plannable from Main.
    expect(p.allocations).toEqual([{ orderLineId: "ol-1001-1", variantId: "var-laptop-16-512", warehouseId: "warehouse-main", quantity: 1 }]);
    expect(p.backorders).toEqual([]);
  });
});

describe("estimateShipmentCost", () => {
  it("adds per-shipment and per-kg costs, 2 dp", () => {
    expect(estimateShipmentCost(warehouses[0], 19.2)).toBe("1184.00");
    expect(estimateShipmentCost({ ...warehouses[0], shippingCostPerKg: undefined }, 100)).toBe("800.00");
  });
});
