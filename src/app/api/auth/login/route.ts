import { NextResponse } from "next/server";
import { readJson } from "@/features/catalog/api";
import { ApiFailure, fail } from "@/lib/api/respond";
import { loginWithPassword, parseLoginBody } from "@/server/lib/auth/credentials";
import { setSessionCookie } from "@/server/lib/auth/session";

export async function POST(request: Request) {
  try {
    const input = parseLoginBody(await readJson(request));
    const { user, token } = await loginWithPassword(input);
    const mode =
      process.env.NODE_ENV !== "production" && process.env.DEALFLOW_ADAPTER === "development"
        ? "DEV FIXTURE"
        : "LIVE";
    const actor = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role === "FINANCE" ? "FINANCE_OPS" : user.role,
      active: user.active !== false && user.status === "ACTIVE",
      customerId: user.customerId,
    };
    const response = NextResponse.json({ data: { actor }, mode });
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
