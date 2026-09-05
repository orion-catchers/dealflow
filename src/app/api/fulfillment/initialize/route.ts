import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { requireRole } from "@/server/lib/auth/dev-actor";
import { initializeBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/service";

/**
 * POST /api/fulfillment/initialize — DEV hook for Atharva's confirmOrder until the
 * in-transaction initializer is wired. Records the order as PENDING; reserves nothing.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    requireRole(actor, "ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE");
    const body = initializeBodySchema.parse(await request.json());
    return getFulfillmentService().initializeFulfillment(body);
  });
}
