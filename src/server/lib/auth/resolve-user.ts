import type { Actor } from "@/contracts/harsh";
import { prisma } from "@/server/lib/db";
import { ACTOR_ID_TO_EMAIL } from "./actor-helpers";

export async function prismaUserIdForActor(actor: Actor): Promise<string | null> {
  const email = ACTOR_ID_TO_EMAIL[actor.id];
  if (!email) return actor.id;
  const user = await prisma.user.findUnique({ where: { email } });
  return user?.id ?? null;
}
