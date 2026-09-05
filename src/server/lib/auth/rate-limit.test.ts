import { describe, expect, it } from "vitest";
import { ApiFailure } from "@/lib/api/respond";
import { LoginRateLimiter, MAX_FAILURES, WINDOW_MS } from "./rate-limit";

function assertAllowed(limiter: LoginRateLimiter, key: string): ApiFailure {
  try {
    limiter.assertAllowed(key);
  } catch (e) {
    if (e instanceof ApiFailure) return e;
    throw e;
  }
  throw new Error("expected ApiFailure");
}

describe("LoginRateLimiter", () => {
  it("allows attempts below the failure threshold", () => {
    const t = 0;
    const limiter = new LoginRateLimiter({ now: () => t });
    for (let i = 0; i < MAX_FAILURES - 1; i++) limiter.recordFailure("user@example.test");
    expect(() => limiter.assertAllowed("user@example.test")).not.toThrow();
  });

  it("blocks once the failure threshold is reached and reports retry time", () => {
    const t = 0;
    const limiter = new LoginRateLimiter({ now: () => t });
    for (let i = 0; i < MAX_FAILURES; i++) limiter.recordFailure("user@example.test");
    const err = assertAllowed(limiter, "user@example.test");
    expect(err.code).toBe("UNAUTHENTICATED");
    expect(err.details).toEqual({ retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) });
  });

  it("unblocks after the window passes", () => {
    let t = 0;
    const limiter = new LoginRateLimiter({ now: () => t });
    for (let i = 0; i < MAX_FAILURES; i++) limiter.recordFailure("user@example.test");
    t += WINDOW_MS + 1;
    expect(() => limiter.assertAllowed("user@example.test")).not.toThrow();
  });

  it("a successful login clears prior failures", () => {
    const t = 0;
    const limiter = new LoginRateLimiter({ now: () => t });
    for (let i = 0; i < MAX_FAILURES - 1; i++) limiter.recordFailure("user@example.test");
    limiter.recordSuccess("user@example.test");
    for (let i = 0; i < MAX_FAILURES - 1; i++) limiter.recordFailure("user@example.test");
    expect(() => limiter.assertAllowed("user@example.test")).not.toThrow();
  });

  it("tracks keys independently", () => {
    const t = 0;
    const limiter = new LoginRateLimiter({ now: () => t });
    for (let i = 0; i < MAX_FAILURES; i++) limiter.recordFailure("a@example.test");
    expect(() => limiter.assertAllowed("b@example.test")).not.toThrow();
  });
});
