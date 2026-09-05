CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "teamId" TEXT,
    "status" "QuoteStage" NOT NULL DEFAULT 'DRAFT',
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Deal" ("id", "customerId", "repId", "teamId", "status", "lastActivityAt", "createdAt", "updatedAt")
SELECT 'deal-' || "id", "customerId", "repId", "teamId", "stage", "lastActivityAt", "createdAt", "updatedAt"
FROM "Quote";

ALTER TABLE "Quote" ADD COLUMN "dealId" TEXT;
UPDATE "Quote" SET "dealId" = 'deal-' || "id";

ALTER TABLE "QuoteRevision" ADD COLUMN "dealId" TEXT;
UPDATE "QuoteRevision" r
SET "dealId" = q."dealId"
FROM "Quote" q
WHERE r."quoteId" = q."id";

ALTER TABLE "Order" ADD COLUMN "dealId" TEXT;
UPDATE "Order" o
SET "dealId" = 'deal-' || q."id"
FROM "QuoteRevision" r
JOIN "Quote" q ON q."id" = r."quoteId"
WHERE o."sourceRevisionId" = r."id";

CREATE UNIQUE INDEX "Quote_dealId_key" ON "Quote"("dealId");
CREATE UNIQUE INDEX "Order_dealId_key" ON "Order"("dealId");
CREATE INDEX "Deal_customerId_status_idx" ON "Deal"("customerId", "status");
CREATE INDEX "Deal_repId_status_idx" ON "Deal"("repId", "status");
CREATE INDEX "Deal_status_lastActivityAt_idx" ON "Deal"("status", "lastActivityAt");

ALTER TABLE "Deal" ADD CONSTRAINT "Deal_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_repId_fkey"
  FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "SalesTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
