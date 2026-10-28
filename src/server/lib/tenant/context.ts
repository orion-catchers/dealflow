/**
 * Tenant context for the current request or job.
 *
 * Every API request runs inside `withTenantScope`. Authentication binds the
 * signed-in user's company with `bindTenant`, and from then on the tenant-scoped
 * Prisma client (src/server/lib/db/tenant.ts) filters every query by that
 * company. Code that legitimately spans companies (seed, migrations of data,
 * the cron runner, signed webhooks before they know the tenant) must say so with
 * `runAsSystem`. Anything else that reaches the database without a scope fails
 * closed instead of reading every company's rows.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type TenantScope = {
  /** Company bound for this request; undefined until authentication succeeds. */
  companyId?: string;
  /** Explicit cross-company access (seed, cron fan-out, webhook lookup). */
  system: boolean;
};

const storage = new AsyncLocalStorage<TenantScope>();

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

/**
 * Run `fn` and await its result inside `scope`. Prisma queries are lazy (they start when awaited), so returning one
 * unawaited from `storage.run` would run it after the scope ended; awaiting here keeps it inside.
 */
function runIn<T>(scope: TenantScope, fn: () => Promise<T>): Promise<T> {
  return storage.run(scope, async () => await fn());
}

/** Run a request handler with an empty scope that authentication later binds. */
export async function withTenantScope<T>(fn: () => Promise<T>): Promise<T> {
  if (storage.getStore()) return await fn();
  return runIn({ system: false }, fn);
}

/** Bind the authenticated company to the current request. A request never switches company. */
export function bindTenant(companyId: string): void {
  const scope = storage.getStore();
  if (!scope) throw new TenantScopeError("bindTenant called outside a tenant scope");
  if (scope.system) return;
  if (scope.companyId && scope.companyId !== companyId) {
    throw new TenantScopeError("A request cannot act for two companies");
  }
  scope.companyId = companyId;
}

/** Run work for exactly one company, e.g. one tenant's slice of a cron job. */
export function runForCompany<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return runIn({ companyId, system: false }, fn);
}

/** Run work that deliberately spans companies. Keep these call sites few and reviewed. */
export function runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
  return runIn({ system: true }, fn);
}

export function currentTenantScope(): TenantScope | undefined {
  return storage.getStore();
}

/** The bound company, or a TenantScopeError when none is bound. */
export function requireCompanyId(): string {
  const companyId = storage.getStore()?.companyId;
  if (!companyId) throw new TenantScopeError("No company is bound to this request");
  return companyId;
}

/** Wrap a route handler that does not use `handle()` so it runs in a tenant scope too. */
export function scopedRoute<A extends unknown[], R>(handler: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args: A) => withTenantScope(() => handler(...args));
}
