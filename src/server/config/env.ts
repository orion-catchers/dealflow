/**
 * Production configuration check, run once at server start (src/instrumentation.ts). Errors stop the server so a
 * misconfigured host fails at deploy time instead of serving half-working pages; warnings are logged.
 */
export type EnvReport = { errors: string[]; warnings: string[] };

export function checkProductionEnv(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!env.DATABASE_URL) errors.push("DATABASE_URL is required.");
  else if (!/sslmode=(require|verify-ca|verify-full)/.test(env.DATABASE_URL) && !/@(localhost|127\.0\.0\.1|db|postgres)[:/]/.test(env.DATABASE_URL)) {
    warnings.push("DATABASE_URL points at a remote host without sslmode=require; database traffic may be unencrypted.");
  }

  if (!env.APP_URL) errors.push("APP_URL is required (invite links, password resets, SSO and Stripe return URLs).");
  else if (!env.APP_URL.startsWith("https://")) warnings.push("APP_URL is not https://; session cookies are Secure-only in production.");

  if (env.DEALFLOW_ADAPTER === "development") errors.push("DEALFLOW_ADAPTER=development is a local fixture switch; unset it in production.");
  if (env.DEALFLOW_DEV_IMPERSONATION === "1") errors.push("DEALFLOW_DEV_IMPERSONATION=1 is a local-only switch; unset it in production.");

  if (env.CRON_SECRET !== undefined && env.CRON_SECRET.length < 24) errors.push("CRON_SECRET must be at least 24 characters.");
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) {
    warnings.push("STRIPE_SECRET_KEY is set without STRIPE_WEBHOOK_SECRET; card payments rely on the return URL only.");
  }
  if (env.RESEND_API_KEY && !env.MAIL_FROM) errors.push("MAIL_FROM is required with RESEND_API_KEY (a sender on a domain verified in Resend).");
  if (!env.RESEND_API_KEY && !env.MAIL_WEBHOOK_URL) {
    warnings.push("No email provider (RESEND_API_KEY or MAIL_WEBHOOK_URL); admins must share invite links by hand.");
  }
  if (env.DEALFLOW_DEMO_MODE === "1") warnings.push("DEALFLOW_DEMO_MODE=1 lists seeded demo passwords on the sign-in page.");
  if (env.DEALFLOW_PUBLIC_SIGNUP === "1") warnings.push("DEALFLOW_PUBLIC_SIGNUP=1: anyone can create a workspace.");

  return { errors, warnings };
}
