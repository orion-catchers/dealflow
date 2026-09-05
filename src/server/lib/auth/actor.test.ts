import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFailure } from "@/lib/api/respond";
import { getActor } from "./actor";

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
  });

  it("production without cookie throws UNAUTHENTICATED", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new Request("http://localhost/api/test");
    const err = await failure(getActor(request));
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  it("dev with x-dev-actor admin-dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEALFLOW_ADAPTER", "development");
    const request = new Request("http://localhost/api/test", {
      headers: { "x-dev-actor": "admin-dev" },
    });
    const actor = await getActor(request);
    expect(actor).toEqual({ id: "admin-dev", role: "ADMIN", active: true });
  });
});
