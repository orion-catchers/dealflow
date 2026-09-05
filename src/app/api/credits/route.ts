import { handle } from "@/lib/api/respond";
import { getBillingService } from "@/server/billing/live";
import { getActor } from "@/server/lib/auth/dev-actor";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getBillingService().listCreditNotes(actor);
  });
}
