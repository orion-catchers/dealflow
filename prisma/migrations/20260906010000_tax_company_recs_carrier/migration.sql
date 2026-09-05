-- TaxRate table, company tenancy, trained rec lift column.

CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

INSERT INTO "Company" ("id", "code", "name", "currency", "active", "createdAt", "updatedAt")
VALUES
  ('company-nexa', 'NEXA', 'Nexa', 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('company-contoso', 'CONTOSO', 'Contoso Demo', 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratePct" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaxRate_code_key" ON "TaxRate"("code");

INSERT INTO "TaxRate" ("id", "code", "name", "ratePct", "active", "createdAt", "updatedAt")
VALUES
  ('tax-0', 'tax-0', 'Zero (demo)', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tax-5', 'tax-5', 'GST 5%', 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tax-12', 'tax-12', 'GST 12%', 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tax-18', 'tax-18', 'GST 18%', 18, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "TaxRate" ("id", "code", "name", "ratePct", "active", "createdAt", "updatedAt")
SELECT
  'tax-' || ROUND(p."taxPct")::int,
  'tax-' || ROUND(p."taxPct")::int,
  CASE WHEN ROUND(p."taxPct") = 0 THEN 'Zero (demo)' ELSE 'GST ' || ROUND(p."taxPct")::int || '%' END,
  ROUND(p."taxPct"),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "taxPct" FROM "Product") p
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "User" ADD COLUMN "companyId" TEXT;
UPDATE "User" SET "companyId" = 'company-nexa' WHERE "companyId" IS NULL;
ALTER TABLE "User" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Customer" ADD COLUMN "companyId" TEXT;
UPDATE "Customer" SET "companyId" = 'company-nexa' WHERE "companyId" IS NULL;
ALTER TABLE "Customer" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");

ALTER TABLE "Product" ADD COLUMN "taxRateId" TEXT;
ALTER TABLE "Product" ADD COLUMN "companyId" TEXT;
UPDATE "Product" SET "taxRateId" = 'tax-' || ROUND("taxPct")::int, "companyId" = 'company-nexa';
ALTER TABLE "Product" ALTER COLUMN "taxRateId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "TaxRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Product_companyId_idx" ON "Product"("companyId");

ALTER TABLE "Warehouse" ADD COLUMN "companyId" TEXT;
UPDATE "Warehouse" SET "companyId" = 'company-nexa' WHERE "companyId" IS NULL;
ALTER TABLE "Warehouse" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RecommendationRule" ADD COLUMN "trainedLift" DECIMAL(12,6);
