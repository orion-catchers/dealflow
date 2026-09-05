/**
 * Password recovery (auth lane; blueprint screen 01 — recovery handler owned by
 * Ruchir). Email delivery is not configured in this prototype, so the honest
 * path is: request records a single-use hashed token; in non-production the
 * token is printed to the server log for the requester to use; otherwise the
 * admin hands it over. Responses never reveal whether an account exists.
 */
import { createHash, randomBytes } from "node:crypto";
import { ApiFailure } from "@/lib/api/respond";
import { parseInput } from "@/features/catalog/api";
import { prisma } from "@/server/lib/db";
import { hashPassword } from "./password";
import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from "./schemas";

export const RESET_TTL_MS = 30 * 60 * 1000;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ResetRequestOptions {
  now?: Date;
}

export async function requestPasswordReset(
  raw: unknown,
  options: ResetRequestOptions = {},
): Promise<{ accepted: boolean }> {
  const input = parseInput(passwordResetRequestSchema, raw);
  const now = options.now ?? new Date();
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (user && user.status === "ACTIVE") {
    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: hashResetToken(token),
        userId: user.id,
        expiresAt: new Date(now.getTime() + RESET_TTL_MS),
      },
    });
    if (process.env.NODE_ENV !== "production") {
      const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
      console.log(
        `[auth] password reset requested for ${user.email}; token (valid until ${expiresAt}): ${token}`,
      );
    }
  }

  return { accepted: true };
}

export async function confirmPasswordReset(
  raw: unknown,
  options: ResetRequestOptions = {},
): Promise<{ ok: boolean }> {
  const input = parseInput(passwordResetConfirmSchema, raw);
  const now = options.now ?? new Date();
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(input.token) },
  });
  if (!record || record.usedAt || record.expiresAt < now) {
    throw new ApiFailure(
      "INVALID_INPUT",
      "Reset link is invalid or expired; request a new one",
    );
  }

  const newPasswordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: newPasswordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    }),
    // Old sessions must not survive a password change.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  return { ok: true };
}
