import { handle } from "@/lib/api/respond";
import { getBillingService } from "@/server/billing/live";
import { getActor } from "@/server/lib/auth/dev-actor";

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getBillingService().runDueBilling(actor, await request.json());
  });
}
