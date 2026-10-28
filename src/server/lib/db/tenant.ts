/**
 * Tenant isolation for every Prisma query.
 *
 * The extension reads the request's tenant scope (src/server/lib/tenant/context.ts)
 * and, for every model a company owns:
 *   - adds the company filter to the `where` of reads, updates, and deletes;
 *   - stamps `companyId` on creates and refuses a create or update that names
 *     another company.
 * Models without their own `companyId` column are filtered through their parent
 * (a revision through its quote, a payment through its invoice, and so on).
 *
 * Raw SQL (`$queryRaw` / `$executeRaw`) is not intercepted: every raw statement
 * must carry its own company predicate or act on an id the scoped client already
 * returned. Nested `create` blocks for company-owned models must pass companyId
 * themselves; Prisma rejects the write when they forget.
 */
import { Prisma } from "@/generated/prisma/client";
import { currentTenantScope, TenantScopeError } from "@/server/lib/tenant/context";

type Where = Record<string, unknown>;

/**
 * Models with their own companyId column, each with its owning-side relation fields (those that hold a foreign key).
 * A create that sets one of these as a relation object uses Prisma's checked input, so the company is connected as a
 * relation; otherwise it is set as the companyId column. tenant.test.ts keeps this list in step with the schema.
 */
export const DIRECT_TENANT_MODELS: Record<string, readonly string[]> = {
  User: ["company", "team"],
  SalesTeam: ["company"],
  Customer: ["company", "priceList", "assignedRep", "team"],
  Category: ["company"],
  Product: ["taxRate", "company", "category", "defaultPlan"],
  Variant: ["product", "company"],
  PriceList: ["company"],
  PolicyVersion: ["company", "createdBy"],
  Deal: ["company", "customer", "rep", "team"],
  Quote: ["company", "customer", "deal", "rep", "team", "currentRevision"],
  Order: ["sourceRevision", "deal", "acceptance", "company", "customer", "rep", "team"],
  Warehouse: ["company"],
  SubscriptionPlan: ["company"],
  Subscription: ["sourceOrderLine", "company", "customer", "plan", "pendingPlan"],
  Invoice: ["company", "customer", "order", "subscription"],
  CreditNote: ["company", "customer", "sourceInvoice", "issuedBy"],
  RecommendationRule: ["company", "baseProduct", "candidateProduct"],
  HealthSettings: ["company"],
  HealthFlag: ["company", "quote", "order"],
  Task: ["company", "flag", "quote", "order", "assignee", "createdBy"],
  AuditEvent: ["company", "actor"],
  RequestKey: ["company", "actor"],
};

/** Models scoped through a parent relation. */
export const INDIRECT_TENANT_MODELS: Record<string, (companyId: string) => Where> = {
  Session: (companyId) => ({ user: { companyId } }),
  PasswordResetToken: (companyId) => ({ user: { companyId } }),
  CustomerMembership: (companyId) => ({ customer: { companyId } }),
  PriceRule: (companyId) => ({ priceList: { companyId } }),
  PolicyCeiling: (companyId) => ({ policyVersion: { companyId } }),
  PolicyChainStep: (companyId) => ({ policyVersion: { companyId } }),
  DealRevision: (companyId) => ({ quote: { companyId } }),
  DealLine: (companyId) => ({ revision: { quote: { companyId } } }),
  DealApprovalStep: (companyId) => ({ revision: { quote: { companyId } } }),
  ApprovalDecision: (companyId) => ({ revision: { quote: { companyId } } }),
  CustomerAcceptance: (companyId) => ({ revision: { quote: { companyId } } }),
  PortalMessage: (companyId) => ({ quote: { companyId } }),
  OrderLine: (companyId) => ({ order: { companyId } }),
  Stock: (companyId) => ({ warehouse: { companyId } }),
  StockReceipt: (companyId) => ({ warehouse: { companyId } }),
  Reservation: (companyId) => ({ warehouse: { companyId } }),
  Backorder: (companyId) => ({ orderLine: { order: { companyId } } }),
  Shipment: (companyId) => ({ order: { companyId } }),
  ShipmentLine: (companyId) => ({ shipment: { order: { companyId } } }),
  SubscriptionChange: (companyId) => ({ subscription: { companyId } }),
  InvoiceLine: (companyId) => ({ invoice: { companyId } }),
  Payment: (companyId) => ({ invoice: { companyId } }),
  CreditApplication: (companyId) => ({ invoice: { companyId } }),
};

/** Platform rows every tenant reads. */
export const SHARED_MODELS: ReadonlySet<string> = new Set(["TaxRate"]);

