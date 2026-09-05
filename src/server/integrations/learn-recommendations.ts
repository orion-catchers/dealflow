import { prisma } from "@/server/lib/db";
import { trainCopurchaseModel } from "./train-copurchase";

/** Train item-item lift from confirmed quote baskets and upsert pairing rules. */
export async function learnRecommendationWeights(): Promise<{ updated: number; created: number; pairs: number }> {
  const quotes = await prisma.quote.findMany({
    where: { stage: "CONFIRMED" },
    include: { currentRevision: { include: { lines: true } } },
  });
  const baskets = quotes.map((quote) => (quote.currentRevision?.lines ?? []).map((line) => line.productId));
  const trained = trainCopurchaseModel(baskets);
  let updated = 0;
  let created = 0;
  for (const pair of trained) {
    const existing = await prisma.recommendationRule.findUnique({
      where: {
        baseProductId_candidateProductId: {
          baseProductId: pair.baseProductId,
          candidateProductId: pair.candidateProductId,
        },
      },
    });
    if (existing) {
      await prisma.recommendationRule.update({
        where: { id: existing.id },
        data: { copurchaseScore: pair.score, trainedLift: pair.lift },
      });
      updated += 1;
      continue;
    }
    await prisma.recommendationRule.create({
      data: {
        baseProductId: pair.baseProductId,
        candidateProductId: pair.candidateProductId,
        copurchaseScore: pair.score,
        trainedLift: pair.lift,
        minMarginPct: 10,
        status: "ACTIVE",
      },
    });
    created += 1;
  }
  return { updated, created, pairs: trained.length };
}
