import { readJson } from "@/features/catalog/api";
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { patchUser } from "@/server/users/service";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getAuthorizedActor(request);
    return patchUser(actor, id, await readJson(request));
  });
}
