/** Restore an archived product — DEV FIXTURE. POST (ADMIN). */
import { handle } from "@/lib/api/respond";
import { getActor } from "@/lib/auth/dev-actor";
import { getCatalogService } from "@/features/catalog/service";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getActor(request);
    return getCatalogService().restoreProduct(actor, id);
  });
}
