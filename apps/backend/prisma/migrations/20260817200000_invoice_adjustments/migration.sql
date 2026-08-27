CREATE TYPE "InvoiceAdjustmentType" AS ENUM ('CREDIT_NOTE', 'DEBIT_NOTE', 'WRITE_OFF', 'REFUND');
CREATE TYPE "InvoiceAdjustmentStatus" AS ENUM ('APPROVED', 'CANCELLED');

ALTER TABLE "Invoice"
  ADD COLUMN "adjustmentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "InvoiceAdjustment" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "type" "InvoiceAdjustmentType" NOT NULL,
  "status" "InvoiceAdjustmentStatus" NOT NULL DEFAULT 'APPROVED',
  "amount" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "reference" TEXT,
  "createdById" TEXT NOT NULL,
  "cancelledById" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceAdjustment_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "InvoiceAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "InvoiceAdjustment_invoiceId_status_createdAt_idx" ON "InvoiceAdjustment"("invoiceId", "status", "createdAt");
