import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { warehouseCreateSchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/service";

/** GET /api/warehouses — list warehouses (internal roles). */
export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getFulfillmentService().listWarehouses(actor);
  });
}

/** POST /api/warehouses — create a warehouse (ADMIN). */
export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    const body = warehouseCreateSchema.parse(await request.json());
    return getFulfillmentService().createWarehouse(actor, body);
  });
}
