import { runForCompany, withTenantScope } from "./context";

/** Company the seed creates for the Nexa demo tenant. */
export const DEMO_COMPANY_ID = "company-nexa";

/** Run a database-backed test body the way a signed-in request for the demo company runs. */
export function inDemoCompany(fn: () => Promise<void>): () => Promise<void> {
  return () => runForCompany(DEMO_COMPANY_ID, fn);
}

/** Run a test body like a fresh request, before authentication binds a company. */
export function inRequest(fn: () => Promise<void>): () => Promise<void> {
  return () => withTenantScope(fn);
}
