/**
 * Engine 2 — availability primitives (pure; no repository imports).
 *
 * `available = onHand - reserved`. The working stock map is the ONLY thing the
 * preview decrements; it never touches persisted stock levels.
 */
import type { StockLevel } from "@/contracts/harsh";

/** Available units on one stock level, floored at zero. */
export function available(stock: Pick<StockLevel, "onHand" | "reserved">): number {
  return Math.max(0, stock.onHand - stock.reserved);
}

/** Key for a (warehouseId, variantId) cell. */
export function stockKey(warehouseId: string, variantId: string): string {
  return `${warehouseId}::${variantId}`;
}

/** Local mutable copy of available stock: stockKey → available units. */
export type WorkingStock = Map<string, number>;

/**
 * Build a working stock map from persisted levels. Optionally restrict to a set of
 * warehouse ids (e.g. active warehouses only).
 */
export function buildWorkingStock(levels: StockLevel[], warehouseIds?: ReadonlySet<string>): WorkingStock {
  const ws: WorkingStock = new Map();
  for (const level of levels) {
    if (warehouseIds && !warehouseIds.has(level.warehouseId)) continue;
    const key = stockKey(level.warehouseId, level.variantId);
    ws.set(key, (ws.get(key) ?? 0) + available(level));
  }
  return ws;
}

export function workingAvailable(ws: WorkingStock, warehouseId: string, variantId: string): number {
  return ws.get(stockKey(warehouseId, variantId)) ?? 0;
}

/**
 * Take up to `quantity` units from the working map and return the amount actually taken.
 * Never lets a cell go negative.
 */
export function takeFromWorking(ws: WorkingStock, warehouseId: string, variantId: string, quantity: number): number {
  const key = stockKey(warehouseId, variantId);
  const avail = ws.get(key) ?? 0;
  const taken = Math.max(0, Math.min(avail, quantity));
  ws.set(key, avail - taken);
  return taken;
}

/** Add units back to the working map (used when crediting an order's own reservations). */
export function addToWorking(ws: WorkingStock, warehouseId: string, variantId: string, quantity: number): void {
  const key = stockKey(warehouseId, variantId);
  ws.set(key, (ws.get(key) ?? 0) + Math.max(0, quantity));
}
