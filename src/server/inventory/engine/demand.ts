/**
 * Engine 2 — demand aggregation (pure).
 *
 * Rule 1: process stock-tracked variants only; skip services/subscriptions and
 * zero quantities. Rule 2: aggregate demand across repeated variant lines while
 * retaining the per-line links needed for `AllocationPlanEntry.orderLineId`.
 */
import type { OrderForFulfillment, OrderLineForFulfillment } from "@/contracts/harsh";

export interface DemandLine {
  orderLineId: string;
  quantity: number;
}

export interface VariantDemand {
  variantId: string;
  /** Total units demanded across all lines of this variant. */
  total: number;
  /** Per-line demand, in order-line order. */
  lines: DemandLine[];
  productName: string;
  variantLabel?: string;
  /** Kg per unit (0 when unknown). */
  shippingWeightKg: number;
}

export interface DemandResult {
  /** variantId → aggregated demand. Insertion order follows first appearance in the order. */
  demand: Map<string, VariantDemand>;
  /** Lines skipped because they are not stock-tracked, are zero-quantity, or lack a variant. */
  skippedLineIds: string[];
  /** Total stock-tracked units on the order (ignores `remainingByLine`). */
  stockTrackedUnits: number;
  notes: string[];
}

/** True when Engine 2 must plan stock for this line. */
export function isStockTrackedLine(line: OrderLineForFulfillment): boolean {
  return line.stockTracked && !line.isSubscription && line.quantity > 0 && typeof line.variantId === "string" && line.variantId.length > 0;
}

/**
 * Aggregate demand for an order. When `remainingByLine` is supplied, each line's
 * demand is the remaining quantity for that line (used for consolidation prompts);
 * lines with zero remaining are simply omitted from the demand map (not "skipped").
 */
export function aggregateDemand(order: OrderForFulfillment, remainingByLine?: ReadonlyMap<string, number>): DemandResult {
  const demand = new Map<string, VariantDemand>();
  const skippedLineIds: string[] = [];
  const notes: string[] = [];
  let stockTrackedUnits = 0;

  for (const line of order.lines) {
    if (!isStockTrackedLine(line)) {
      skippedLineIds.push(line.orderLineId);
      if (line.stockTracked && !line.isSubscription && line.quantity > 0 && !line.variantId) {
        notes.push(`Line ${line.orderLineId} is stock-tracked but has no variant; skipped`);
      }
      continue;
    }
    const variantId = line.variantId as string;
    stockTrackedUnits += line.quantity;

    const qty = remainingByLine ? (remainingByLine.get(line.orderLineId) ?? 0) : line.quantity;
    if (qty <= 0) continue;

    const entry = demand.get(variantId) ?? {
      variantId,
      total: 0,
      lines: [],
      productName: line.productName,
      variantLabel: line.variantLabel,
      shippingWeightKg: line.shippingWeightKg ?? 0,
    };
    entry.total += qty;
    entry.lines.push({ orderLineId: line.orderLineId, quantity: qty });
    demand.set(variantId, entry);
  }

  return { demand, skippedLineIds, stockTrackedUnits, notes };
}
