import { NextResponse } from "next/server";
import { fail, handle } from "@/lib/api/respond";
import { runScheduledJobs } from "@/server/integrations/jobs";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: "INTEGRATION_REQUIRED", message: "Set CRON_SECRET to enable scheduled jobs" } },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return fail("UNAUTHENTICATED", "Invalid cron secret");
  return handle(async () => runScheduledJobs());
}
