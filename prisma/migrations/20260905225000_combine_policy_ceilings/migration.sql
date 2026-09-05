CREATE TABLE "PolicyCeiling" (
    "id" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "tier" "DiscountTier" NOT NULL,
    "categoryId" TEXT,
    "ceilingPct" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PolicyCeiling_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PolicyCeiling" ("id", "policyVersionId", "tier", "categoryId", "ceilingPct", "createdAt")
SELECT "id", "policyVersionId", "tier", NULL, "ceilingPct", "createdAt"
FROM "PolicyTierCeiling";

INSERT INTO "PolicyCeiling" ("id", "policyVersionId", "tier", "categoryId", "ceilingPct", "createdAt")
SELECT "id", "policyVersionId", "tier", "categoryId", "ceilingPct", "createdAt"
FROM "PolicyCategoryCeiling";

CREATE UNIQUE INDEX "PolicyCeiling_policyVersionId_tier_categoryId_key"
ON "PolicyCeiling"("policyVersionId", "tier", "categoryId");
CREATE INDEX "PolicyCeiling_policyVersionId_idx" ON "PolicyCeiling"("policyVersionId");
ALTER TABLE "PolicyCeiling" ADD CONSTRAINT "PolicyCeiling_policyVersionId_fkey"
  FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PolicyCeiling" ADD CONSTRAINT "PolicyCeiling_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PolicyCeiling" ADD CONSTRAINT "PolicyCeiling_ceilingPct_range"
  CHECK ("ceilingPct" BETWEEN 0 AND 100);

DROP TABLE "PolicyCategoryCeiling";
DROP TABLE "PolicyTierCeiling";
