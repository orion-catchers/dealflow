import type { Warehouse } from "@/contracts/harsh";

/** Published per-kg add-on when the warehouse row has no shippingCostPerKg (Prisma stores a flat shipment cost). */
export const COURIER_RATE_CARD: Record<string, { perKg: string }> = {
  MAIN: { perKg: "12.00" },
  EAST: { perKg: "18.00" },
  "warehouse-main": { perKg: "12.00" },
  "warehouse-east": { perKg: "18.00" },
};

export function applyCourierRateCard(warehouse: Warehouse): Warehouse {
  if (warehouse.shippingCostPerKg) return warehouse;
  const extra = COURIER_RATE_CARD[warehouse.code] ?? COURIER_RATE_CARD[warehouse.id];
  if (!extra) return warehouse;
  return { ...warehouse, shippingCostPerKg: extra.perKg };
}
