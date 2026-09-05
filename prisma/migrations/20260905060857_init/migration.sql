-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SALES_REP', 'SALES_MANAGER', 'FINANCE', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "DiscountTier" AS ENUM ('STANDARD', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "QuoteStage" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'UNDER_NEGOTIATION', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RevisionApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ApprovalDecisionKind" AS ENUM ('APPROVE', 'REJECT', 'RETURN');

-- CreateEnum
CREATE TYPE "ApprovalStepStatus" AS ENUM ('PENDING', 'APPROVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('NONE', 'MANAGER', 'FINANCE');

-- CreateEnum
CREATE TYPE "LineBillingKind" AS ENUM ('ONE_TIME', 'RECURRING');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING', 'PARTIAL', 'ALLOCATED', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'SHIPPED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PLANNED', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionChangeKind" AS ENUM ('QUANTITY', 'PLAN', 'PAUSE', 'RESUME', 'CANCEL');

-- CreateEnum
CREATE TYPE "CancelPolicy" AS ENUM ('IMMEDIATE', 'PERIOD_END');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('ONE_TIME', 'RECURRING', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD', 'CHEQUE', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('CANCELLATION', 'PRORATION', 'GOODWILL');

-- CreateEnum
CREATE TYPE "HealthFlagType" AS ENUM ('STALLED', 'DISCOUNT_ANOMALY', 'DELIVERY_RISK');

-- CreateEnum
CREATE TYPE "TaskAction" AS ENUM ('NUDGE', 'ESCALATE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PortalMessageStatus" AS ENUM ('OPEN', 'INCORPORATED', 'DECLINED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "RequestScope" AS ENUM ('CONFIRM_ORDER', 'BILLING_INIT', 'PAYMENT', 'CREDIT_APPLY', 'ALLOCATION_ACCEPT', 'DUE_BILLING', 'STOCK_RECEIPT');

-- CreateEnum
CREATE TYPE "RequestResultKind" AS ENUM ('ORDER', 'INVOICE', 'PAYMENT', 'CREDIT_APPLICATION', 'ALLOCATION', 'SUBSCRIPTION_SET', 'STOCK_RECEIPT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING',
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "discountTier" "DiscountTier" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "priceListId" TEXT NOT NULL,
    "assignedRepId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "taxPct" DECIMAL(5,2) NOT NULL,
    "basePrice" DECIMAL(14,2) NOT NULL,
    "baseCost" DECIMAL(14,2) NOT NULL,
    "stockTracked" BOOLEAN NOT NULL,
    "defaultPlanId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "extraPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost" DECIMAL(14,2) NOT NULL,
    "shippingWeight" DECIMAL(10,3),
    "attributes" JSONB,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceRule" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "tier" "DiscountTier" NOT NULL,
    "currency" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "anyExcessRequiresManager" BOOLEAN NOT NULL,
    "managerWorstExcessPct" DECIMAL(5,2) NOT NULL,
    "managerWeightedExcessPct" DECIMAL(5,2) NOT NULL,
    "financeWorstExcessPct" DECIMAL(5,2) NOT NULL,
    "financeWeightedExcessPct" DECIMAL(5,2) NOT NULL,
    "totalDiscountBudgetPct" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyTierCeiling" (
    "id" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "tier" "DiscountTier" NOT NULL,
    "ceilingPct" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyTierCeiling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyCategoryCeiling" (
    "id" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "tier" "DiscountTier" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "ceilingPct" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyCategoryCeiling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyChainStep" (
    "id" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyChainStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "teamId" TEXT,
    "currentRevisionId" TEXT,
    "stage" "QuoteStage" NOT NULL DEFAULT 'DRAFT',
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRevision" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "weightedExcessPct" DECIMAL(5,2) NOT NULL,
    "worstLineExcessPct" DECIMAL(5,2) NOT NULL,
    "evaluationReasons" JSONB NOT NULL,
    "approvalStatus" "RevisionApprovalStatus" NOT NULL,
    "orderDiscountPct" DECIMAL(5,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "promisedDate" DATE,
    "oneTimeSubtotal" DECIMAL(14,2) NOT NULL,
    "oneTimeTax" DECIMAL(14,2) NOT NULL,
    "oneTimeTotal" DECIMAL(14,2) NOT NULL,
    "recurringMonthly" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "recurringQuarterly" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "recurringYearly" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "marginPct" DECIMAL(5,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "planId" TEXT,
    "billingKind" "LineBillingKind" NOT NULL,
    "interval" "BillingInterval",
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "lineDiscountPct" DECIMAL(5,2) NOT NULL,
    "effectiveDiscountPct" DECIMAL(5,2) NOT NULL,
    "ceilingPct" DECIMAL(5,2) NOT NULL,
    "excessPct" DECIMAL(5,2) NOT NULL,
    "excessAmount" DECIMAL(14,2) NOT NULL,
    "taxPct" DECIMAL(5,2) NOT NULL,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "categoryId" TEXT NOT NULL,
    "stockTracked" BOOLEAN NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRevisionApprovalStep" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "role" "Role" NOT NULL,
    "status" "ApprovalStepStatus" NOT NULL DEFAULT 'PENDING',
    "decisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRevisionApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" "Role" NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "kind" "ApprovalDecisionKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAcceptance" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalMessage" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "baseRevisionId" TEXT NOT NULL,
    "lineId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "status" "PortalMessageStatus" NOT NULL DEFAULT 'OPEN',
    "proposedDiscountPct" DECIMAL(5,2),
    "proposedQty" INTEGER,
    "proposedPromisedDate" DATE,
    "spawnedRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "sourceRevisionId" TEXT NOT NULL,
    "acceptanceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "teamId" TEXT,
    "currency" TEXT NOT NULL,
    "promisedDate" DATE,
    "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sourceQuoteLineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "lineDiscountPct" DECIMAL(5,2) NOT NULL,
    "taxPct" DECIMAL(5,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "billingKind" "LineBillingKind" NOT NULL,
    "interval" "BillingInterval",
    "planId" TEXT,
    "stockTracked" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shippingCost" DECIMAL(14,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL,
    "reorderAt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceipt" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "receivedById" TEXT NOT NULL,
    "requestKeyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backorder" (
    "id" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Backorder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PLANNED',
    "shippingCostSnapshot" DECIMAL(14,2) NOT NULL,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLine" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "cancelPolicy" "CancelPolicy" NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "sourceOrderLineId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "anchorDay" INTEGER NOT NULL,
    "currentPeriodStart" DATE NOT NULL,
    "currentPeriodEnd" DATE NOT NULL,
    "nextBillingDate" DATE,
    "cancelPolicy" "CancelPolicy" NOT NULL,
    "cancelEffectiveDate" DATE,
    "pausedAt" TIMESTAMP(3),
    "pendingPlanId" TEXT,
    "pendingPlanEffectiveDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionChange" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "kind" "SubscriptionChangeKind" NOT NULL,
    "beforeQuantity" INTEGER,
    "afterQuantity" INTEGER,
    "beforePlanId" TEXT,
    "afterPlanId" TEXT,
    "effectiveDate" DATE NOT NULL,
    "remainingDays" INTEGER,
    "periodDays" INTEGER,
    "adjustmentAmount" DECIMAL(14,2),
    "adjustmentInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "subscriptionId" TEXT,
    "kind" "InvoiceKind" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "currency" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "periodStart" DATE,
    "periodEnd" DATE,
    "dueDate" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL,
    "taxPct" DECIMAL(5,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceInvoiceId" TEXT NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "recordedById" TEXT NOT NULL,
    "requestKeyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditApplication" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "requestKeyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationRule" (
    "id" TEXT NOT NULL,
    "baseProductId" TEXT NOT NULL,
    "candidateProductId" TEXT NOT NULL,
    "copurchaseScore" DECIMAL(8,4) NOT NULL,
    "promotionTag" TEXT,
    "minMarginPct" DECIMAL(5,2) NOT NULL,
    "status" "RuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "stalledAfterDays" INTEGER NOT NULL DEFAULT 5,
    "anomalyMinSamples" INTEGER NOT NULL DEFAULT 3,
    "anomalyExcessPoints" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "deliveryRiskLeadDays" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthFlag" (
    "id" TEXT NOT NULL,
    "type" "HealthFlagType" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "quoteId" TEXT,
    "orderId" TEXT,
    "reason" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "flagId" TEXT NOT NULL,
    "quoteId" TEXT,
    "orderId" TEXT,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "action" "TaskAction" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "revisionId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestKey" (
    "id" TEXT NOT NULL,
    "scope" "RequestScope" NOT NULL,
    "key" TEXT NOT NULL,
    "actorId" TEXT,
    "resultKind" "RequestResultKind",
    "resultId" TEXT,
    "resultPayload" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTeam_name_key" ON "SalesTeam"("name");

-- CreateIndex
CREATE INDEX "CustomerMembership_customerId_idx" ON "CustomerMembership"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMembership_userId_customerId_key" ON "CustomerMembership"("userId", "customerId");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_assignedRepId_idx" ON "Customer"("assignedRepId");

-- CreateIndex
CREATE INDEX "Customer_discountTier_idx" ON "Customer"("discountTier");

-- CreateIndex
CREATE UNIQUE INDEX "Category_code_key" ON "Category"("code");

-- CreateIndex
CREATE INDEX "Category_active_name_idx" ON "Category"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_categoryId_archivedAt_idx" ON "Product"("categoryId", "archivedAt");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_sku_key" ON "Variant"("sku");

-- CreateIndex
CREATE INDEX "Variant_productId_idx" ON "Variant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceList_code_key" ON "PriceList"("code");

-- CreateIndex
CREATE INDEX "PriceRule_priceListId_productId_variantId_tier_currency_act_idx" ON "PriceRule"("priceListId", "productId", "variantId", "tier", "currency", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyTierCeiling_policyVersionId_tier_key" ON "PolicyTierCeiling"("policyVersionId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyCategoryCeiling_policyVersionId_tier_categoryId_key" ON "PolicyCategoryCeiling"("policyVersionId", "tier", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyChainStep_policyVersionId_stepIndex_key" ON "PolicyChainStep"("policyVersionId", "stepIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_currentRevisionId_key" ON "Quote"("currentRevisionId");

-- CreateIndex
CREATE INDEX "Quote_customerId_stage_idx" ON "Quote"("customerId", "stage");

-- CreateIndex
CREATE INDEX "Quote_repId_stage_idx" ON "Quote"("repId", "stage");

-- CreateIndex
CREATE INDEX "Quote_stage_lastActivityAt_idx" ON "Quote"("stage", "lastActivityAt");

-- CreateIndex
CREATE INDEX "QuoteRevision_quoteId_createdAt_idx" ON "QuoteRevision"("quoteId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteRevision_policyVersionId_idx" ON "QuoteRevision"("policyVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRevision_quoteId_revisionNumber_key" ON "QuoteRevision"("quoteId", "revisionNumber");

-- CreateIndex
CREATE INDEX "QuoteLine_productId_idx" ON "QuoteLine"("productId");

-- CreateIndex
CREATE INDEX "QuoteLine_variantId_idx" ON "QuoteLine"("variantId");

-- CreateIndex
CREATE INDEX "QuoteLine_revisionId_idx" ON "QuoteLine"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteLine_revisionId_position_key" ON "QuoteLine"("revisionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRevisionApprovalStep_decisionId_key" ON "QuoteRevisionApprovalStep"("decisionId");

-- CreateIndex
CREATE INDEX "QuoteRevisionApprovalStep_revisionId_status_idx" ON "QuoteRevisionApprovalStep"("revisionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRevisionApprovalStep_revisionId_stepIndex_key" ON "QuoteRevisionApprovalStep"("revisionId", "stepIndex");

-- CreateIndex
CREATE INDEX "ApprovalDecision_revisionId_createdAt_idx" ON "ApprovalDecision"("revisionId", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalDecision_actorId_idx" ON "ApprovalDecision"("actorId");

-- CreateIndex
CREATE INDEX "CustomerAcceptance_revisionId_idx" ON "CustomerAcceptance"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAcceptance_revisionId_actorId_key" ON "CustomerAcceptance"("revisionId", "actorId");

-- CreateIndex
CREATE INDEX "PortalMessage_quoteId_createdAt_idx" ON "PortalMessage"("quoteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_sourceRevisionId_key" ON "Order"("sourceRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_acceptanceId_key" ON "Order"("acceptanceId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_fulfillmentStatus_idx" ON "Order"("fulfillmentStatus");

-- CreateIndex
CREATE INDEX "Order_promisedDate_fulfillmentStatus_idx" ON "Order"("promisedDate", "fulfillmentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_sourceQuoteLineId_key" ON "OrderLine"("sourceQuoteLineId");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_variantId_idx" ON "OrderLine"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE INDEX "Warehouse_active_name_idx" ON "Warehouse"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_warehouseId_variantId_key" ON "Stock"("warehouseId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReceipt_requestKeyId_key" ON "StockReceipt"("requestKeyId");

-- CreateIndex
CREATE INDEX "Reservation_orderLineId_status_idx" ON "Reservation"("orderLineId", "status");

-- CreateIndex
CREATE INDEX "Reservation_warehouseId_variantId_status_idx" ON "Reservation"("warehouseId", "variantId", "status");

-- CreateIndex
CREATE INDEX "Backorder_orderLineId_idx" ON "Backorder"("orderLineId");

-- CreateIndex
CREATE INDEX "Backorder_variantId_resolvedAt_idx" ON "Backorder"("variantId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Shipment_orderId_status_idx" ON "Shipment"("orderId", "status");

-- CreateIndex
CREATE INDEX "ShipmentLine_shipmentId_idx" ON "ShipmentLine"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_sourceOrderLineId_key" ON "Subscription"("sourceOrderLineId");

-- CreateIndex
CREATE INDEX "Subscription_status_nextBillingDate_idx" ON "Subscription"("status", "nextBillingDate");

-- CreateIndex
CREATE INDEX "Subscription_customerId_idx" ON "Subscription"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionChange_adjustmentInvoiceId_key" ON "SubscriptionChange"("adjustmentInvoiceId");

-- CreateIndex
CREATE INDEX "SubscriptionChange_subscriptionId_createdAt_idx" ON "SubscriptionChange"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_customerId_status_idx" ON "Invoice"("customerId", "status");

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_subscriptionId_periodStart_idx" ON "Invoice"("subscriptionId", "periodStart");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_requestKeyId_key" ON "Payment"("requestKeyId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditApplication_requestKeyId_key" ON "CreditApplication"("requestKeyId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditApplication_creditNoteId_invoiceId_key" ON "CreditApplication"("creditNoteId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationRule_baseProductId_candidateProductId_key" ON "RecommendationRule"("baseProductId", "candidateProductId");

-- CreateIndex
CREATE INDEX "HealthFlag_resolvedAt_type_idx" ON "HealthFlag"("resolvedAt", "type");

-- CreateIndex
CREATE INDEX "HealthFlag_quoteId_resolvedAt_idx" ON "HealthFlag"("quoteId", "resolvedAt");

-- CreateIndex
CREATE INDEX "HealthFlag_orderId_resolvedAt_idx" ON "HealthFlag"("orderId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_actionKey_key" ON "Task"("actionKey");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_idx" ON "Task"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestKey_resultKind_resultId_idx" ON "RequestKey"("resultKind", "resultId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestKey_scope_key_key" ON "RequestKey"("scope", "key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "SalesTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMembership" ADD CONSTRAINT "CustomerMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMembership" ADD CONSTRAINT "CustomerMembership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_assignedRepId_fkey" FOREIGN KEY ("assignedRepId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "SalesTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_defaultPlanId_fkey" FOREIGN KEY ("defaultPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyTierCeiling" ADD CONSTRAINT "PolicyTierCeiling_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyCategoryCeiling" ADD CONSTRAINT "PolicyCategoryCeiling_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyCategoryCeiling" ADD CONSTRAINT "PolicyCategoryCeiling_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyChainStep" ADD CONSTRAINT "PolicyChainStep_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "SalesTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevisionApprovalStep" ADD CONSTRAINT "QuoteRevisionApprovalStep_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevisionApprovalStep" ADD CONSTRAINT "QuoteRevisionApprovalStep_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ApprovalDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAcceptance" ADD CONSTRAINT "CustomerAcceptance_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAcceptance" ADD CONSTRAINT "CustomerAcceptance_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalMessage" ADD CONSTRAINT "PortalMessage_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalMessage" ADD CONSTRAINT "PortalMessage_baseRevisionId_fkey" FOREIGN KEY ("baseRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalMessage" ADD CONSTRAINT "PortalMessage_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "QuoteLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalMessage" ADD CONSTRAINT "PortalMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalMessage" ADD CONSTRAINT "PortalMessage_spawnedRevisionId_fkey" FOREIGN KEY ("spawnedRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_acceptanceId_fkey" FOREIGN KEY ("acceptanceId") REFERENCES "CustomerAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "SalesTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_requestKeyId_fkey" FOREIGN KEY ("requestKeyId") REFERENCES "RequestKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backorder" ADD CONSTRAINT "Backorder_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backorder" ADD CONSTRAINT "Backorder_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_sourceOrderLineId_fkey" FOREIGN KEY ("sourceOrderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_beforePlanId_fkey" FOREIGN KEY ("beforePlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_afterPlanId_fkey" FOREIGN KEY ("afterPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_adjustmentInvoiceId_fkey" FOREIGN KEY ("adjustmentInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_sourceInvoiceId_fkey" FOREIGN KEY ("sourceInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_requestKeyId_fkey" FOREIGN KEY ("requestKeyId") REFERENCES "RequestKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_requestKeyId_fkey" FOREIGN KEY ("requestKeyId") REFERENCES "RequestKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationRule" ADD CONSTRAINT "RecommendationRule_baseProductId_fkey" FOREIGN KEY ("baseProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationRule" ADD CONSTRAINT "RecommendationRule_candidateProductId_fkey" FOREIGN KEY ("candidateProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthFlag" ADD CONSTRAINT "HealthFlag_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthFlag" ADD CONSTRAINT "HealthFlag_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "HealthFlag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestKey" ADD CONSTRAINT "RequestKey_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level invariants and partial unique indexes Prisma cannot express.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_taxPct_range" CHECK ("taxPct" BETWEEN 0 AND 100),
  ADD CONSTRAINT "Product_amounts_nonnegative" CHECK ("basePrice" >= 0 AND "baseCost" >= 0);

ALTER TABLE "Variant"
  ADD CONSTRAINT "Variant_amounts_nonnegative" CHECK ("extraPrice" >= 0 AND "cost" >= 0),
  ADD CONSTRAINT "Variant_shippingWeight_positive" CHECK ("shippingWeight" IS NULL OR "shippingWeight" > 0);

ALTER TABLE "PriceRule"
  ADD CONSTRAINT "PriceRule_unitPrice_nonnegative" CHECK ("unitPrice" >= 0);

ALTER TABLE "PolicyVersion"
  ADD CONSTRAINT "PolicyVersion_thresholds_range" CHECK (
    "managerWorstExcessPct" BETWEEN 0 AND 100
    AND "managerWeightedExcessPct" BETWEEN 0 AND 100
    AND "financeWorstExcessPct" BETWEEN 0 AND 100
    AND "financeWeightedExcessPct" BETWEEN 0 AND 100
    AND ("totalDiscountBudgetPct" IS NULL OR "totalDiscountBudgetPct" BETWEEN 0 AND 100)
  ),
  ADD CONSTRAINT "PolicyVersion_finance_not_lower" CHECK (
    "financeWorstExcessPct" >= "managerWorstExcessPct"
    AND "financeWeightedExcessPct" >= "managerWeightedExcessPct"
  );

ALTER TABLE "PolicyTierCeiling"
  ADD CONSTRAINT "PolicyTierCeiling_ceilingPct_range" CHECK ("ceilingPct" BETWEEN 0 AND 100);

ALTER TABLE "PolicyCategoryCeiling"
  ADD CONSTRAINT "PolicyCategoryCeiling_ceilingPct_range" CHECK ("ceilingPct" BETWEEN 0 AND 100);

ALTER TABLE "PolicyChainStep"
  ADD CONSTRAINT "PolicyChainStep_stepIndex_nonnegative" CHECK ("stepIndex" >= 0),
  ADD CONSTRAINT "PolicyChainStep_role_internal" CHECK ("role" IN ('SALES_MANAGER', 'FINANCE'));

ALTER TABLE "QuoteRevision"
  ADD CONSTRAINT "QuoteRevision_percentages_range" CHECK (
    "orderDiscountPct" BETWEEN 0 AND 100
    AND "weightedExcessPct" BETWEEN 0 AND 100
    AND "worstLineExcessPct" BETWEEN 0 AND 100
    AND "marginPct" BETWEEN -100 AND 100
  ),
  ADD CONSTRAINT "QuoteRevision_totals_nonnegative" CHECK (
    "oneTimeSubtotal" >= 0 AND "oneTimeTax" >= 0 AND "oneTimeTotal" >= 0
    AND "recurringMonthly" >= 0 AND "recurringQuarterly" >= 0 AND "recurringYearly" >= 0
    AND "totalCost" >= 0
  );

ALTER TABLE "QuoteLine"
  ADD CONSTRAINT "QuoteLine_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "QuoteLine_percentages_range" CHECK (
    "lineDiscountPct" BETWEEN 0 AND 100
    AND "effectiveDiscountPct" BETWEEN 0 AND 100
    AND "ceilingPct" BETWEEN 0 AND 100
    AND "excessPct" BETWEEN 0 AND 100
    AND "taxPct" BETWEEN 0 AND 100
  ),
  ADD CONSTRAINT "QuoteLine_amounts_nonnegative" CHECK (
    "unitPrice" >= 0 AND "unitCost" >= 0 AND "excessAmount" >= 0
    AND "lineSubtotal" >= 0 AND "taxAmount" >= 0 AND "lineTotal" >= 0
  ),
  ADD CONSTRAINT "QuoteLine_billing_shape" CHECK (
    ("billingKind" = 'ONE_TIME' AND "planId" IS NULL AND "interval" IS NULL)
    OR ("billingKind" = 'RECURRING' AND "planId" IS NOT NULL AND "interval" IS NOT NULL)
  );

ALTER TABLE "QuoteRevisionApprovalStep"
  ADD CONSTRAINT "QuoteRevisionApprovalStep_stepIndex_nonnegative" CHECK ("stepIndex" >= 0),
  ADD CONSTRAINT "QuoteRevisionApprovalStep_role_internal" CHECK ("role" IN ('SALES_MANAGER', 'FINANCE'));

ALTER TABLE "PortalMessage"
  ADD CONSTRAINT "PortalMessage_proposedDiscountPct_range" CHECK (
    "proposedDiscountPct" IS NULL OR "proposedDiscountPct" BETWEEN 0 AND 100
  ),
  ADD CONSTRAINT "PortalMessage_proposedQty_positive" CHECK (
    "proposedQty" IS NULL OR "proposedQty" > 0
  );

ALTER TABLE "OrderLine"
  ADD CONSTRAINT "OrderLine_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "OrderLine_percentages_range" CHECK (
    "lineDiscountPct" BETWEEN 0 AND 100 AND "taxPct" BETWEEN 0 AND 100
  ),
  ADD CONSTRAINT "OrderLine_amounts_nonnegative" CHECK (
    "unitPrice" >= 0 AND "unitCost" >= 0 AND "lineTotal" >= 0
  ),
  ADD CONSTRAINT "OrderLine_billing_shape" CHECK (
    ("billingKind" = 'ONE_TIME' AND "planId" IS NULL AND "interval" IS NULL)
    OR ("billingKind" = 'RECURRING' AND "planId" IS NOT NULL AND "interval" IS NOT NULL)
  );

ALTER TABLE "Warehouse"
  ADD CONSTRAINT "Warehouse_shippingCost_nonnegative" CHECK ("shippingCost" >= 0);

ALTER TABLE "Stock"
  ADD CONSTRAINT "Stock_balances_valid" CHECK (
    "onHand" >= 0 AND "reserved" >= 0 AND "reserved" <= "onHand" AND "reorderAt" >= 0
  );

ALTER TABLE "StockReceipt"
  ADD CONSTRAINT "StockReceipt_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "Reservation_release_coherent" CHECK (
    ("status" = 'RELEASED' AND "releasedAt" IS NOT NULL)
    OR ("status" IN ('ACTIVE', 'SHIPPED') AND "releasedAt" IS NULL)
  );

ALTER TABLE "Shipment"
  ADD CONSTRAINT "Shipment_cost_nonnegative" CHECK ("shippingCostSnapshot" >= 0),
  ADD CONSTRAINT "Shipment_status_timestamps_coherent" CHECK (
    ("shippedAt" IS NULL OR "status" IN ('SHIPPED', 'DELIVERED'))
    AND ("deliveredAt" IS NULL OR "status" = 'DELIVERED')
  ),
  ADD CONSTRAINT "Shipment_timestamps_ordered" CHECK (
    "deliveredAt" IS NULL OR ("shippedAt" IS NOT NULL AND "deliveredAt" >= "shippedAt")
  );

ALTER TABLE "ShipmentLine"
  ADD CONSTRAINT "ShipmentLine_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "Backorder"
  ADD CONSTRAINT "Backorder_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_values_valid" CHECK (
    "quantity" > 0 AND "unitPrice" >= 0 AND "anchorDay" BETWEEN 1 AND 31
  ),
  ADD CONSTRAINT "Subscription_period_ordered" CHECK (
    "currentPeriodStart" < "currentPeriodEnd"
    AND ("nextBillingDate" IS NULL OR "nextBillingDate" >= "currentPeriodEnd")
  ),
  ADD CONSTRAINT "Subscription_pending_plan_coherent" CHECK (
    ("pendingPlanId" IS NULL AND "pendingPlanEffectiveDate" IS NULL)
    OR ("pendingPlanId" IS NOT NULL AND "pendingPlanEffectiveDate" IS NOT NULL)
  );

ALTER TABLE "SubscriptionChange"
  ADD CONSTRAINT "SubscriptionChange_quantities_positive" CHECK (
    ("beforeQuantity" IS NULL OR "beforeQuantity" > 0)
    AND ("afterQuantity" IS NULL OR "afterQuantity" > 0)
  ),
  ADD CONSTRAINT "SubscriptionChange_proration_valid" CHECK (
    ("remainingDays" IS NULL OR "remainingDays" >= 0)
    AND ("periodDays" IS NULL OR "periodDays" > 0)
    AND ("remainingDays" IS NULL OR "periodDays" IS NULL OR "remainingDays" <= "periodDays")
  );

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_dates_ordered" CHECK (
    "dueDate" >= "issueDate"
    AND (
      ("periodStart" IS NULL AND "periodEnd" IS NULL)
      OR ("periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL AND "periodStart" < "periodEnd")
    )
  ),
  ADD CONSTRAINT "Invoice_totals_nonnegative" CHECK (
    "subtotal" >= 0 AND "taxTotal" >= 0 AND "total" >= 0
  ),
  ADD CONSTRAINT "Invoice_kind_shape" CHECK (
    ("kind" = 'ONE_TIME' AND "orderId" IS NOT NULL AND "subscriptionId" IS NULL AND "periodStart" IS NULL AND "periodEnd" IS NULL)
    OR ("kind" IN ('RECURRING', 'ADJUSTMENT') AND "subscriptionId" IS NOT NULL AND "periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL)
  );

ALTER TABLE "InvoiceLine"
  ADD CONSTRAINT "InvoiceLine_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "InvoiceLine_percentages_range" CHECK (
    "discountPct" BETWEEN 0 AND 100 AND "taxPct" BETWEEN 0 AND 100
  );

ALTER TABLE "CreditNote"
  ADD CONSTRAINT "CreditNote_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "CreditApplication"
  ADD CONSTRAINT "CreditApplication_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "RecommendationRule"
  ADD CONSTRAINT "RecommendationRule_values_valid" CHECK (
    "copurchaseScore" >= 0 AND "minMarginPct" BETWEEN 0 AND 100
    AND "baseProductId" <> "candidateProductId"
  );

ALTER TABLE "HealthFlag"
  ADD CONSTRAINT "HealthFlag_one_subject" CHECK (
    ("quoteId" IS NOT NULL AND "orderId" IS NULL)
    OR ("quoteId" IS NULL AND "orderId" IS NOT NULL)
  ),
  ADD CONSTRAINT "HealthFlag_resolution_ordered" CHECK (
    "resolvedAt" IS NULL OR "resolvedAt" >= "detectedAt"
  );

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_one_subject" CHECK (
    ("quoteId" IS NOT NULL AND "orderId" IS NULL)
    OR ("quoteId" IS NULL AND "orderId" IS NOT NULL)
  ),
  ADD CONSTRAINT "Task_completion_coherent" CHECK (
    ("status" = 'DONE' AND "completedAt" IS NOT NULL)
    OR ("status" <> 'DONE' AND "completedAt" IS NULL)
  );

ALTER TABLE "RequestKey"
  ADD CONSTRAINT "RequestKey_result_coherent" CHECK (
    ("completedAt" IS NULL AND "resultKind" IS NULL AND "resultId" IS NULL AND "resultPayload" IS NULL)
    OR ("completedAt" IS NOT NULL AND "resultKind" IS NOT NULL AND "resultId" IS NOT NULL)
  );

CREATE UNIQUE INDEX "HealthFlag_one_active_fingerprint"
  ON "HealthFlag" ("fingerprint")
  WHERE "resolvedAt" IS NULL;

CREATE UNIQUE INDEX "PriceRule_unique_product_price"
  ON "PriceRule" ("priceListId", "productId", "tier", "currency")
  WHERE "variantId" IS NULL AND "active" = true;

CREATE UNIQUE INDEX "PriceRule_unique_variant_price"
  ON "PriceRule" ("priceListId", "variantId", "tier", "currency")
  WHERE "variantId" IS NOT NULL AND "active" = true;

CREATE UNIQUE INDEX "Invoice_one_time_per_order"
  ON "Invoice" ("orderId")
  WHERE "kind" = 'ONE_TIME' AND "orderId" IS NOT NULL AND "status" <> 'VOID';

CREATE UNIQUE INDEX "Invoice_recurring_per_period"
  ON "Invoice" ("subscriptionId", "periodStart")
  WHERE "kind" = 'RECURRING'
    AND "subscriptionId" IS NOT NULL
    AND "periodStart" IS NOT NULL
    AND "status" <> 'VOID';

ALTER TABLE "HealthSettings"
  ADD CONSTRAINT "HealthSettings_values_valid" CHECK (
    "stalledAfterDays" > 0 AND "anomalyMinSamples" > 0
    AND "anomalyExcessPoints" >= 0 AND "deliveryRiskLeadDays" >= 0
  );
