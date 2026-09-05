/**
 * DEV FIXTURE actor resolver. Ruchir owns real session auth (`src/lib/auth/*`,
 * `/api/auth/*`). Until his middleware lands, Harsh's routes read an `x-dev-actor`
 * header (a fixture user id) and map it to an Actor. This file is replaced by
 * Ruchir's `getActor(request)`; the call signature is kept identical.
 *
 * NEVER enable this in production: it is gated on NODE_ENV !== "production".
 */
import type { Actor } from "@/contracts/harsh";
import { fixtureUsers } from "@/fixtures/harsh";
import { ApiFailure } from "@/lib/api/respond";

export async function getActor(request: Request): Promise<Actor> {
  if (process.env.NODE_ENV === "production") {
    throw new ApiFailure("UNAUTHENTICATED", "Session auth not connected (NOT CONNECTED: Ruchir's auth boundary)");
  }
  const id = request.headers.get("x-dev-actor") ?? "admin-dev";
  const u = fixtureUsers.find((x) => x.id === id);
  if (!u) throw new ApiFailure("UNAUTHENTICATED", `Unknown dev actor '${id}'`);
  return { id: u.id, role: u.role, customerId: "customerId" in u ? u.customerId : undefined, active: true };
}

export function requireRole(actor: Actor, ...roles: Actor["role"][]) {
  if (!actor.active) throw new ApiFailure("FORBIDDEN", "Inactive account");
  if (!roles.includes(actor.role)) {
    throw new ApiFailure("FORBIDDEN", `Role ${actor.role} may not perform this action`, { allowed: roles });
  }
}
