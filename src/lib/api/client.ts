"use client";
/**
 * Browser-side fetch helper for Harsh's screens. Unwraps the `{data}` / `{error}`
 * envelope and throws `ApiClientError` on failure so UIs show visible failed saves.
 *
 * DEV FIXTURE: sends `x-dev-actor` from localStorage (`dealflow.devActor`, default
 * `admin-dev`) until Ruchir's session cookie auth lands; then this header is ignored
 * server-side and can be removed.
 */
import type { ApiErrorCode } from "@/contracts/harsh";

export class ApiClientError extends Error {
  constructor(
    public code: ApiErrorCode | "INTERNAL" | "NETWORK",
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function getDevActor(): string {
  if (typeof window === "undefined") return "admin-dev";
  return window.localStorage.getItem("dealflow.devActor") ?? "admin-dev";
}

export function setDevActor(id: string) {
  if (typeof window !== "undefined") window.localStorage.setItem("dealflow.devActor", id);
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      credentials: "include",
      headers: {
        ...(json !== undefined ? { "content-type": "application/json" } : {}),
        "x-dev-actor": getDevActor(),
        ...(headers ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch (e) {
    throw new ApiClientError("NETWORK", (e as Error).message, 0);
  }
  const body = (await res.json().catch(() => null)) as { data?: T; error?: { code: ApiErrorCode; message: string; details?: unknown } } | null;
  if (!res.ok || !body || body.error) {
    const err = body?.error;
    throw new ApiClientError(err?.code ?? "INTERNAL", err?.message ?? `Request failed (${res.status})`, res.status, err?.details);
  }
  return body.data as T;
}

/** Stable request key per user intent (blueprint: repeat-safe writes). */
export function newRequestKey(prefix: string): string {
  const web = globalThis.crypto;
  let rnd: string;
  if (web && typeof web.randomUUID === "function") rnd = web.randomUUID();
  else if (web && typeof web.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    web.getRandomValues(bytes);
    rnd = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } else rnd = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rnd}`;
}
