/** Delete a price rule — DEV FIXTURE. Rules may be deleted; lists are archived instead. */
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { getCatalogService } from "@/server/catalog/live";

type Ctx = { params: Promise<{ id: string; ruleId: string }> };

export async function DELETE(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, ruleId } = await params;
    const actor = await getAuthorizedActor(request);
    return getCatalogService().deletePriceRule(actor, id, ruleId);
  });
}
