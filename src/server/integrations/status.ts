export function integrationFlags() {
  return {
    database: Boolean(process.env.DATABASE_URL),
    sessionSecret: Boolean(process.env.SESSION_SECRET),
    email: Boolean(process.env.RESEND_API_KEY || process.env.MAIL_WEBHOOK_URL),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    stripePublishable: Boolean(process.env.STRIPE_PUBLISHABLE_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    googleSso: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    cron: Boolean(process.env.CRON_SECRET),
    fxOverride: Boolean(process.env.DEALFLOW_FX_JSON),
    carrier: Boolean(process.env.CARRIER_QUOTE_URL),
  };
}

export const ENV_KEYS = {
  required: ["DATABASE_URL", "SESSION_SECRET"] as const,
  optional: [
    "APP_URL",
    "RESEND_API_KEY",
    "MAIL_FROM",
    "MAIL_WEBHOOK_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "CRON_SECRET",
    "JOBS_ACTOR_EMAIL",
    "DEALFLOW_FX_JSON",
    "CARRIER_QUOTE_URL",
    "CARRIER_API_KEY",
  ] as const,
};
