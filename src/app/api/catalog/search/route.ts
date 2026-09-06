/**
 * Catalog boundary (blueprint §7): GET ?customerId=&q=&category=&includeInactive=1
 * → CatalogSearchItem[] priced for that customer. DEV FIXTURE data.
 */
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { queryFlag } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/live";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const sp = new URL(request.url).searchParams;
    return getCatalogService().search(actor, {
      customerId: sp.get("customerId") || undefined,
      query: sp.get("q") ?? undefined,
      category: sp.get("category") ?? undefined,
      includeInactive: queryFlag(sp.get("includeInactive")),
    });
  });
}
