/** Price lists — DEV FIXTURE. GET list, POST create (ADMIN). */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/live";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getCatalogService().listPriceLists(actor);
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getCatalogService().createPriceList(actor, await readJson(request));
  });
}
