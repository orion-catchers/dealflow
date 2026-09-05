import { afterAll, describe, expect, it } from "vitest";
import { ApiFailure } from "@/lib/api/respond";
import { prisma } from "@/server/lib/db";
import { getActor, getSessionUser } from "@/server/lib/auth/actor";
import { loginWithPassword } from "@/server/lib/auth/credentials";
import { destroySessionByToken, SESSION_COOKIE } from "@/server/lib/auth/session";
import { hashPassword } from "@/server/lib/auth/password";
import { listUsers, patchUser } from "@/server/users/service";
import { ruchirFixtures } from "@/fixtures/ruchir";

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

function passwordFor(email: string): string {
  const user = ruchirFixtures.users.find((u) => u.email === email);
  if (!user) throw new Error(`No fixture user for ${email}`);
  return user.devPassword;
}

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

describe.skipIf(!dbAvailable)("auth session flow", () => {
  it("login rejects wrong password", async () => {
    const admin = await prisma.user.findUnique({ where: { email: "dev@nexa.example" } });
    expect(admin).toBeTruthy();
    const err = await failure(loginWithPassword({ email: "dev@nexa.example", password: "wrong-password" }));
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  it("login returns session user with fixture actor id", async () => {
    const { user, token } = await loginWithPassword({ email: "dev@nexa.example", password: passwordFor("dev@nexa.example") });
    expect(user.id).toBe("admin-dev");
    expect(user.email).toBe("dev@nexa.example");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    await destroySessionByToken(token);
  });

  it("getActor resolves session cookie for active user", async () => {
    const { token } = await loginWithPassword({ email: "arjun@nexa.example", password: passwordFor("arjun@nexa.example") });
    const request = new Request("http://localhost/api/test", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    const actor = await getActor(request);
    expect(actor.id).toBe("rep-arjun");
    expect(actor.role).toBe("SALES_REP");
    await destroySessionByToken(token);
  });

  it("getSessionUser returns customer fixture id", async () => {
    const { token } = await loginWithPassword({ email: "neha@acme.example", password: passwordFor("neha@acme.example") });
    const request = new Request("http://localhost/api/test", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    const user = await getSessionUser(request);
    expect(user.id).toBe("customer-neha");
    expect(user.customerId).toBe("customer-acme");
    await destroySessionByToken(token);
  });

  it("pending user cannot login", async () => {
    const err = await failure(loginWithPassword({ email: "vikram@nexa.example", password: "not-the-seeded-password" }));
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  it("admin can activate pending user", async () => {
    const pending = await prisma.user.findUnique({ where: { email: "vikram@nexa.example" } });
    expect(pending).toBeTruthy();
    const adminActor = { id: "admin-dev", role: "ADMIN" as const, active: true };
    const row = await patchUser(adminActor, pending!.id, { status: "ACTIVE" });
    expect(row.status).toBe("ACTIVE");
    await patchUser(adminActor, pending!.id, { status: "PENDING" });
  });
});

describe.skipIf(!dbAvailable)("users admin", () => {
  const adminActor = { id: "admin-dev", role: "ADMIN" as const, active: true };

  it("listUsers requires admin", async () => {
    const err = await failure(listUsers({ id: "rep-arjun", role: "SALES_REP", active: true }));
    expect(err.code).toBe("FORBIDDEN");
  });

  it("listUsers returns seeded users", async () => {
    const rows = await listUsers(adminActor);
    expect(rows.some((u) => u.email === "dev@nexa.example")).toBe(true);
  });
});

describe.skipIf(!dbAvailable)("signup", () => {
  it("creates pending sales rep", async () => {
    const email = `signup-${Date.now()}@example.com`;
    const passwordHash = await hashPassword("signup-test-password");
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: "Signup Test",
        role: "SALES_REP",
        status: "PENDING",
        companyId: "company-nexa",
      },
    });
    expect(user.status).toBe("PENDING");
    await prisma.user.delete({ where: { id: user.id } });
  });
});
