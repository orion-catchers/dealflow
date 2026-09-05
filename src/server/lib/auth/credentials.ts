import type { SessionUser, SignupInput } from "@/contracts/ruchir";
import { parseInput } from "@/features/catalog/api";
import { ApiFailure } from "@/lib/api/respond";
import { prisma } from "@/server/lib/db";
import { userToSessionUser } from "./actor-helpers";
import { hashPassword, verifyPassword } from "./password";
import { createSession } from "./session";
import { loginSchema, signupSchema } from "./schemas";

export async function loginWithPassword(input: { email: string; password: string }): Promise<{ user: SessionUser; token: string }> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: { memberships: true },
  });
  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new ApiFailure("UNAUTHENTICATED", "Invalid email or password");
  }
  const { token } = await createSession(user.id);
  return { user: userToSessionUser(user), token };
}

export async function signupUser(raw: SignupInput): Promise<SessionUser> {
  const input = parseInput(signupSchema, raw);
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiFailure("CONFLICT", "Email already registered");

  const passwordHash = await hashPassword(input.password);
  const role = input.customerId ? "CUSTOMER" : "SALES_REP";

  const user = await prisma.$transaction(async (tx) => {
    if (input.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new ApiFailure("NOT_FOUND", "Customer not found");
    }

    const created = await tx.user.create({
      data: {
        email,
        passwordHash,
        name: input.name,
        role,
        status: "PENDING",
      },
      include: { memberships: true },
    });

    if (input.customerId) {
      await tx.customerMembership.create({
        data: { userId: created.id, customerId: input.customerId },
      });
    }

    return tx.user.findUniqueOrThrow({
      where: { id: created.id },
      include: { memberships: true },
    });
  });

  return userToSessionUser(user);
}

export function parseLoginBody(raw: unknown) {
  return parseInput(loginSchema, raw);
}

export function parseSignupBody(raw: unknown) {
  return parseInput(signupSchema, raw);
}
