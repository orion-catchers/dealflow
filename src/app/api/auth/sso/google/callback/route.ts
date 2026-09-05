import { NextResponse } from "next/server";
import { prisma } from "@/server/lib/db";
import { createSession, setSessionCookie } from "@/server/lib/auth/session";

const STATE_COOKIE = "dealflow_sso_state";

export async function GET(request: Request) {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  if (!id || !secret) {
    return NextResponse.json(
      { error: { code: "INTEGRATION_REQUIRED", message: "Google SSO is not connected" } },
      { status: 503 },
    );
  }
  const incoming = new URL(request.url);
  const code = incoming.searchParams.get("code");
  const state = incoming.searchParams.get("state");
  const expected = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  if (!code) return NextResponse.redirect(`${origin}/login?sso=missing_code`);
  if (!state || !expected || state !== expected) return NextResponse.redirect(`${origin}/login?sso=bad_state`);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: `${origin}/api/auth/sso/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) return NextResponse.redirect(`${origin}/login?sso=token_failed`);
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = (await userRes.json()) as { email?: string };
  const email = profile.email?.toLowerCase();
  if (!email) return NextResponse.redirect(`${origin}/login?sso=no_email`);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return NextResponse.redirect(`${origin}/login?sso=unknown_user`);
  const { token } = await createSession(user.id);
  const response = NextResponse.redirect(`${origin}${user.role === "CUSTOMER" ? "/portal" : "/home"}`);
  setSessionCookie(response, token);
  response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
