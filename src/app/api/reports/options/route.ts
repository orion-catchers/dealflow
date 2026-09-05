/**
 * GET /api/reports/options → { data: { teams, reps, products, categories } }
 * Dropdown data for the reporting screen filters.
 */
import type { NextRequest } from "next/server";
import { handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { getReportService } from "@/server/reports/live";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    return getReportService().filterOptions(actor);
  });
}
