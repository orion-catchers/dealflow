import type { Actor as AppActor, Role as AppRole } from "@/contracts/application";
import type { Actor as HarshActor, Role as HarshRole } from "@/contracts/harsh";
import { AppError } from "@/server/errors";
import { ApiFailure } from "@/lib/api/respond";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";
import { ACTOR_ID_TO_EMAIL } from "@/server/lib/auth/actor-helpers";
import { FIXTURE_CUSTOMER_EMAIL, FIXTURE_USER_EMAIL, FIXTURE_VARIANT_SKU, FIXTURE_WAREHOUSE_CODE } from "@/server/lib/db/map";

export { FIXTURE_USER_EMAIL, FIXTURE_CUSTOMER_EMAIL };

export function toAppRole(role: string): AppRole {
  if (role === "FINANCE") return "FINANCE_OPS";
  return role as AppRole;
}

export function toHarshRole(role: AppRole): HarshRole {
  if (role === "FINANCE_OPS") return "FINANCE";
  return role as HarshRole;
}

export function harshActor(actor: AppActor): HarshActor {
  return {
    id: actor.id,
    role: toHarshRole(actor.role),
    customerId: actor.customerId,
    companyId: actor.companyId,
    active: actor.active,
  };
}

export function wrapError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof ApiFailure) {
    const status =
      error.code === "UNAUTHENTICATED"
        ? 401
        : error.code === "FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "CONFLICT"
              ? 409
              : 422;
    throw new AppError(status, error.code, error.message, error.details as Record<string, unknown> | undefined);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025" || error.code === "P2003" || error.code === "P2018") {
      throw new AppError(404, "NOT_FOUND", "Record not found", { prisma: error.code });
    }
    const driver = [error.meta && typeof error.meta === "object" ? String((error.meta as { originalMessage?: string }).originalMessage ?? "") : "", error.message]
      .filter(Boolean)
      .join(" ");
    if (/not found|does not exist|foreign key/i.test(driver)) {
      throw new AppError(404, "NOT_FOUND", "Record not found", { prisma: error.code });
    }
    throw new AppError(422, "VALIDATION", driver || "The record could not be saved", { prisma: error.code });
  }
  if (error instanceof Error && (error.name === "PrismaClientValidationError" || /Unknown arg|Unknown field/i.test(error.message))) {
    throw new AppError(422, "VALIDATION", "The record could not be saved", { reason: error.message });
  }
  if (error instanceof Error && /not found/i.test(error.message)) {
    throw new AppError(404, "NOT_FOUND", error.message);
  }
  console.error("[live]", error);
  throw new AppError(500, "INTERNAL", "The request could not be completed");
}

export async function prismaUserId(actorId: string): Promise<string> {
  const byId = await prisma.user.findUnique({ where: { id: actorId } });
  if (byId) return byId.id;
  const email = ACTOR_ID_TO_EMAIL[actorId] ?? FIXTURE_USER_EMAIL[actorId];
  if (email) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) return byEmail.id;
  }
  throw new AppError(404, "NOT_FOUND", `User ${actorId} is not in the database`);
}

export async function prismaCustomerId(id: string): Promise<string> {
  const byId = await prisma.customer.findUnique({ where: { id } });
  if (byId) return byId.id;
  const emails = [FIXTURE_CUSTOMER_EMAIL[id], id === "customer-gamma" ? "meera@gamma.example" : undefined].filter(
    (e): e is string => Boolean(e),
  );
  for (const email of emails) {
    const byEmail = await prisma.customer.findFirst({ where: { contactEmail: email } });
    if (byEmail) return byEmail.id;
  }
  throw new AppError(404, "NOT_FOUND", `Customer ${id} is not in the database`);
}

const WAREHOUSE_CODE_BY_SYMBOL = FIXTURE_WAREHOUSE_CODE;
const VARIANT_SKU_BY_SYMBOL = FIXTURE_VARIANT_SKU;

export async function prismaWarehouseId(id: string): Promise<string> {
  const byId = await prisma.warehouse.findUnique({ where: { id } });
  if (byId) return byId.id;
  const code = WAREHOUSE_CODE_BY_SYMBOL[id] ?? id;
  const byCode = await prisma.warehouse.findFirst({ where: { code: { equals: code, mode: "insensitive" } } });
  if (byCode) return byCode.id;
  throw new AppError(404, "NOT_FOUND", `Warehouse ${id} is not in the database`);
}

export async function prismaVariantId(id: string): Promise<string> {
  const byId = await prisma.variant.findUnique({ where: { id } });
  if (byId) return byId.id;
  const sku = VARIANT_SKU_BY_SYMBOL[id] ?? id;
  const bySku = await prisma.variant.findFirst({ where: { sku } });
  if (bySku) return bySku.id;
  throw new AppError(404, "NOT_FOUND", `Variant ${id} is not in the database`);
}

export function sessionToken(reqCookie: string | undefined, fallback?: string): string | undefined {
  return reqCookie || fallback;
}
