/**
 * Catalog boundary (blueprint §7): GET ?customerId=&q=&category=&includeInactive=1
 * → CatalogSearchItem[] priced for that customer. DEV FIXTURE data.
 */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { queryFlag } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/live";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    const sp = new URL(request.url).searchParams;
    return getCatalogService().search(actor, {
      customerId: sp.get("customerId") ?? "",
      query: sp.get("q") ?? undefined,
      category: sp.get("category") ?? undefined,
      includeInactive: queryFlag(sp.get("includeInactive")),
    });
  });
}
