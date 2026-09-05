import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { stockLevelPatchSchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/live";

/** PATCH /api/stock/levels — admin edit of onHand / reorderThreshold (ADMIN). */
export async function PATCH(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const body = stockLevelPatchSchema.parse(await request.json());
    return getFulfillmentService().upsertStockLevel({ ...body, actor });
  });
}
