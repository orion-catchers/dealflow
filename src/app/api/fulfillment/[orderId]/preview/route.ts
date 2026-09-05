import { handle } from "@/lib/api/respond";
import { getActor } from "@/lib/auth/dev-actor";
import { getFulfillmentService } from "@/features/inventory/service";

/** GET /api/fulfillment/:orderId/preview — SplitPreview for the unallocated remainder. Writes nothing. */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await params;
    const actor = await getActor(request);
    return getFulfillmentService().preview(actor, orderId);
  });
}
