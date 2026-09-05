import { handle } from "@/lib/api/respond";
import { getActor } from "@/server/lib/auth/dev-actor";
import { atharvaFixtures } from "@/fixtures/atharva-dev";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request);
    if (actor.role === "CUSTOMER") return [];
    return atharvaFixtures.approvals;
  });
}
