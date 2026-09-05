import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { requireRole } from "@/server/lib/auth/dev-actor";
import { initializeBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/live";

/**
 * POST /api/fulfillment/initialize — records an existing Prisma order as PENDING
 * fulfillment (no reservations). Prefer `initializeFulfillment(tx, order)` inside
 * Atharva's confirmOrder transaction.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    requireRole(actor, "ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE");
    const body = initializeBodySchema.parse(await request.json());
    return getFulfillmentService().initializeFulfillment(body);
  });
}
