import { NextResponse } from "next/server";
import { readJson } from "@/features/catalog/api";
import { ApiFailure, fail, ok } from "@/lib/api/respond";
import { loginWithPassword, parseLoginBody } from "@/server/lib/auth/credentials";
import { setSessionCookie } from "@/server/lib/auth/session";

export async function POST(request: Request) {
  try {
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
