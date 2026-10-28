import type { SessionUser, SignupInput } from "@/contracts/ruchir";
import { parseInput } from "@/features/catalog/api";
import { ApiFailure } from "@/lib/api/respond";
import { prisma } from "@/server/lib/db";
import { createWorkspace, publicSignupEnabled } from "@/server/tenancy/workspace";
import { userToSessionUser } from "./actor-helpers";
import { verifyPassword } from "./password";
import { loginRateLimiter, signupRateLimiter } from "./rate-limit";
import { createSession } from "./session";
import { loginSchema, signupSchema } from "./schemas";

export async function loginWithPassword(input: { email: string; password: string }): Promise<{ user: SessionUser; token: string }> {
  const email = input.email.toLowerCase();
  loginRateLimiter.assertAllowed(email);
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: true, company: { select: { active: true } } },
    });
    // A suspended workspace signs nobody in; the response does not say why, like a wrong password.
    if (!user || user.status !== "ACTIVE" || !user.company.active || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new ApiFailure("UNAUTHENTICATED", "Invalid email or password");
    }
    const { token } = await createSession(user.id);
    loginRateLimiter.recordSuccess(email);
    return { user: userToSessionUser(user), token };
  } catch (e) {
    if (e instanceof ApiFailure && e.code === "UNAUTHENTICATED") loginRateLimiter.recordFailure(email);
    throw e;
  }
}

/**
 * Public sign-up: create a new workspace whose owner is the signing-up person, then sign them in. Off unless
 * DEALFLOW_PUBLIC_SIGNUP=1; people join an existing workspace by an admin's invitation instead.
 */
export async function signupWorkspace(raw: SignupInput, client: string): Promise<{ user: SessionUser; token: string }> {
  if (!publicSignupEnabled()) {
    throw new ApiFailure("FORBIDDEN", "Workspace sign-up is by invitation. Ask your administrator to invite you.");
  }
  const input = parseInput(signupSchema, raw);
  signupRateLimiter.assertAllowed(client);
  signupRateLimiter.recordFailure(client);
  const created = await createWorkspace({
    companyName: input.companyName,
    name: input.name,
    email: input.email,
    password: input.password,
    currency: input.currency,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: created.ownerId }, include: { memberships: true } });
  const { token } = await createSession(user.id);
  return { user: userToSessionUser(user), token };
}

export function parseLoginBody(raw: unknown) {
  return parseInput(loginSchema, raw);
}

export function parseSignupBody(raw: unknown) {
  return parseInput(signupSchema, raw);
}
