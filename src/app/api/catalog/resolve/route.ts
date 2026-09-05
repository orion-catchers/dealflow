/**
 * Catalog boundary (blueprint §7): POST ResolvePriceInput → ResolvedPrice.
 * Consumed by Atharva's quote pricing and Krishna's builder. DEV FIXTURE data.
 */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/features/catalog/service";

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getCatalogService().resolve(actor, await readJson(request));
  });
}
