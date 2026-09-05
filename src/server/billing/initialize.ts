/**
 * Atharva's confirmOrder boundary. Runs on the caller's Prisma transaction.
 * Does not construct BillingService. Repeat requestKey replays the completed payload.
 */
import type { BillingInitResult, ConfirmedOrderForBilling } from "@/contracts/ruchir";
import type { Tx } from "@/server/lib/db";
import { executeInitialize } from "./repository";
import { PrismaBillingStore } from "./prisma-store";

export async function initializeBilling(
  tx: Tx,
  order: ConfirmedOrderForBilling,
  requestKey: string,
): Promise<BillingInitResult> {
  return executeInitialize(new PrismaBillingStore(tx), order, requestKey);
}
