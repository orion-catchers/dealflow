import type { NextRequest } from "next/server";
import { ApiFailure, handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { getBillingService } from "@/server/billing/live";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(async () => {
    const actor = await getActor(request);
    const { id } = await context.params;
    const plans = await getBillingService().listPlans(actor);
    const plan = plans.find((p) => p.id === id);
    if (!plan) throw new ApiFailure("NOT_FOUND", "Plan not found");
    return plan;
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handle(async () => {
    const actor = await getActor(request);
    const { id } = await context.params;
    return getBillingService().patchPlan(actor, id, await request.json());
  });
}
