import { NextResponse } from "next/server";
import { ApiFailure, fail } from "@/lib/api/respond";
import { getSessionUser } from "@/server/lib/auth/actor";
import { developmentEnabled, getAdapter } from "@/server/adapters";

function connectionMode() {
  return process.env.NODE_ENV !== "production" && process.env.DEALFLOW_ADAPTER === "development"
    ? "DEV FIXTURE"
    : "LIVE";
}

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

export async function GET(request: Request) {
  try {
    if (developmentEnabled()) {
      const token = request.headers.get("cookie")?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("dealflow-session="))
        ?.slice("dealflow-session=".length);
      const actor = await (await getAdapter()).authenticate(token);
      if (!actor) throw new ApiFailure("UNAUTHENTICATED", "Not authenticated");
      return NextResponse.json({ data: { actor, mode: "DEV FIXTURE" }, mode: "DEV FIXTURE" }, { headers: { "Cache-Control": "no-store" } });
    }
    const user = await getSessionUser(request);
    return NextResponse.json(
      { data: { actor: toAppActor(user), mode: connectionMode() }, mode: connectionMode() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof ApiFailure) return fail(e.code, e.message, e.details);
    console.error(e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "Unexpected server error" } }, { status: 500 });
  }
}
