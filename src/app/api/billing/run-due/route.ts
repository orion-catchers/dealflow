import { handle } from "@/lib/api/respond";
import { getBillingService } from "@/server/billing/live";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return getBillingService().runDueBilling(actor, await request.json());
  });
}
