-- Database-level tenant guard: a row may only reference rows of its own company.
--
-- The tenant-scoped Prisma client already filters every query by company. These
-- triggers are the second line of defense: whatever the application does, an
-- INSERT or UPDATE that points a row at another company's customer, product,
-- quote, invoice, and so on is rejected by PostgreSQL.
--
-- dealflow_tenant_guard() takes SQL snippets as trigger arguments. The first
-- returns the company that owns the new row (its own companyId, or its parent's);
-- each later one returns the company of one referenced row, or NULL when the
-- reference is empty. {s} is replaced with the trigger table's schema so the
-- guard works in per-developer schemas (?schema=dev_<name>) as well as public.
-- $1 is the new row as jsonb. Prisma does not model triggers, so `migrate diff`
-- never proposes dropping them.

CREATE OR REPLACE FUNCTION dealflow_tenant_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  row_json jsonb := to_jsonb(NEW);
  schema_name text := quote_ident(TG_TABLE_SCHEMA);
  owner_company text;
  referenced_company text;
  i integer;
BEGIN
  EXECUTE replace(TG_ARGV[0], '{s}', schema_name) INTO owner_company USING row_json;
  -- A missing parent is left to the foreign key constraint to report.
  IF owner_company IS NULL THEN
    RETURN NEW;
  END IF;
  FOR i IN 1 .. TG_NARGS - 1 LOOP
    EXECUTE replace(TG_ARGV[i], '{s}', schema_name) INTO referenced_company USING row_json;
    IF referenced_company IS NOT NULL AND referenced_company <> owner_company THEN
      RAISE EXCEPTION 'tenant guard: % row references another company (%)', TG_TABLE_NAME, TG_ARGV[i]
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "User_tenant_guard" BEFORE INSERT OR UPDATE ON "User"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."SalesTeam" WHERE id = $1->>''teamId'''
  );

CREATE TRIGGER "Customer_tenant_guard" BEFORE INSERT OR UPDATE ON "Customer"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."PriceList" WHERE id = $1->>''priceListId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''assignedRepId''',
    'SELECT "companyId" FROM {s}."SalesTeam" WHERE id = $1->>''teamId'''
  );

CREATE TRIGGER "Product_tenant_guard" BEFORE INSERT OR UPDATE ON "Product"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."Category" WHERE id = $1->>''categoryId''',
    'SELECT "companyId" FROM {s}."SubscriptionPlan" WHERE id = $1->>''defaultPlanId'''
  );

CREATE TRIGGER "Variant_tenant_guard" BEFORE INSERT OR UPDATE ON "Variant"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."Product" WHERE id = $1->>''productId'''
  );

CREATE TRIGGER "PolicyVersion_tenant_guard" BEFORE INSERT OR UPDATE ON "PolicyVersion"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''createdById'''
  );

CREATE TRIGGER "Deal_tenant_guard" BEFORE INSERT OR UPDATE ON "Deal"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."Customer" WHERE id = $1->>''customerId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''repId''',
    'SELECT "companyId" FROM {s}."SalesTeam" WHERE id = $1->>''teamId'''
  );

CREATE TRIGGER "Quote_tenant_guard" BEFORE INSERT OR UPDATE ON "Quote"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."Customer" WHERE id = $1->>''customerId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''repId''',
    'SELECT "companyId" FROM {s}."SalesTeam" WHERE id = $1->>''teamId''',
    'SELECT "companyId" FROM {s}."Deal" WHERE id = $1->>''dealId''',
    'SELECT q."companyId" FROM {s}."QuoteRevision" r JOIN {s}."Quote" q ON q.id = r."quoteId" WHERE r.id = $1->>''currentRevisionId'''
  );

