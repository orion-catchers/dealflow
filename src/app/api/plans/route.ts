import type { NextRequest } from "next/server";
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { getBillingService } from "@/server/billing/live";

/** GET /api/plans — PlanRef[] for the product editor; `?full=1` returns SubscriptionPlanRecord[]. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const svc = getBillingService();
    if (request.nextUrl.searchParams.get("full") === "1") return svc.listPlans(actor);
    return svc.listPlanRefs(actor);
  });
}

/** POST /api/plans — ADMIN create. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return getBillingService().createPlan(actor, await request.json());
  });
}
