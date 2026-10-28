-- Company tenancy: every business record carries its owning company.
--
-- Columns are added nullable, backfilled from the record's existing relations,
-- then made NOT NULL. Rows that no relation can place fall back to the oldest
-- company that has users (a database with data has at least one). The checks at
-- the end abort the migration if any reference crosses companies, so a bad
-- backfill fails loudly instead of leaking data between tenants.

CREATE TEMP TABLE "_tenancy_default" ON COMMIT DROP AS
SELECT COALESCE(
  (SELECT c."id" FROM "Company" c WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."companyId" = c."id") ORDER BY c."createdAt", c."id" LIMIT 1),
  (SELECT c."id" FROM "Company" c ORDER BY c."createdAt", c."id" LIMIT 1)
) AS "id";

-- Catalog and configuration ------------------------------------------------

ALTER TABLE "Variant" ADD COLUMN "companyId" TEXT;
UPDATE "Variant" v SET "companyId" = p."companyId" FROM "Product" p WHERE p."id" = v."productId";

ALTER TABLE "Category" ADD COLUMN "companyId" TEXT;
UPDATE "Category" c SET "companyId" = (
  SELECT p."companyId" FROM "Product" p WHERE p."categoryId" = c."id" ORDER BY p."createdAt", p."id" LIMIT 1
);

ALTER TABLE "PriceList" ADD COLUMN "companyId" TEXT;
UPDATE "PriceList" pl SET "companyId" = COALESCE(
  (SELECT cu."companyId" FROM "Customer" cu WHERE cu."priceListId" = pl."id" ORDER BY cu."createdAt", cu."id" LIMIT 1),
  (SELECT p."companyId" FROM "PriceRule" r JOIN "Product" p ON p."id" = r."productId" WHERE r."priceListId" = pl."id" ORDER BY r."createdAt", r."id" LIMIT 1)
);

ALTER TABLE "SubscriptionPlan" ADD COLUMN "companyId" TEXT;
UPDATE "SubscriptionPlan" sp SET "companyId" = COALESCE(
  (SELECT p."companyId" FROM "Product" p WHERE p."defaultPlanId" = sp."id" ORDER BY p."createdAt", p."id" LIMIT 1),
  (SELECT cu."companyId" FROM "Subscription" s JOIN "Customer" cu ON cu."id" = s."customerId" WHERE s."planId" = sp."id" ORDER BY s."createdAt", s."id" LIMIT 1)
);

ALTER TABLE "SalesTeam" ADD COLUMN "companyId" TEXT;
UPDATE "SalesTeam" t SET "companyId" = COALESCE(
  (SELECT u."companyId" FROM "User" u WHERE u."teamId" = t."id" ORDER BY u."createdAt", u."id" LIMIT 1),
  (SELECT cu."companyId" FROM "Customer" cu WHERE cu."teamId" = t."id" ORDER BY cu."createdAt", cu."id" LIMIT 1)
);

ALTER TABLE "PolicyVersion" ADD COLUMN "companyId" TEXT;
UPDATE "PolicyVersion" pv SET "companyId" = u."companyId" FROM "User" u WHERE u."id" = pv."createdById";

ALTER TABLE "RecommendationRule" ADD COLUMN "companyId" TEXT;
UPDATE "RecommendationRule" r SET "companyId" = p."companyId" FROM "Product" p WHERE p."id" = r."baseProductId";

-- Commercial records -------------------------------------------------------

ALTER TABLE "Deal" ADD COLUMN "companyId" TEXT;
UPDATE "Deal" d SET "companyId" = cu."companyId" FROM "Customer" cu WHERE cu."id" = d."customerId";

ALTER TABLE "Quote" ADD COLUMN "companyId" TEXT;
UPDATE "Quote" q SET "companyId" = cu."companyId" FROM "Customer" cu WHERE cu."id" = q."customerId";

ALTER TABLE "Order" ADD COLUMN "companyId" TEXT;
UPDATE "Order" o SET "companyId" = cu."companyId" FROM "Customer" cu WHERE cu."id" = o."customerId";

