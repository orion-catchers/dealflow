import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { getFulfillmentService } from "@/server/inventory/live";

/** GET /api/fulfillment — FulfillmentListItem[] for Screen 07 (internal roles). */
export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return getFulfillmentService().listFulfillment(actor);
  });
}
