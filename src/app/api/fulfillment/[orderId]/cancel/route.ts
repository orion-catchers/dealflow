import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { cancelBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/live";

/** POST /api/fulfillment/:orderId/cancel — release unshipped allocation; SHIPPED untouched (FINANCE/ADMIN). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await params;
    const actor = await getAuthorizedActor(request);
    const body = cancelBodySchema.parse(await request.json());
    return getFulfillmentService().cancel({ orderId, actor, ...body });
  });
}
