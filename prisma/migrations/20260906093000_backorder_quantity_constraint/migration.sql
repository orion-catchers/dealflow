-- Alter Backorder quantity check constraint to allow 0 or non-negative when resolved
ALTER TABLE "Backorder" DROP CONSTRAINT IF EXISTS "Backorder_quantity_positive";
ALTER TABLE "Backorder" ADD CONSTRAINT "Backorder_quantity_positive" CHECK ("quantity" >= 0);
