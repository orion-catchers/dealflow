import { NextResponse } from "next/server";
import { prisma } from "@/server/lib/db";
import { getBillingService } from "@/server/billing/live";
import type { Actor } from "@/contracts/harsh";
import { appOrigin, retrieveCheckoutSession, stripeConfigured } from "@/server/integrations/stripe";

async function financeActor(): Promise<Actor> {
  const user = await prisma.user.findFirst({
    where: { role: { in: ["FINANCE", "ADMIN"] }, status: "ACTIVE" },
    include: { memberships: true },
  });
  if (!user) throw new Error("No FINANCE/ADMIN user to record Stripe payment");
  return { id: user.id, role: user.role, active: true, customerId: user.memberships[0]?.customerId };
}

/** After Stripe Checkout: record the books payment using STRIPE_SECRET_KEY (webhook optional). */
export async function GET(request: Request) {
  const origin = appOrigin(request.url);
  if (!stripeConfigured()) {
    return NextResponse.redirect(`${origin}/invoices?stripe=not_connected`);
  }
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return NextResponse.redirect(`${origin}/invoices?stripe=missing_session`);
  try {
    const session = await retrieveCheckoutSession(sessionId);
    if (!session.paid || !session.invoiceId) {
      return NextResponse.redirect(`${origin}/invoices?stripe=unpaid`);
    }
    const actor = await financeActor();
    await getBillingService().recordPayment(actor, {
      invoiceId: session.invoiceId,
      amount: session.amount,
      method: "CARD",
      reference: session.paymentRef,
      paidOn: new Date().toISOString().slice(0, 10),
      requestKey: `stripe:${session.paymentRef}`,
    });
    return NextResponse.redirect(`${origin}/invoices/${session.invoiceId}?stripe=paid`);
  } catch {
    return NextResponse.redirect(`${origin}/invoices?stripe=failed`);
  }
}
