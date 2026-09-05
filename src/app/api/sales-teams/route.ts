/** Sales teams (report filters) — DEV FIXTURE. GET list. */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/lib/auth/dev-actor";
import { getCatalogService } from "@/features/catalog/service";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getCatalogService().listSalesTeams(actor);
  });
}
