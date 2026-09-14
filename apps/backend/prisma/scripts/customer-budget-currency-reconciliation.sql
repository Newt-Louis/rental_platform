-- ============================================================================
-- CUR-002-CUSTOMER — CUSTOMER BUDGET CURRENCY RECONCILIATION (READ-ONLY)
-- ============================================================================
--
-- `Customer.budgetMin` / `budgetMax` are monetary but `Customer` has no currency
-- column. Wave 3 gave `Lead` an explicit currency, so the
-- `Lead.expectedRent -> Customer.budgetMin` copy in
-- `customers.service.ts#customerDataFromLead` now DROPS a currency that exists.
--
-- ⚠ READ-ONLY. No UPDATE, no DELETE, no backfill.
--
-- Usage:
--   psql "$DATABASE_URL" -f prisma/scripts/customer-budget-currency-reconciliation.sql
--
-- ---------------------------------------------------------------------------
-- WHAT COUNTS AS A DETERMINISTIC SOURCE
-- ---------------------------------------------------------------------------
-- Only one relation can carry a currency for a Customer budget: the linked
-- `Lead` (Customer 1—* Lead), via `Lead.currencyCode`.
--
-- Explicitly NOT used, per the remediation brief: mall, country, locale, amount
-- magnitude, any `@default(VND)` column, the most recent Proposal, or "the first
-- related record".
--
-- ⚠ PROVENANCE IS A PRECONDITION, NOT A FOOTNOTE.
--
-- A linked Lead is NOT proof that the budget came from it. `Customer.budgetMin`
-- is written directly by `CustomersService.create` and by the seed; only
-- `customerDataFromLead` copies it from `Lead.expectedRent`. Where
-- `budgetMin <> lead.expectedRent`, the Lead's currency describes a DIFFERENT
-- monetary value, and carrying it across would be guesswork wearing an
-- inference label.
--
-- So a linked Lead can only supply a currency when
-- `lead.expectedRent = customer.budgetMin` — i.e. the exact monetary value being
-- inferred is demonstrably the same business value. Every other row is
-- CURRENCY_UNKNOWN, however many Leads it links to.
--
-- (Earlier revisions of this script classified on link alone and reported 10
-- SAFE_TO_INFER on a dataset where the provenance check failed for all 10. That
-- was wrong: the label promised something the data did not support.)
--
-- `Lead.currencyCode` is itself nullable (Wave 3, deliberately). A Lead with a
-- NULL currency carries nothing to inherit even when the figures do match.
--
-- CLASSIFICATION  (all cases below already require budgetMin/budgetMax present)
--   NO_MONETARY_VALUE  budgetMin and budgetMax both NULL -> no decision needed
--   SAFE_TO_INFER      at least one linked Lead has expectedRent = budgetMin,
--                      every such Lead carries a currency, and they all agree on
--                      exactly one
--   AMBIGUOUS          provenance-matched Leads agree on one currency but at
--                      least one of them has a NULL currency
--   CONFLICT           provenance-matched Leads carry more than one currency
--   CURRENCY_UNKNOWN   no provenance-matched Lead at all, or every matched Lead
--                      has a NULL currency -- only a human can say
-- ============================================================================

\echo ''
\echo '=== 1. Every Customer, classified ========================================='
\echo ''

WITH src AS (
  SELECT
    c.id,
    c."customerCode",
    c."companyName",
    c.status,
    c."budgetMin",
    c."budgetMax",
    (c."budgetMin" IS NOT NULL OR c."budgetMax" IS NOT NULL)              AS has_money,
    (SELECT count(*) FROM "Lead" l
      WHERE l."customerId" = c.id AND l."isActive" AND l."deletedAt" IS NULL)   AS linked_leads,
    -- Diagnostic only: every currency reachable through a link, regardless of
    -- whether the budget actually came from that Lead. NOT used to classify.
    (SELECT array_agg(DISTINCT l."currencyCode"::text) FROM "Lead" l
      WHERE l."customerId" = c.id AND l."isActive" AND l."deletedAt" IS NULL
        AND l."currencyCode" IS NOT NULL)                                      AS linked_lead_currency,
    -- Provenance check: does the budget actually equal what the Lead holds?
    (SELECT bool_or(l."expectedRent" IS NOT DISTINCT FROM c."budgetMin") FROM "Lead" l
      WHERE l."customerId" = c.id AND l."isActive" AND l."deletedAt" IS NULL)   AS budget_equals_lead_rent,
    -- CLASSIFYING inputs: restricted to Leads whose expectedRent IS the budget.
    (SELECT count(*) FROM "Lead" l
      WHERE l."customerId" = c.id AND l."isActive" AND l."deletedAt" IS NULL
        AND l."expectedRent" IS NOT DISTINCT FROM c."budgetMin")                AS matched_leads,
    (SELECT count(*) FROM "Lead" l
      WHERE l."customerId" = c.id AND l."isActive" AND l."deletedAt" IS NULL
        AND l."expectedRent" IS NOT DISTINCT FROM c."budgetMin"
        AND l."currencyCode" IS NULL)                                          AS matched_leads_without_currency,
    (SELECT array_agg(DISTINCT l."currencyCode"::text) FROM "Lead" l
      WHERE l."customerId" = c.id AND l."isActive" AND l."deletedAt" IS NULL
        AND l."expectedRent" IS NOT DISTINCT FROM c."budgetMin"
        AND l."currencyCode" IS NOT NULL)                                      AS matched_lead_currencies
  FROM "Customer" c
  WHERE c."isActive" AND c."deletedAt" IS NULL
)
SELECT
  "customerCode",
  "companyName",
  status,
  "budgetMin",
  "budgetMax",
  linked_leads,
  linked_lead_currency,
  budget_equals_lead_rent,
  matched_leads,
  matched_lead_currencies,
  CASE
    WHEN NOT has_money                                        THEN 'NO_MONETARY_VALUE'
    -- No Lead holds this exact figure -> nothing to inherit from.
    WHEN matched_lead_currencies IS NULL                      THEN 'CURRENCY_UNKNOWN'
    WHEN array_length(matched_lead_currencies, 1) > 1         THEN 'CONFLICT'
    WHEN matched_leads_without_currency > 0                   THEN 'AMBIGUOUS'
    ELSE 'SAFE_TO_INFER'
  END                                                          AS classification
