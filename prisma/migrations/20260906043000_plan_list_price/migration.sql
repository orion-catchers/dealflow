ALTER TABLE "SubscriptionPlan" ADD COLUMN "listPrice" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "SubscriptionPlan" AS p
SET "listPrice" = pr."basePrice"
FROM "Product" AS pr
WHERE pr."defaultPlanId" = p."id"
  AND p."listPrice" = 0;