ALTER TABLE "Subscription" ADD COLUMN "companyId" TEXT;
UPDATE "Subscription" s SET "companyId" = cu."companyId" FROM "Customer" cu WHERE cu."id" = s."customerId";

ALTER TABLE "Invoice" ADD COLUMN "companyId" TEXT;
UPDATE "Invoice" i SET "companyId" = cu."companyId" FROM "Customer" cu WHERE cu."id" = i."customerId";

ALTER TABLE "CreditNote" ADD COLUMN "companyId" TEXT;
UPDATE "CreditNote" cn SET "companyId" = cu."companyId" FROM "Customer" cu WHERE cu."id" = cn."customerId";

-- Health, audit, idempotency -----------------------------------------------

ALTER TABLE "HealthFlag" ADD COLUMN "companyId" TEXT;
UPDATE "HealthFlag" f SET "companyId" = COALESCE(
  (SELECT q."companyId" FROM "Quote" q WHERE q."id" = f."quoteId"),
  (SELECT o."companyId" FROM "Order" o WHERE o."id" = f."orderId")
);

ALTER TABLE "Task" ADD COLUMN "companyId" TEXT;
UPDATE "Task" t SET "companyId" = COALESCE(
  (SELECT q."companyId" FROM "Quote" q WHERE q."id" = t."quoteId"),
  (SELECT o."companyId" FROM "Order" o WHERE o."id" = t."orderId"),
  (SELECT f."companyId" FROM "HealthFlag" f WHERE f."id" = t."flagId")
);

ALTER TABLE "AuditEvent" ADD COLUMN "companyId" TEXT;
UPDATE "AuditEvent" a SET "companyId" = u."companyId" FROM "User" u WHERE u."id" = a."actorId";

ALTER TABLE "RequestKey" ADD COLUMN "companyId" TEXT;
UPDATE "RequestKey" k SET "companyId" = u."companyId" FROM "User" u WHERE u."id" = k."actorId";

-- Health settings move from one fixed row to one row per company.
ALTER TABLE "HealthSettings" ADD COLUMN "companyId" TEXT;
ALTER TABLE "HealthSettings" ALTER COLUMN "id" DROP DEFAULT;
UPDATE "HealthSettings" SET "companyId" = (SELECT "id" FROM "_tenancy_default");

