-- ============================================================================
-- INT-002-SEED / CONTRACT-PERIOD-01 — CONTRACT-IN-FORCE RECONCILIATION
-- (READ-ONLY)
-- ============================================================================
--
-- Revenue-share now resolves the applicable Contract by effective-date coverage
-- of the whole turnover period, and fails closed on 0 or >1 matches
-- (`resolveContractForPeriod`). This script shows which existing rows that
-- resolution would refuse to bill, and why.
--
-- Eligible statuses mirror CONTRACT_PERIOD_ELIGIBLE_STATUSES:
--   ACTIVE, EXPIRING, EXPIRED, TERMINATING, TERMINATED
-- A terminated contract still governed its earlier periods, so it is eligible —
-- but early termination moves the real end to ContractTermination.effectiveDate
-- and never rewrites Contract.endDate, so coverage is tested against a DERIVED
-- effective_end_date (see the candidates CTE), mirroring
-- effectiveContractEndDate() in contract-period-resolver.ts.
--
-- ⚠ READ-ONLY. No UPDATE. Nothing here is auto-fixed.
--
-- Usage:
--   psql "$DATABASE_URL" -f prisma/scripts/contract-period-resolution-reconciliation.sql
-- ============================================================================

\echo ''
\echo '=== 1. Units with OVERLAPPING live contracts ================================'
\echo '(the INT-002 state ContractsService.create() rejects but direct writes allow)'
\echo ''

SELECT
  u.code                                   AS unit,
  m.name                                   AS mall,
  a."contractNumber"                       AS contract_a,
  a."currencyCode"                         AS currency_a,
  a.status                                 AS status_a,
  a."startDate"::date                      AS start_a,
  a."endDate"::date                        AS end_a,
  b."contractNumber"                       AS contract_b,
  b."currencyCode"                         AS currency_b,
  b.status                                 AS status_b,
  b."startDate"::date                      AS start_b,
  b."endDate"::date                        AS end_b,
  greatest(a."startDate", b."startDate")::date AS overlap_from,
  least(a."endDate", b."endDate")::date        AS overlap_to,
  (a."currencyCode" <> b."currencyCode")   AS currency_conflict
FROM "Contract" a
JOIN "Contract" b
  ON b."unitId" = a."unitId"
 AND b.id > a.id
 AND a."startDate" <= b."endDate"
 AND b."startDate" <= a."endDate"
JOIN "Unit" u ON u.id = a."unitId"
LEFT JOIN "Mall" m ON m.id = u."mallId"
WHERE a."isActive" AND b."isActive"
  AND a."deletedAt" IS NULL AND b."deletedAt" IS NULL
  AND a.status IN ('ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATING', 'TERMINATED')
  AND b.status IN ('ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATING', 'TERMINATED')
ORDER BY (a."currencyCode" <> b."currencyCode") DESC, u.code;

\echo ''
\echo '=== 2. Every SalesTurnover row, with its resolution outcome ================='
\echo ''

