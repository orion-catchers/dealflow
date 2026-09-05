import { handle } from "@/lib/api/respond";
import { getActor } from "@/lib/auth/dev-actor";
import { acceptBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/features/inventory/service";

/** POST /api/fulfillment/:orderId/accept — commit the split once under requestKey (FINANCE/ADMIN). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await params;
    const actor = await getActor(request);
    const body = acceptBodySchema.parse(await request.json());
    return getFulfillmentService().accept({ orderId, actor, ...body });
  });
}
