/**
 * Engine 2 — line summaries and fulfillment status derivation (pure).
 *
 * Unit buckets per line are disjoint:
 *   reserved   = RESERVED reservations (allocated, not yet shipped)
 *   shipped    = SHIPPED reservations whose shipment is SHIPPED (in transit)
 *   delivered  = SHIPPED reservations whose shipment is DELIVERED
 *   backordered= OPEN backorders
 *   unallocated= quantity - (reserved + shipped + delivered + backordered)
 * Invariant (rule 6): reserved + shipped + delivered + backordered + unallocated == quantity.
 */
import type {
  Backorder,
  FulfillmentDetail,
  FulfillmentStatus,
  OrderForFulfillment,
  Reservation,
  Shipment,
} from "@/contracts/harsh";
import { isStockTrackedLine } from "./demand";

export type LineSummary = FulfillmentDetail["lines"][number];

export interface UnitTotals {
  stockTrackedUnits: number;
  /** Reserved, not yet shipped. */
  allocatedUnits: number;
  shippedUnits: number;
  deliveredUnits: number;
  backorderedUnits: number;
  unallocatedUnits: number;
}

export function summarizeLines(
  order: OrderForFulfillment,
  reservations: Reservation[],
  backorders: Backorder[],
  shipments: Shipment[],
): LineSummary[] {
  const shipmentById = new Map(shipments.map((s) => [s.id, s]));

  return order.lines.map((line) => {
    const tracked = isStockTrackedLine(line);
    let reserved = 0;
    let shipped = 0;
    let delivered = 0;
    let backordered = 0;

    if (tracked) {
      for (const r of reservations) {
        if (r.orderLineId !== line.orderLineId) continue;
        if (r.status === "RESERVED") reserved += r.quantity;
        else if (r.status === "SHIPPED") {
          const shipment = r.shipmentId ? shipmentById.get(r.shipmentId) : undefined;
          if (shipment?.status === "DELIVERED") delivered += r.quantity;
          else shipped += r.quantity;
        }
      }
      for (const b of backorders) {
        if (b.orderLineId === line.orderLineId && b.status === "OPEN") backordered += b.remainingQuantity;
      }
    }

    const unallocated = tracked ? Math.max(0, line.quantity - reserved - shipped - delivered - backordered) : 0;

    return {
      orderLineId: line.orderLineId,
      productName: line.productName,
      variantLabel: line.variantLabel,
      stockTracked: tracked,
      quantity: line.quantity,
      reserved,
      shipped,
      delivered,
      backordered,
      unallocated,
    };
  });
}

export function totalUnits(lines: LineSummary[]): UnitTotals {
  const t: UnitTotals = {
    stockTrackedUnits: 0,
    allocatedUnits: 0,
    shippedUnits: 0,
    deliveredUnits: 0,
    backorderedUnits: 0,
    unallocatedUnits: 0,
  };
  for (const l of lines) {
    if (!l.stockTracked) continue;
    t.stockTrackedUnits += l.quantity;
    t.allocatedUnits += l.reserved;
    t.shippedUnits += l.shipped;
    t.deliveredUnits += l.delivered;
    t.backorderedUnits += l.backordered;
    t.unallocatedUnits += l.unallocated;
  }
  return t;
}

/**
 * Derive the fulfillment status from line summaries.
 *  - cancelled → CANCELLED
 *  - no stock-tracked units (service-only) → DELIVERED (nothing to ship)
 *  - all units delivered → DELIVERED
 *  - any shipped/delivered → SHIPPED
 *  - all units reserved → ALLOCATED
 *  - some reserved or backordered → PARTIAL
 *  - else PENDING
 */
export function deriveStatus(lines: LineSummary[], opts: { cancelled: boolean }): FulfillmentStatus {
  if (opts.cancelled) return "CANCELLED";
  const t = totalUnits(lines);
  if (t.stockTrackedUnits === 0) return "DELIVERED";
  if (t.deliveredUnits >= t.stockTrackedUnits) return "DELIVERED";
  if (t.shippedUnits + t.deliveredUnits > 0) return "SHIPPED";
  if (t.allocatedUnits >= t.stockTrackedUnits) return "ALLOCATED";
  if (t.allocatedUnits > 0 || t.backorderedUnits > 0) return "PARTIAL";
  return "PENDING";
}

/**
 * Remaining units per stock-tracked line.
 *  - "UNALLOCATED": quantity not reserved/shipped/delivered (backordered units count as
 *    remaining — this is what preview re-plans and consolidation can cover).
 *  - "UNSHIPPED": quantity not shipped/delivered (what an Override must cover exactly).
 */
export function remainingByLine(lines: LineSummary[], mode: "UNALLOCATED" | "UNSHIPPED"): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    if (!l.stockTracked) continue;
    const shippedOrDelivered = l.shipped + l.delivered;
    const remaining =
      mode === "UNSHIPPED" ? l.quantity - shippedOrDelivered : l.quantity - shippedOrDelivered - l.reserved;
    out.set(l.orderLineId, Math.max(0, remaining));
  }
  return out;
}
