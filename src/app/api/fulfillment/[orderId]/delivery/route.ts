import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { getFulfillmentService } from "@/server/inventory/service";

/** GET /api/fulfillment/:orderId/delivery — OrderDeliveryRead (Ruchir's invoice detail, Atharva's health). */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await params;
    const actor = await getActor(request);
    return getFulfillmentService().getDeliveryRead(actor, orderId);
  });
}
