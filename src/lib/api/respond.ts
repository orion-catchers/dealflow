/**
 * Shared response envelope helpers (blueprint §7): `{data}` on success,
 * `{error:{code,message,details?}}` on failure with the agreed HTTP statuses.
 */
import { NextResponse } from "next/server";
import type { ApiErrorCode } from "@/contracts/harsh";

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_INPUT: 422,
};

export class ApiFailure extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function fail(code: ApiErrorCode, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status: STATUS[code] });
}

/** Wrap a route handler so thrown ApiFailure / ZodError become envelope errors. */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return ok(data);
  } catch (e) {
    if (e instanceof ApiFailure) return fail(e.code, e.message, e.details);
    if (e && typeof e === "object" && "issues" in e) {
      return fail("INVALID_INPUT", "Invalid input", (e as { issues: unknown }).issues);
    }
    console.error(e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "Unexpected server error" } }, { status: 500 });
  }
}
