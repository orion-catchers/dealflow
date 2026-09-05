import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { ApiFailure } from "@/lib/api/respond";
import { prisma } from "@/server/lib/db";
import { hashPassword, verifyPassword } from "./password";
import {
  confirmPasswordReset,
  hashResetToken,
  requestPasswordReset,
  RESET_TTL_MS,
} from "./password-reset";

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

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiFailure) return e;
    throw e;
  }
  throw new Error("expected ApiFailure");
}

const suffix = randomBytes(4).toString("hex");
const activeEmail = `reset-active-${suffix}@example.test`;
const disabledEmail = `reset-disabled-${suffix}@example.test`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (!dbAvailable) return;
  for (const userId of createdUserIds) {
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

describe.skipIf(!dbAvailable)("password reset flow", () => {
  it("records the same accepted response for unknown emails", async () => {
    const result = await requestPasswordReset({ email: `nobody-${suffix}@example.test` });
    expect(result).toEqual({ accepted: true });
  });

  it("creates a single-use token for active users and resets the password", async () => {
    const user = await prisma.user.create({
      data: {
        email: activeEmail,
        passwordHash: await hashPassword("old-password-1"),
        name: "Reset Active",
        role: "SALES_REP",
        status: "ACTIVE",
        companyId: "company-nexa",
      },
    });
    createdUserIds.push(user.id);

    const request = await requestPasswordReset({ email: activeEmail });
    expect(request).toEqual({ accepted: true });
    const stored = await prisma.passwordResetToken.findFirst({ where: { userId: user.id } });
    expect(stored).not.toBeNull();

    const liveSession = await prisma.session.create({
      data: { tokenHash: `reset-test-${suffix}`, userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });

    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.update({
      // Swap in a known token so the confirm step can be exercised end to end.
      where: { id: stored!.id },
      data: { tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });

    const confirm = await confirmPasswordReset({ token, newPassword: "new-password-1" });
    expect(confirm).toEqual({ ok: true });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword("new-password-1", updated.passwordHash)).toBe(true);
    expect((await prisma.session.findUnique({ where: { tokenHash: liveSession.tokenHash } }))).toBeNull();

    const replay = await failure(confirmPasswordReset({ token, newPassword: "again-password-1" }));
    expect(replay.code).toBe("INVALID_INPUT");
  });

  it("rejects expired tokens", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: activeEmail } });
    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: hashResetToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const err = await failure(confirmPasswordReset({ token, newPassword: "expired-pass-1" }));
    expect(err.code).toBe("INVALID_INPUT");
  });

  it("consumes a token atomically under concurrent confirmation", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: activeEmail } });
    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: hashResetToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    const attempts = await Promise.allSettled([
      confirmPasswordReset({ token, newPassword: "race-password-1" }),
      confirmPasswordReset({ token, newPassword: "race-password-2" }),
    ]);
    const ok = attempts.filter((a) => a.status === "fulfilled");
    const rejected = attempts.filter(
      (a) => a.status === "rejected" && a.reason instanceof ApiFailure && a.reason.code === "INVALID_INPUT",
    );
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("does not create tokens for non-active accounts", async () => {
    const user = await prisma.user.create({
      data: {
        email: disabledEmail,
        passwordHash: await hashPassword("old-password-1"),
        name: "Reset Disabled",
        role: "SALES_REP",
        status: "DISABLED",
        companyId: "company-nexa",
      },
    });
    createdUserIds.push(user.id);

    const request = await requestPasswordReset({ email: disabledEmail });
    expect(request).toEqual({ accepted: true });
    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(0);
  });
});
