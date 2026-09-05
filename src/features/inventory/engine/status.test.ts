import { describe, expect, it } from "vitest";
import type { Backorder, Reservation, Shipment } from "@/contracts/harsh";
import { orderAcmeFlowA, orderServiceOnly } from "@/fixtures/harsh";
import { deriveStatus, remainingByLine, summarizeLines, totalUnits } from "./status";

const rsv = (id: string, orderLineId: string, variantId: string, quantity: number, status: Reservation["status"], shipmentId?: string): Reservation => ({
  id,
  orderId: orderAcmeFlowA.orderId,
  orderLineId,
  variantId,
  warehouseId: "warehouse-main",
  quantity,
  status,
  shipmentId,
  createdAt: "2026-09-05T00:00:00.000Z",
});
const bo = (id: string, orderLineId: string, remainingQuantity: number, status: Backorder["status"]): Backorder => ({
  id,
  orderId: orderAcmeFlowA.orderId,
  orderLineId,
  variantId: "var-laptop-16-512",
  remainingQuantity,
  status,
  createdAt: "x",
  updatedAt: "x",
});
const shp = (id: string, status: Shipment["status"]): Shipment => ({
  id,
  orderId: orderAcmeFlowA.orderId,
  warehouseId: "warehouse-main",
  status,
  lines: [],
  estimatedCost: "0.00",
  createdAt: "x",
});

describe("deriveStatus / summarizeLines", () => {
  it("PENDING with nothing allocated", () => {
    const lines = summarizeLines(orderAcmeFlowA, [], [], []);
    expect(deriveStatus(lines, { cancelled: false })).toBe("PENDING");
    expect(totalUnits(lines).stockTrackedUnits).toBe(20);
    expect(lines.find((l) => l.orderLineId === "ol-1001-3")?.stockTracked).toBe(false);
  });

  it("PARTIAL when some reserved + backordered; invariant holds per line", () => {
    const lines = summarizeLines(
      orderAcmeFlowA,
      [rsv("r1", "ol-1001-1", "var-laptop-16-512", 9, "RESERVED"), rsv("r2", "ol-1001-2", "var-dock-std", 10, "RESERVED")],
      [bo("b1", "ol-1001-1", 1, "OPEN")],
      [],
    );
    expect(deriveStatus(lines, { cancelled: false })).toBe("PARTIAL");
    for (const l of lines.filter((x) => x.stockTracked)) {
      expect(l.reserved + l.shipped + l.delivered + l.backordered + l.unallocated).toBe(l.quantity);
    }
  });

  it("ALLOCATED when every unit is reserved", () => {
    const lines = summarizeLines(
      orderAcmeFlowA,
      [rsv("r1", "ol-1001-1", "var-laptop-16-512", 10, "RESERVED"), rsv("r2", "ol-1001-2", "var-dock-std", 10, "RESERVED")],
      [],
      [],
    );
    expect(deriveStatus(lines, { cancelled: false })).toBe("ALLOCATED");
  });

  it("SHIPPED when any unit shipped; DELIVERED only when all delivered", () => {
    const shipped = summarizeLines(
      orderAcmeFlowA,
      [rsv("r1", "ol-1001-1", "var-laptop-16-512", 10, "SHIPPED", "s1"), rsv("r2", "ol-1001-2", "var-dock-std", 10, "RESERVED", "s2")],
      [],
      [shp("s1", "SHIPPED"), shp("s2", "PLANNED")],
    );
    expect(deriveStatus(shipped, { cancelled: false })).toBe("SHIPPED");
    expect(shipped[0].shipped).toBe(10);

    const delivered = summarizeLines(
      orderAcmeFlowA,
      [rsv("r1", "ol-1001-1", "var-laptop-16-512", 10, "SHIPPED", "s1"), rsv("r2", "ol-1001-2", "var-dock-std", 10, "SHIPPED", "s1")],
      [],
      [shp("s1", "DELIVERED")],
    );
    expect(deriveStatus(delivered, { cancelled: false })).toBe("DELIVERED");
    expect(totalUnits(delivered).deliveredUnits).toBe(20);
  });

  it("CANCELLED wins; service-only orders derive DELIVERED with zero stock-tracked units", () => {
    const lines = summarizeLines(orderServiceOnly, [], [], []);
    expect(deriveStatus(lines, { cancelled: true })).toBe("CANCELLED");
    expect(deriveStatus(lines, { cancelled: false })).toBe("DELIVERED");
    expect(totalUnits(lines).stockTrackedUnits).toBe(0);
  });

  it("remainingByLine distinguishes UNALLOCATED and UNSHIPPED", () => {
    const lines = summarizeLines(
      orderAcmeFlowA,
      [rsv("r1", "ol-1001-1", "var-laptop-16-512", 6, "SHIPPED", "s1"), rsv("r2", "ol-1001-1", "var-laptop-16-512", 3, "RESERVED", "s2")],
      [bo("b1", "ol-1001-1", 1, "OPEN")],
      [shp("s1", "SHIPPED"), shp("s2", "PLANNED")],
    );
    expect(remainingByLine(lines, "UNALLOCATED").get("ol-1001-1")).toBe(1);
    expect(remainingByLine(lines, "UNSHIPPED").get("ol-1001-1")).toBe(4);
    expect(remainingByLine(lines, "UNSHIPPED").has("ol-1001-3")).toBe(false);
  });
});
