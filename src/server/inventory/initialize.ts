/**
 * Atharva's confirmOrder boundary. Runs on the caller's Prisma client/transaction.
 * Does not invent Order rows. If the order exists, fulfillment is CONNECTED (PENDING status
 * is already the Order default). Repeat calls are a no-op.
 */
import type { OrderReady } from "@/contracts/atharva";
import type { Db, Tx } from "@/server/lib/db";
import { PrismaInventoryStore } from "./prisma-inventory";

type Client = Db | Tx;

export async function initializeFulfillment(db: Client, order: OrderReady): Promise<"PENDING" | "CONNECTED"> {
  if (!order?.orderId) return "PENDING";
  const rec = await new PrismaInventoryStore(db).getFulfillment(order.orderId);
  return rec ? "CONNECTED" : "PENDING";
}

/** Structural match for Atharva's `FulfillmentInitializer`. */
export class PrismaFulfillmentInitializer {
  constructor(private readonly db: Client) {}

  initialize(order: OrderReady): Promise<"PENDING" | "CONNECTED"> {
    return initializeFulfillment(this.db, order);
  }
}
