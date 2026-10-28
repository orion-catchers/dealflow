import type { Actor } from "@/contracts/harsh";
import { prisma } from "@/server/lib/db";
import { runAsSystem, runForCompany } from "@/server/lib/tenant/context";

/**
 * Signed Stripe callbacks carry an invoice id but no session. Find the invoice's
 * company, then run `fn` inside that company as one of its active finance or
 * admin users, so the payment is recorded by, and visible to, that tenant only.
 * Returns null when the invoice does not exist.
 */
export async function runAsInvoiceCompany<T>(invoiceId: string, fn: (actor: Actor) => Promise<T>): Promise<T | null> {
  const invoice = await runAsSystem(() => prisma.invoice.findUnique({ where: { id: invoiceId }, select: { companyId: true } }));
  if (!invoice) return null;
  return runForCompany(invoice.companyId, async () => {
    const user = await prisma.user.findFirst({
      where: { role: { in: ["FINANCE", "ADMIN"] }, status: "ACTIVE" },
      // Role enum order puts FINANCE after ADMIN, so descending prefers a finance user.
      orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    });
    if (!user) throw new Error(`Company ${invoice.companyId} has no active FINANCE/ADMIN user to record a Stripe payment`);
    return fn({ id: user.id, role: user.role, companyId: invoice.companyId, active: true });
  });
}
