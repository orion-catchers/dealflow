import type { NextRequest } from "next/server";
import { handle } from "@/lib/api/respond";
import { parseApprovalListFilter } from "@/server/approval-ui/api";
import { getApprovalUiService } from "@/server/approval-ui/service";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";

/** GET /api/approvals?status=PENDING|RETURNED|COMPLETED|ALL */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const filter = parseApprovalListFilter(request.nextUrl.searchParams);
    return getApprovalUiService().listApprovals(actor, filter);
  });
}
