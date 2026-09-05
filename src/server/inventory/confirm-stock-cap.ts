import { ApiFailure } from "@/lib/api/respond";
import type { Tx } from "@/server/lib/db";
import { confirmStockShortages, type ConfirmLineDemand } from "./engine/confirm-stock-cap";

type Client = { stock: { findMany: (args: { where: { variantId: { in: string[] } } }) => Promise<{ variantId: string; onHand: number; reserved: number }[]> } };

/** Fail confirm when stock-tracked qty exceeds available. Does not increment reserved. */
export async function assertConfirmStockCap(db: Client | Tx, lines: ConfirmLineDemand[]): Promise<void> {
  const ids = [...new Set(lines.filter((l) => l.stockTracked && l.variantId).map((l) => l.variantId!))];
  if (ids.length === 0) return;
  const stocks = await db.stock.findMany({ where: { variantId: { in: ids } } });
  const available = new Map<string, number>();
  for (const id of ids) available.set(id, 0);
  for (const row of stocks) {
    available.set(row.variantId, (available.get(row.variantId) ?? 0) + Math.max(0, row.onHand - row.reserved));
  }
  const shortages = confirmStockShortages(lines, available);
  if (shortages.length === 0) return;
  throw new ApiFailure(
    "CONFLICT",
    "Confirm blocked: stock-tracked quantity exceeds available stock (on-hand minus reserved). Nothing is reserved until Allocate.",
    { shortages },
  );
}
