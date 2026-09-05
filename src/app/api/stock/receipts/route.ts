import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { receiptBodySchema } from "@/features/inventory/api";
import { getFulfillmentService } from "@/server/inventory/live";

/** POST /api/stock/receipts — ReceiptInput → ReceiptResult (FINANCE/ADMIN). Idempotent by requestKey. */
export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    const body = receiptBodySchema.parse(await request.json());
    return getFulfillmentService().receipt({ ...body, actor });
  });
}