-- Actor-less audit rows and request keys: place them through what they describe.
UPDATE "AuditEvent" a SET "companyId" = q."companyId" FROM "Quote" q WHERE a."companyId" IS NULL AND a."entityType" = 'Quote' AND q."id" = a."entityId";
UPDATE "AuditEvent" a SET "companyId" = o."companyId" FROM "Order" o WHERE a."companyId" IS NULL AND a."entityType" = 'Order' AND o."id" = a."entityId";
UPDATE "AuditEvent" a SET "companyId" = i."companyId" FROM "Invoice" i WHERE a."companyId" IS NULL AND a."entityType" = 'Invoice' AND i."id" = a."entityId";
UPDATE "AuditEvent" a SET "companyId" = s."companyId" FROM "Subscription" s WHERE a."companyId" IS NULL AND a."entityType" = 'Subscription' AND s."id" = a."entityId";
UPDATE "AuditEvent" a SET "companyId" = c."companyId" FROM "Customer" c WHERE a."companyId" IS NULL AND a."entityType" = 'Customer' AND c."id" = a."entityId";
UPDATE "AuditEvent" a SET "companyId" = p."companyId" FROM "Product" p WHERE a."companyId" IS NULL AND a."entityType" = 'Product' AND p."id" = a."entityId";
UPDATE "AuditEvent" a SET "companyId" = u."companyId" FROM "User" u WHERE a."companyId" IS NULL AND a."entityType" = 'User' AND u."id" = a."entityId";
UPDATE "AuditEvent" a SET "companyId" = pv."companyId" FROM "PolicyVersion" pv WHERE a."companyId" IS NULL AND a."entityType" = 'PolicyVersion' AND pv."id" = a."entityId";
UPDATE "AuditEvent" a SET "companyId" = f."companyId" FROM "HealthFlag" f WHERE a."companyId" IS NULL AND a."entityType" = 'HealthFlag' AND f."id" = a."entityId";
UPDATE "AuditEvent" a SET "companyId" = t."companyId" FROM "Task" t WHERE a."companyId" IS NULL AND a."entityType" = 'Task' AND t."id" = a."entityId";
UPDATE "AuditEvent" a SET "companyId" = q."companyId" FROM "QuoteRevision" r JOIN "Quote" q ON q."id" = r."quoteId" WHERE a."companyId" IS NULL AND r."id" = a."revisionId";
UPDATE "RequestKey" k SET "companyId" = o."companyId" FROM "Order" o WHERE k."companyId" IS NULL AND k."resultKind" = 'ORDER' AND o."id" = k."resultId";
UPDATE "RequestKey" k SET "companyId" = i."companyId" FROM "Invoice" i WHERE k."companyId" IS NULL AND k."resultKind" = 'INVOICE' AND i."id" = k."resultId";
UPDATE "RequestKey" k SET "companyId" = i."companyId" FROM "Payment" p JOIN "Invoice" i ON i."id" = p."invoiceId" WHERE k."companyId" IS NULL AND p."requestKeyId" = k."id";
UPDATE "RequestKey" k SET "companyId" = i."companyId" FROM "CreditApplication" ca JOIN "Invoice" i ON i."id" = ca."invoiceId" WHERE k."companyId" IS NULL AND ca."requestKeyId" = k."id";
UPDATE "RequestKey" k SET "companyId" = w."companyId" FROM "StockReceipt" sr JOIN "Warehouse" w ON w."id" = sr."warehouseId" WHERE k."companyId" IS NULL AND sr."requestKeyId" = k."id";

-- Fallback for rows no relation could place, then enforce -------------------

-- Tell the operator how many rows were placed by the fallback; on a database with one company this is harmless.
DO $$
DECLARE
  unplaced integer;
BEGIN
  SELECT
    (SELECT count(*) FROM "Variant" WHERE "companyId" IS NULL) + (SELECT count(*) FROM "Category" WHERE "companyId" IS NULL) +
    (SELECT count(*) FROM "PriceList" WHERE "companyId" IS NULL) + (SELECT count(*) FROM "SubscriptionPlan" WHERE "companyId" IS NULL) +
    (SELECT count(*) FROM "SalesTeam" WHERE "companyId" IS NULL) + (SELECT count(*) FROM "PolicyVersion" WHERE "companyId" IS NULL) +
    (SELECT count(*) FROM "RecommendationRule" WHERE "companyId" IS NULL) + (SELECT count(*) FROM "HealthFlag" WHERE "companyId" IS NULL) +
    (SELECT count(*) FROM "Task" WHERE "companyId" IS NULL) + (SELECT count(*) FROM "AuditEvent" WHERE "companyId" IS NULL) +
    (SELECT count(*) FROM "RequestKey" WHERE "companyId" IS NULL)
  INTO unplaced;
  IF unplaced > 0 THEN
    RAISE NOTICE 'company tenancy: % rows had no relation to a company and were assigned to the oldest company with users', unplaced;
  END IF;
END $$;

