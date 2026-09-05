import type { NextRequest } from "next/server";
import { ApiFailure, handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { getBillingService } from "@/server/billing/live";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const { id } = await context.params;
    const plans = await getBillingService().listPlans(actor);
    const plan = plans.find((p) => p.id === id);
    if (!plan) throw new ApiFailure("NOT_FOUND", "Plan not found");
    return plan;
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const { id } = await context.params;
    return getBillingService().patchPlan(actor, id, await request.json());
  });
}
