import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { initializeBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/live";

/**
 * POST /api/fulfillment/initialize — records an existing Prisma order as PENDING
 * fulfillment (no reservations). Prefer `initializeFulfillment(tx, order)` inside
 * Atharva's confirmOrder transaction.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await getAuthorizedActor(request);
    const body = initializeBodySchema.parse(await request.json());
    return getFulfillmentService().initializeFulfillment(body);
  });
}
