/** Products — DEV FIXTURE. GET list (`?includeArchived=1`), POST create (ADMIN). */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/lib/auth/dev-actor";
import { queryFlag, readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/features/catalog/service";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    const includeArchived = queryFlag(new URL(request.url).searchParams.get("includeArchived"));
    return getCatalogService().listProducts(actor, { includeArchived });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return getCatalogService().createProduct(actor, await readJson(request));
  });
}
