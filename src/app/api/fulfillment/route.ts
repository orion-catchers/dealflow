import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { getFulfillmentService } from "@/server/inventory/service";

/** GET /api/fulfillment — FulfillmentListItem[] for Screen 07 (internal roles). */
export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getFulfillmentService().listFulfillment(actor);
  });
}
