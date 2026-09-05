import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { consolidateBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/service";

/** POST /api/fulfillment/:orderId/consolidate — allocate open backorders into a new PLANNED shipment (FINANCE/ADMIN). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await params;
    const actor = await getActor(request);
    const body = consolidateBodySchema.parse(await request.json());
    return getFulfillmentService().consolidate({ orderId, actor, ...body });
  });
}
