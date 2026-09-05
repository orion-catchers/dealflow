import { NextResponse } from "next/server";
import { ApiFailure, handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";
import { appOrigin, createCheckoutSession, stripeConfigured } from "@/server/integrations/stripe";

export async function POST(request: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: { code: "INTEGRATION_REQUIRED", message: "Set STRIPE_SECRET_KEY to collect card payments" } },
      { status: 503 },
    );
  }
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const body = (await readJson(request)) as { invoiceId?: string; amount?: string; currency?: string };
    if (!body.invoiceId || !body.amount) throw new ApiFailure("INVALID_INPUT", "invoiceId and amount are required");
    const session = await createCheckoutSession({
      invoiceId: body.invoiceId,
      amount: body.amount,
      currency: body.currency ?? "INR",
      origin: appOrigin(request.url),
    });
    return { ...session, actorId: actor.id };
  });
}
