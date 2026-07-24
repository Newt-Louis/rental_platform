CREATE TYPE "ServiceContractStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'PENDING_SIGNATURE', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED', 'CANCELLED');
CREATE TYPE "ServiceContractType" AS ENUM ('SERVICE', 'MAINTENANCE', 'SUPPLY', 'CONSULTING', 'INSURANCE', 'SECURITY', 'CLEANING', 'OTHER');

CREATE TABLE "ServiceContract" (
  "id" TEXT NOT NULL,
  "contractNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "mallId" TEXT NOT NULL,
  "counterpartyName" TEXT NOT NULL,
  "counterpartyTax" TEXT,
  "counterpartyEmail" TEXT,
  "counterpartyPhone" TEXT,
  "type" "ServiceContractType" NOT NULL DEFAULT 'SERVICE',
  "status" "ServiceContractStatus" NOT NULL DEFAULT 'DRAFT',
  "signedDate" TIMESTAMP(3),
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "terminatedDate" TIMESTAMP(3),
  "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'VND',
  "ownerId" TEXT,
  "createdById" TEXT NOT NULL,
  "parentContractId" TEXT,
  "notes" TEXT,
  "tags" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceContract_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ServiceContractDocument" (
  "id" TEXT NOT NULL, "contractId" TEXT NOT NULL, "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL, "fileSize" INTEGER NOT NULL, "mimeType" TEXT NOT NULL,
  "documentType" TEXT NOT NULL DEFAULT 'CONTRACT', "version" INTEGER NOT NULL DEFAULT 1,
  "uploadedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceContractDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ServiceContractEvent" (
  "id" TEXT NOT NULL, "contractId" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "description" TEXT, "oldValue" TEXT, "newValue" TEXT, "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceContractEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceContract_contractNumber_key" ON "ServiceContract"("contractNumber");
CREATE INDEX "ServiceContract_mallId_status_idx" ON "ServiceContract"("mallId", "status");
CREATE INDEX "ServiceContract_endDate_idx" ON "ServiceContract"("endDate");
CREATE INDEX "ServiceContract_counterpartyName_idx" ON "ServiceContract"("counterpartyName");
CREATE INDEX "ServiceContractDocument_contractId_documentType_idx" ON "ServiceContractDocument"("contractId", "documentType");
CREATE INDEX "ServiceContractEvent_contractId_createdAt_idx" ON "ServiceContractEvent"("contractId", "createdAt");
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_parentContractId_fkey" FOREIGN KEY ("parentContractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceContractDocument" ADD CONSTRAINT "ServiceContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceContractEvent" ADD CONSTRAINT "ServiceContractEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
