import { afterEach, describe, expect, it } from "vitest";
import { GET as googleStart } from "@/app/api/auth/sso/google/route";
import { POST as jobsRun } from "@/app/api/jobs/run/route";
import { POST as stripeCheckout } from "@/app/api/payments/checkout/route";
import { GET as publicIntegrations } from "@/app/api/integrations/public/route";
import { integrationFlags } from "./status";

describe("optional vendor fail-closed", () => {
  const previous = {
    CRON_SECRET: process.env.CRON_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  };

  afterEach(() => {
    restore("CRON_SECRET", previous.CRON_SECRET);
    restore("STRIPE_SECRET_KEY", previous.STRIPE_SECRET_KEY);
    restore("GOOGLE_CLIENT_ID", previous.GOOGLE_CLIENT_ID);
    restore("GOOGLE_CLIENT_SECRET", previous.GOOGLE_CLIENT_SECRET);
  });

  it("jobs return 503 without CRON_SECRET", async () => {
    delete process.env.CRON_SECRET;
    const res = await jobsRun(new Request("http://localhost/api/jobs/run", { method: "POST" }));
    expect(res.status).toBe(503);
  });

  it("jobs return 401 with the wrong bearer token", async () => {
    process.env.CRON_SECRET = "expected-secret";
    const res = await jobsRun(
      new Request("http://localhost/api/jobs/run", {
        method: "POST",
        headers: { authorization: "Bearer other" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("checkout returns 503 without STRIPE_SECRET_KEY", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await stripeCheckout(
      new Request("http://localhost/api/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ invoiceId: "inv_1", amount: "10.00" }),
      }),
    );
    expect(res.status).toBe(503);
  });

  it("google SSO start returns 503 without client credentials", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const res = await googleStart(new Request("http://localhost/api/auth/sso/google"));
    expect(res.status).toBe(503);
  });

  it("public integration flags do not require a session", async () => {
    const res = await publicIntegrations();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data?: { googleSso?: boolean } };
    expect(typeof body.data?.googleSso).toBe("boolean");
  });

  it("reports required vs optional env keys", () => {
    const flags = integrationFlags();
    expect(typeof flags.database).toBe("boolean");
    expect(typeof flags.stripe).toBe("boolean");
  });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