WITH turnover_bounds AS (
  SELECT st.*,
         make_date(split_part(st.period, '-', 1)::int, split_part(st.period, '-', 2)::int, 1) AS period_start,
         (make_date(split_part(st.period, '-', 1)::int, split_part(st.period, '-', 2)::int, 1)
            + INTERVAL '1 month - 1 day')::date                                               AS period_end
  FROM "SalesTurnover" st
), candidates AS (
  -- RS-TERMINATED: mirrors effectiveContractEndDate(). A COMPLETED or pending
  -- (INITIATED/IN_PROGRESS) termination shortens the contract; a CANCELLED one
  -- does not. Contract.endDate is never rewritten by termination.
  SELECT tb.id AS turnover_id, c.*,
         ct.status        AS termination_status,
         ct."effectiveDate" AS termination_effective_date,
         CASE
           WHEN ct.id IS NULL THEN c."endDate"
           WHEN ct.status = 'CANCELLED' THEN c."endDate"
           WHEN ct.status IN ('COMPLETED', 'INITIATED', 'IN_PROGRESS')
             THEN least(c."endDate", ct."effectiveDate")
           ELSE c."endDate"
         END              AS effective_end_date
  FROM turnover_bounds tb
  JOIN "Contract" c
    ON c."unitId" = tb."unitId"
   AND c."isActive" AND c."deletedAt" IS NULL
   AND c.status IN ('ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATING', 'TERMINATED')
  -- Authoritative relationship: the termination of THIS contract, never
  -- inferred by unit.
  LEFT JOIN "ContractTermination" ct ON ct."contractId" = c.id
), resolution AS (
  SELECT
    tb.id                                                   AS turnover_id,
    count(cov.id)                                           AS covering_count,
    count(ovl.id)                                           AS overlapping_count,
    min(cov."contractNumber")                               AS sole_contract,
    min(cov."currencyCode"::text)                           AS sole_currency,
    min(cov."startDate"::text)                              AS sole_start,
    min(cov."endDate"::text)                                AS sole_end,
    min(cov.effective_end_date::text)                       AS sole_effective_end,
    min(cov.termination_status)                             AS sole_termination_status,
    min(cov.termination_effective_date::text)               AS sole_termination_effective_date,
    max(CASE WHEN allc.effective_end_date::date < tb.period_start
              AND allc.termination_status IS NOT NULL
             THEN 1 ELSE 0 END)                                 AS ended_before_period,
    bool_or(cov."tenantId" <> tb."tenantId")                AS tenant_mismatch,
    string_agg(DISTINCT cov."contractNumber", ', ')         AS covering_contracts,
    string_agg(DISTINCT ovl."contractNumber", ', ')         AS overlapping_contracts
  FROM turnover_bounds tb
  LEFT JOIN candidates cov
    ON cov.turnover_id = tb.id
   AND cov."startDate"::date <= tb.period_start
   AND cov.effective_end_date::date >= tb.period_end
  LEFT JOIN candidates ovl
    ON ovl.turnover_id = tb.id
   AND ovl."startDate"::date <= tb.period_end
   AND ovl.effective_end_date::date >= tb.period_start
  -- Unfiltered, so a contract that ended before the period is still visible and
  -- can be reported as TERMINATED_BEFORE_PERIOD rather than a bare NO_CONTRACT.
  LEFT JOIN candidates allc ON allc.turnover_id = tb.id
  GROUP BY tb.id
)
SELECT
  tb.id                       AS turnover_id,
  t."brandName"               AS tenant,
  u.code                      AS unit,
  tb.period,
  tb.period_start,
  tb.period_end,
  tb."grossSales",
  tb."currencyCode"           AS turnover_currency,
  r.covering_count,
  r.covering_contracts,
  r.overlapping_contracts,
  r.sole_currency             AS resolved_contract_currency,
  r.sole_start                AS contract_start,
  r.sole_end                  AS contract_end_raw,
  r.sole_effective_end        AS contract_effective_end,
  r.sole_termination_status   AS termination_status,
  r.sole_termination_effective_date AS termination_effective_date,
  (inv.id IS NOT NULL)        AS invoice_generated,
  inv."invoiceNumber",
  CASE
    WHEN inv.id IS NOT NULL                     THEN 'ALREADY_BILLED'
    WHEN r.tenant_mismatch                      THEN 'TENANT_MISMATCH'
    WHEN r.covering_count > 1                   THEN 'MULTIPLE_CONTRACTS'
    WHEN r.covering_count = 1
     AND tb."currencyCode" IS NOT NULL
     AND tb."currencyCode"::text <> r.sole_currency THEN 'CURRENCY_MISMATCH'
    WHEN r.covering_count = 1                   THEN 'OK'
    WHEN r.overlapping_count > 0                THEN 'PARTIAL_PERIOD'
    WHEN r.ended_before_period = 1              THEN 'TERMINATED_BEFORE_PERIOD'
    ELSE 'NO_CONTRACT'
  END                         AS classification
