/**
 * GET /api/reports?period=THIS_MONTH&teamId=…&repId=…&approvalStatus=…&productId=…&category=…
 * → { data: ReportAggregates }
 */
import type { NextRequest } from "next/server";
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { parseReportFilters } from "@/features/reports/api";
import { getReportService } from "@/server/reports/live";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const filters = parseReportFilters(request.nextUrl.searchParams);
    return getReportService().run(filters, actor);
  });
}