UPDATE "Variant"            SET "companyId" = (SELECT "id" FROM "_tenancy_default") WHERE "companyId" IS NULL;
UPDATE "Category"           SET "companyId" = (SELECT "id" FROM "_tenancy_default") WHERE "companyId" IS NULL;
UPDATE "PriceList"          SET "companyId" = (SELECT "id" FROM "_tenancy_default") WHERE "companyId" IS NULL;
UPDATE "SubscriptionPlan"   SET "companyId" = (SELECT "id" FROM "_tenancy_default") WHERE "companyId" IS NULL;
UPDATE "SalesTeam"          SET "companyId" = (SELECT "id" FROM "_tenancy_default") WHERE "companyId" IS NULL;
UPDATE "PolicyVersion"      SET "companyId" = (SELECT "id" FROM "_tenancy_default") WHERE "companyId" IS NULL;
UPDATE "RecommendationRule" SET "companyId" = (SELECT "id" FROM "_tenancy_default") WHERE "companyId" IS NULL;
UPDATE "HealthFlag"         SET "companyId" = (SELECT "id" FROM "_tenancy_default") WHERE "companyId" IS NULL;
UPDATE "Task"               SET "companyId" = (SELECT "id" FROM "_tenancy_default") WHERE "companyId" IS NULL;
UPDATE "AuditEvent"         SET "companyId" = (SELECT "id" FROM "_tenancy_default") WHERE "companyId" IS NULL;
UPDATE "RequestKey"         SET "companyId" = (SELECT "id" FROM "_tenancy_default") WHERE "companyId" IS NULL;

ALTER TABLE "Variant"            ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Category"           ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PriceList"          ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "SubscriptionPlan"   ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "SalesTeam"          ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PolicyVersion"      ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "RecommendationRule" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Deal"               ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Quote"              ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Order"              ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Subscription"       ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Invoice"            ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "CreditNote"         ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "HealthFlag"         ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Task"               ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "AuditEvent"         ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "RequestKey"         ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "HealthSettings"     ALTER COLUMN "companyId" SET NOT NULL;

-- Cross-company references are a data leak; refuse to continue if any exist.
DO $$
DECLARE
  bad integer;
BEGIN
  SELECT
    (SELECT count(*) FROM "Product" p JOIN "Category" c ON c."id" = p."categoryId" WHERE c."companyId" <> p."companyId") +
    (SELECT count(*) FROM "Customer" cu JOIN "PriceList" pl ON pl."id" = cu."priceListId" WHERE pl."companyId" <> cu."companyId") +
    (SELECT count(*) FROM "Customer" cu JOIN "User" u ON u."id" = cu."assignedRepId" WHERE u."companyId" <> cu."companyId") +
    (SELECT count(*) FROM "Product" p JOIN "SubscriptionPlan" sp ON sp."id" = p."defaultPlanId" WHERE sp."companyId" <> p."companyId") +
    (SELECT count(*) FROM "User" u JOIN "SalesTeam" t ON t."id" = u."teamId" WHERE t."companyId" <> u."companyId") +
    (SELECT count(*) FROM "PriceRule" r JOIN "PriceList" pl ON pl."id" = r."priceListId" JOIN "Product" p ON p."id" = r."productId" WHERE pl."companyId" <> p."companyId") +
    (SELECT count(*) FROM "Stock" s JOIN "Warehouse" w ON w."id" = s."warehouseId" JOIN "Variant" v ON v."id" = s."variantId" WHERE w."companyId" <> v."companyId") +
    (SELECT count(*) FROM "Quote" q JOIN "User" u ON u."id" = q."repId" WHERE u."companyId" <> q."companyId") +
    (SELECT count(*) FROM "QuoteLine" l JOIN "QuoteRevision" r ON r."id" = l."revisionId" JOIN "Quote" q ON q."id" = r."quoteId" JOIN "Product" p ON p."id" = l."productId" WHERE p."companyId" <> q."companyId") +
    (SELECT count(*) FROM "QuoteRevision" r JOIN "Quote" q ON q."id" = r."quoteId" JOIN "PolicyVersion" pv ON pv."id" = r."policyVersionId" WHERE pv."companyId" <> q."companyId") +
    (SELECT count(*) FROM "CustomerMembership" m JOIN "User" u ON u."id" = m."userId" JOIN "Customer" cu ON cu."id" = m."customerId" WHERE u."companyId" <> cu."companyId") +
    (SELECT count(*) FROM "Subscription" s JOIN "SubscriptionPlan" sp ON sp."id" = s."planId" WHERE sp."companyId" <> s."companyId") +
    (SELECT count(*) FROM "PolicyCeiling" pc JOIN "PolicyVersion" pv ON pv."id" = pc."policyVersionId" JOIN "Category" c ON c."id" = pc."categoryId" WHERE c."companyId" <> pv."companyId") +
    (SELECT count(*) FROM "QuoteLine" l JOIN "QuoteRevision" r ON r."id" = l."revisionId" JOIN "Quote" q ON q."id" = r."quoteId" JOIN "Category" c ON c."id" = l."categoryId" WHERE c."companyId" <> q."companyId") +
    (SELECT count(*) FROM "Task" t JOIN "User" u ON u."id" = t."assigneeId" WHERE u."companyId" <> t."companyId") +
    (SELECT count(*) FROM "AuditEvent" a JOIN "User" u ON u."id" = a."actorId" WHERE u."companyId" <> a."companyId") +
    (SELECT count(*) FROM "RequestKey" k JOIN "User" u ON u."id" = k."actorId" WHERE u."companyId" <> k."companyId")
  INTO bad;
  IF bad > 0 THEN
    RAISE EXCEPTION 'company tenancy backfill found % cross-company references; split the shared rows per company before migrating', bad;
  END IF;