FROM turnover_bounds tb
JOIN resolution r ON r.turnover_id = tb.id
LEFT JOIN "Tenant" t ON t.id = tb."tenantId"
LEFT JOIN "Unit"   u ON u.id = tb."unitId"
LEFT JOIN "Invoice" inv
       ON inv.period = tb.period
      AND inv.type = 'REVENUE_SHARE'
      AND inv."isActive" = true
      AND inv."tenantId" = tb."tenantId"
ORDER BY
  CASE
    WHEN inv.id IS NOT NULL THEN 0
    WHEN r.tenant_mismatch THEN 1
    WHEN r.covering_count > 1 THEN 2
    WHEN r.covering_count = 0 AND r.overlapping_count > 0 THEN 3
    WHEN r.covering_count = 0 THEN 4
    ELSE 5
  END,
  tb.period DESC, t."brandName";

\echo ''
\echo '=== 3. Summary =============================================================='
\echo ''

WITH turnover_bounds AS (
  SELECT st.*,
         make_date(split_part(st.period, '-', 1)::int, split_part(st.period, '-', 2)::int, 1) AS period_start,
         (make_date(split_part(st.period, '-', 1)::int, split_part(st.period, '-', 2)::int, 1)
            + INTERVAL '1 month - 1 day')::date                                               AS period_end
  FROM "SalesTurnover" st
), candidates AS (
  -- RS-TERMINATED: mirrors effectiveContractEndDate(). A COMPLETED or pending
  -- (INITIATED/IN_PROGRESS) termination shortens the contract; a CANCELLED one
  -- does not. Contract.endDate is never rewritten by termination.
  SELECT tb.id AS turnover_id, c.*,
         ct.status        AS termination_status,
         ct."effectiveDate" AS termination_effective_date,
         CASE
           WHEN ct.id IS NULL THEN c."endDate"
           WHEN ct.status = 'CANCELLED' THEN c."endDate"
           WHEN ct.status IN ('COMPLETED', 'INITIATED', 'IN_PROGRESS')
             THEN least(c."endDate", ct."effectiveDate")
           ELSE c."endDate"
         END              AS effective_end_date
  FROM turnover_bounds tb
  JOIN "Contract" c
    ON c."unitId" = tb."unitId"
   AND c."isActive" AND c."deletedAt" IS NULL
   AND c.status IN ('ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATING', 'TERMINATED')
  -- Authoritative relationship: the termination of THIS contract, never
  -- inferred by unit.
  LEFT JOIN "ContractTermination" ct ON ct."contractId" = c.id
), resolution AS (
  SELECT tb.id AS turnover_id,
         count(cov.id) AS covering_count,
         count(ovl.id) AS overlapping_count,
         min(cov."currencyCode"::text) AS sole_currency,
         bool_or(cov."tenantId" <> tb."tenantId") AS tenant_mismatch,
         min(tb."currencyCode"::text) AS turnover_currency
  FROM turnover_bounds tb
  LEFT JOIN candidates cov ON cov.turnover_id = tb.id
   AND cov."startDate"::date <= tb.period_start AND cov."endDate"::date >= tb.period_end
  LEFT JOIN candidates ovl ON ovl.turnover_id = tb.id
   AND ovl."startDate"::date <= tb.period_end AND ovl."endDate"::date >= tb.period_start
  GROUP BY tb.id
)
SELECT CASE
    WHEN tenant_mismatch THEN 'TENANT_MISMATCH'
    WHEN covering_count > 1 THEN 'MULTIPLE_CONTRACTS'
    WHEN covering_count = 1 AND turnover_currency IS NOT NULL
     AND turnover_currency <> sole_currency THEN 'CURRENCY_MISMATCH'
    WHEN covering_count = 1 THEN 'OK'
    WHEN overlapping_count > 0 THEN 'PARTIAL_PERIOD'
    ELSE 'NO_CONTRACT'
  END AS classification,
  count(*) AS rows
FROM resolution
GROUP BY 1
ORDER BY 1;
