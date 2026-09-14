-- ============================================================================
-- CUR-001 — SALES TURNOVER CURRENCY RECONCILIATION (READ-ONLY)
-- ============================================================================
--
-- `SalesTurnover.currencyCode` was added nullable and WITHOUT a default. Rows
-- that predate it carry NULL, meaning "reported before currency was captured".
-- Their true unit cannot be derived: the shipped seed created VND-scale
-- turnover against USD and MMK contracts, so backfilling from
-- Contract.currencyCode would stamp a fabricated unit onto figures that feed
-- revenue-share invoices.
--
-- ⚠ READ-ONLY. Do not add UPDATE statements. Revenue-share billing already
--   fails closed on NULL and on a currency mismatch, so nothing is silently
--   mis-billed while these rows await a business decision.
--
-- Usage:
--   psql "$DATABASE_URL" -f prisma/scripts/sales-turnover-currency-reconciliation.sql
--
-- Classification produced below:
--   SAFE_TO_BACKFILL   NULL currency, contract is VND, figure is VND-plausible,
--                      nothing billed yet. Still a business decision, but low risk.
--   AMBIGUOUS          NULL currency against a non-VND contract, or the figure's
--                      magnitude contradicts the contract currency. DO NOT guess.
--   CURRENCY_MISMATCH  currency present and different from the contract's.
--                      Revenue-share will refuse to bill this row.
--   ALREADY_BILLED     a REVENUE_SHARE invoice exists for this contract+period.
--                      Changing the turnover currency now would contradict an
--                      issued document. Escalate rather than edit.
--   OK                 currency present and equal to the contract's.
-- ============================================================================

\echo ''
\echo '=== SalesTurnover currency reconciliation ==================================='
\echo ''

WITH live_contract AS (
  SELECT c."tenantId",
         c."unitId",
         count(*)                                   AS live_contract_count,
         count(DISTINCT c."currencyCode")           AS distinct_currencies,
         min(c.id)                                  AS id,
         string_agg(c."contractNumber" || ' (' || c."currencyCode" || '/' || c.status || ')',
                    ', ' ORDER BY c."createdAt")    AS contracts,
         CASE WHEN count(DISTINCT c."currencyCode") = 1
              THEN min(c."currencyCode"::text) END  AS "currencyCode"
  FROM "Contract" c
  WHERE c."isActive" = true
    AND c."deletedAt" IS NULL
    AND c.status IN ('ACTIVE', 'EXPIRING')
  GROUP BY c."tenantId", c."unitId"
)
SELECT
  st.id                              AS turnover_id,
  t."brandName"                      AS tenant,
  u.code                             AS unit,
  m.name                             AS mall,
  st.period,
  st."grossSales",
  st."netSales",
  st."currencyCode"                  AS turnover_currency,
  st.status                          AS approval_status,
  lc.contracts                       AS live_contracts,
  lc.live_contract_count,
  lc."currencyCode"                  AS contract_currency,
  inv."invoiceNumber"                AS revenue_share_invoice,
  inv."currencyCode"                 AS invoice_currency,
  (inv.id IS NOT NULL)               AS invoice_generated,
  CASE
    WHEN inv.id IS NOT NULL                              THEN 'ALREADY_BILLED'
    WHEN st."currencyCode" IS NOT NULL
     AND lc."currencyCode" IS NOT NULL
     AND st."currencyCode"::text <> lc."currencyCode"          THEN 'CURRENCY_MISMATCH'
    WHEN st."currencyCode" IS NOT NULL                   THEN 'OK'
    WHEN lc.distinct_currencies > 1                      THEN 'AMBIGUOUS'
    WHEN lc."currencyCode" IS NULL                       THEN 'AMBIGUOUS'
    WHEN lc."currencyCode" <> 'VND'                      THEN 'AMBIGUOUS'
    -- A VND contract whose figure is VND-plausible (>= 1,000,000 for a monthly
    -- retail turnover) is the only combination with no competing reading.
    WHEN st."grossSales" >= 1000000                      THEN 'SAFE_TO_BACKFILL'
    ELSE 'AMBIGUOUS'
  END                                AS classification,
  -- Magnitude sanity check: a USD contract with a nine-figure turnover almost
  -- certainly received a VND-scale number.
  CASE
    WHEN lc.distinct_currencies > 1
      THEN 'unit has ' || lc.live_contract_count || ' live contracts in ' || lc.distinct_currencies || ' currencies'
    WHEN lc."currencyCode" = 'USD' AND st."grossSales" > 1000000
      THEN 'figure looks VND-scale for a USD contract'
    WHEN lc."currencyCode" = 'MMK' AND st."grossSales" > 100000000
      THEN 'figure looks VND-scale for an MMK contract'
    ELSE NULL
  END                                AS magnitude_warning,
  st."createdAt",
  st."updatedAt"
FROM "SalesTurnover" st
LEFT JOIN "Tenant" t ON t.id = st."tenantId"
LEFT JOIN "Unit"   u ON u.id = st."unitId"
LEFT JOIN "Mall"   m ON m.id = u."mallId"
LEFT JOIN live_contract lc ON lc."tenantId" = st."tenantId" AND lc."unitId" = st."unitId"
LEFT JOIN "Invoice" inv
       ON inv."contractId" = lc.id
      AND inv.period = st.period
      AND inv.type = 'REVENUE_SHARE'
      AND inv."isActive" = true
ORDER BY
  CASE
    WHEN inv.id IS NOT NULL THEN 0
    WHEN st."currencyCode" IS NOT NULL AND lc."currencyCode" IS NOT NULL
     AND st."currencyCode"::text <> lc."currencyCode" THEN 1
    WHEN st."currencyCode" IS NULL THEN 2
    ELSE 3
  END,
  st.period DESC, t."brandName";

\echo ''
\echo '=== Summary by classification ==============================================='
\echo ''

WITH live_contract AS (
  SELECT c."tenantId", c."unitId", min(c.id) AS id,
         count(DISTINCT c."currencyCode") AS distinct_currencies,
         CASE WHEN count(DISTINCT c."currencyCode") = 1
              THEN min(c."currencyCode"::text) END AS "currencyCode"
  FROM "Contract" c
  WHERE c."isActive" = true AND c."deletedAt" IS NULL
    AND c.status IN ('ACTIVE', 'EXPIRING')
  GROUP BY c."tenantId", c."unitId"
), classified AS (
  SELECT CASE
    WHEN inv.id IS NOT NULL THEN 'ALREADY_BILLED'
    WHEN st."currencyCode" IS NOT NULL AND lc."currencyCode" IS NOT NULL
     AND st."currencyCode"::text <> lc."currencyCode" THEN 'CURRENCY_MISMATCH'
    WHEN st."currencyCode" IS NOT NULL THEN 'OK'
    WHEN lc.distinct_currencies > 1 THEN 'AMBIGUOUS'
    WHEN lc."currencyCode" IS NULL THEN 'AMBIGUOUS'
    WHEN lc."currencyCode" <> 'VND' THEN 'AMBIGUOUS'
    WHEN st."grossSales" >= 1000000 THEN 'SAFE_TO_BACKFILL'
    ELSE 'AMBIGUOUS'
  END AS classification
  FROM "SalesTurnover" st
  LEFT JOIN live_contract lc ON lc."tenantId" = st."tenantId" AND lc."unitId" = st."unitId"
  LEFT JOIN "Invoice" inv ON inv."contractId" = lc.id AND inv.period = st.period
                         AND inv.type = 'REVENUE_SHARE' AND inv."isActive" = true
)
SELECT classification, count(*) AS rows
FROM classified
GROUP BY classification
ORDER BY 1;