CREATE TRIGGER "Order_tenant_guard" BEFORE INSERT OR UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."Customer" WHERE id = $1->>''customerId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''repId''',
    'SELECT "companyId" FROM {s}."SalesTeam" WHERE id = $1->>''teamId''',
    'SELECT "companyId" FROM {s}."Deal" WHERE id = $1->>''dealId''',
    'SELECT q."companyId" FROM {s}."QuoteRevision" r JOIN {s}."Quote" q ON q.id = r."quoteId" WHERE r.id = $1->>''sourceRevisionId''',
    'SELECT q."companyId" FROM {s}."CustomerAcceptance" a JOIN {s}."QuoteRevision" r ON r.id = a."revisionId" JOIN {s}."Quote" q ON q.id = r."quoteId" WHERE a.id = $1->>''acceptanceId'''
  );

CREATE TRIGGER "Subscription_tenant_guard" BEFORE INSERT OR UPDATE ON "Subscription"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."Customer" WHERE id = $1->>''customerId''',
    'SELECT "companyId" FROM {s}."SubscriptionPlan" WHERE id = $1->>''planId''',
    'SELECT "companyId" FROM {s}."SubscriptionPlan" WHERE id = $1->>''pendingPlanId''',
    'SELECT o."companyId" FROM {s}."OrderLine" ol JOIN {s}."Order" o ON o.id = ol."orderId" WHERE ol.id = $1->>''sourceOrderLineId'''
  );

CREATE TRIGGER "Invoice_tenant_guard" BEFORE INSERT OR UPDATE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."Customer" WHERE id = $1->>''customerId''',
    'SELECT "companyId" FROM {s}."Order" WHERE id = $1->>''orderId''',
    'SELECT "companyId" FROM {s}."Subscription" WHERE id = $1->>''subscriptionId'''
  );

CREATE TRIGGER "CreditNote_tenant_guard" BEFORE INSERT OR UPDATE ON "CreditNote"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."Customer" WHERE id = $1->>''customerId''',
    'SELECT "companyId" FROM {s}."Invoice" WHERE id = $1->>''sourceInvoiceId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''issuedById'''
  );

CREATE TRIGGER "RecommendationRule_tenant_guard" BEFORE INSERT OR UPDATE ON "RecommendationRule"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."Product" WHERE id = $1->>''baseProductId''',
    'SELECT "companyId" FROM {s}."Product" WHERE id = $1->>''candidateProductId'''
  );

CREATE TRIGGER "HealthFlag_tenant_guard" BEFORE INSERT OR UPDATE ON "HealthFlag"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."Quote" WHERE id = $1->>''quoteId''',
    'SELECT "companyId" FROM {s}."Order" WHERE id = $1->>''orderId'''
  );

CREATE TRIGGER "Task_tenant_guard" BEFORE INSERT OR UPDATE ON "Task"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."HealthFlag" WHERE id = $1->>''flagId''',
    'SELECT "companyId" FROM {s}."Quote" WHERE id = $1->>''quoteId''',
    'SELECT "companyId" FROM {s}."Order" WHERE id = $1->>''orderId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''assigneeId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''createdById'''
  );

CREATE TRIGGER "AuditEvent_tenant_guard" BEFORE INSERT OR UPDATE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''actorId'''
  );

CREATE TRIGGER "RequestKey_tenant_guard" BEFORE INSERT OR UPDATE ON "RequestKey"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT $1->>''companyId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''actorId'''
  );

CREATE TRIGGER "CustomerMembership_tenant_guard" BEFORE INSERT OR UPDATE ON "CustomerMembership"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."Customer" WHERE id = $1->>''customerId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''userId'''
  );

CREATE TRIGGER "PriceRule_tenant_guard" BEFORE INSERT OR UPDATE ON "PriceRule"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."PriceList" WHERE id = $1->>''priceListId''',
    'SELECT "companyId" FROM {s}."Product" WHERE id = $1->>''productId''',
    'SELECT "companyId" FROM {s}."Variant" WHERE id = $1->>''variantId'''
  );

