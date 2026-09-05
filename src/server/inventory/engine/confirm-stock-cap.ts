export type ConfirmLineDemand = {
  variantId?: string | null;
  quantity: number;
  stockTracked: boolean;
};

export type StockCapShortage = {
  variantId: string;
  requested: number;
  available: number;
};

/** Confirm may not exceed on-hand minus reserved. Does not reserve. */
export function confirmStockShortages(
  lines: ConfirmLineDemand[],
  availableByVariant: Map<string, number>,
): StockCapShortage[] {
  const requested = new Map<string, number>();
  for (const line of lines) {
    if (!line.stockTracked || !line.variantId) continue;
    requested.set(line.variantId, (requested.get(line.variantId) ?? 0) + line.quantity);
  }
  const shortages: StockCapShortage[] = [];
  for (const [variantId, qty] of requested) {
    const available = Math.max(0, availableByVariant.get(variantId) ?? 0);
    if (qty > available) shortages.push({ variantId, requested: qty, available });
  }
  return shortages;
}
