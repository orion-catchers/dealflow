/** Sales teams (report filters) — DEV FIXTURE. GET list. */
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { getCatalogService } from "@/server/catalog/live";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return getCatalogService().listSalesTeams(actor);
  });
}
