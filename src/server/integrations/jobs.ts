import type { Actor } from "@/contracts/harsh";
import { prisma } from "@/server/lib/db";
import { runAsSystem, runForCompany } from "@/server/lib/tenant/context";
import { getBillingService } from "@/server/billing/live";
import { getLiveHealthService } from "@/server/health/live-service";
import { learnRecommendationWeights } from "./learn-recommendations";

/** Jobs run as the company's earliest active admin, so audit rows name a real user of that tenant. */
async function jobsActor(companyId: string): Promise<Actor | null> {
  const user = await prisma.user.findFirst({
    where: { role: "ADMIN", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!user) return null;
  return { id: user.id, role: user.role, active: true, companyId };
}

async function runCompanyJobs(companyId: string, asOf: string) {
  const actor = await jobsActor(companyId);
  if (!actor) return { companyId, skipped: "no active ADMIN user" };
  const billing = await getBillingService().runDueBilling(actor, {
    // Request keys are unique across the platform, so the company is part of the key.
    requestKey: `cron-due-${companyId}-${asOf}`,
    asOf,
  });
  const health = await getLiveHealthService().refresh(actor);
  const learned = await learnRecommendationWeights();
  return { companyId, billing, healthFlags: health.flags.length, learned };
}

/** Run due billing, deal health, and recommendation learning once per active company. One failing company does not stop the rest. */
export async function runScheduledJobs(asOf = new Date().toISOString().slice(0, 10)) {
  const companies = await runAsSystem(() =>
    prisma.company.findMany({ where: { active: true }, select: { id: true }, orderBy: { createdAt: "asc" } }),
  );
  const results = [];
  for (const company of companies) {
    try {
      results.push(await runForCompany(company.id, () => runCompanyJobs(company.id, asOf)));
    } catch (error) {
      console.error(`[jobs] company ${company.id}`, error);
      results.push({ companyId: company.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { asOf, companies: results };
}
