import { NextResponse } from "next/server";
import { ApiFailure, handle, readJsonBody } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { moneySchema, parseInput } from "@/features/catalog/api";
import { toCents } from "@/server/billing/engine/money";
import { getBillingService } from "@/server/billing/live";
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
    const body = ((await readJsonBody(request)) ?? {}) as { invoiceId?: string; amount?: string };
    if (!body.invoiceId) throw new ApiFailure("INVALID_INPUT", "invoiceId is required");
    // The stored invoice (visibility enforced by the billing service) supplies the currency and the balance; the browser's values are not trusted.
    const invoice = await getBillingService().getInvoice(actor, body.invoiceId);
    const amount = parseInput(moneySchema, body.amount || invoice.outstanding);
    if (toCents(amount) <= 0 || toCents(amount) > toCents(invoice.outstanding)) {
      throw new ApiFailure("INVALID_INPUT", "amount must be positive and no more than the outstanding balance", {
        outstanding: invoice.outstanding,
      });
    }
    const session = await createCheckoutSession({
      invoiceId: invoice.id,
      amount,
      currency: invoice.currency,
      origin: appOrigin(request.url),
    });
    return { ...session, actorId: actor.id };
  });
}
