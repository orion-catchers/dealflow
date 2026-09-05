"use client";

import { useState } from "react";
import { api, Button, Input, Money, StatusBadge, newId, today } from "./shared";

function moneyString(amount: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toFixed(2) : amount;
}

export function CardCheckoutButton({
  invoiceId,
  amount,
  currency,
  onNotice,
  onPaid,
}: {
  invoiceId: string;
  amount: string;
  currency: string;
  onNotice: (message: string) => void;
  onPaid?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const payable = moneyString(amount);

  async function openGateway() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ checkoutUrl?: string; sessionId?: string }>("payments/checkout", {
        invoiceId,
        amount: payable,
        currency,
      });
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      onNotice("Stripe did not return a checkout URL.");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      if (message.includes("INTEGRATION_REQUIRED") || message.includes("503")) {
        setOpen(true);
        return;
      }
      onNotice(message || "Card checkout is not connected");
    } finally {
      setBusy(false);
    }
  }

  async function payPreview() {
    const digits = cardNumber.replace(/\s/g, "");
    if (digits.length < 13 || digits.length > 19 || !/^\d+$/.test(digits)) {
      setError("Enter a valid card number to continue this Preview.");
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry.trim())) {
      setError("Expiry must be MM/YY.");
      return;
    }
    if (!/^\d{3,4}$/.test(cvc.trim())) {
      setError("Enter a 3 or 4 digit CVC.");
      return;
    }
    if (!name.trim()) {
      setError("Name on card is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("payments", {
        invoiceId,
        amount: payable,
        method: "CARD",
        reference: `CARD-PREVIEW-${digits.slice(-4)}`,
        paidOn: today(),
        requestKey: newId(),
      });
      setOpen(false);
      onNotice("Preview card payment recorded. Stripe is not connected; no live charge was made.");
      await onPaid?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payment could not be recorded");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" disabled={busy || Number(payable) <= 0} onClick={() => void openGateway()}>
        {busy && !open ? "Opening checkout…" : "Pay with card"}
      </Button>
      {open ? (
        <div className="pay-gateway" role="dialog" aria-modal="true" aria-labelledby="pay-gateway-title">
          <div className="pay-gateway__panel">
            <header className="pay-gateway__head">
              <div>
                <p className="pay-gateway__brand">DealFlow360</p>
                <h2 id="pay-gateway-title">Pay invoice</h2>
              </div>
              <StatusBadge status="NOT CONNECTED" />
            </header>
            <p className="pay-gateway__lede">
              Preview checkout. Stripe is not connected, so this page records the invoice in DealFlow360. It does not charge a card network.
            </p>
            <div className="pay-gateway__amount">
              <span>Amount due</span>
              <strong>
                <Money amount={payable} currency={currency} />
              </strong>
            </div>
            <form
              className="pay-gateway__form"
              onSubmit={(e) => {
                e.preventDefault();
                void payPreview();
              }}
            >
              <Input label="Card number" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
              <div className="pay-gateway__row">
                <Input label="Expiry" autoComplete="cc-exp" placeholder="MM/YY" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                <Input label="CVC" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={cvc} onChange={(e) => setCvc(e.target.value)} />
              </div>
              <Input label="Name on card" autoComplete="cc-name" value={name} onChange={(e) => setName(e.target.value)} />
              {error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="actions">
                <Button type="submit" disabled={busy}>
                  {busy ? "Paying…" : `Pay ${payable} ${currency}`}
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
