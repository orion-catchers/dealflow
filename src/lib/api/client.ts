"use client";
/**
 * Browser-side fetch helper for Harsh's screens. Unwraps the `{data}` / `{error}`
 * envelope and throws `ApiClientError` on failure so UIs show visible failed saves.
 *
 * Session cookie is the LIVE credential. `x-dev-actor` is sent only when a
 * developer explicitly chose a fixture actor in localStorage (`dealflow.devActor`).
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

export function getDevActor(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("dealflow.devActor");
}

export function setDevActor(id: string) {
  if (typeof window !== "undefined") window.localStorage.setItem("dealflow.devActor", id);
}

function impersonationHeaders(): Record<string, string> {
  const actor = getDevActor();
  return actor ? { "x-dev-actor": actor } : {};
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
        ...impersonationHeaders(),
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
