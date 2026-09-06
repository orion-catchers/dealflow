import type { Actor } from "@/contracts/harsh";
import { ApiFailure } from "@/lib/api/respond";
import { getActor } from "./actor";

// Role → API access matrix, derived from the DealFlow360 blueprint §3 "User Roles":
//   SALES_REP      builds quotations, applies discounts, tracks approvals/fulfillment
//   SALES_MANAGER  approves/rejects over-threshold quotes, configures discount
//                  tiers + approval chains, monitors deal-health dashboard
//   FINANCE        second-level approvals, warehouse splits + backorders,
//                  reconciles billing and credit notes
//   CUSTOMER       portal only: view quotes, negotiate, confirm terms
//   ADMIN          backend setup (products, price lists, warehouses, plans) and
//                  platform-wide analytics
export type Role = Actor["role"];

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type Access = "PUBLIC" | "ANY" | "INTERNAL" | readonly Role[];

type Rule = {
  prefix: string;
  methods?: Method[];
  access: Access;
};

const INTERNAL_ROLES: readonly Role[] = ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"];

// First matching rule wins, so specific prefixes must come before general ones.
const RULES: readonly Rule[] = [
  { prefix: "/api/auth/login", access: "PUBLIC" },
  { prefix: "/api/auth/signup", access: "PUBLIC" },
  { prefix: "/api/auth/sso", access: "PUBLIC" },
  { prefix: "/api/auth", access: "ANY" },
  { prefix: "/api/jobs", access: "PUBLIC" },
  { prefix: "/api/payments/stripe", access: "PUBLIC" },

  { prefix: "/api/admin", access: ["ADMIN"] },
  { prefix: "/api/portal", access: ["CUSTOMER"] },

  { prefix: "/api/quotes", access: ["SALES_REP", "SALES_MANAGER", "ADMIN"] },
  { prefix: "/api/approvals", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/approvals", access: ["SALES_MANAGER", "FINANCE", "ADMIN"] },
  { prefix: "/api/catalog", access: "INTERNAL" },

  { prefix: "/api/fulfillment", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/fulfillment", access: ["FINANCE", "ADMIN"] },
  { prefix: "/api/stock", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/stock", access: ["FINANCE", "ADMIN"] },

  { prefix: "/api/invoices", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/invoices", access: ["FINANCE", "ADMIN"] },
  { prefix: "/api/payments", access: ["FINANCE", "ADMIN", "CUSTOMER"] },
  { prefix: "/api/credits", access: ["FINANCE", "ADMIN"] },
  { prefix: "/api/subscriptions", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/subscriptions", access: ["FINANCE", "ADMIN"] },
  { prefix: "/api/billing", access: ["FINANCE", "ADMIN"] },

  { prefix: "/api/dashboard", access: "INTERNAL" },
  { prefix: "/api/reports", access: ["SALES_MANAGER", "FINANCE", "ADMIN", "SALES_REP"] },
  { prefix: "/api/fx", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/carrier", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/companies", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/integrations/public", access: "PUBLIC" },
  { prefix: "/api/integrations", access: "INTERNAL" },

  { prefix: "/api/products", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/products", access: ["ADMIN"] },
  { prefix: "/api/price-lists", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/price-lists", access: ["ADMIN"] },
  { prefix: "/api/warehouses", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/warehouses", access: ["ADMIN"] },
  { prefix: "/api/plans", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/plans", access: ["ADMIN"] },
  { prefix: "/api/tax-rates", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/tax-rates", access: ["ADMIN"] },
  { prefix: "/api/sales-teams", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/sales-teams", access: ["ADMIN"] },
  { prefix: "/api/customers", methods: ["GET"], access: "INTERNAL" },
  { prefix: "/api/customers", access: ["ADMIN"] },

  { prefix: "/api/health/actions", access: "INTERNAL" },
  { prefix: "/api/health", access: "INTERNAL" },
];

export function accessFor(pathname: string, method: string): Access {
  const path = pathname.endsWith("/") && pathname !== "/api" ? pathname.slice(0, -1) : pathname;
  for (const rule of RULES) {
    if (!path.startsWith(rule.prefix)) continue;
    if (rule.methods && !rule.methods.includes(method as Method)) continue;
    return rule.access;
  }
  return "INTERNAL";
}

export function canAccess(role: Role, pathname: string, method: string): boolean {
  const access = accessFor(pathname, method);
  if (access === "PUBLIC") return true;
  if (access === "ANY") return true;
  if (access === "INTERNAL") return INTERNAL_ROLES.includes(role);
  return access.includes(role);
}

function methodOf(request: Request): string {
  return request.method.toUpperCase();
}

function pathnameOf(request: Request): string {
  return new URL(request.url).pathname;
}

export function assertCanAccess(actor: Actor, pathname: string, method: string): void {
  if (!actor.active) throw new ApiFailure("FORBIDDEN", "Inactive account");
  const access = accessFor(pathname, method);
  if (access === "PUBLIC") return;
  if (access === "ANY") return;
  const allowed = access === "INTERNAL" ? INTERNAL_ROLES : access;
  if (!allowed.includes(actor.role)) {
    throw new ApiFailure("FORBIDDEN", `Role ${actor.role} may not perform this action`, {
      allowed,
    });
  }
}

// Single entry point for API routes: resolves the session actor and enforces the
// role matrix for the request's path + method.
export async function getAuthorizedActor(request: Request): Promise<Actor> {
  const pathname = pathnameOf(request);
  const method = methodOf(request);
  if (accessFor(pathname, method) === "PUBLIC") {
    // Route-authoring bug, not a client error: PUBLIC rules serve anonymous
    // callers, so the route must not resolve an actor at all.
    throw new Error(`${method} ${pathname} is PUBLIC: serve it without resolving an actor`);
  }
  const actor = await getActor(request);
  assertCanAccess(actor, pathname, method);
  return actor;
}
