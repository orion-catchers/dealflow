import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { warehouseUpdateSchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/service";

/** PATCH /api/warehouses/:id — update a warehouse (ADMIN). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getActor(request);
    const body = warehouseUpdateSchema.parse(await request.json());
    return getFulfillmentService().updateWarehouse(actor, id, body);
  });
}
