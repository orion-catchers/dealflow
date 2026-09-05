import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { overrideBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/live";

/** POST /api/fulfillment/:orderId/override — replace the unshipped plan (FINANCE/ADMIN). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await params;
    const actor = await getAuthorizedActor(request);
    const body = overrideBodySchema.parse(await request.json());
    return getFulfillmentService().override({ orderId, actor, ...body });
  });
}
