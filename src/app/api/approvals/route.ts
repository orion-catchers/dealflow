import type { NextRequest } from "next/server";
import { handle } from "@/lib/api/respond";
import { parseApprovalListFilter } from "@/server/approval-ui/api";
import { getApprovalUiService } from "@/server/approval-ui/service";
import { getActor } from "@/server/lib/auth/dev-actor";

/** GET /api/approvals?status=PENDING|RETURNED|COMPLETED|ALL */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const actor = await getActor(request);
    const filter = parseApprovalListFilter(request.nextUrl.searchParams);
    return getApprovalUiService().listApprovals(actor, filter);
  });
}
