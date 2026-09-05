/** Customer master — DEV FIXTURE. GET one, PATCH update. */
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/live";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getAuthorizedActor(request);
    return getCatalogService().getCustomer(actor, id);
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getAuthorizedActor(request);
    return getCatalogService().updateCustomer(actor, id, await readJson(request));
  });
}
