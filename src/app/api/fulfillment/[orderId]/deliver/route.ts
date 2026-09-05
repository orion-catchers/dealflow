import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { deliverBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/service";

/** POST /api/fulfillment/:orderId/deliver — SHIPPED shipment → DELIVERED (FINANCE/ADMIN). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await params;
    const actor = await getActor(request);
    const body = deliverBodySchema.parse(await request.json());
    return getFulfillmentService().deliver({ orderId, actor, ...body });
  });
}
