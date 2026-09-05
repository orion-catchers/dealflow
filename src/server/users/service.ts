import type { Actor } from "@/contracts/harsh";
import type { UserAdminRow } from "@/contracts/ruchir";
import { parseInput } from "@/features/catalog/api";
import { ApiFailure } from "@/lib/api/respond";
import { prisma } from "@/server/lib/db";
import { requireRole } from "@/server/lib/auth/actor";
import { userPatchSchema } from "@/server/lib/auth/schemas";

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

    return tx.user.findUniqueOrThrow({
      where: { id },
      include: { memberships: true },
    });
  });

  return toAdminRow(user);
}
