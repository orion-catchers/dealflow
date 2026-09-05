import type { NextRequest } from "next/server";
import { handle } from "@/lib/api/respond";
import { getBillingService } from "@/server/billing/live";
import { getActor } from "@/server/lib/auth/dev-actor";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(async () => {
    const actor = await getActor(request);
    const { id } = await context.params;
    return getBillingService().getSubscription(actor, id);
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handle(async () => {
    const actor = await getActor(request);
    const { id } = await context.params;
    return getBillingService().patchSubscription(actor, id, await request.json());
  });
}
