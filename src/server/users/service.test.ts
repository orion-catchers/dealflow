import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { ApiFailure } from "@/lib/api/respond";
import { prisma } from "@/server/lib/db";
import { listUsers, patchUser } from "./service";
import { hashPassword } from "@/server/lib/auth/password";

async function isDbUp(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const dbAvailable = await isDbUp();

afterAll(async () => {
  if (dbAvailable) await prisma.$disconnect();
});

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiFailure) return e;
    throw e;
  }
  throw new Error("expected ApiFailure");
}

describe.skipIf(!dbAvailable)("UserAdminService", () => {
  const admin = { id: "admin-dev", role: "ADMIN" as const, active: true };

  it("non-admin cannot list", async () => {
    const err = await failure(listUsers({ id: "finance-farah", role: "FINANCE", active: true }));
    expect(err.code).toBe("FORBIDDEN");
  });

  it("admin lists users with memberships", async () => {
    const rows = await listUsers(admin);
    const neha = rows.find((u) => u.email === "neha@acme.example");
    expect(neha?.customerIds.length).toBeGreaterThan(0);
  });

  it("admin can change a customer membership", async () => {
    const rows = await listUsers(admin);
    const neha = rows.find((u) => u.email === "neha@acme.example");
    const beta = await prisma.customer.findFirst({ where: { contactEmail: "rohan@beta.example" } });
    expect(neha && beta).toBeTruthy();
    const previous = neha!.customerIds;
    try {
      const updated = await patchUser(admin, neha!.id, { customerIds: [beta!.id] });
      expect(updated.customerIds).toEqual([beta!.id]);
    } finally {
      await patchUser(admin, neha!.id, { customerIds: previous });
    }
  });

  it("patch status on unknown user is NOT_FOUND", async () => {
    const err = await failure(patchUser(admin, "missing-user-id", { status: "ACTIVE" }));
    expect(err.code).toBe("NOT_FOUND");
  });

  it("audits admin user changes and ends sessions on deactivation", async () => {
    const suffix = randomBytes(4).toString("hex");
    const user = await prisma.user.create({
      data: {
        email: `audit-${suffix}@example.test`,
        passwordHash: await hashPassword("audit-password-1"),
        name: "Audit Test",
        role: "SALES_REP",
        status: "ACTIVE",
        companyId: "company-nexa",
      },
    });
    const liveSession = await prisma.session.create({
      data: { tokenHash: `audit-test-${suffix}`, userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });

    try {
      await patchUser(admin, user.id, { status: "DISABLED" });
      const event = await prisma.auditEvent.findFirst({
        where: { entityType: "User", entityId: user.id, action: "user.update" },
      });
      expect(event?.actorId).toBeTruthy();
      expect(event?.metadata).toMatchObject({ changes: { status: { from: "ACTIVE", to: "DISABLED" } } });
      expect(await prisma.session.findUnique({ where: { tokenHash: liveSession.tokenHash } })).toBeNull();
    } finally {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.auditEvent.deleteMany({ where: { entityType: "User", entityId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });
});
