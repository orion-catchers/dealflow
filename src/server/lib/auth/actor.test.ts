import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFailure } from "@/lib/api/respond";
import { getActor, getSessionUser } from "./actor";
import { getAuthorizedActor } from "./permissions";

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

  it("dev x-dev-actor resolves fixture actor only with DEALFLOW_DEV_IMPERSONATION=1", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEALFLOW_DEV_IMPERSONATION", "1");
    const request = new Request("http://localhost/api/test", {
      headers: { "x-dev-actor": "admin-dev" },
    });
    const actor = await getActor(request);
    expect(actor).toEqual({ id: "admin-dev", role: "ADMIN", active: true });
  });

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
