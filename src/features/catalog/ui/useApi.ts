"use client";
/**
 * Small data-loading helpers for the catalog screens (16, 17, price lists, customers).
 *
 * `useApi` wraps `api<T>()` into `{ data, error, loading, reload }`; `useMutation` tracks a
 * pending write and keeps the last `ApiClientError` so dialogs can stay open with the
 * failure visible (blueprint §6: visible failed saves, no success before server OK).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Money } from "@/contracts/harsh";
import { api, ApiClientError } from "@/lib/api/client";
import { MONEY_PATTERN } from "../api";

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** GET `path` (or nothing when `path` is null) and re-run on `reload()` or when the path changes. */
export function useApi<T>(path: string | null): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) {
      setData(undefined);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(errorMessage(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/**
 * Run several GETs in parallel (e.g. rules for every price list). `paths` is joined into a
 * stable key so callers may pass a fresh array each render.
 */
export function useApiMany<T>(paths: string[] | null): AsyncState<T[]> {
  const key = paths === null ? null : paths.join("\n");
  const [data, setData] = useState<T[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(key !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (key === null) {
      setData(undefined);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const list = key === "" ? [] : key.split("\n");
    Promise.all(list.map((p) => api<T>(p)))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(errorMessage(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

export interface MutationState {
  pending: boolean;
  error: ApiClientError | null;
  /** Top-level message of the last failure (or null). */
  errorMessage: string | null;
  /** Field-level messages derived from zod issues / `{ field }` details of the last failure. */
  fieldErrors: Record<string, string>;
  run: <R>(fn: () => Promise<R>) => Promise<R | undefined>;
  reset: () => void;
}

/** Track one in-flight write. `run` resolves to `undefined` on failure and records the error. */
export function useMutation(): MutationState {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (mounted.current) setPending(false);
      return result;
    } catch (e: unknown) {
      if (mounted.current) {
        setError(e instanceof ApiClientError ? e : new ApiClientError("INTERNAL", errorMessage(e), 0));
        setPending(false);
      }
      return undefined;
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return {
    pending,
    error,
    errorMessage: error ? error.message : null,
    fieldErrors: error ? fieldErrorsFrom(error) : {},
    run,
    reset,
  };
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

/**
 * Map `ApiClientError.details` to `{ fieldPath: message }`. Handles the zod issues array
 * (`parseInput`) and the `{ field }` object used by service-level checks (tax rate, plan, SKU).
 */
export function fieldErrorsFrom(err: ApiClientError | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!err) return out;
  const d = err.details;
  if (Array.isArray(d)) {
    for (const issue of d) {
      if (!issue || typeof issue !== "object") continue;
      const rec = issue as { path?: unknown; message?: unknown };
      const path = Array.isArray(rec.path) ? rec.path.map(String).join(".") : "";
      if (!path || out[path]) continue;
      out[path] = typeof rec.message === "string" ? rec.message : "Invalid value";
    }
  } else if (d && typeof d === "object" && typeof (d as { field?: unknown }).field === "string") {
    out[(d as { field: string }).field] = err.message;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Input normalization (client mirrors the zod schemas so obvious mistakes fail before the request)
// ---------------------------------------------------------------------------

/** "50000" → "50000.00", " 12.5 " → "12.50"; returns null when not a valid money string. */
export function normalizeMoney(raw: string): Money | null {
  const s = raw.trim().replace(/,/g, "");
  if (!MONEY_PATTERN.test(s)) return null;
  return Number(s).toFixed(2);
}

export function marginPct(price: Money, cost: Money): number | null {
  const p = Number(price);
  const c = Number(cost);
  if (!Number.isFinite(p) || !Number.isFinite(c) || p <= 0) return null;
  return ((p - c) / p) * 100;
}
