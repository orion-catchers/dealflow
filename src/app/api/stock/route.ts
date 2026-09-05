import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { stockQuerySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/live";

/** GET /api/stock?warehouseId=&variantId= — StockListItem[] (internal roles). */
export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const url = new URL(request.url);
    const query = stockQuerySchema.parse({
      warehouseId: url.searchParams.get("warehouseId") ?? undefined,
      variantId: url.searchParams.get("variantId") ?? undefined,
    });
    return getFulfillmentService().listStock(actor, query);
  });
}
