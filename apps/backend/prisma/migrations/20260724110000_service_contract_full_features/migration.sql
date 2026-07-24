ALTER TYPE "ServiceContractStatus" ADD VALUE IF NOT EXISTS 'PROPOSAL';
ALTER TYPE "ServiceContractStatus" ADD VALUE IF NOT EXISTS 'RENEWED';
ALTER TYPE "ServiceContractType" ADD VALUE IF NOT EXISTS 'LABOR';
ALTER TYPE "ServiceContractType" ADD VALUE IF NOT EXISTS 'CONSTRUCTION';
ALTER TYPE "ServiceContractType" ADD VALUE IF NOT EXISTS 'PARTNERSHIP';
ALTER TYPE "ServiceContractType" ADD VALUE IF NOT EXISTS 'CONFIDENTIALITY';
ALTER TYPE "ServiceContractType" ADD VALUE IF NOT EXISTS 'SOFTWARE';
ALTER TABLE "ServiceContract" ADD COLUMN "workflowStage" TEXT,
ADD COLUMN "workflowColor" TEXT,
ADD COLUMN "paymentDirection" TEXT NOT NULL DEFAULT 'PAYABLE',
ADD COLUMN "productName" TEXT,
ADD COLUMN "riskScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "hasAllRequiredClauses" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ServiceContractPayment" (
 "id" TEXT NOT NULL, "contractId" TEXT NOT NULL, "milestone" TEXT NOT NULL,
 "dueDate" TIMESTAMP(3) NOT NULL, "amount" DOUBLE PRECISION NOT NULL,
 "currency" TEXT NOT NULL DEFAULT 'VND', "status" TEXT NOT NULL DEFAULT 'PENDING',
 "paidDate" TIMESTAMP(3), "paidAmount" DOUBLE PRECISION, "invoiceNumber" TEXT,
 "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ServiceContractPayment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ServiceContractChecklistItem" (
 "id" TEXT NOT NULL, "contractId" TEXT NOT NULL, "title" TEXT NOT NULL,
 "description" TEXT, "isCompleted" BOOLEAN NOT NULL DEFAULT false, "completedAt" TIMESTAMP(3),
 "completedById" TEXT, "dueDate" TIMESTAMP(3), "order" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ServiceContractChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ServiceContractMilestone" (
 "id" TEXT NOT NULL, "contractId" TEXT NOT NULL, "title" TEXT NOT NULL,
 "description" TEXT, "dueDate" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'PENDING',
 "completedAt" TIMESTAMP(3), "completedById" TEXT, "order" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ServiceContractMilestone_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ServiceContractDocument" ADD COLUMN "paymentId" TEXT;
CREATE INDEX "ServiceContractPayment_contractId_dueDate_idx" ON "ServiceContractPayment"("contractId", "dueDate");
CREATE INDEX "ServiceContractPayment_status_dueDate_idx" ON "ServiceContractPayment"("status", "dueDate");
CREATE INDEX "ServiceContractChecklistItem_contractId_order_idx" ON "ServiceContractChecklistItem"("contractId", "order");
CREATE INDEX "ServiceContractMilestone_contractId_order_idx" ON "ServiceContractMilestone"("contractId", "order");
ALTER TABLE "ServiceContractPayment" ADD CONSTRAINT "ServiceContractPayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceContractChecklistItem" ADD CONSTRAINT "ServiceContractChecklistItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceContractMilestone" ADD CONSTRAINT "ServiceContractMilestone_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceContractDocument" ADD CONSTRAINT "ServiceContractDocument_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ServiceContractPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
