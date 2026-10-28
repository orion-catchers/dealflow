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

type TokenClient = Pick<typeof prisma, "passwordResetToken">;

/**
 * Create a single-use invitation token for a PENDING user and return the link that redeems it. Earlier unused
 * invitations for the same user stop working. Pass the transaction that creates the user, so a user never exists
 * without a way in. The token travels in the URL fragment, which browsers do not send to servers or proxies.
 */
export async function createInviteLink(db: TokenClient, userId: string, now = new Date()): Promise<string> {
  await db.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
  const token = randomBytes(32).toString("hex");
  await db.passwordResetToken.create({
    data: { tokenHash: hashResetToken(token), userId, expiresAt: new Date(now.getTime() + INVITE_TTL_MS) },
  });
  return `${process.env.APP_URL ?? "http://localhost:3000"}/login#invite=${token}`;
}

/** Email an invitation link. Delivery failures are logged, not thrown: the admin can resend. */
export async function sendInviteEmail(user: { email: string }, companyName: string, link: string): Promise<void> {
  try {
    await sendMail({
      to: user.email,
      subject: `You're invited to ${companyName} on DealFlow360`,
      text: `Set your password within 7 days to activate your account:\n${link}`,
    });
  } catch (reason) {
    console.error("[auth] invitation email was not delivered; resend it from Users & roles", reason);
  }
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
    // Redeeming an invitation (the only token a PENDING user can hold) also activates the account.
    const user = await tx.user.findUniqueOrThrow({ where: { id: record.userId }, select: { status: true } });
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash: newPasswordHash, ...(user.status === "PENDING" ? { status: "ACTIVE" as const } : {}) },
    });
    // Old sessions must not survive a password change.
    await tx.session.deleteMany({ where: { userId: record.userId } });
  });

  return { ok: true };
}
