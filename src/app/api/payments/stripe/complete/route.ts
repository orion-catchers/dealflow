import { NextResponse } from "next/server";
import { getBillingService } from "@/server/billing/live";
import { runAsInvoiceCompany } from "@/server/billing/system-actor";
import { appOrigin, retrieveCheckoutSession, stripeConfigured } from "@/server/integrations/stripe";
import { scopedRoute } from "@/server/lib/tenant/context";

/** After Stripe Checkout: record the books payment using STRIPE_SECRET_KEY (webhook optional). */
export const GET = scopedRoute(async function GET(request: Request) {
  const origin = appOrigin(request.url);
  if (!stripeConfigured()) {
    return NextResponse.redirect(`${origin}/invoices?stripe=not_connected`);
  }
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return NextResponse.redirect(`${origin}/invoices?stripe=missing_session`);
  try {
    const session = await retrieveCheckoutSession(sessionId);
    if (!session.paid || !session.invoiceId || !session.paidOn) {
      return NextResponse.redirect(`${origin}/invoices?stripe=unpaid`);
    }
    const invoiceId = session.invoiceId;
    const paidOn = session.paidOn;
    const recorded = await runAsInvoiceCompany(invoiceId, async (actor) => {
      const invoice = await getBillingService().getInvoice(actor, invoiceId);
      // A settlement in another currency is not booked; respond like the other unusable sessions.
      if (session.currency?.toLowerCase() !== invoice.currency.toLowerCase()) return false;
      await getBillingService().recordPayment(actor, {
        invoiceId,
        amount: session.amount,
        method: "CARD",
        reference: session.paymentRef,
        paidOn,
        requestKey: `stripe:${session.paymentRef}`,
      });
      return true;
    });
    if (!recorded) return NextResponse.redirect(`${origin}/invoices?stripe=unpaid`);
    return NextResponse.redirect(`${origin}/invoices/${invoiceId}?stripe=paid`);
  } catch {
    return NextResponse.redirect(`${origin}/invoices?stripe=failed`);
  }
});
