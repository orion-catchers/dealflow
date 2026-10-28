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
  const result = await runScheduledJobs();
  // A company whose billing failed must page someone, so the run is not reported as a plain success.
  if (result.failed > 0) return NextResponse.json({ error: { code: "JOBS_FAILED", message: `${result.failed} company job(s) failed`, details: result } }, { status: 500 });
  return handle(async () => result);
}
