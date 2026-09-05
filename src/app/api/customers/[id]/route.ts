/** Customer master — DEV FIXTURE. GET one, PATCH update. */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/lib/auth/dev-actor";
import { readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/features/catalog/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getActor(request);
    return getCatalogService().getCustomer(actor, id);
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getActor(request);
    return getCatalogService().updateCustomer(actor, id, await readJson(request));
  });
}
