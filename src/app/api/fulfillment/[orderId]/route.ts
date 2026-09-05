import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { getFulfillmentService } from "@/server/inventory/live";

/** GET /api/fulfillment/:orderId — FulfillmentDetail for Screen 08. */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await params;
    const actor = await getAuthorizedActor(request);
    return getFulfillmentService().getDetail(actor, orderId);
  });
}
