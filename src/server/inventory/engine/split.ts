/**
 * Engine 2 — split preview (pure; writes NOTHING).
 *
 * Rule 3: try a single active warehouse covering ALL demand (several → lowest
 * estimated cost, then warehouse id). Otherwise a deterministic greedy heuristic:
 * pick the warehouse covering the most remaining units (tie → lower
 * shippingCostPerShipment → id), repeat until demand is met or no stock remains.
 * Rule 4: only the local working stock map is decremented.
 *
 * Costs are ESTIMATES from configured warehouse costs; the heuristic does not claim
 * global optimization.
 */
import type {
  AllocationPlanEntry,
  Backorder,
  BackorderPlanEntry,
  Money,
  OrderForFulfillment,
  Reservation,
  Shipment,
  SplitPreview,
  StockLevel,
  Warehouse,
  WarehouseSplitSummary,
} from "@/contracts/harsh";
import { buildWorkingStock, takeFromWorking, workingAvailable, type WorkingStock } from "./availability";
import { aggregateDemand, type VariantDemand } from "./demand";
import { remainingByLine, summarizeLines } from "./status";

export const ESTIMATE_NOTE = "Estimated from configured warehouse costs; heuristic, not globally optimal";

export interface ExistingFulfillmentState {
  reservations: Reservation[];
  backorders: Backorder[];
  shipments: Shipment[];
}

/** Estimated cost of one shipment from a warehouse carrying `totalKg`. Decimal string. */
export function estimateShipmentCost(warehouse: Warehouse, totalKg: number): Money {
  const perShipment = Number(warehouse.shippingCostPerShipment) || 0;
  const perKg = Number(warehouse.shippingCostPerKg ?? "0") || 0;
  return (perShipment + perKg * Math.max(0, totalKg)).toFixed(2);
}

/** Sum of decimal strings, formatted to 2 dp. */
export function sumMoney(values: Money[]): Money {
  return values.reduce((acc, v) => acc + (Number(v) || 0), 0).toFixed(2);
}

function sortWarehouses(warehouses: Warehouse[]): Warehouse[] {
  return [...warehouses].filter((w) => w.active).sort((a, b) => a.id.localeCompare(b.id));
}

/** Per-warehouse, per-variant units chosen by the heuristic (before line distribution). */
type WarehouseTake = { warehouse: Warehouse; byVariant: Map<string, number> };

function totalKg(take: WarehouseTake, demand: Map<string, VariantDemand>): number {
  let kg = 0;
  for (const [variantId, qty] of take.byVariant) kg += qty * (demand.get(variantId)?.shippingWeightKg ?? 0);
  return kg;
}

/** Rule 3a: a single warehouse whose available stock covers every variant's total demand. */
function pickSingleWarehouse(ws: WorkingStock, warehouses: Warehouse[], demand: Map<string, VariantDemand>): WarehouseTake | null {
  const candidates: { take: WarehouseTake; cost: number }[] = [];
  for (const warehouse of warehouses) {
    let covers = true;
    const byVariant = new Map<string, number>();
    for (const d of demand.values()) {
      if (workingAvailable(ws, warehouse.id, d.variantId) < d.total) {
        covers = false;
        break;
      }
      byVariant.set(d.variantId, d.total);
    }
    if (!covers) continue;
    const take = { warehouse, byVariant };
    candidates.push({ take, cost: Number(estimateShipmentCost(warehouse, totalKg(take, demand))) });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.cost - b.cost || a.take.warehouse.id.localeCompare(b.take.warehouse.id));
  const chosen = candidates[0].take;
  for (const [variantId, qty] of chosen.byVariant) takeFromWorking(ws, chosen.warehouse.id, variantId, qty);
  return chosen;
}

/** Rule 3b: greedy coverage heuristic. Mutates `ws` and `remaining`. */
function greedySplit(ws: WorkingStock, warehouses: Warehouse[], remaining: Map<string, number>): WarehouseTake[] {
  const takes: WarehouseTake[] = [];
  const used = new Set<string>();

  for (;;) {
    let outstanding = 0;
    for (const q of remaining.values()) outstanding += q;
    if (outstanding <= 0) break;

    let best: { warehouse: Warehouse; units: number } | null = null;
    for (const warehouse of warehouses) {
      if (used.has(warehouse.id)) continue;
      let units = 0;
      for (const [variantId, need] of remaining) units += Math.min(need, workingAvailable(ws, warehouse.id, variantId));
      if (units <= 0) continue;
      if (
        !best ||
        units > best.units ||
        (units === best.units &&
          (Number(warehouse.shippingCostPerShipment) < Number(best.warehouse.shippingCostPerShipment) ||
            (Number(warehouse.shippingCostPerShipment) === Number(best.warehouse.shippingCostPerShipment) &&
              warehouse.id.localeCompare(best.warehouse.id) < 0)))
      ) {
        best = { warehouse, units };
      }
    }
    if (!best) break;

    const byVariant = new Map<string, number>();
    for (const [variantId, need] of remaining) {
      if (need <= 0) continue;
      const taken = takeFromWorking(ws, best.warehouse.id, variantId, need);
      if (taken > 0) {
        byVariant.set(variantId, taken);
        remaining.set(variantId, need - taken);
      }
    }
    used.add(best.warehouse.id);
    takes.push({ warehouse: best.warehouse, byVariant });
  }
  return takes;
}

