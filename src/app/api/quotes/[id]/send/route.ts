import { ApiFailure, handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";
import { getLiveQuoteService } from "@/server/quotes/live-service";
import { notifyQuoteSent } from "@/server/integrations/notifications";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const { id } = await context.params;
    const raw = (await readJson(request)) as {
      expectedRevision?: number | string;
      customerTier?: string;
    };
    if (raw.expectedRevision === undefined)
      throw new ApiFailure("INVALID_INPUT", "expectedRevision is required");
    const normalizedTier =
      typeof raw.customerTier === "string"
        ? raw.customerTier.trim().toUpperCase()
        : undefined;
    if (
      raw.customerTier !== undefined &&
      (!normalizedTier ||
        !["BRONZE", "SILVER", "GOLD"].includes(normalizedTier))
    ) {
      throw new ApiFailure(
        "INVALID_INPUT",
        "customerTier must be Bronze, Silver, or Gold",
      );
    }
    const body = {
      expectedRevision: raw.expectedRevision,
      customerTier: normalizedTier as "BRONZE" | "SILVER" | "GOLD" | undefined,
    };
    const result = await getLiveQuoteService().send(actor, id, body);
    try {
      await notifyQuoteSent(id);
    } catch (reason) {
      console.error("[quotes] send email was not delivered", reason);
    }
    return result;
  });
}
