import { NextResponse } from "next/server";
import { prisma } from "@/server/lib/db";

export const dynamic = "force-dynamic";

/**
 * Readiness probe for load balancers: 200 when the database answers, 503 otherwise. Unauthenticated, so it reports
 * no tenant data. (`/api/health` is the signed-in deal-health dashboard, not a probe.)
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[readyz] database unavailable", error);
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
