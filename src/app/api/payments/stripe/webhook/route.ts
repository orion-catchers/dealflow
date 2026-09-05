import { NextResponse } from "next/server";
import { prisma } from "@/server/lib/db";
import { getBillingService } from "@/server/billing/live";
import type { Actor } from "@/contracts/harsh";
import {
  paidInvoiceFromStripeEvent,
  stripeConfigured,
  verifyStripeSignature,
} from "@/server/integrations/stripe";

async function financeActor(): Promise<Actor> {
  const user = await prisma.user.findFirst({
    where: { role: { in: ["FINANCE", "ADMIN"] }, status: "ACTIVE" },
    include: { memberships: true },
  });
  if (!user) throw new Error("No FINANCE/ADMIN user for Stripe webhook");
  return { id: user.id, role: user.role, active: true, customerId: user.memberships[0]?.customerId };
}

export async function POST(request: Request) {
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
  const actor = await financeActor();
  const payment = await getBillingService().recordPayment(actor, {
    invoiceId: paid.invoiceId,
    amount: paid.amount,
    method: "CARD",
    reference: paid.reference,
    paidOn: new Date().toISOString().slice(0, 10),
    requestKey: `stripe:${paid.reference}`,
  });
  return NextResponse.json({ data: { payment } });
}
