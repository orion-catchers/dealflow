import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFailure } from "@/lib/api/respond";
import { customerIdForUser } from "./actor-helpers";
import { getActor, getSessionUser } from "./actor";
import { getAuthorizedActor } from "./permissions";
import { DEMO_COMPANY_ID, inRequest } from "@/server/lib/tenant/testing";

describe("customerIdForUser", () => {
  const customer = { id: "user-neha", email: "neha@acme.example", name: "Neha", role: "CUSTOMER" as const, status: "ACTIVE" as const };

  it("gives no portal customer once the membership is revoked, even though the email is mapped", () => {
    expect(customerIdForUser({ ...customer, memberships: [] })).toBeUndefined();
  });

  it("keeps the mapped customer for a user who still has a membership", () => {
    expect(customerIdForUser({ ...customer, memberships: [{ customerId: "cust-db-acme" }] })).toBe("customer-acme");
  });
});

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiFailure) return e;
    throw e;
  }
  throw new Error("expected ApiFailure");
}

describe("getActor", () => {
  const env = process.env.NODE_ENV;

  afterEach(() => {
    vi.stubEnv("NODE_ENV", env);
    vi.unstubAllEnvs();
  });

  it("production without cookie throws UNAUTHENTICATED", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new Request("http://localhost/api/test");
    const err = await failure(getActor(request));
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  it("dev x-dev-actor header without opt-in flag throws UNAUTHENTICATED", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.DEALFLOW_DEV_IMPERSONATION;
    const request = new Request("http://localhost/api/test", {
      headers: { "x-dev-actor": "admin-dev" },
    });
    const err = await failure(getActor(request));
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  // Impersonation binds the company of the seeded user with the fixture's email, so it needs the seeded database.
  it.skipIf(!process.env.DATABASE_URL)("dev x-dev-actor resolves fixture actor only with DEALFLOW_DEV_IMPERSONATION=1", inRequest(async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEALFLOW_DEV_IMPERSONATION", "1");
    const request = new Request("http://localhost/api/test", {
      headers: { "x-dev-actor": "admin-dev" },
    });
    const actor = await getActor(request);
    expect(actor).toEqual({ id: "admin-dev", role: "ADMIN", active: true, companyId: DEMO_COMPANY_ID });
  }));

  it("unknown fixture actor id throws even with opt-in", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEALFLOW_DEV_IMPERSONATION", "1");
    const request = new Request("http://localhost/api/test", {
      headers: { "x-dev-actor": "no-such-user" },
    });
    const err = await failure(getActor(request));
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  it("getAuthorizedActor rejects sessionless requests before the role matrix", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = new Request("http://localhost/api/products", {
      headers: { "x-dev-actor": "admin-dev" },
    });
    const err = await failure(getAuthorizedActor(request));
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  it("getSessionUser rejects sessionless requests without opt-in", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = new Request("http://localhost/api/auth/me");
    const err = await failure(getSessionUser(request));
    expect(err.code).toBe("UNAUTHENTICATED");
  });
});
