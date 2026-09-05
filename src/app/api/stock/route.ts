import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { stockQuerySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/service";

/** GET /api/stock?warehouseId=&variantId= — StockListItem[] (internal roles). */
export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    const url = new URL(request.url);
    const query = stockQuerySchema.parse({
      warehouseId: url.searchParams.get("warehouseId") ?? undefined,
      variantId: url.searchParams.get("variantId") ?? undefined,
    });
    return getFulfillmentService().listStock(actor, query);
  });
}
