/** Configured taxes — DEV FIXTURE. GET list, POST create (ADMIN). */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/service";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getCatalogService().listTaxRates(actor);
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getCatalogService().createTaxRate(actor, await readJson(request));
  });
}