/**
 * Preview the split for an order's UNALLOCATED remainder. When `existing` is given,
 * remaining per line = quantity − reserved − shipped − delivered (open backorders are
 * re-planned, which is what a consolidation prompt needs). Never writes.
 */
export function previewSplit(
  order: OrderForFulfillment,
  stockLevels: StockLevel[],
  warehouses: Warehouse[],
  existing?: ExistingFulfillmentState,
): SplitPreview {
  const remainingLines = existing
    ? remainingByLine(summarizeLines(order, existing.reservations, existing.backorders, existing.shipments), "UNALLOCATED")
    : undefined;
  const { demand, skippedLineIds, stockTrackedUnits, notes: demandNotes } = aggregateDemand(order, remainingLines);

  const notes: string[] = [ESTIMATE_NOTE, ...demandNotes];
  if (skippedLineIds.length > 0) notes.push(`Skipped ${skippedLineIds.length} non-stock-tracked line(s)`);

  const base: SplitPreview = {
    orderId: order.orderId,
    strategy: "MULTI_WAREHOUSE",
    allocations: [],
    backorders: [],
    warehouses: [],
    shipmentCount: 0,
    estimatedTotalCost: "0.00",
    skippedLineIds,
    notes,
  };

  if (stockTrackedUnits === 0) {
    return { ...base, strategy: "NO_STOCK_TRACKED_LINES", notes: [...notes, "No stock-tracked lines; nothing to ship"] };
  }
  if (demand.size === 0) {
    return { ...base, notes: [...notes, "Nothing remaining to allocate"] };
  }

  const active = sortWarehouses(warehouses);
  const ws = buildWorkingStock(stockLevels, new Set(active.map((w) => w.id)));

  let takes: WarehouseTake[];
  let strategy: SplitPreview["strategy"];
  const single = pickSingleWarehouse(ws, active, demand);
  if (single) {
    takes = [single];
    strategy = "SINGLE_WAREHOUSE";
  } else {
    const remaining = new Map<string, number>();
    for (const d of demand.values()) remaining.set(d.variantId, d.total);
    takes = greedySplit(ws, active, remaining);
    strategy = "MULTI_WAREHOUSE";
  }

  // Distribute per-warehouse, per-variant units across lines deterministically (line order).
  const lineCursor = new Map<string, number>(); // orderLineId → still to place
  for (const d of demand.values()) for (const l of d.lines) lineCursor.set(l.orderLineId, l.quantity);

  const allocations: AllocationPlanEntry[] = [];
  const summaries: WarehouseSplitSummary[] = [];
  for (const take of takes) {
    const summary: WarehouseSplitSummary = {
      warehouseId: take.warehouse.id,
      warehouseName: take.warehouse.name,
      totalUnits: 0,
      lines: [],
      estimatedCost: estimateShipmentCost(take.warehouse, totalKg(take, demand)),
    };
    for (const d of demand.values()) {
      let toPlace = take.byVariant.get(d.variantId) ?? 0;
      for (const line of d.lines) {
        if (toPlace <= 0) break;
        const left = lineCursor.get(line.orderLineId) ?? 0;
        const qty = Math.min(left, toPlace);
        if (qty <= 0) continue;
        lineCursor.set(line.orderLineId, left - qty);
        toPlace -= qty;
        allocations.push({ orderLineId: line.orderLineId, variantId: d.variantId, warehouseId: take.warehouse.id, quantity: qty });
        summary.lines.push({ orderLineId: line.orderLineId, productName: d.productName, variantLabel: d.variantLabel, quantity: qty });
        summary.totalUnits += qty;
      }
    }
    if (summary.totalUnits > 0) summaries.push(summary);
  }

  const backorders: BackorderPlanEntry[] = [];
  for (const d of demand.values()) {
    for (const line of d.lines) {
      const left = lineCursor.get(line.orderLineId) ?? 0;
      if (left > 0) backorders.push({ orderLineId: line.orderLineId, variantId: d.variantId, quantity: left });
    }
  }
  const backorderedUnits = backorders.reduce((a, b) => a + b.quantity, 0);
  if (backorderedUnits > 0) notes.push(`${backorderedUnits} unit(s) backordered: insufficient available stock`);
  if (strategy === "MULTI_WAREHOUSE" && summaries.length > 1) notes.push(`Split across ${summaries.length} warehouses`);

  return {
    ...base,
    strategy,
    allocations,
    backorders,
    warehouses: summaries,
    shipmentCount: summaries.length,
    estimatedTotalCost: sumMoney(summaries.map((s) => s.estimatedCost)),
    notes,
  };
}
