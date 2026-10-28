import { NextResponse } from "next/server";
import { getBillingService } from "@/server/billing/live";
import { runAsInvoiceCompany } from "@/server/billing/system-actor";
import {
  paidInvoiceFromStripeEvent,
  stripeConfigured,
  verifyStripeSignature,
} from "@/server/integrations/stripe";
import { scopedRoute } from "@/server/lib/tenant/context";

export const POST = scopedRoute(async function POST(request: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: { code: "INTEGRATION_REQUIRED", message: "Stripe is not connected" } },
      { status: 503 },
    );
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: "INTEGRATION_REQUIRED", message: "Set STRIPE_WEBHOOK_SECRET to accept Stripe webhooks" } },
      { status: 503 },
    );
  }
  const body = await request.text();
  const header = request.headers.get("stripe-signature");
  if (!header || !verifyStripeSignature(body, header, secret)) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Invalid Stripe signature" } }, { status: 401 });
  }
  const event = JSON.parse(body) as Parameters<typeof paidInvoiceFromStripeEvent>[0];
  const paid = paidInvoiceFromStripeEvent(event);
  if (!paid) return NextResponse.json({ data: { ignored: true } });
  const payment = await runAsInvoiceCompany(paid.invoiceId, async (actor) => {
    const invoice = await getBillingService().getInvoice(actor, paid.invoiceId);
    // A settlement in another currency is not booked against this invoice; treat it like any other ignored event.
    if (paid.currency.toLowerCase() !== invoice.currency.toLowerCase()) return null;
    return getBillingService().recordPayment(actor, {
      invoiceId: paid.invoiceId,
      amount: paid.amount,
      method: "CARD",
      reference: paid.reference,
      paidOn: paid.paidOn,
      requestKey: `stripe:${paid.reference}`,
    });
  });
  if (!payment) return NextResponse.json({ data: { ignored: true } });
  return NextResponse.json({ data: { payment } });
});
