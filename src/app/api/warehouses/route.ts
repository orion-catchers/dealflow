import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { warehouseCreateSchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/live";

/** GET /api/warehouses — list warehouses (internal roles). */
export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return getFulfillmentService().listWarehouses(actor);
  });
}

/** POST /api/warehouses — create a warehouse (ADMIN). */
export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const body = warehouseCreateSchema.parse(await request.json());
    return getFulfillmentService().createWarehouse(actor, body);
  });
}
