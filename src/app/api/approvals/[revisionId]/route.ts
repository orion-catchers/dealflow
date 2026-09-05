import type { NextRequest } from "next/server";
import { handle } from "@/lib/api/respond";
import { parseApprovalActionBody } from "@/server/approval-ui/api";
import { getApprovalUiService } from "@/server/approval-ui/service";
import { getActor } from "@/server/lib/auth/dev-actor";

type RouteContext = { params: Promise<{ revisionId: string }> };

/** GET /api/approvals/[revisionId] — approval detail for screen 06. */
export async function GET(request: NextRequest, context: RouteContext) {
  return handle(async () => {
    const actor = await getActor(request);
    const { revisionId } = await context.params;
    return getApprovalUiService().getApprovalDetail(actor, revisionId);
  });
}

/** POST /api/approvals/[revisionId] — record APPROVE | REJECT | RETURN. */
export async function POST(request: NextRequest, context: RouteContext) {
  return handle(async () => {
    const actor = await getActor(request);
    const { revisionId } = await context.params;
    const body = parseApprovalActionBody(await request.json());
    return getApprovalUiService().submitDecision(actor, revisionId, body.decision, body.reason);
  });
}
