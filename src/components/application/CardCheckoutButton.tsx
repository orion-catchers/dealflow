"use client";

import { useState } from "react";
import { api, Button } from "./shared";

export function CardCheckoutButton({
  invoiceId,
  amount,
  currency,
  onNotice,
}: {
  invoiceId: string;
  amount: string;
  currency: string;
  onNotice: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      type="button"
      disabled={busy || Number(amount) <= 0}
      onClick={() => {
        void (async () => {
          setBusy(true);
          try {
            const result = await api<{ paymentIntentId?: string; clientSecret?: string }>("payments/checkout", {
              invoiceId,
              amount,
              currency,
            });
            onNotice(
              `Preview: Stripe PaymentIntent ${result.paymentIntentId ?? ""} created. The invoice is not marked paid until the Stripe webhook records the card payment.`,
            );
            void result.clientSecret;
          } catch (reason) {
            onNotice(reason instanceof Error ? reason.message : "Card checkout is not connected");
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      {busy ? "Starting Stripe…" : "Card checkout (Stripe)"}
    </Button>
  );
}
