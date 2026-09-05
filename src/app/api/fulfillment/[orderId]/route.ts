import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { getFulfillmentService } from "@/server/inventory/live";

/** GET /api/fulfillment/:orderId — FulfillmentDetail for Screen 08. */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await params;
    const actor = await getActor(request);
    return getFulfillmentService().getDetail(actor, orderId);
  });
}
