/** One variant — DEV FIXTURE. PATCH update, DELETE = deactivate (stock/orders reference variants). */
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/live";

type Ctx = { params: Promise<{ id: string; variantId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, variantId } = await params;
    const actor = await getAuthorizedActor(request);
    return getCatalogService().updateVariant(actor, id, variantId, await readJson(request));
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, variantId } = await params;
    const actor = await getAuthorizedActor(request);
    return getCatalogService().deactivateVariant(actor, id, variantId);
  });
}
