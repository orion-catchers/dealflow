import { afterAll, describe, expect, it } from "vitest";
import { ApiFailure } from "@/lib/api/respond";
import { prisma } from "@/server/lib/db";
import { listUsers, patchUser } from "./service";

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

  it("patch status on unknown user is NOT_FOUND", async () => {
    const err = await failure(patchUser(admin, "missing-user-id", { status: "ACTIVE" }));
    expect(err.code).toBe("NOT_FOUND");
  });
});
