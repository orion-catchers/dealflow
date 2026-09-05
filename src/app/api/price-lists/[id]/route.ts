/** One price list — DEV FIXTURE. GET (list + rules), PATCH update (archive via `active:false`). */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getActor(request);
    return getCatalogService().getPriceList(actor, id);
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getActor(request);
    return getCatalogService().updatePriceList(actor, id, await readJson(request));
  });
}
