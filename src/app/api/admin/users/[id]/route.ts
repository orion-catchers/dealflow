import { readJson } from "@/features/catalog/api";
import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/actor";
import { patchUser } from "@/server/users/service";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getActor(request);
    return patchUser(actor, id, await readJson(request));
  });
}