END $$;

-- Natural keys are unique per company, not across the platform ---------------

DROP INDEX "Category_code_key";
DROP INDEX "PriceList_code_key";
DROP INDEX "Product_sku_key";
DROP INDEX "SalesTeam_name_key";
DROP INDEX "SubscriptionPlan_code_key";
DROP INDEX "Variant_sku_key";
DROP INDEX "Warehouse_code_key";

CREATE UNIQUE INDEX "Category_companyId_code_key" ON "Category"("companyId", "code");
CREATE UNIQUE INDEX "PriceList_companyId_code_key" ON "PriceList"("companyId", "code");
CREATE UNIQUE INDEX "Product_companyId_sku_key" ON "Product"("companyId", "sku");
CREATE UNIQUE INDEX "SalesTeam_companyId_name_key" ON "SalesTeam"("companyId", "name");
CREATE UNIQUE INDEX "SubscriptionPlan_companyId_code_key" ON "SubscriptionPlan"("companyId", "code");
CREATE UNIQUE INDEX "Variant_companyId_sku_key" ON "Variant"("companyId", "sku");
CREATE UNIQUE INDEX "Warehouse_companyId_code_key" ON "Warehouse"("companyId", "code");
CREATE UNIQUE INDEX "HealthSettings_companyId_key" ON "HealthSettings"("companyId");

CREATE INDEX "AuditEvent_companyId_createdAt_idx" ON "AuditEvent"("companyId", "createdAt");
CREATE INDEX "CreditNote_companyId_idx" ON "CreditNote"("companyId");
CREATE INDEX "Deal_companyId_status_idx" ON "Deal"("companyId", "status");
CREATE INDEX "HealthFlag_companyId_resolvedAt_idx" ON "HealthFlag"("companyId", "resolvedAt");
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");
CREATE INDEX "Order_companyId_createdAt_idx" ON "Order"("companyId", "createdAt");
CREATE INDEX "PolicyVersion_companyId_createdAt_idx" ON "PolicyVersion"("companyId", "createdAt");
CREATE INDEX "Quote_companyId_lastActivityAt_idx" ON "Quote"("companyId", "lastActivityAt");
CREATE INDEX "RecommendationRule_companyId_idx" ON "RecommendationRule"("companyId");
CREATE INDEX "Subscription_companyId_status_nextBillingDate_idx" ON "Subscription"("companyId", "status", "nextBillingDate");
CREATE INDEX "Task_companyId_status_idx" ON "Task"("companyId", "status");

ALTER TABLE "SalesTeam" ADD CONSTRAINT "SalesTeam_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationRule" ADD CONSTRAINT "RecommendationRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthSettings" ADD CONSTRAINT "HealthSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthFlag" ADD CONSTRAINT "HealthFlag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestKey" ADD CONSTRAINT "RequestKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
