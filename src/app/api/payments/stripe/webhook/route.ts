import { NextResponse } from "next/server";
import { prisma } from "@/server/lib/db";
import { getBillingService } from "@/server/billing/live";
import type { Actor } from "@/contracts/harsh";

async function financeActor(): Promise<Actor> {
  const user = await prisma.user.findFirst({
    where: { role: { in: ["FINANCE", "ADMIN"] }, status: "ACTIVE" },
    include: { memberships: true },
  });
  if (!user) throw new Error("No FINANCE/ADMIN user for Stripe webhook");
  return { id: user.id, role: user.role, active: true, customerId: user.memberships[0]?.customerId };
}

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: { code: "INTEGRATION_REQUIRED", message: "Stripe is not connected" } },
      { status: 503 },
    );
  }
  const body = await request.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secret) {
    const header = request.headers.get("stripe-signature");
    if (!header) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Missing Stripe signature" } }, { status: 401 });
  }
  const event = JSON.parse(body) as {
    type?: string;
    data?: { object?: { id?: string; amount_received?: number; metadata?: { invoiceId?: string } } };
  };
  if (event.type !== "payment_intent.succeeded") return NextResponse.json({ data: { ignored: true } });
  const intent = event.data?.object;
  const invoiceId = intent?.metadata?.invoiceId;
  const amount = ((intent?.amount_received ?? 0) / 100).toFixed(2);
  if (!invoiceId) return NextResponse.json({ data: { ignored: true } });
  const actor = await financeActor();
  const payment = await getBillingService().recordPayment(actor, {
    invoiceId,
    amount,
    method: "CARD",
    reference: intent?.id ?? `stripe-${Date.now()}`,
    paidOn: new Date().toISOString().slice(0, 10),
    requestKey: `stripe:${intent?.id ?? invoiceId}`,
  });
  return NextResponse.json({ data: { payment } });
}
