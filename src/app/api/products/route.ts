/** Products — DEV FIXTURE. GET list (`?includeArchived=1`), POST create (ADMIN). */
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { queryFlag, readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/live";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const includeArchived = queryFlag(new URL(request.url).searchParams.get("includeArchived"));
    return getCatalogService().listProducts(actor, { includeArchived });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return getCatalogService().createProduct(actor, await readJson(request));
  });
}
