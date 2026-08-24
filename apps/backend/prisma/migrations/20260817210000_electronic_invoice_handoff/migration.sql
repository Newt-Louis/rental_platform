ALTER TABLE "Invoice"
  ADD COLUMN "electronicInvoiceStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN "electronicInvoiceRef" TEXT,
  ADD COLUMN "electronicInvoiceIssuedAt" TIMESTAMP(3),
  ADD COLUMN "electronicInvoiceError" TEXT,
  ADD COLUMN "legalInvoiceNumber" TEXT;

CREATE INDEX "Invoice_electronicInvoiceStatus_idx" ON "Invoice"("electronicInvoiceStatus");
