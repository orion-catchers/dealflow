import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { shipBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/live";

/** POST /api/fulfillment/:orderId/ship — PLANNED shipment → SHIPPED; consumes onHand + reserved once (FINANCE/ADMIN). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await params;
    const actor = await getActor(request);
    const body = shipBodySchema.parse(await request.json());
    return getFulfillmentService().ship({ orderId, actor, ...body });
  });
}