CREATE TRIGGER "PolicyCeiling_tenant_guard" BEFORE INSERT OR UPDATE ON "PolicyCeiling"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."PolicyVersion" WHERE id = $1->>''policyVersionId''',
    'SELECT "companyId" FROM {s}."Category" WHERE id = $1->>''categoryId'''
  );

CREATE TRIGGER "QuoteRevision_tenant_guard" BEFORE INSERT OR UPDATE ON "QuoteRevision"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."Quote" WHERE id = $1->>''quoteId''',
    'SELECT "companyId" FROM {s}."Deal" WHERE id = $1->>''dealId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''createdById''',
    'SELECT "companyId" FROM {s}."PolicyVersion" WHERE id = $1->>''policyVersionId'''
  );

CREATE TRIGGER "QuoteLine_tenant_guard" BEFORE INSERT OR UPDATE ON "QuoteLine"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT q."companyId" FROM {s}."QuoteRevision" r JOIN {s}."Quote" q ON q.id = r."quoteId" WHERE r.id = $1->>''revisionId''',
    'SELECT "companyId" FROM {s}."Product" WHERE id = $1->>''productId''',
    'SELECT "companyId" FROM {s}."Variant" WHERE id = $1->>''variantId''',
    'SELECT "companyId" FROM {s}."SubscriptionPlan" WHERE id = $1->>''planId''',
    'SELECT "companyId" FROM {s}."Category" WHERE id = $1->>''categoryId'''
  );

CREATE TRIGGER "ApprovalDecision_tenant_guard" BEFORE INSERT OR UPDATE ON "ApprovalDecision"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT q."companyId" FROM {s}."QuoteRevision" r JOIN {s}."Quote" q ON q.id = r."quoteId" WHERE r.id = $1->>''revisionId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''actorId'''
  );

CREATE TRIGGER "CustomerAcceptance_tenant_guard" BEFORE INSERT OR UPDATE ON "CustomerAcceptance"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT q."companyId" FROM {s}."QuoteRevision" r JOIN {s}."Quote" q ON q.id = r."quoteId" WHERE r.id = $1->>''revisionId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''actorId'''
  );

CREATE TRIGGER "PortalMessage_tenant_guard" BEFORE INSERT OR UPDATE ON "PortalMessage"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."Quote" WHERE id = $1->>''quoteId''',
    'SELECT q."companyId" FROM {s}."QuoteRevision" r JOIN {s}."Quote" q ON q.id = r."quoteId" WHERE r.id = $1->>''baseRevisionId''',
    'SELECT q."companyId" FROM {s}."QuoteRevision" r JOIN {s}."Quote" q ON q.id = r."quoteId" WHERE r.id = $1->>''spawnedRevisionId''',
    'SELECT q."companyId" FROM {s}."QuoteLine" l JOIN {s}."QuoteRevision" r ON r.id = l."revisionId" JOIN {s}."Quote" q ON q.id = r."quoteId" WHERE l.id = $1->>''lineId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''authorId'''
  );

CREATE TRIGGER "OrderLine_tenant_guard" BEFORE INSERT OR UPDATE ON "OrderLine"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."Order" WHERE id = $1->>''orderId''',
    'SELECT "companyId" FROM {s}."Product" WHERE id = $1->>''productId''',
    'SELECT "companyId" FROM {s}."Variant" WHERE id = $1->>''variantId''',
    'SELECT "companyId" FROM {s}."SubscriptionPlan" WHERE id = $1->>''planId''',
    'SELECT q."companyId" FROM {s}."QuoteLine" l JOIN {s}."QuoteRevision" r ON r.id = l."revisionId" JOIN {s}."Quote" q ON q.id = r."quoteId" WHERE l.id = $1->>''sourceQuoteLineId'''
  );

CREATE TRIGGER "Stock_tenant_guard" BEFORE INSERT OR UPDATE ON "Stock"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."Warehouse" WHERE id = $1->>''warehouseId''',
    'SELECT "companyId" FROM {s}."Variant" WHERE id = $1->>''variantId'''
  );

