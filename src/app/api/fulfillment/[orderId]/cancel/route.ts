import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { cancelBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/service";

/** POST /api/fulfillment/:orderId/cancel — release unshipped allocation; SHIPPED untouched (FINANCE/ADMIN). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await params;
    const actor = await getActor(request);
    const body = cancelBodySchema.parse(await request.json());
    return getFulfillmentService().cancel({ orderId, actor, ...body });
  });
}
