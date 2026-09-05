import type { Actor } from "@/contracts/harsh";
import type { SessionUser } from "@/contracts/ruchir";
import { ruchirFixtures } from "@/fixtures/ruchir";
import { fixtureUsers } from "@/fixtures/harsh-dev";
import { ApiFailure } from "@/lib/api/respond";
import { userToActor, userToSessionUser } from "./actor-helpers";
import { findUserBySessionToken, parseSessionCookie } from "./session";

function devFixtureToActor(id: string): Actor {
  const u = fixtureUsers.find((x) => x.id === id);
  if (!u) throw new ApiFailure("UNAUTHENTICATED", `Unknown dev actor '${id}'`);
  return {
    id: u.id,
    role: u.role,
    customerId: "customerId" in u ? u.customerId : undefined,
    active: true,
  };
}

function devFixtureToSessionUser(actor: Actor): SessionUser {
  const fixture = ruchirFixtures.users.find((u) => u.sym === actor.id);
  return {
    id: actor.id,
    email: fixture?.email ?? `${actor.id}@dev.local`,
    name: fixture?.name ?? actor.id,
    role: actor.role,
    status: fixture?.status ?? "ACTIVE",
    customerId: actor.customerId,
    active: actor.active,
  };
}

async function actorFromSession(request: Request): Promise<Actor | null> {
  const token = parseSessionCookie(request.headers.get("cookie"));
  if (!token) return null;
  const user = await findUserBySessionToken(token);
  if (!user || user.status !== "ACTIVE") return null;
  return userToActor(user);
}

export async function getActor(request: Request): Promise<Actor> {
  const fromSession = await actorFromSession(request);
  if (fromSession) return fromSession;

  if (process.env.NODE_ENV !== "production" && process.env.DEALFLOW_ADAPTER === "development") {
    const id = request.headers.get("x-dev-actor") ?? "admin-dev";
    return devFixtureToActor(id);
  }

  throw new ApiFailure("UNAUTHENTICATED", "Not authenticated");
}

export async function getSessionUser(request: Request): Promise<SessionUser> {
  const token = parseSessionCookie(request.headers.get("cookie"));
  if (token) {
    const user = await findUserBySessionToken(token);
    if (user) return userToSessionUser(user);
  }

  if (process.env.NODE_ENV !== "production" && process.env.DEALFLOW_ADAPTER === "development") {
    const actor = devFixtureToActor(request.headers.get("x-dev-actor") ?? "admin-dev");
    return devFixtureToSessionUser(actor);
  }

  throw new ApiFailure("UNAUTHENTICATED", "Not authenticated");
}

export function requireRole(actor: Actor, ...roles: Actor["role"][]): void {
  if (!actor.active) throw new ApiFailure("FORBIDDEN", "Inactive account");
  if (!roles.includes(actor.role)) {
    throw new ApiFailure("FORBIDDEN", `Role ${actor.role} may not perform this action`, { allowed: roles });
  }
}
