import { handle } from "@/lib/api/respond";
import { getActor } from "@/lib/auth/dev-actor";
import { stockLevelPatchSchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/features/inventory/service";

/** PATCH /api/stock/levels — admin edit of onHand / reorderThreshold (ADMIN). */
export async function PATCH(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    const body = stockLevelPatchSchema.parse(await request.json());
    return getFulfillmentService().upsertStockLevel({ ...body, actor });
  });
}
