import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("verify returns true for correct password", async () => {
    const stored = await hashPassword("password123");
    expect(await verifyPassword("password123", stored)).toBe(true);
  });

  it("verify returns false for wrong password", async () => {
    const stored = await hashPassword("password123");
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });
});
