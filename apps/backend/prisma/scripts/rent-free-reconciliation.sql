-- ============================================================================
-- SEM-001 — RENT-FREE PRODUCTION RECONCILIATION (READ-ONLY)
-- ============================================================================
--
-- Purpose: list every Proposal and Contract carrying a non-zero `rentFree` so
-- the business can confirm, record by record, whether the stored number was
-- entered meaning MONTHS (the canonical unit) or DAYS.
--
-- Background: before this change the Bookings conversion dialog labelled the
-- field "Rent-free (ngày)" while the Spaces dialog labelled it "(tháng)", and
-- the backend read it as months for billing but days for approval routing.
-- There is NO source/channel column on Proposal, so the entry unit CANNOT be
-- derived automatically. Every row below needs a human decision.
--
-- ⚠ THIS SCRIPT MUTATES NOTHING. It must stay read-only. Do not add UPDATE
--   statements here — an automated rewrite would silently change contractual
--   terms and, for ACTIVE contracts, the rent actually invoiced.
--
-- Usage:
--   psql "$DATABASE_URL" -f prisma/scripts/rent-free-reconciliation.sql
--
-- Interpreting the output:
--   `rentFree` is the stored value. Under the canonical MONTHS reading it means
--   that many months of waived Base Rent. `rentFreeAsPctOfTerm` makes an
--   implausible value obvious: anything approaching or above 100% almost
--   certainly came from day-based entry (e.g. 30 on a 36-month lease = 83%).
--   `billingImpact` flags rows where billing has already acted on the value.
-- ============================================================================

\echo ''
\echo '=== 1. PROPOSALS with rentFree > 0 ==========================================='
\echo ''

SELECT
  p.id,
  p."proposalNumber",
  t."brandName"                                    AS tenant,
  u.code                                           AS unit,
  m.name                                           AS mall,
  p.term                                           AS "termMonths",
  p."rentFree",
  ROUND((p."rentFree"::numeric / NULLIF(p.term, 0)) * 100, 1) AS "rentFreeAsPctOfTerm",
  CASE
    WHEN p.term > 0 AND p."rentFree" >= p.term THEN 'IMPLAUSIBLE — waives the entire lease'
    WHEN p.term > 0 AND (p."rentFree"::numeric / p.term) > 0.5 THEN 'SUSPECT — likely entered as days'
    WHEN p."rentFree" > 12 THEN 'SUSPECT — over 12 months'
    ELSE 'PLAUSIBLE as months'
  END                                              AS "unitAssessment",
  p."rentCurrency",
  p."monthlyRent",
  p."totalContractValue",
  p.status,
  p."createdAt",
  p."updatedAt"
FROM "Proposal" p
LEFT JOIN "Tenant" t ON t.id = p."tenantId"
LEFT JOIN "Unit"   u ON u.id = p."unitId"
LEFT JOIN "Mall"   m ON m.id = u."mallId"
WHERE p."rentFree" > 0
  AND p."isActive" = true
ORDER BY
  CASE WHEN p.term > 0 AND p."rentFree" >= p.term THEN 0
       WHEN p.term > 0 AND (p."rentFree"::numeric / p.term) > 0.5 THEN 1
       ELSE 2 END,
  p."createdAt";

\echo ''
\echo '=== 2. CONTRACTS with rentFree > 0 (these drive real invoices) ==============='
\echo ''