/** Identity models that sign-in reads before any company is bound. */
const PRE_AUTH_MODELS: ReadonlySet<string> = new Set(["User", "Session", "PasswordResetToken", "CustomerMembership", "Company", "TaxRate"]);

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "upsert",
]);

const CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"]);

function scopeFilter(model: string, companyId: string): Where | undefined {
  if (model === "Company") return { id: companyId };
  if (DIRECT_TENANT_MODELS[model]) return { companyId };
  return INDIRECT_TENANT_MODELS[model]?.(companyId);
}

function withScope(where: unknown, filter: Where): Where {
  const base = (where ?? {}) as Where;
  const existing = base.AND === undefined ? [] : Array.isArray(base.AND) ? base.AND : [base.AND];
  return { ...base, AND: [...existing, filter] };
}

/**
 * A write may name its company only as the plain bound id: `companyId: "<bound>"` or
 * `company: { connect: { id: "<bound>" } }`. Any other form (`{ set: … }`, `connect: { code: … }`, nested create) is
 * refused, because the database triggers cannot catch it on tables that reference nothing else.
 */
function assertSameCompany(model: string, data: unknown, companyId: string): void {
  if (!data || typeof data !== "object") return;
  const row = data as Record<string, unknown>;
  if (row.companyId !== undefined && row.companyId !== companyId) {
    throw new TenantScopeError(`${model} write names another company`);
  }
  if (row.company !== undefined) {
    const relation = row.company as { connect?: Record<string, unknown> } | null;
    const connect = relation?.connect;
    const plain =
      relation !== null && typeof relation === "object" && Object.keys(relation).length === 1 &&
      connect !== undefined && Object.keys(connect).length === 1 && connect.id === companyId;
    if (!plain) throw new TenantScopeError(`${model} write names another company`);
  }
}

function stampCompany(model: string, data: unknown, companyId: string): unknown {
  if (!data || typeof data !== "object") return data;
  assertSameCompany(model, data, companyId);
  const row = data as Record<string, unknown>;
  if (row.companyId !== undefined || row.company !== undefined) return row;
  const relations = DIRECT_TENANT_MODELS[model] ?? [];
  const checked = Object.keys(row).some((key) => relations.includes(key) && row[key] !== undefined);
  return checked ? { ...row, company: { connect: { id: companyId } } } : { ...row, companyId };
}

/** Rewrite one model operation for the bound company. Exported for unit tests. */
export function scopeArgs(model: string, operation: string, args: Record<string, unknown>, companyId: string): Record<string, unknown> {
  if (SHARED_MODELS.has(model)) return args;
  const filter = scopeFilter(model, companyId);
  if (!filter) throw new TenantScopeError(`Model ${model} has no tenant rule; add it to src/server/lib/db/tenant.ts`);
  const next: Record<string, unknown> = { ...args };
  const direct = Boolean(DIRECT_TENANT_MODELS[model]);

  if (WHERE_OPERATIONS.has(operation)) next.where = withScope(args.where, filter);

  if (direct && CREATE_OPERATIONS.has(operation)) {
    const stamp = operation === "create" ? stampCompany : stampScalar;
    next.data = Array.isArray(args.data) ? args.data.map((row) => stamp(model, row, companyId)) : stamp(model, args.data, companyId);
  }
  if (direct && operation === "upsert") {
    next.create = stampCompany(model, args.create, companyId);
    assertSameCompany(model, args.update, companyId);
  }
  if (direct && (operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn")) {
    assertSameCompany(model, args.data, companyId);
  }
  return next;
}

/** createMany only takes scalar input, so the company goes on as a column. */
function stampScalar(model: string, data: unknown, companyId: string): unknown {
  if (!data || typeof data !== "object") return data;
  assertSameCompany(model, data, companyId);
  return { ...(data as Record<string, unknown>), companyId };
}

export const tenantExtension = Prisma.defineExtension({
  name: "tenant-isolation",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const scope = currentTenantScope();
        if (!scope) {
          throw new TenantScopeError(
            `Database access to ${model}.${operation} outside a tenant scope; wrap the caller in withTenantScope, runForCompany, or runAsSystem`,
          );
        }
        if (scope.system) return query(args);
        if (!scope.companyId) {
          if (PRE_AUTH_MODELS.has(model)) return query(args);
          throw new TenantScopeError(`${model}.${operation} needs a signed-in company`);
        }
        return query(scopeArgs(model, operation, (args ?? {}) as Record<string, unknown>, scope.companyId) as typeof args);
      },
    },
  },
});
