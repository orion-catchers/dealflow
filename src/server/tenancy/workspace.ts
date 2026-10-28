/**
 * Workspace (tenant) provisioning.
 *
 * A workspace is one Company plus its first ADMIN and the starter configuration
 * every screen expects: catalog categories, a standard price list, an approval
 * policy, and deal-health settings. Public sign-up, the `pnpm workspace:create`
 * CLI, and the demo seed all go through here, so a new customer company starts
 * with the same working setup and no demo data.
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { parseInput } from "@/features/catalog/api";
import { ApiFailure } from "@/lib/api/failure";
import { prisma, type Tx } from "@/server/lib/db";
import { hashPassword } from "@/server/lib/auth/password";
import { runAsSystem, runForCompany } from "@/server/lib/tenant/context";

export const WORKSPACE_CURRENCIES = ["INR", "USD", "EUR"] as const;

export const workspaceSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  /** Omitted when an operator provisions the workspace; the owner then sets a password from an invite link. */
  password: z.string().min(8).optional(),
  currency: z.enum(WORKSPACE_CURRENCIES).default("INR"),
});

export type WorkspaceInput = z.input<typeof workspaceSchema>;

export type CreatedWorkspace = { companyId: string; companyCode: string; ownerId: string };

const STARTER_CATEGORIES = [
  { code: "HARDWARE", name: "Hardware" },
  { code: "ACCESSORIES", name: "Accessories" },
  { code: "SERVICES", name: "Services" },
  { code: "SUBSCRIPTIONS", name: "Subscriptions" },
] as const;

/**
 * Discount ceilings by customer tier (Bronze is stored as STANDARD), plus tighter service ceilings. Admins publish a
 * new policy version to change them.
 */
const STARTER_CEILINGS: { tier: "STANDARD" | "SILVER" | "GOLD"; category?: string; ceilingPct: number }[] = [
  { tier: "STANDARD", ceilingPct: 5 },
  { tier: "SILVER", ceilingPct: 10 },
  { tier: "GOLD", ceilingPct: 15 },
  { tier: "GOLD", category: "HARDWARE", ceilingPct: 15 },
  { tier: "GOLD", category: "SERVICES", ceilingPct: 10 },
  { tier: "SILVER", category: "SERVICES", ceilingPct: 8 },
  { tier: "STANDARD", category: "SERVICES", ceilingPct: 5 },
];

/** Upper-case code from the company name, e.g. "Acme Office Supply" → "ACME-OFFICE-SUPPLY". */
export function companyCodeBase(name: string): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return base || "COMPANY";
}

async function uniqueCompanyCode(tx: Tx, name: string): Promise<string> {
  const base = companyCodeBase(name);
  if (!(await tx.company.findUnique({ where: { code: base } }))) return base;
  for (;;) {
    const candidate = `${base}-${randomBytes(2).toString("hex").toUpperCase()}`;
    if (!(await tx.company.findUnique({ where: { code: candidate } }))) return candidate;
  }
}

/**
 * Create the starter configuration for a company that has none. Must run in that company's tenant scope.
 * `ownerId` becomes the author of the first policy version.
 */
export async function provisionStarterConfig(tx: Tx, companyId: string, ownerId: string, currency: string): Promise<void> {
  const categoryIds = new Map<string, string>();
  for (const category of STARTER_CATEGORIES) {
    const row = await tx.category.create({ data: { ...category, companyId } });
    categoryIds.set(category.code, row.id);
  }
  await tx.priceList.create({ data: { code: "STANDARD", name: "Standard price list", currency, companyId } });
  await tx.policyVersion.create({
    data: {
      name: "Starter policy",
      companyId,
      createdById: ownerId,
      anyExcessRequiresManager: true,
      managerWorstExcessPct: 0,
      managerWeightedExcessPct: 0,
      financeWorstExcessPct: 5,
      financeWeightedExcessPct: 3,
      totalDiscountBudgetPct: null,
      policyCeilings: {
        create: STARTER_CEILINGS.map((ceiling) => ({
          tier: ceiling.tier,
          categoryId: ceiling.category ? categoryIds.get(ceiling.category)! : null,
          ceilingPct: ceiling.ceilingPct,
        })),
      },
      chainSteps: {
        create: [
          { stepIndex: 0, role: "SALES_MANAGER" },
          { stepIndex: 1, role: "FINANCE" },
        ],
      },
    },
  });
  await tx.healthSettings.create({ data: { companyId } });
}

/**
 * Create a company, its ACTIVE owner admin, and its starter configuration in one transaction.
 * Login emails are unique across the platform, so an email already in use anywhere is a CONFLICT.
 */
export async function createWorkspace(raw: WorkspaceInput): Promise<CreatedWorkspace> {
  const input = parseInput(workspaceSchema, raw);
  const email = input.email.toLowerCase();
  // Without a password the owner can only sign in after setting one from an invite link.
  const passwordHash = await hashPassword(input.password ?? randomBytes(32).toString("hex"));

  // The company row does not exist yet, so the transaction starts as a system operation and then
  // narrows to the new company for everything it owns.
  return runAsSystem(() =>
    prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
        throw new ApiFailure("CONFLICT", "Email already registered");
      }
      const code = await uniqueCompanyCode(tx, input.companyName);
      const company = await tx.company.create({
        data: { code, name: input.companyName, currency: input.currency, active: true },
      });
      return runForCompany(company.id, async () => {
        const owner = await tx.user.create({
          data: { email, passwordHash, name: input.name, role: "ADMIN", status: "ACTIVE", companyId: company.id },
        });
        await provisionStarterConfig(tx, company.id, owner.id, input.currency);
        await tx.auditEvent.create({
          data: {
            companyId: company.id,
            entityType: "Company",
            entityId: company.id,
            actorId: owner.id,
            action: "WORKSPACE_CREATED",
            metadata: { code, currency: input.currency, selfServe: Boolean(input.password) },
          },
        });
        return { companyId: company.id, companyCode: code, ownerId: owner.id };
      });
    }),
  );
}

/** Public self-serve workspace sign-up is off unless the operator enables it. */
export function publicSignupEnabled(): boolean {
  return process.env.DEALFLOW_PUBLIC_SIGNUP === "1";
}
