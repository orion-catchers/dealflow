/** Restore an archived product — DEV FIXTURE. POST (ADMIN). */
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { getCatalogService } from "@/server/catalog/live";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getAuthorizedActor(request);
    return getCatalogService().restoreProduct(actor, id);
  });
}
