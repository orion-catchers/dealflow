import { createHash, randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { prisma } from "@/server/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./cookies";

export { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "./cookies";

// Sample rate for expired-session cleanup inside createSession.
const SESSION_PURGE_INTERVAL = 20;
let sessionPurgeCounter = 0;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function parseSessionCookie(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (key === SESSION_COOKIE) return trimmed.slice(eq + 1);
  }
  return undefined;
}

export function sessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: "lax";
  path: string;
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  // Expired rows are never read (findUserBySessionToken rechecks), but without
  // a purge they accumulate forever on the shared database. Sampling keeps the
  // deleteMany scan off the hot path (review P2); the first login purges so a
  // stale demo database starts clean.
  sessionPurgeCounter += 1;
  if (sessionPurgeCounter % SESSION_PURGE_INTERVAL === 1) {
    await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function destroySessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export async function findUserBySessionToken(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          memberships: true,
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}
