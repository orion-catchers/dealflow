/**
 * Engine 2 — plan validation (pure). Shared by Accept, Override and Consolidate.
 *
 * Validates a plan against persisted stock plus this order's OWN unshipped
 * reservations (credited back so re-using the same warehouse in an Override does
 * not double-count), and checks that per-line quantities cover the remainder.
 */
import type {
  AllocationPlanEntry,
  BackorderPlanEntry,
  OrderForFulfillment,
  Reservation,
  StockLevel,
  Warehouse,
} from "@/contracts/harsh";
import { addToWorking, buildWorkingStock, stockKey, workingAvailable } from "./availability";
import { isStockTrackedLine } from "./demand";

export type PlanErrorKind = "INVALID" | "SHORTAGE";

export interface PlanValidationError {
  kind: PlanErrorKind;
  code:
    | "EMPTY_PLAN"
    | "BAD_QUANTITY"
    | "UNKNOWN_LINE"
    | "LINE_NOT_STOCK_TRACKED"
    | "VARIANT_MISMATCH"
    | "UNKNOWN_WAREHOUSE"
    | "WAREHOUSE_INACTIVE"
    | "LINE_QUANTITY_MISMATCH"
    | "LINE_QUANTITY_EXCEEDS_REMAINING"
    | "INSUFFICIENT_STOCK";
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidatePlanInput {
  order: OrderForFulfillment;
  allocations: AllocationPlanEntry[];
  backorders: BackorderPlanEntry[];
  stockLevels: StockLevel[];
  warehouses: Warehouse[];
  /** This order's RESERVED (unshipped) reservations; credited back as available. */
  ownReservations: Reservation[];
  /** Units per stock-tracked line that the plan must cover. */
  remainingByLine: ReadonlyMap<string, number>;
  /**
   * false (Accept/Override): allocations + backorders must equal remaining exactly.
   * true (Consolidate): allocations must not exceed remaining; backorders ignored.
   */
  allowPartial?: boolean;
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

export function validatePlan(input: ValidatePlanInput): PlanValidationError[] {
  const errors: PlanValidationError[] = [];
  const { order, allocations, backorders, warehouses, ownReservations, remainingByLine, allowPartial = false } = input;
  const lineById = new Map(order.lines.map((l) => [l.orderLineId, l]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  if (allocations.length === 0 && backorders.length === 0) {
    let anyRemaining = false;
    for (const q of remainingByLine.values()) if (q > 0) anyRemaining = true;
    if (anyRemaining || allowPartial) errors.push({ kind: "INVALID", code: "EMPTY_PLAN", message: "Plan has no allocations or backorders" });
  }

  const checkLine = (entry: { orderLineId: string; variantId: string; quantity: number }, where: string) => {
    if (!isPositiveInt(entry.quantity)) {
      errors.push({ kind: "INVALID", code: "BAD_QUANTITY", message: `${where}: quantity must be a positive integer`, details: { ...entry } });
      return null;
    }
    const line = lineById.get(entry.orderLineId);
    if (!line) {
      errors.push({ kind: "INVALID", code: "UNKNOWN_LINE", message: `${where}: unknown order line ${entry.orderLineId}`, details: { orderLineId: entry.orderLineId } });
      return null;
    }
    if (!isStockTrackedLine(line)) {
      errors.push({ kind: "INVALID", code: "LINE_NOT_STOCK_TRACKED", message: `${where}: line ${entry.orderLineId} is not stock-tracked`, details: { orderLineId: entry.orderLineId } });
      return null;
    }
    if (line.variantId !== entry.variantId) {
      errors.push({
        kind: "INVALID",
        code: "VARIANT_MISMATCH",
        message: `${where}: line ${entry.orderLineId} is variant ${line.variantId}, not ${entry.variantId}`,
        details: { orderLineId: entry.orderLineId, expected: line.variantId, got: entry.variantId },
      });
      return null;
    }
    return line;
  };

  // Per-line and per-cell aggregation.
  const plannedByLine = new Map<string, number>();
  const requestedByCell = new Map<string, { warehouseId: string; variantId: string; quantity: number }>();

  for (const a of allocations) {
    const line = checkLine(a, "allocation");
    if (!line) continue;
    const warehouse = warehouseById.get(a.warehouseId);
    if (!warehouse) {
      errors.push({ kind: "INVALID", code: "UNKNOWN_WAREHOUSE", message: `allocation: unknown warehouse ${a.warehouseId}`, details: { warehouseId: a.warehouseId } });
      continue;
    }
    if (!warehouse.active) {
      errors.push({ kind: "INVALID", code: "WAREHOUSE_INACTIVE", message: `allocation: warehouse ${a.warehouseId} is inactive`, details: { warehouseId: a.warehouseId } });
      continue;
    }
    plannedByLine.set(a.orderLineId, (plannedByLine.get(a.orderLineId) ?? 0) + a.quantity);
    const key = stockKey(a.warehouseId, a.variantId);
    const cell = requestedByCell.get(key) ?? { warehouseId: a.warehouseId, variantId: a.variantId, quantity: 0 };
    cell.quantity += a.quantity;
    requestedByCell.set(key, cell);
  }

  if (!allowPartial) {
    for (const b of backorders) {
      if (!checkLine(b, "backorder")) continue;
      plannedByLine.set(b.orderLineId, (plannedByLine.get(b.orderLineId) ?? 0) + b.quantity);
    }
  }

  // Per-line coverage.
  for (const [orderLineId, remaining] of remainingByLine) {
    const planned = plannedByLine.get(orderLineId) ?? 0;
    if (allowPartial) {
      if (planned > remaining) {
        errors.push({
          kind: "INVALID",
          code: "LINE_QUANTITY_EXCEEDS_REMAINING",
          message: `line ${orderLineId}: planned ${planned} exceeds remaining ${remaining}`,
          details: { orderLineId, planned, remaining },
        });
      }
    } else if (planned !== remaining) {
      errors.push({
        kind: "INVALID",
        code: "LINE_QUANTITY_MISMATCH",
        message: `line ${orderLineId}: allocations + backorders = ${planned}, expected ${remaining}`,
        details: { orderLineId, planned, remaining },
      });
    }
  }
  for (const orderLineId of plannedByLine.keys()) {
    if (!remainingByLine.has(orderLineId) && lineById.has(orderLineId)) {
      errors.push({
        kind: "INVALID",
        code: "LINE_QUANTITY_MISMATCH",
        message: `line ${orderLineId}: nothing remaining to plan`,
        details: { orderLineId, planned: plannedByLine.get(orderLineId), remaining: 0 },
      });
    }
  }

  // Stock sufficiency: available + own unshipped reservations at that cell.
  const ws = buildWorkingStock(input.stockLevels);
  for (const r of ownReservations) if (r.status === "RESERVED") addToWorking(ws, r.warehouseId, r.variantId, r.quantity);
  for (const cell of requestedByCell.values()) {
    const avail = workingAvailable(ws, cell.warehouseId, cell.variantId);
    if (cell.quantity > avail) {
      errors.push({
        kind: "SHORTAGE",
        code: "INSUFFICIENT_STOCK",
        message: `warehouse ${cell.warehouseId} has ${avail} available of variant ${cell.variantId}; plan needs ${cell.quantity}`,
        details: { warehouseId: cell.warehouseId, variantId: cell.variantId, requested: cell.quantity, available: avail },
      });
    }
  }

  return errors;
}
