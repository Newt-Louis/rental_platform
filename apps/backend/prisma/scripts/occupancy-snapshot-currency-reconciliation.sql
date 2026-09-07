-- ============================================================================
-- CUR-002 (OccupancySnapshot subset) / MON-CUR-OCC-01
-- OCCUPANCY SNAPSHOT CURRENCY RECONCILIATION (READ-ONLY)
-- ============================================================================
--
-- `OccupancySnapshot.revenuePerSqm` is a monetary RATIO (money / m2). Dividing
-- by an area does not make it currency-neutral: VND/m2 and USD/m2 remain
-- different units. The column had no currency, so the figure was persisted and
-- returned with nothing saying what unit it was in.
--
-- ⚠ READ-ONLY. No UPDATE, no DELETE, no backfill.
--
-- Usage:
--   psql "$DATABASE_URL" -f prisma/scripts/occupancy-snapshot-currency-reconciliation.sql
--
-- ---------------------------------------------------------------------------
-- WHY EXISTING ROWS CANNOT BE INFERRED
-- ---------------------------------------------------------------------------
-- The arithmetic was never unsafe: the monthly writer aggregates
-- `Invoice.subtotal` under an explicit `currencyCode = 'VND'` filter, so no
-- cross-currency SUM ever occurred. The defect was the UNDISCLOSED SCOPE.
--
-- That does NOT make a backfill safe, for two reasons:
--
--   1. Two writers exist. `takeMonthlySnapshot` computes from VND-scoped
--      invoices; `prisma/seed.ts` writes a fabricated `400000 + random()`
--      figure. Nothing in a persisted row distinguishes them -- same shape, same
--      nullable floorId/category, overlapping periods.
--   2. A snapshot is HISTORICAL. Even for cron-written rows, asserting VND today
--      means reading the CURRENT writer's filter back onto rows written by
--      whatever the code did then. That is deriving historical currency from
--      current configuration, which MON-CUR-OCC-01 forbids.
--
-- So `SAFE_TO_INFER_FROM_PROVEN_SOURCE` is **unreachable by construction** here.
-- It is still emitted as a class so the reasoning is visible rather than
-- silently absent. Rows written after the migration carry their own currency and
-- classify SAFE_EXPLICIT_VND.
--
-- CLASSIFICATION
--   NO_MONETARY_VALUE               revenuePerSqm is NULL, or 0 (a zero has no
--                                   unit of account to be missing)
--   SAFE_EXPLICIT_VND               revenuePerSqmCurrency = 'VND' on the row
--   SAFE_TO_INFER_FROM_PROVEN_SOURCE unreachable, see above
--   MIXED_SOURCE                    unreachable: one snapshot row is produced by
--                                   exactly one writer from one aggregate, so
--                                   there is no second source to mix with
--   AMBIGUOUS                       a currency is recorded but is not the scale
--                                   currency the writer can produce -- i.e. the
--                                   row was written by something unaccounted for
--   CURRENCY_UNKNOWN                has a non-zero amount and no currency
-- ============================================================================

\echo ''
\echo '=== 1. Every snapshot, classified ========================================='
\echo ''

SELECT
  o.id,
  m.code                        AS mall_code,
  o.period,
  o."leaseTermType",
  o."snapshotDate"::date,
  o."occupiedAreaSqm",
  o."revenuePerSqm",
  o."revenuePerSqmCurrency",
  -- DIAGNOSTIC ONLY. Current mall/unit configuration is NOT evidence for a
  -- historical snapshot's unit of account; shown so a human can see what the
  -- present state happens to be, never to drive the classification.
  (SELECT count(DISTINCT u."currencyCode") FROM "Unit" u
    WHERE u."mallId" = o."mallId" AND u."isActive")            AS distinct_unit_currencies_DIAGNOSTIC,
  CASE
    WHEN o."revenuePerSqm" IS NULL OR o."revenuePerSqm" = 0 THEN 'NO_MONETARY_VALUE'
    WHEN o."revenuePerSqmCurrency" = 'VND'                  THEN 'SAFE_EXPLICIT_VND'
    WHEN o."revenuePerSqmCurrency" IS NOT NULL               THEN 'AMBIGUOUS'
    ELSE 'CURRENCY_UNKNOWN'
  END                           AS classification
FROM "OccupancySnapshot" o
JOIN "Mall" m ON m.id = o."mallId"
ORDER BY
  CASE
    WHEN o."revenuePerSqm" IS NULL OR o."revenuePerSqm" = 0 THEN 3
    WHEN o."revenuePerSqmCurrency" = 'VND' THEN 2
    WHEN o."revenuePerSqmCurrency" IS NOT NULL THEN 0
    ELSE 1
  END,
  m.code, o.period, o."leaseTermType";

\echo ''
\echo '=== 2. Summary ============================================================'
\echo ''

SELECT
  CASE
    WHEN "revenuePerSqm" IS NULL OR "revenuePerSqm" = 0 THEN 'NO_MONETARY_VALUE'
    WHEN "revenuePerSqmCurrency" = 'VND'                THEN 'SAFE_EXPLICIT_VND'
    WHEN "revenuePerSqmCurrency" IS NOT NULL             THEN 'AMBIGUOUS'
    ELSE 'CURRENCY_UNKNOWN'
  END AS classification,
  count(*) AS snapshots
FROM "OccupancySnapshot"
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '=== 3. Was the arithmetic ever unsafe? ===================================='
\echo ''
\echo 'The writer aggregates Invoice.subtotal under an explicit VND filter, so a'
\echo 'cross-currency SUM never occurred. This shows what the writer WOULD have'
\echo 'swept in per mall/period had that filter been absent -- i.e. what the'
\echo 'undisclosed scope is excluding. It is completeness evidence, not a defect.'
\echo ''

SELECT
  m.code                                            AS mall_code,
  i.period,
  i."currencyCode",
  count(*)                                          AS invoices,
  sum(i.subtotal)                                   AS subtotal
FROM "Invoice" i
JOIN "Contract" c ON c.id = i."contractId"
JOIN "Unit" u     ON u.id = c."unitId"
JOIN "Mall" m     ON m.id = u."mallId"
WHERE i.status IN ('ISSUED', 'PAID', 'PARTIALLY_PAID')
GROUP BY m.code, i.period, i."currencyCode"
HAVING i."currencyCode" <> 'VND'
ORDER BY m.code, i.period, i."currencyCode";

\echo ''
\echo '=== 4. Post-migration: snapshots still carrying money with no currency ====='
\echo ''

SELECT
  count(*) FILTER (WHERE "revenuePerSqmCurrency" IS NULL
                     AND "revenuePerSqm" IS NOT NULL
                     AND "revenuePerSqm" <> 0)        AS money_without_currency,
  count(*) FILTER (WHERE "revenuePerSqmCurrency" IS NOT NULL)
                                                      AS currency_captured,
  count(*) FILTER (WHERE "revenuePerSqm" IS NULL OR "revenuePerSqm" = 0)
                                                      AS no_money,
  count(*)                                            AS snapshots
FROM "OccupancySnapshot";

\echo ''
\echo 'Nothing here may be backfilled from current Mall/Unit currency, nor from'
\echo 'the writer''s present filter. Historical unknown rows stay UNKNOWN.'
\echo ''
