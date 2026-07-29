INSERT INTO "BillingParty" ("id", "mallId", "name", "taxCode", "email", "phone", "isActive", "createdAt", "updatedAt")
SELECT
  'scbp_' || md5(sc."id"),
  sc."mallId",
  sc."counterpartyName",
  sc."counterpartyTax",
  sc."counterpartyEmail",
  sc."counterpartyPhone",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ServiceContract" sc
WHERE sc."paymentDirection" = 'RECEIVABLE'
  AND sc."billingPartyId" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "ServiceContract" sc
SET "billingPartyId" = 'scbp_' || md5(sc."id")
WHERE sc."paymentDirection" = 'RECEIVABLE'
  AND sc."billingPartyId" IS NULL;
