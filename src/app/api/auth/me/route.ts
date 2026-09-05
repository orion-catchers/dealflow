import { NextResponse } from "next/server";
import { ApiFailure, fail } from "@/lib/api/respond";
import { getSessionUser } from "@/server/lib/auth/actor";

function connectionMode() {
  return process.env.NODE_ENV !== "production" && process.env.DEALFLOW_ADAPTER === "development"
    ? "DEV FIXTURE"
    : "LIVE";
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request);
    const actor = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role === "FINANCE" ? "FINANCE_OPS" : user.role,
      active: user.active !== false && user.status === "ACTIVE",
      customerId: user.customerId,
    };
    return NextResponse.json({ data: { actor }, mode: connectionMode() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ApiFailure) return fail(e.code, e.message, e.details);
    console.error(e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "Unexpected server error" } }, { status: 500 });
  }
}
