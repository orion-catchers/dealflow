/** Product Dashboard counts (Screen 16) — DEV FIXTURE. GET. */
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { getCatalogService } from "@/server/catalog/live";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return getCatalogService().dashboardSummary(actor);
  });
}
