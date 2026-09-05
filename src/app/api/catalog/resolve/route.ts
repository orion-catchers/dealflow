/**
 * Catalog boundary (blueprint §7): POST ResolvePriceInput → ResolvedPrice.
 * Consumed by the quote builder (Acme 50,000 hint) and Atharva pricing.
 */
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/live";

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return getCatalogService().resolve(actor, await readJson(request));
  });
}
