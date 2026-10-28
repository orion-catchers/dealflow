import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { resendInvite } from "@/server/users/service";

type Ctx = { params: Promise<{ id: string }> };

/** Resend a pending invitation with a fresh one-time link. */
export async function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const actor = await getAuthorizedActor(request);
    return resendInvite(actor, id);
  });
}
