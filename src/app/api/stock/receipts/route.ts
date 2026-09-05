import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { receiptBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/live";
import { prismaVariantId, prismaWarehouseId } from "@/server/live/ids";

/** POST /api/stock/receipts — ReceiptInput → ReceiptResult (FINANCE/ADMIN). Idempotent by requestKey. */
export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const body = receiptBodySchema.parse(await request.json());
    return getFulfillmentService().receipt({
      ...body,
      warehouseId: await prismaWarehouseId(body.warehouseId),
      variantId: await prismaVariantId(body.variantId),
      actor,
    });
  });
}
