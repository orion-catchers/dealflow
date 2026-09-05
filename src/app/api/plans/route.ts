/**
 * DEV FIXTURE of Ruchir's /api/plans; Ruchir's implementation replaces this file.
 * Serves `planRefs` so the product editor can link subscription products to a plan.
 */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/lib/auth/dev-actor";
import { getCatalogService } from "@/features/catalog/service";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getCatalogService().listPlans(actor);
  });
}
