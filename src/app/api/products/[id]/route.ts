/**
 * Product detail — DEV FIXTURE. GET (product + variants), PATCH update, DELETE = archive
 * (blueprint §10: never hard-delete catalog records).
 */
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";
import { getCatalogService } from "@/server/catalog/live";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getAuthorizedActor(request);
    return getCatalogService().getProduct(actor, id);
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getAuthorizedActor(request);
    return getCatalogService().updateProduct(actor, id, await readJson(request));
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getAuthorizedActor(request);
    return getCatalogService().archiveProduct(actor, id);
  });
}
