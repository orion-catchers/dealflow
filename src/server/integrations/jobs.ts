import type { Actor } from "@/contracts/harsh";
import { prisma } from "@/server/lib/db";
import { getBillingService } from "@/server/billing/live";
import { getLiveHealthService } from "@/server/health/live-service";
import { learnRecommendationWeights } from "./learn-recommendations";

async function jobsActor(): Promise<Actor> {
  const email = (process.env.JOBS_ACTOR_EMAIL ?? "dev@nexa.example").toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
  if (!user) throw new Error(`JOBS_ACTOR_EMAIL ${email} is not a seeded user`);
  return {
    id: user.id,
    role: user.role,
    active: user.status === "ACTIVE",
    customerId: user.memberships[0]?.customerId,
    companyId: user.companyId,
  };
}

export async function runScheduledJobs(asOf = new Date().toISOString().slice(0, 10)) {
  const actor = await jobsActor();
  const billing = await getBillingService().runDueBilling(actor, {
    requestKey: `cron-due-${asOf}`,
    asOf,
  });
  const health = await getLiveHealthService().refresh(actor);
  const learned = await learnRecommendationWeights();
  return { asOf, billing, healthFlags: health.flags.length, learned };
}
