import { NextResponse } from "next/server";
import { ApiFailure, fail, ok } from "@/lib/api/respond";
import { clearSessionCookie, destroySessionByToken, parseSessionCookie } from "@/server/lib/auth/session";
import { developmentEnabled, getAdapter } from "@/server/adapters";

export async function POST(request: Request) {
  try {
    if (developmentEnabled()) {
      const token = request.headers.get("cookie")?.split(";")
        .map(part => part.trim())
        .find(part => part.startsWith("dealflow-session="))
        ?.slice("dealflow-session=".length);
      if (token) await (await getAdapter()).logout(token);
      const response = ok({ ok: true });
      response.cookies.delete("dealflow-session");
      return response;
    }
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
