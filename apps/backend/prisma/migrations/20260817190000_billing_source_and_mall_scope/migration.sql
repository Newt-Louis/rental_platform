-- Give every receivable a first-class Mall scope and preserve the legal
-- counterparty snapshot used when an invoice is issued.
ALTER TABLE "Invoice"
  ADD COLUMN "mallId" TEXT,
  ADD COLUMN "counterpartyName" TEXT,
  ADD COLUMN "counterpartyTaxCode" TEXT;

UPDATE "Invoice" i
SET "mallId" = COALESCE(u."mallId", bp."mallId"),
    "counterpartyName" = COALESCE(t."companyName", bp."name"),
    "counterpartyTaxCode" = COALESCE(t."taxCode", bp."taxCode")
FROM "Invoice" source
LEFT JOIN "Contract" c ON c."id" = source."contractId"
LEFT JOIN "Unit" u ON u."id" = c."unitId"
LEFT JOIN "Tenant" t ON t."id" = source."tenantId"
LEFT JOIN "BillingParty" bp ON bp."id" = source."billingPartyId"
WHERE i."id" = source."id";

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_mallId_fkey"
  FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Invoice_mallId_status_dueDate_idx" ON "Invoice"("mallId", "status", "dueDate");
