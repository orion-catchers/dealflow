import type { NextRequest } from "next/server";
import { handle } from "@/lib/api/respond";
import { getBillingService } from "@/server/billing/live";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const { id } = await context.params;
    return getBillingService().getInvoice(actor, id);
  });
}
