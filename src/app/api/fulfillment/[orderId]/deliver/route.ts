import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { deliverBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/live";

/** POST /api/fulfillment/:orderId/deliver — SHIPPED shipment → DELIVERED (FINANCE/ADMIN). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await params;
    const actor = await getAuthorizedActor(request);
    const body = deliverBodySchema.parse(await request.json());
    return getFulfillmentService().deliver({ orderId, actor, ...body });
  });
}
