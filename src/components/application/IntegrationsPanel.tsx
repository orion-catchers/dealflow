"use client";

import { useEffect, useState } from "react";
import { api, Section, StatusBadge } from "./shared";

type Flags = {
  database: boolean;
  sessionSecret: boolean;
  email: boolean;
  stripe: boolean;
  stripePublishable: boolean;
  stripeWebhook: boolean;
  googleSso: boolean;
  cron: boolean;
  fxOverride: boolean;
  carrier: boolean;
};

export function IntegrationsPanel() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ flags: Flags }>("integrations/status")
      .then((data) => setFlags(data.flags))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load integration status"));
  }, []);

  return (
    <Section title="Connected services">
      <p>Optional vendors stay 503 until their keys are in `.env`. Core sales, catalog, fulfillment, and billing use Postgres only.</p>
      {error ? <p className="error">{error}</p> : null}
      {flags ? (
        <dl>
          {(
            [
              ["Database", flags.database],
              ["Session secret", flags.sessionSecret],
              ["Email (Resend or webhook)", flags.email],
              ["Stripe charges", flags.stripe],
              ["Stripe publishable key", flags.stripePublishable],
              ["Stripe webhook secret", flags.stripeWebhook],
              ["Google SSO", flags.googleSso],
              ["Cron secret", flags.cron],
              ["FX JSON override", flags.fxOverride],
              ["Live carrier HTTP", flags.carrier],
            ] as const
          ).map(([label, on]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <StatusBadge status={on ? "LIVE" : "NOT CONNECTED"} />
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted">Checking connected services…</p>
      )}
    </Section>
  );
}
