import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { assertPostOrigin, postedOrigin, sameOrigin } from "./origin";

function headers(map: Record<string, string>) {
  return { get(name: string) { return map[name] ?? map[name.toLowerCase()] ?? null; } };
}

describe("origin guard", () => {
  it("accepts loopback aliases in development and rejects foreign origins", () => {
    const h = headers({ host: "127.0.0.1:3000" });
    expect(sameOrigin("http://localhost:3000/api/auth/login", h, "http://127.0.0.1:3000")).toBe(true);
    expect(sameOrigin("http://127.0.0.1:3000/api/auth/login", h, "http://localhost:3000")).toBe(true);
    expect(sameOrigin("http://127.0.0.1:3000/api/auth/login", h, "http://evil.example")).toBe(false);
    expect(sameOrigin("https://127.0.0.1:3000/api/auth/login", h, "http://127.0.0.1:3000")).toBe(false);
    expect(sameOrigin("http://127.0.0.1:3000/api/auth/login", h, "http://127.0.0.1:3001")).toBe(false);
  });

  it("reads Origin and Referer", () => {
    expect(postedOrigin(headers({ origin: "http://evil.example" }))).toBe("http://evil.example");
    expect(postedOrigin(headers({ referer: "http://localhost:3000/login" }))).toBe("http://localhost:3000");
  });

  it("rejects mismatched POST Origin", () => {
    expect(() =>
      assertPostOrigin("http://127.0.0.1:3000/api/auth/login", headers({ host: "127.0.0.1:3000", origin: "http://evil.example" }), "POST"),
    ).toThrow(AppError);
  });

  it("rejects cross-site fetch metadata", () => {
    expect(() =>
      assertPostOrigin("http://127.0.0.1:3000/api/actions", headers({ host: "127.0.0.1:3000", "sec-fetch-site": "cross-site" }), "POST"),
    ).toThrow(AppError);
  });

  it("allows GET without Origin", () => {
    expect(() => assertPostOrigin("http://127.0.0.1:3000/api/workspace", headers({ host: "127.0.0.1:3000" }), "GET")).not.toThrow();
  });
});
