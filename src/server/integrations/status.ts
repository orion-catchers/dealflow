import { demoModeEnabled } from "@/server/config/demo";

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
    "DEALFLOW_FX_JSON",
    "CARRIER_QUOTE_URL",
    "CARRIER_API_KEY",
  ] as const,
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  SALES_REP: "Rep",
  SALES_MANAGER: "Manager",
  FINANCE: "Finance",
  CUSTOMER: "Customer",
};

/**
 * Unauthenticated configuration for the entry pages. Seeded demo credentials are only included in demo mode and are
 * loaded from the fixtures on demand, so a production build never ships them to the browser.
 */
export async function publicConfig() {
  const flags = integrationFlags();
  const { publicSignupEnabled } = await import("@/server/tenancy/workspace");
  const demoAccounts = demoModeEnabled()
    ? (await import("@/fixtures/ruchir")).ruchirFixtures.users
        .filter((user) => user.status === "ACTIVE")
        .map((user) => {
          const first = user.name.split(" ")[0];
          const org = user.email.split("@")[1]?.split(".")[0] ?? "";
          const who = user.role === "CUSTOMER" ? `${org.charAt(0).toUpperCase()}${org.slice(1)} (${first})` : first;
          return { label: `${ROLE_LABEL[user.role] ?? user.role} · ${who}`, email: user.email, password: user.devPassword };
        })
    : [];
  const { developmentEnabled } = await import("@/server/adapters");
  return {
    mode: developmentEnabled() ? "DEV FIXTURE" : flags.database ? "LIVE" : "NOT CONNECTED",
    googleSso: flags.googleSso,
    email: flags.email,
    stripe: flags.stripe,
    workspaceSignup: publicSignupEnabled(),
    demoAccounts,
  };
}
