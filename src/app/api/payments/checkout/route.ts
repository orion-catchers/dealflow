import { NextResponse } from "next/server";
import { ApiFailure, handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { readJson } from "@/features/catalog/api";

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: { code: "INTEGRATION_REQUIRED", message: "Set STRIPE_SECRET_KEY to collect card payments" } },
      { status: 503 },
    );
  }
  return handle(async () => {
    const actor = await getAuthorizedActor(request);
    const body = (await readJson(request)) as { invoiceId?: string; amount?: string; currency?: string };
    if (!body.invoiceId || !body.amount) throw new ApiFailure("INVALID_INPUT", "invoiceId and amount are required");
    const paise = Math.round(Number(body.amount) * 100);
    if (!Number.isFinite(paise) || paise < 1) throw new ApiFailure("INVALID_INPUT", "amount must be a positive money string");
    const response = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: String(paise),
        currency: (body.currency ?? "inr").toLowerCase(),
        "metadata[invoiceId]": body.invoiceId,
        "metadata[actorId]": actor.id,
      }),
    });
    const json = (await response.json()) as { id?: string; client_secret?: string; error?: { message?: string } };
    if (!response.ok) throw new ApiFailure("INVALID_INPUT", json.error?.message ?? "Stripe rejected the payment intent");
    return { paymentIntentId: json.id, clientSecret: json.client_secret, invoiceId: body.invoiceId };
  });
}
