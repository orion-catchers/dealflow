/** Product Dashboard counts (Screen 16) — DEV FIXTURE. GET. */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/lib/auth/dev-actor";
import { getCatalogService } from "@/features/catalog/service";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getCatalogService().dashboardSummary(actor);
  });
}
