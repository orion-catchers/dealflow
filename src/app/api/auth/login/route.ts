import { NextResponse } from "next/server";
import { readJson } from "@/features/catalog/api";
import { ApiFailure, fail, ok } from "@/lib/api/respond";
import { loginWithPassword, parseLoginBody } from "@/server/lib/auth/credentials";
import { setSessionCookie } from "@/server/lib/auth/session";
import { developmentEnabled, getAdapter } from "@/server/adapters";

export async function POST(request: Request) {
  try {
    if (developmentEnabled()) {
      const input = parseLoginBody(await readJson(request));
      const result = await (await getAdapter()).login(input.email, input.password);
      const response = ok({ actor: result.actor, mode: "DEV FIXTURE" });
      response.cookies.set("dealflow-session", result.token, {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/",
        maxAge: 8 * 60 * 60,
      });
      return response;
    }
    const input = parseLoginBody(await readJson(request));
    const { user, token } = await loginWithPassword(input);
    const response = ok(user);
    setSessionCookie(response, token);
    return response;
  } catch (e) {
    if (e instanceof ApiFailure) return fail(e.code, e.message, e.details);
    if (e && typeof e === "object" && "issues" in e) {
      return fail("INVALID_INPUT", "Invalid input", (e as { issues: unknown }).issues);
    }
    console.error(e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "Unexpected server error" } }, { status: 500 });
  }
}
