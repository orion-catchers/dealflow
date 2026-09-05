let portalCache: unknown = null;

export function readPortalCache<T>(): T | null {
  return (portalCache as T | null) ?? null;
}

export function rememberPortal(data: unknown): void {
  portalCache = data;
}

export function clearPortalCache(): void {
  portalCache = null;
}
