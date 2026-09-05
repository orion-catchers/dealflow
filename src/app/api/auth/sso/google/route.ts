import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  if (!id || !secret) {
    return NextResponse.json(
      { error: { code: "INTEGRATION_REQUIRED", message: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for SSO" } },
      { status: 503 },
    );
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/sso/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(url);
}
