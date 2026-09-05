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
            const result = await api<{ checkoutUrl?: string; sessionId?: string }>("payments/checkout", {
              invoiceId,
              amount,
              currency,
            });
            if (result.checkoutUrl) {
              window.location.assign(result.checkoutUrl);
              return;
            }
            onNotice("Stripe did not return a checkout URL.");
          } catch (reason) {
            onNotice(reason instanceof Error ? reason.message : "Card checkout is not connected");
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      {busy ? "Opening Stripe…" : "Pay with card (Stripe)"}
    </Button>
  );
}
