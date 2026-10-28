import { handle, readJsonBody } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { inviteUser, listUsers } from "@/server/users/service";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return listUsers(actor);
  });
}

/** Invite a person into the admin's workspace; responds with the user and a one-time set-password link. */
export async function POST(request: Request) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return inviteUser(actor, await readJsonBody(request));
  });
}
