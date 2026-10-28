import type { Actor } from "@/contracts/harsh";
import type { UserAdminRow } from "@/contracts/ruchir";
import { parseInput } from "@/features/catalog/api";
import { ApiFailure } from "@/lib/api/respond";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/lib/db";
import { requireRole } from "@/server/lib/auth/actor";
import { hashPassword } from "@/server/lib/auth/password";
import { issueInviteLink } from "@/server/lib/auth/password-reset";
import { prismaUserIdForActor } from "@/server/lib/auth/resolve-user";
import { recordPrismaAudit } from "@/server/audit/prisma-repository";
import { userInviteSchema, userPatchSchema } from "@/server/lib/auth/schemas";
import { requireCompanyId, runAsSystem } from "@/server/lib/tenant/context";

function toAdminRow(user: {
  id: string;
  email: string;
  name: string;
  role: UserAdminRow["role"];
  status: UserAdminRow["status"];
  teamId: string | null;
  createdAt: Date;
  memberships: { customerId: string }[];
}): UserAdminRow {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    teamId: user.teamId,
    customerIds: user.memberships.map((m) => m.customerId),
    createdAt: user.createdAt.toISOString(),
  };
}

export async function listUsers(actor: Actor): Promise<UserAdminRow[]> {
  requireRole(actor, "ADMIN");
  const users = await prisma.user.findMany({
    include: { memberships: true },
    orderBy: { createdAt: "asc" },
  });
  return users.map(toAdminRow);
}

export async function patchUser(actor: Actor, id: string, raw: unknown): Promise<UserAdminRow> {
  requireRole(actor, "ADMIN");
  const input = parseInput(userPatchSchema, raw);

  const existing = await prisma.user.findUnique({
    where: { id },
    include: { memberships: true },
  });
  if (!existing) throw new ApiFailure("NOT_FOUND", "User not found");

  if (input.teamId !== undefined && input.teamId !== null) {
    const team = await prisma.salesTeam.findUnique({ where: { id: input.teamId } });
    if (!team) throw new ApiFailure("NOT_FOUND", "Team not found");
  }

  if (input.customerIds !== undefined) {
    for (const customerId of input.customerIds) {
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new ApiFailure("NOT_FOUND", `Customer not found: ${customerId}`);
    }
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (input.status !== undefined && input.status !== existing.status) changes.status = { from: existing.status, to: input.status };
  if (input.role !== undefined && input.role !== existing.role) changes.role = { from: existing.role, to: input.role };
  if (input.teamId !== undefined && input.teamId !== existing.teamId) changes.teamId = { from: existing.teamId, to: input.teamId };
  if (input.customerIds !== undefined) {
    const before = existing.memberships.map((m) => m.customerId).sort();
    if (JSON.stringify(before) !== JSON.stringify([...input.customerIds].sort())) changes.customerIds = { from: before, to: input.customerIds };
  }

  // AuditEvent.actorId references User, so a fixture actor symbol (x-dev-actor)
  // must resolve to the seeded database user before it can be recorded.
  const resolvedActorId = await prismaUserIdForActor(actor);

  const user = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        status: input.status,
        role: input.role,
        teamId: input.teamId,
      },
    });

    if (input.customerIds !== undefined) {
      await tx.customerMembership.deleteMany({ where: { userId: id } });
      if (input.customerIds.length > 0) {
        await tx.customerMembership.createMany({
          data: input.customerIds.map((customerId) => ({ userId: id, customerId })),
        });
      }
    }

    // Blueprint §1: admin configuration changes are audited. Deactivation and
    // demotion to PENDING end live sessions so removed access takes effect now.
    if (input.status !== undefined && input.status !== "ACTIVE") {
      await tx.session.deleteMany({ where: { userId: id } });
    }
    await recordPrismaAudit(tx, {
      entityType: "User",
      entityId: id,
      actorId: resolvedActorId ?? undefined,
      action: "user.update",
      metadata: { changes, actor: actor.id },
    });

    return tx.user.findUniqueOrThrow({
      where: { id },
      include: { memberships: true },
    });
  });

  return toAdminRow(user);
}

/**
 * Add a person to the admin's own workspace. The account is ACTIVE with an unusable password until the invitee sets
 * one from the returned link (also emailed when a mail provider is configured). Customer-role invitees must be bound
 * to at least one of the workspace's customers.
 */
export async function inviteUser(actor: Actor, raw: unknown): Promise<{ user: UserAdminRow; inviteUrl: string }> {
  requireRole(actor, "ADMIN");
  const input = parseInput(userInviteSchema, raw);
  const email = input.email.toLowerCase();
  const companyId = requireCompanyId();

  // Login emails are unique across every workspace, so the check deliberately looks beyond this company.
  if (await runAsSystem(() => prisma.user.findUnique({ where: { email }, select: { id: true } }))) {
    throw new ApiFailure("CONFLICT", "Email already registered");
  }
  const customerIds = input.customerIds ?? [];
  if (input.role === "CUSTOMER" && customerIds.length === 0) {
    throw new ApiFailure("INVALID_INPUT", "A customer user needs at least one customer membership");
  }
  for (const customerId of customerIds) {
    if (!(await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) {
      throw new ApiFailure("NOT_FOUND", `Customer not found: ${customerId}`);
    }
  }
  if (input.teamId && !(await prisma.salesTeam.findUnique({ where: { id: input.teamId }, select: { id: true } }))) {
    throw new ApiFailure("NOT_FOUND", "Team not found");
  }

  const resolvedActorId = await prismaUserIdForActor(actor);
  const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        passwordHash,
        name: input.name,
        role: input.role,
        status: "ACTIVE",
        teamId: input.teamId ?? null,
        companyId,
        memberships: { create: customerIds.map((customerId) => ({ customerId })) },
      },
      include: { memberships: true },
    });
    await recordPrismaAudit(tx, {
      entityType: "User",
      entityId: created.id,
      actorId: resolvedActorId ?? undefined,
      action: "user.invite",
      metadata: { role: input.role, customerIds, actor: actor.id },
    });
    return created;
  });
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } });
  const inviteUrl = await issueInviteLink(user, company.name);
  return { user: toAdminRow(user), inviteUrl };
}