CREATE TRIGGER "StockReceipt_tenant_guard" BEFORE INSERT OR UPDATE ON "StockReceipt"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."Warehouse" WHERE id = $1->>''warehouseId''',
    'SELECT "companyId" FROM {s}."Variant" WHERE id = $1->>''variantId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''receivedById''',
    'SELECT "companyId" FROM {s}."RequestKey" WHERE id = $1->>''requestKeyId'''
  );

CREATE TRIGGER "Reservation_tenant_guard" BEFORE INSERT OR UPDATE ON "Reservation"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."Warehouse" WHERE id = $1->>''warehouseId''',
    'SELECT "companyId" FROM {s}."Variant" WHERE id = $1->>''variantId''',
    'SELECT o."companyId" FROM {s}."OrderLine" ol JOIN {s}."Order" o ON o.id = ol."orderId" WHERE ol.id = $1->>''orderLineId'''
  );

CREATE TRIGGER "Backorder_tenant_guard" BEFORE INSERT OR UPDATE ON "Backorder"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT o."companyId" FROM {s}."OrderLine" ol JOIN {s}."Order" o ON o.id = ol."orderId" WHERE ol.id = $1->>''orderLineId''',
    'SELECT "companyId" FROM {s}."Variant" WHERE id = $1->>''variantId'''
  );

CREATE TRIGGER "Shipment_tenant_guard" BEFORE INSERT OR UPDATE ON "Shipment"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."Order" WHERE id = $1->>''orderId''',
    'SELECT "companyId" FROM {s}."Warehouse" WHERE id = $1->>''warehouseId'''
  );

CREATE TRIGGER "ShipmentLine_tenant_guard" BEFORE INSERT OR UPDATE ON "ShipmentLine"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT o."companyId" FROM {s}."Shipment" sh JOIN {s}."Order" o ON o.id = sh."orderId" WHERE sh.id = $1->>''shipmentId''',
    'SELECT o."companyId" FROM {s}."OrderLine" ol JOIN {s}."Order" o ON o.id = ol."orderId" WHERE ol.id = $1->>''orderLineId''',
    'SELECT w."companyId" FROM {s}."Reservation" rv JOIN {s}."Warehouse" w ON w.id = rv."warehouseId" WHERE rv.id = $1->>''reservationId'''
  );

CREATE TRIGGER "SubscriptionChange_tenant_guard" BEFORE INSERT OR UPDATE ON "SubscriptionChange"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."Subscription" WHERE id = $1->>''subscriptionId''',
    'SELECT "companyId" FROM {s}."SubscriptionPlan" WHERE id = $1->>''beforePlanId''',
    'SELECT "companyId" FROM {s}."SubscriptionPlan" WHERE id = $1->>''afterPlanId''',
    'SELECT "companyId" FROM {s}."Invoice" WHERE id = $1->>''adjustmentInvoiceId'''
  );

CREATE TRIGGER "Payment_tenant_guard" BEFORE INSERT OR UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."Invoice" WHERE id = $1->>''invoiceId''',
    'SELECT "companyId" FROM {s}."User" WHERE id = $1->>''recordedById''',
    'SELECT "companyId" FROM {s}."RequestKey" WHERE id = $1->>''requestKeyId'''
  );

CREATE TRIGGER "CreditApplication_tenant_guard" BEFORE INSERT OR UPDATE ON "CreditApplication"
  FOR EACH ROW EXECUTE FUNCTION dealflow_tenant_guard(
    'SELECT "companyId" FROM {s}."Invoice" WHERE id = $1->>''invoiceId''',
    'SELECT "companyId" FROM {s}."CreditNote" WHERE id = $1->>''creditNoteId''',
    'SELECT "companyId" FROM {s}."RequestKey" WHERE id = $1->>''requestKeyId'''
  );
