import { describe, expect, it } from "vitest";
import { checkProductionEnv } from "./env";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@db.example.com:5432/dealflow?sslmode=require",
  APP_URL: "https://app.dealflow.example",
  RESEND_API_KEY: "re_x",
  MAIL_FROM: "DealFlow360 <noreply@mail.dealflow.example>",
} as NodeJS.ProcessEnv;

describe("checkProductionEnv", () => {
  it("accepts a complete production configuration", () => {
    expect(checkProductionEnv(good)).toEqual({ errors: [], warnings: [] });
  });

  it("requires a database and the public app URL", () => {
    const { errors } = checkProductionEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(errors).toHaveLength(2);
  });

  it("rejects local-only switches, a short cron secret, and Resend without a sender", () => {
    const { errors } = checkProductionEnv({
      ...good,
      DEALFLOW_ADAPTER: "development",
      DEALFLOW_DEV_IMPERSONATION: "1",
      CRON_SECRET: "short",
      MAIL_FROM: undefined,
    });
    expect(errors).toHaveLength(4);
  });

  it("warns about demo credentials, open sign-up, plain http and unencrypted remote databases", () => {
    const { errors, warnings } = checkProductionEnv({
      ...good,
      APP_URL: "http://app.example",
      DATABASE_URL: "postgresql://u:p@db.example.com:5432/dealflow",
      DEALFLOW_DEMO_MODE: "1",
      DEALFLOW_PUBLIC_SIGNUP: "1",
    });
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(4);
  });
});
