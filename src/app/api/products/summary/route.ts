/** Product Dashboard counts (Screen 16) — DEV FIXTURE. GET. */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { getCatalogService } from "@/server/catalog/service";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getCatalogService().dashboardSummary(actor);
  });
}
