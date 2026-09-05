import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/actor";
import { listUsers } from "@/server/users/service";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    return listUsers(actor);
  });
}
