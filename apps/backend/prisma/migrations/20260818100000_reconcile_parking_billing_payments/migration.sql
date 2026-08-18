-- Bring Parking payments recorded before invoice transfer into Billing.
WITH existing_invoice_payments AS (
  SELECT "invoiceId", COALESCE(SUM("amount") FILTER (WHERE "reversedAt" IS NULL), 0) AS paid
  FROM "Payment"
  GROUP BY "invoiceId"
), parking_source_payments AS (
  SELECT "statementId", MAX("paidAt") AS "lastPaidAt"
  FROM "ParkingDebtPayment"
  GROUP BY "statementId"
), missing AS (
  SELECT
    i."id" AS "invoiceId",
    i."tenantId",
    i."sourceId" AS "statementId",
    GREATEST(0, LEAST(i."totalAmount", s."paidAmount") - COALESCE(ep.paid, 0)) AS amount,
    COALESCE(sp."lastPaidAt", NOW()) AS "paidAt"
  FROM "Invoice" i
  JOIN "ParkingMonthlyStatement" s ON s."id" = i."sourceId"
  LEFT JOIN existing_invoice_payments ep ON ep."invoiceId" = i."id"
  LEFT JOIN parking_source_payments sp ON sp."statementId" = s."id"
  WHERE i."sourceType" = 'PARKING'
    AND i."isActive" = true
    AND i."status" <> 'CANCELLED'
    AND s."paidAmount" > COALESCE(ep.paid, 0)
)
INSERT INTO "Payment" (
  "id", "invoiceId", "tenantId", "amount", "method", "reference",
  "idempotencyKey", "paidAt", "notes"
)
SELECT
  'parking-sync-' || SUBSTRING(MD5("invoiceId"), 1, 24),
  "invoiceId", "tenantId", amount, 'BANK_TRANSFER'::"PaymentMethod",
  'PARKING-HISTORY', 'parking-source-payment:' || "statementId", "paidAt",
  'Đồng bộ khoản thanh toán lịch sử từ Parking'
FROM missing
WHERE amount > 0
ON CONFLICT ("idempotencyKey") DO NOTHING;

-- Recompute Billing invoice payment status without moving DRAFT invoices out of draft.
WITH invoice_paid AS (
  SELECT
    i."id",
    GREATEST(0, COALESCE(SUM(p."amount") FILTER (WHERE p."reversedAt" IS NULL), 0) - i."refundedAmount") AS paid,
    GREATEST(0, i."totalAmount" + i."adjustmentAmount") AS payable
  FROM "Invoice" i
  LEFT JOIN "Payment" p ON p."invoiceId" = i."id"
  WHERE i."sourceType" = 'PARKING' AND i."isActive" = true AND i."status" <> 'CANCELLED'
  GROUP BY i."id"
)
UPDATE "Invoice" i
SET
  "status" = CASE
    WHEN i."status" = 'DRAFT' THEN 'DRAFT'::"InvoiceStatus"
    WHEN ip.paid >= ip.payable AND (ip.paid > 0 OR ip.payable = 0) THEN 'PAID'::"InvoiceStatus"
    WHEN ip.paid > 0 THEN 'PARTIALLY_PAID'::"InvoiceStatus"
    WHEN i."dueDate" < NOW() THEN 'OVERDUE'::"InvoiceStatus"
    ELSE 'ISSUED'::"InvoiceStatus"
  END,
  "paidAt" = CASE WHEN ip.paid >= ip.payable AND ip.paid > 0 THEN COALESCE(i."paidAt", NOW()) ELSE NULL END,
  "updatedAt" = NOW()
FROM invoice_paid ip
WHERE i."id" = ip."id";

-- Synchronize the effective Billing payment total back to each Parking statement.
WITH invoice_payment AS (
  SELECT
    i."sourceId" AS "statementId",
    GREATEST(0, COALESCE(SUM(p."amount") FILTER (WHERE p."reversedAt" IS NULL), 0) - i."refundedAmount") AS paid
  FROM "Invoice" i
  LEFT JOIN "Payment" p ON p."invoiceId" = i."id"
  WHERE i."sourceType" = 'PARKING' AND i."isActive" = true AND i."status" <> 'CANCELLED'
  GROUP BY i."id"
), source_paid AS (
  SELECT "statementId", SUM(paid) AS paid
  FROM invoice_payment
  WHERE "statementId" IS NOT NULL
  GROUP BY "statementId"
)
UPDATE "ParkingMonthlyStatement" s
SET
  "paidAmount" = LEAST(s."totalAmount", sp.paid),
  "status" = CASE
    WHEN LEAST(s."totalAmount", sp.paid) >= s."totalAmount" THEN 'PAID'
    WHEN sp.paid > 0 THEN 'PARTIAL'
    ELSE 'UNPAID'
  END,
  "updatedAt" = NOW()
FROM source_paid sp
WHERE s."id" = sp."statementId";
