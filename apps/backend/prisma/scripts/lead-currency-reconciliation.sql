-- ============================================================================
-- RPT-CUR-005 / CUR-002 (Lead subset) — LEAD CURRENCY RECONCILIATION (READ-ONLY)
-- ============================================================================
--
-- `Lead.expectedRent` and `Lead.estimatedValue` are monetary but `Lead` carries
-- no currency column, so every CRM pipeline figure derived from them has no unit
-- of account. This script classifies existing rows BEFORE any migration.
--
-- ⚠ READ-ONLY. No UPDATE, no DELETE, no backfill. Nothing here is a migration.
--
-- Usage:
--   psql "$DATABASE_URL" -f prisma/scripts/lead-currency-reconciliation.sql
--
-- ---------------------------------------------------------------------------
-- WHAT COUNTS AS A DETERMINISTIC SOURCE
-- ---------------------------------------------------------------------------
-- Only two relations can carry a currency for a Lead:
--   * Proposal.rentCurrency   (Lead 1—* Proposal)   -- the canonical deal currency
--   * UnitBooking.currencyCode (Lead 1—* UnitBooking)
--
-- Explicitly NOT used, per the remediation brief: mall default, locale, amount
-- magnitude, creator, country, or the frontend's VND formatter.
--
-- ⚠ IMPORTANT CAVEAT, do not skip when reading the output.
-- BOTH source columns are declared `@default(VND)`. A row reading 'VND' there
-- may therefore be an explicit business choice OR an untouched default. This
-- script cannot distinguish the two. Consequently SAFE_TO_INFER means "one
-- unambiguous candidate exists", NOT "this value is proven correct". A
-- VND-valued inference in particular reproduces exactly the silent assumption
-- this remediation exists to remove. Treat SAFE_TO_INFER as a shortlist for a
-- human decision, never as an automatic backfill list.
--
-- ---------------------------------------------------------------------------
-- CLASSIFICATION
-- ---------------------------------------------------------------------------
--   NO_MONETARY_VALUE  expectedRent and estimatedValue are both NULL -> a NULL
--                      currency is correct and needs no decision at all
--   SAFE_TO_INFER      has money; every linked Proposal/UnitBooking agrees on
--                      exactly ONE currency (subject to the caveat above)
--   CONFLICT           has money; Proposals and UnitBookings BOTH exist and
--                      disagree with each other
--   AMBIGUOUS          has money; more than one distinct currency among the
--                      linked records of a single kind
--   CURRENCY_UNKNOWN   has money; no linked Proposal or UnitBooking at all --
--                      no deterministic source exists, only a human can say
-- ============================================================================

\echo ''
\echo '=== 1. Every Lead, classified ============================================='
\echo ''

WITH src AS (
  SELECT
    l.id,
    l."brandName",
    l.status,
    l."expectedRent",
    l."expectedArea",
    l."estimatedValue",
    (l."expectedRent" IS NOT NULL OR l."estimatedValue" IS NOT NULL) AS has_money,
    (SELECT array_agg(DISTINCT p."rentCurrency"::text)
       FROM "Proposal" p WHERE p."leadId" = l.id AND p."isActive")        AS proposal_currencies,
    (SELECT array_agg(DISTINCT b."currencyCode"::text)
       FROM "UnitBooking" b WHERE b."leadId" = l.id)                      AS booking_currencies
  FROM "Lead" l
  WHERE l."isActive" AND l."deletedAt" IS NULL
),
merged AS (
  SELECT
    src.*,
    -- Union of every distinct currency reachable from this Lead.
    (SELECT array_agg(DISTINCT c)
       FROM unnest(
         COALESCE(proposal_currencies, ARRAY[]::text[]) ||
         COALESCE(booking_currencies,  ARRAY[]::text[])
       ) AS c)                                                            AS all_currencies
  FROM src
)
SELECT
  id,
  "brandName",
  status,
  "expectedRent",
  "expectedArea",
  "estimatedValue",
  proposal_currencies,
  booking_currencies,
  all_currencies,
  CASE
    WHEN NOT has_money                                     THEN 'NO_MONETARY_VALUE'
    WHEN all_currencies IS NULL                            THEN 'CURRENCY_UNKNOWN'
    WHEN array_length(all_currencies, 1) = 1               THEN 'SAFE_TO_INFER'
    WHEN proposal_currencies IS NOT NULL
     AND booking_currencies IS NOT NULL
     AND NOT (proposal_currencies @> booking_currencies
              AND booking_currencies @> proposal_currencies)
                                                           THEN 'CONFLICT'
    ELSE 'AMBIGUOUS'
  END                                                      AS classification,
  -- Surfaced separately because a VND inference is the one most likely to be a
  -- leftover column default rather than a decision (see the caveat above).
  CASE
    WHEN has_money
     AND all_currencies IS NOT NULL
     AND array_length(all_currencies, 1) = 1
     AND all_currencies[1] = 'VND'                         THEN true
    ELSE false
  END                                                      AS inference_is_vnd_default_risk
