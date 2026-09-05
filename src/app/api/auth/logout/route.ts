import { NextResponse } from "next/server";
import { ApiFailure, fail, ok } from "@/lib/api/respond";
import { clearSessionCookie, destroySessionByToken, parseSessionCookie } from "@/server/lib/auth/session";

export async function POST(request: Request) {
  try {
    const token = parseSessionCookie(request.headers.get("cookie"));
    if (token) await destroySessionByToken(token);
    const response = ok({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (e) {
    if (e instanceof ApiFailure) return fail(e.code, e.message, e.details);
    console.error(e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "Unexpected server error" } }, { status: 500 });
  }
}
