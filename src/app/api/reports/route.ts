/**
 * GET /api/reports?period=THIS_MONTH&teamId=…&repId=…&approvalStatus=…&productId=…&category=…
 * → { data: ReportAggregates }
 */
import type { NextRequest } from "next/server";
import { handle } from "@/lib/api/respond";
import { getActor } from "@/lib/auth/dev-actor";
import { parseReportFilters } from "@/features/reports/api";
import { getReportService } from "@/features/reports/service";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const actor = await getActor(request);
    const filters = parseReportFilters(request.nextUrl.searchParams);
    return getReportService().run(filters, actor);
  });
}