FROM merged
ORDER BY
  CASE
    WHEN NOT has_money THEN 4
    WHEN all_currencies IS NULL THEN 1
    WHEN array_length(all_currencies, 1) = 1 THEN 3
    ELSE 0
  END,
  "brandName";

\echo ''
\echo '=== 2. Summary — how much can a migration actually decide? ================='
\echo ''

WITH src AS (
  SELECT
    (l."expectedRent" IS NOT NULL OR l."estimatedValue" IS NOT NULL) AS has_money,
    (SELECT array_agg(DISTINCT p."rentCurrency"::text)
       FROM "Proposal" p WHERE p."leadId" = l.id AND p."isActive")        AS proposal_currencies,
    (SELECT array_agg(DISTINCT b."currencyCode"::text)
       FROM "UnitBooking" b WHERE b."leadId" = l.id)                      AS booking_currencies
  FROM "Lead" l
  WHERE l."isActive" AND l."deletedAt" IS NULL
),
merged AS (
  SELECT src.*,
    (SELECT array_agg(DISTINCT c)
       FROM unnest(
         COALESCE(proposal_currencies, ARRAY[]::text[]) ||
         COALESCE(booking_currencies,  ARRAY[]::text[])
       ) AS c) AS all_currencies
  FROM src
)
SELECT
  CASE
    WHEN NOT has_money                                     THEN 'NO_MONETARY_VALUE'
    WHEN all_currencies IS NULL                            THEN 'CURRENCY_UNKNOWN'
    WHEN array_length(all_currencies, 1) = 1               THEN 'SAFE_TO_INFER'
    WHEN proposal_currencies IS NOT NULL
     AND booking_currencies IS NOT NULL
     AND NOT (proposal_currencies @> booking_currencies
              AND booking_currencies @> proposal_currencies)
                                                           THEN 'CONFLICT'
    ELSE 'AMBIGUOUS'
  END AS classification,
  count(*) AS leads
FROM merged
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '=== 3. Currency-losing copies out of Lead (for the record) ================='
\echo ''
\echo 'Lead.expectedRent is copied into Customer.budgetMin by'
\echo 'customers.service.ts (syncFromLead / createFromLead). Customer carries NO'
\echo 'currency column, so that copy drops the unit of account regardless of what'
\echo 'Lead gains. Tracked separately as CUR-002-CUSTOMER; NOT fixed by the Lead'
\echo 'migration alone.'
\echo ''

SELECT
  c.id                AS customer_id,
  c."customerCode",
  c."budgetMin",
  c."budgetMax",
  l.id                AS lead_id,
  l."brandName",
  l."expectedRent"    AS lead_expected_rent
FROM "Customer" c
JOIN "Lead" l ON l."customerId" = c.id
WHERE c."budgetMin" IS NOT NULL OR c."budgetMax" IS NOT NULL
ORDER BY c."customerCode";

\echo ''
\echo '=== 4. Post-migration: leads still carrying money with no currency ========='
\echo ''
\echo 'These are the rows the UNKNOWN bucket surfaces in the CRM pipeline. They are'
\echo 'not a bug -- they are legacy rows awaiting a human decision. They must never'
\echo 'be backfilled to VND by a script.'
\echo ''

SELECT
  count(*) FILTER (WHERE "currencyCode" IS NULL
                     AND ("expectedRent" IS NOT NULL OR "estimatedValue" IS NOT NULL))
                                                        AS money_without_currency,
  count(*) FILTER (WHERE "currencyCode" IS NOT NULL)     AS currency_captured,
  count(*) FILTER (WHERE "currencyCode" IS NULL
                     AND "expectedRent" IS NULL
                     AND "estimatedValue" IS NULL)       AS no_money_no_currency_ok,
  count(*)                                               AS active_leads
FROM "Lead"
WHERE "isActive" AND "deletedAt" IS NULL;

\echo ''
\echo 'A NOT NULL migration is safe only when CURRENCY_UNKNOWN, AMBIGUOUS and'
\echo 'CONFLICT are all 0. Otherwise add the column NULLABLE with NO default and'
\echo 'let the business resolve the rest. Never stamp legacy rows as VND.'
\echo ''