SELECT
  c.id,
  c."contractNumber",
  t."brandName"                                    AS tenant,
  u.code                                           AS unit,
  m.name                                           AS mall,
  c.term                                           AS "termMonths",
  c."rentFree",
  ROUND((c."rentFree"::numeric / NULLIF(c.term, 0)) * 100, 1) AS "rentFreeAsPctOfTerm",
  CASE
    WHEN c.term > 0 AND c."rentFree" >= c.term THEN 'IMPLAUSIBLE — waives the entire lease'
    WHEN c.term > 0 AND (c."rentFree"::numeric / c.term) > 0.5 THEN 'SUSPECT — likely entered as days'
    WHEN c."rentFree" > 12 THEN 'SUSPECT — over 12 months'
    ELSE 'PLAUSIBLE as months'
  END                                              AS "unitAssessment",
  c."currencyCode",
  c.rent                                           AS "monthlyRent",
  c.status,
  c."startDate",
  c."endDate",
  c."createdAt",
  c."updatedAt",
  -- Has billing already acted on this value?
  (SELECT count(*) FROM "BillingScheduleEntry" b
     WHERE b."contractId" = c.id)                  AS "scheduleEntries",
  (SELECT count(*) FROM "BillingScheduleEntry" b
     WHERE b."contractId" = c.id AND b."invoiceId" IS NOT NULL)
                                                   AS "periodsAlreadyInvoiced",
  CASE
    WHEN c.status IN ('ACTIVE', 'EXPIRING')
     AND EXISTS (SELECT 1 FROM "BillingScheduleEntry" b
                  WHERE b."contractId" = c.id AND b."invoiceId" IS NOT NULL)
      THEN 'INVOICED — correcting rentFree changes already-billed amounts'
    WHEN c.status IN ('ACTIVE', 'EXPIRING')
      THEN 'LIVE — schedule exists, not yet invoiced'
    ELSE 'NOT LIVE'
  END                                              AS "billingImpact"
FROM "Contract" c
LEFT JOIN "Tenant" t ON t.id = c."tenantId"
LEFT JOIN "Unit"   u ON u.id = c."unitId"
LEFT JOIN "Mall"   m ON m.id = u."mallId"
WHERE c."rentFree" > 0
  AND c."isActive" = true
  AND c."deletedAt" IS NULL
ORDER BY
  CASE WHEN c.status IN ('ACTIVE', 'EXPIRING') THEN 0 ELSE 1 END,
  CASE WHEN c.term > 0 AND c."rentFree" >= c.term THEN 0
       WHEN c.term > 0 AND (c."rentFree"::numeric / c.term) > 0.5 THEN 1
       ELSE 2 END,
  c."createdAt";

\echo ''
\echo '=== 3. Summary counts ========================================================'
\echo ''

SELECT 'Proposal' AS entity,
       count(*)                                          AS "rowsWithRentFree",
       count(*) FILTER (WHERE term > 0 AND "rentFree" >= term) AS "implausible",
       count(*) FILTER (WHERE term > 0 AND ("rentFree"::numeric / term) > 0.5
                          AND "rentFree" < term)         AS "suspect"
FROM "Proposal" WHERE "rentFree" > 0 AND "isActive" = true
UNION ALL
SELECT 'Contract',
       count(*),
       count(*) FILTER (WHERE term > 0 AND "rentFree" >= term),
       count(*) FILTER (WHERE term > 0 AND ("rentFree"::numeric / term) > 0.5
                          AND "rentFree" < term)
FROM "Contract" WHERE "rentFree" > 0 AND "isActive" = true AND "deletedAt" IS NULL;

\echo ''
\echo '=== 4. Legacy approval-policy rules still using RENT_FREE_DAYS ==============='
\echo ''
-- These still evaluate (via the deprecation shim in approval-policy.util.ts,
-- which reads the threshold as days ÷ 30), but should be migrated to
-- RENT_FREE_MONTHS. Migration is a business decision on the threshold value,
-- not a mechanical rewrite — see docs/audit/RENT_FREE_DATA_RISK.md §4.

SELECT id, code, name, "stepName", "approverRole", "conditionType",
       operator, threshold,
       ROUND(threshold::numeric / 30, 2) AS "thresholdAsMonths",
       "isActive"
FROM "ApprovalPolicyRule"
WHERE "conditionType" = 'RENT_FREE_DAYS'
ORDER BY "isActive" DESC, "stepOrder";
