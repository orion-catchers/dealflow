import { NextResponse } from "next/server";
import { readJson } from "@/features/catalog/api";
import { ApiFailure, fail } from "@/lib/api/respond";
import { loginWithPassword, parseLoginBody } from "@/server/lib/auth/credentials";
import { setSessionCookie } from "@/server/lib/auth/session";
import { developmentEnabled, getAdapter } from "@/server/adapters";

function toAppActor(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  active?: boolean;
  customerId?: string;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role === "FINANCE" ? "FINANCE_OPS" : user.role,
    active: user.active !== false && user.status !== "PENDING" && user.status !== "DISABLED",
    customerId: user.customerId,
  };
}

export async function POST(request: Request) {
  try {
    if (developmentEnabled()) {
      const input = parseLoginBody(await readJson(request));
      const result = await (await getAdapter()).login(input.email, input.password);
      const response = NextResponse.json({ data: { actor: result.actor, mode: "DEV FIXTURE" }, mode: "DEV FIXTURE" });
      response.cookies.set("dealflow-session", result.token, {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/",
        maxAge: 8 * 60 * 60,
      });
      setSessionCookie(response, result.token);
      return response;
    }
    const input = parseLoginBody(await readJson(request));
    const { user, token } = await loginWithPassword(input);
    const response = NextResponse.json({ data: { actor: toAppActor(user), mode: "LIVE" }, mode: "LIVE" });
    setSessionCookie(response, token);
    response.cookies.set("dealflow-session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
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
