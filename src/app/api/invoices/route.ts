import type { NextRequest } from "next/server";
import { handle } from "@/lib/api/respond";
import { parseListStatus } from "@/server/billing/api";
import { getBillingService } from "@/server/billing/live";
import { getActor } from "@/server/lib/auth/dev-actor";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const actor = await getActor(request);
    const status = parseListStatus(request.nextUrl.searchParams.get("status"));
    const subscriptionId = request.nextUrl.searchParams.get("subscriptionId") ?? undefined;
    return getBillingService().listInvoices(actor, { status, subscriptionId });
  });
}
