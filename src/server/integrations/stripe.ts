import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiFailure } from "@/lib/api/respond";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function appOrigin(requestUrl: string): string {
  return (process.env.APP_URL ?? new URL(requestUrl).origin).replace(/\/$/, "");
}

function formHeaders(): Record<string, string> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ApiFailure("INVALID_INPUT", "Stripe is not connected");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

export async function createCheckoutSession(input: {
  invoiceId: string;
  amount: string;
  currency: string;
  origin: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const paise = Math.round(Number(input.amount) * 100);
  if (!Number.isFinite(paise) || paise < 1) throw new ApiFailure("INVALID_INPUT", "amount must be a positive money string");
  const currency = (input.currency || "inr").toLowerCase();
  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${input.origin}/api/payments/stripe/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/invoices/${encodeURIComponent(input.invoiceId)}?stripe=cancelled`,
    client_reference_id: input.invoiceId,
    "metadata[invoiceId]": input.invoiceId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(paise),
    "line_items[0][price_data][product_data][name]": `DealFlow360 invoice ${input.invoiceId}`,
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: formHeaders(),
    body,
  });
  const json = (await response.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !json.url || !json.id) {
    throw new ApiFailure("INVALID_INPUT", json.error?.message ?? "Stripe rejected the checkout session");
  }
  return { checkoutUrl: json.url, sessionId: json.id };
}

export async function retrieveCheckoutSession(sessionId: string): Promise<{
  paid: boolean;
  invoiceId?: string;
  amount: string;
  paymentRef: string;
}> {
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: formHeaders(),
  });
  const json = (await response.json()) as {
    id?: string;
    payment_status?: string;
    amount_total?: number;
    payment_intent?: string;
    metadata?: { invoiceId?: string };
    client_reference_id?: string;
    error?: { message?: string };
  };
  if (!response.ok) throw new ApiFailure("INVALID_INPUT", json.error?.message ?? "Stripe session was not found");
  const amount = ((json.amount_total ?? 0) / 100).toFixed(2);
  return {
    paid: json.payment_status === "paid",
    invoiceId: json.metadata?.invoiceId ?? json.client_reference_id,
    amount,
    paymentRef: typeof json.payment_intent === "string" && json.payment_intent ? json.payment_intent : json.id ?? sessionId,
  };
}

/** Stripe-Signature: t=timestamp,v1=hex HMAC of `${t}.${rawBody}`. */
export function verifyStripeSignature(payload: string, header: string, secret: string, toleranceSec = 300): boolean {
  const timestamp = header
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = header
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return signatures.some((sig) => {
    try {
      const got = Buffer.from(sig, "hex");
      return got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf);
    } catch {
      return false;
    }
  });
}

export function paidInvoiceFromStripeEvent(event: {
  type?: string;
  data?: {
    object?: {
      id?: string;
      object?: string;
      payment_status?: string;
      amount_received?: number;
      amount_total?: number;
      payment_intent?: string;
      metadata?: { invoiceId?: string };
      client_reference_id?: string;
    };
  };
}): { invoiceId: string; amount: string; reference: string } | null {
  const obj = event.data?.object;
  if (!obj) return null;
  if (event.type === "checkout.session.completed") {
    if (obj.payment_status && obj.payment_status !== "paid") return null;
    const invoiceId = obj.metadata?.invoiceId ?? obj.client_reference_id;
    if (!invoiceId) return null;
    return {
      invoiceId,
      amount: ((obj.amount_total ?? 0) / 100).toFixed(2),
      reference: (typeof obj.payment_intent === "string" && obj.payment_intent) || obj.id || invoiceId,
    };
  }
  if (event.type === "payment_intent.succeeded") {
    const invoiceId = obj.metadata?.invoiceId;
    if (!invoiceId) return null;
    return {
      invoiceId,
      amount: ((obj.amount_received ?? 0) / 100).toFixed(2),
      reference: obj.id ?? invoiceId,
    };
  }
  return null;
}
