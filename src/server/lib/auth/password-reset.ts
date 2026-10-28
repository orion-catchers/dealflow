/**
 * Password recovery. Token is stored hashed. Email uses `sendMail` (Resend/webhook)
 * or a server log in non-production. HTTP never reveals whether the email exists.
 */
import { createHash, randomBytes } from "node:crypto";
import { ApiFailure } from "@/lib/api/respond";
import { parseInput } from "@/features/catalog/api";
import { prisma } from "@/server/lib/db";
import { sendMail } from "@/server/integrations/mail";
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
    const origin = process.env.APP_URL ?? "http://localhost:3000";
    try {
      await sendMail({
        to: user.email,
        subject: "DealFlow360 password reset",
        text: `Use this token on the sign-in recovery form within 30 minutes:\n${token}\n${origin}/login`,
      });
    } catch (reason) {
      console.error("[auth] password reset email was not delivered", reason);
    }
  }

  return { accepted: true };
}

/** Invitations stay valid for a week; a password reset for 30 minutes. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Issue a single-use set-password token for a newly invited user and return the link that redeems it.
 * The link is returned so an admin can share it when email delivery is not configured.
 */
export async function issueInviteLink(user: { id: string; email: string }, companyName: string, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { tokenHash: hashResetToken(token), userId: user.id, expiresAt: new Date(now.getTime() + INVITE_TTL_MS) },
  });
  const origin = process.env.APP_URL ?? "http://localhost:3000";
  const link = `${origin}/login?invite=${token}`;
  try {
    await sendMail({
      to: user.email,
      subject: `You're invited to ${companyName} on DealFlow360`,
      text: `Set your password within 7 days to activate your account:\n${link}`,
    });
  } catch (reason) {
    console.error("[auth] invitation email was not delivered; share the invite link instead", reason);
  }
  return link;
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
  await prisma.$transaction(async (tx) => {
    // Atomic claim: the conditional update makes concurrent replays of the
    // same token fail here instead of both rotating the password.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      throw new ApiFailure(
        "INVALID_INPUT",
        "Reset link is invalid or expired; request a new one",
      );
    }
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash: newPasswordHash },
    });
    // Old sessions must not survive a password change.
    await tx.session.deleteMany({ where: { userId: record.userId } });
  });

  return { ok: true };
}
