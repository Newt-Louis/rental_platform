-- ============================================================================
-- BILL-002 — REVENUE-SHARE DUPLICATE RECONCILIATION (READ-ONLY)
-- ============================================================================
--
-- Revenue-share invoices are identified by the business key
--   (contractId, period, type = 'REVENUE_SHARE')
-- restricted to LIVE invoices, i.e. `isActive = true AND status <> 'CANCELLED'`.
--
-- Why the liveness restriction matters: `voidInvoice()` sets
-- `status = CANCELLED` and KEEPS the row (isActive stays true). A unique
-- constraint over the bare triple would therefore permanently prevent
-- re-issuing a revenue-share invoice for a period whose invoice was voided —
-- a regression, not a fix. Any DB constraint must be a PARTIAL unique index
-- carrying the same liveness predicate the application uses.
--
-- tenantId is deliberately NOT part of the key: `Contract.tenantId` is NOT NULL,
-- so the tenant is functionally determined by the contract. Including it would
-- be redundant and would open a loophole (same contract+period under a
-- different tenantId would slip through).
--
-- ⚠ READ-ONLY. No UPDATE, no DELETE. Run this BEFORE applying any uniqueness
--   migration; a partial unique index cannot be created while duplicates exist.
--
-- Usage:
--   psql "$DATABASE_URL" -f prisma/scripts/revenue-share-duplicate-reconciliation.sql
--
-- Classification:
--   OK                one live revenue-share invoice for the key
--   DUPLICATE_KEY     more than one — must be resolved before adding the index
--   MISSING_CONTRACT  revenue-share invoice with no contractId (should not
--                     happen: the generator always sets it)
--   MISSING_PERIOD    null/empty period
--   UNCLASSIFIABLE    anything the cases above do not cover
-- ============================================================================

\echo ''
\echo '=== 1. Duplicate live revenue-share invoices per (contractId, period) ======='
\echo ''

SELECT
  i."contractId",
  c."contractNumber",
  t."brandName"                              AS tenant,
  u.code                                     AS unit,
  i.period,
  count(*)                                   AS live_invoices,
  string_agg(i."invoiceNumber", ', ' ORDER BY i."createdAt") AS invoice_numbers,
  string_agg(i.status::text, ', ' ORDER BY i."createdAt")    AS statuses,
  string_agg(i."totalAmount"::text, ', ' ORDER BY i."createdAt") AS amounts,
  min(i."createdAt")                         AS first_created,
  max(i."createdAt")                         AS last_created,
  -- A duplicate created within seconds of the first is the concurrency race;
  -- one created much later is more likely a deliberate manual re-run.
  EXTRACT(EPOCH FROM (max(i."createdAt") - min(i."createdAt")))::int AS seconds_apart
FROM "Invoice" i
LEFT JOIN "Contract" c ON c.id = i."contractId"
LEFT JOIN "Tenant"   t ON t.id = i."tenantId"
LEFT JOIN "Unit"     u ON u.id = c."unitId"
WHERE i.type = 'REVENUE_SHARE'
  AND i."isActive" = true
  AND i.status <> 'CANCELLED'
GROUP BY i."contractId", c."contractNumber", t."brandName", u.code, i.period
HAVING count(*) > 1
ORDER BY count(*) DESC, i.period DESC;

\echo ''
\echo '=== 2. Every revenue-share invoice, classified ============================='
\echo ''

WITH keyed AS (
  SELECT
    i.*,
    count(*) FILTER (WHERE i."isActive" AND i.status <> 'CANCELLED')
      OVER (PARTITION BY i."contractId", i.period)                AS live_in_key
  FROM "Invoice" i
  WHERE i.type = 'REVENUE_SHARE'
)
SELECT
  k.id                        AS invoice_id,
  k."invoiceNumber",
  k."contractId",
  c."contractNumber",
  t."brandName"               AS tenant,
  k.period,
  k."currencyCode",
  k."totalAmount",
  k.status,
  k."isActive",
  k."voidedAt" IS NOT NULL    AS voided,
  k.live_in_key,
  CASE
    WHEN k."contractId" IS NULL                       THEN 'MISSING_CONTRACT'
    WHEN k.period IS NULL OR k.period = ''            THEN 'MISSING_PERIOD'
    WHEN NOT k."isActive" OR k.status = 'CANCELLED'   THEN 'OK'  -- not live, cannot collide
    WHEN k.live_in_key > 1                            THEN 'DUPLICATE_KEY'
    WHEN k.live_in_key = 1                            THEN 'OK'
    ELSE 'UNCLASSIFIABLE'
  END                         AS classification,
  k."createdAt"
FROM keyed k
LEFT JOIN "Contract" c ON c.id = k."contractId"
LEFT JOIN "Tenant"   t ON t.id = k."tenantId"
ORDER BY
  CASE
    WHEN k."contractId" IS NULL THEN 0
    WHEN k.period IS NULL OR k.period = '' THEN 1
    WHEN k.live_in_key > 1 THEN 2
    ELSE 3
  END,
  k.period DESC, k."createdAt";

\echo ''
\echo '=== 3. Summary — is a partial unique index safe to apply? =================='
\echo ''

WITH keyed AS (
  SELECT
    i."contractId", i.period, i."isActive", i.status,
    count(*) FILTER (WHERE i."isActive" AND i.status <> 'CANCELLED')
      OVER (PARTITION BY i."contractId", i.period) AS live_in_key
  FROM "Invoice" i
  WHERE i.type = 'REVENUE_SHARE'
)
SELECT CASE
    WHEN "contractId" IS NULL THEN 'MISSING_CONTRACT'
    WHEN period IS NULL OR period = '' THEN 'MISSING_PERIOD'
    WHEN NOT "isActive" OR status = 'CANCELLED' THEN 'OK'
    WHEN live_in_key > 1 THEN 'DUPLICATE_KEY'
    WHEN live_in_key = 1 THEN 'OK'
    ELSE 'UNCLASSIFIABLE'
  END AS classification,
  count(*) AS rows
FROM keyed
GROUP BY 1
ORDER BY 1;

\echo ''
\echo 'A partial unique index can be created only when DUPLICATE_KEY = 0 and'
\echo 'MISSING_CONTRACT = 0. Otherwise resolve those rows with the business first.'
\echo ''