FROM src
ORDER BY
  CASE
    WHEN NOT has_money THEN 4
    WHEN matched_lead_currencies IS NULL THEN 1
    WHEN array_length(matched_lead_currencies, 1) > 1 THEN 0
    WHEN matched_leads_without_currency > 0 THEN 2
    ELSE 3
  END,
  "customerCode";

\echo ''
\echo '=== 2. Summary ============================================================'
\echo ''

WITH src AS (
  SELECT
    (c."budgetMin" IS NOT NULL OR c."budgetMax" IS NOT NULL) AS has_money,
    -- Same provenance restriction as section 1: only Leads whose expectedRent
    -- IS this budget can supply its currency.
    (SELECT count(*) FROM "Lead" l
      WHERE l."customerId" = c.id AND l."isActive" AND l."deletedAt" IS NULL
        AND l."expectedRent" IS NOT DISTINCT FROM c."budgetMin"
        AND l."currencyCode" IS NULL)                        AS matched_leads_without_currency,
    (SELECT array_agg(DISTINCT l."currencyCode"::text) FROM "Lead" l
      WHERE l."customerId" = c.id AND l."isActive" AND l."deletedAt" IS NULL
        AND l."expectedRent" IS NOT DISTINCT FROM c."budgetMin"
        AND l."currencyCode" IS NOT NULL)                    AS matched_lead_currencies
  FROM "Customer" c
  WHERE c."isActive" AND c."deletedAt" IS NULL
)
SELECT
  CASE
    WHEN NOT has_money                                THEN 'NO_MONETARY_VALUE'
    WHEN matched_lead_currencies IS NULL              THEN 'CURRENCY_UNKNOWN'
    WHEN array_length(matched_lead_currencies, 1) > 1 THEN 'CONFLICT'
    WHEN matched_leads_without_currency > 0           THEN 'AMBIGUOUS'
    ELSE 'SAFE_TO_INFER'
  END AS classification,
  count(*) AS customers
FROM src
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '=== 3. Provenance: is the budget actually the Lead figure? ================='
\echo ''
\echo 'If budgetMin differs from the linked Lead expectedRent, the budget was NOT'
\echo 'copied from that Lead (CustomersService.create and the seed write budgets'
\echo 'directly). Inferring the currency from that Lead would then be describing a'
\echo 'different number -- which is guesswork, not inference.'
\echo ''

SELECT
  c."customerCode",
  c."budgetMin",
  l."brandName"       AS lead_brand,
  l."expectedRent"    AS lead_expected_rent,
  l."currencyCode"    AS lead_currency,
  (l."expectedRent" IS NOT DISTINCT FROM c."budgetMin") AS budget_equals_lead_rent
FROM "Customer" c
JOIN "Lead" l ON l."customerId" = c.id AND l."isActive" AND l."deletedAt" IS NULL
WHERE c."budgetMin" IS NOT NULL OR c."budgetMax" IS NOT NULL
ORDER BY c."customerCode";

\echo ''
\echo '=== 4. Post-migration: budgets still carrying no currency =================='
\echo ''

SELECT
  count(*) FILTER (WHERE "currencyCode" IS NULL
                     AND ("budgetMin" IS NOT NULL OR "budgetMax" IS NOT NULL))
                                                       AS money_without_currency,
  count(*) FILTER (WHERE "currencyCode" IS NOT NULL)    AS currency_captured,
  count(*) FILTER (WHERE "budgetMin" IS NULL AND "budgetMax" IS NULL)
                                                       AS no_money,
  count(*)                                             AS active_customers
FROM "Customer"
WHERE "isActive" AND "deletedAt" IS NULL;

\echo ''
\echo 'A NOT NULL migration is safe only when CURRENCY_UNKNOWN, AMBIGUOUS and'
\echo 'CONFLICT are all 0 AND budget_equals_lead_rent holds for every row.'
\echo 'Otherwise add the column NULLABLE with NO default. Never stamp legacy rows'
\echo 'as VND.'
\echo ''
