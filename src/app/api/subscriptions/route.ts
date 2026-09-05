import type { NextRequest } from "next/server";
import { handle } from "@/lib/api/respond";
import { parseSubStatus } from "@/server/billing/api";
import { getBillingService } from "@/server/billing/live";
import { getActor } from "@/server/lib/auth/dev-actor";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const actor = await getActor(request);
    const status = parseSubStatus(request.nextUrl.searchParams.get("status"));
    return getBillingService().listSubscriptions(actor, { status });
  });
}
