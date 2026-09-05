/** Price rules in a list — DEV FIXTURE. GET list, PUT upsert (body `id` → update, else create). */
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/live";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getAuthorizedActor(request);
    return getCatalogService().listPriceRules(actor, id);
  });
}

export async function PUT(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getAuthorizedActor(request);
    return getCatalogService().upsertPriceRule(actor, id, await readJson(request));
  });
}
