-- RPT-CUR-005 / CUR-002 (Lead subset)
--
-- Adds a currency to Lead's monetary fields (expectedRent, estimatedValue).
--
-- NULLABLE with NO DEFAULT, on purpose. Run
-- `prisma/scripts/lead-currency-reconciliation.sql` before and after: on the
-- reference dataset it reports 9 SAFE_TO_INFER, 10 CURRENCY_UNKNOWN and
-- 1 CONFLICT out of 20 active leads, so no backfill rule exists. A DEFAULT 'VND'
-- would stamp a fabricated unit of account onto figures that feed the CRM
-- pipeline value -- precisely the defect this column exists to remove.
--
-- This migration adds a column and touches no rows. It takes only a brief
-- ACCESS EXCLUSIVE lock (no table rewrite: nullable, no default, no
-- constraint), and rolls back with `ALTER TABLE "Lead" DROP COLUMN "currencyCode"`.

ALTER TABLE "Lead" ADD COLUMN "currencyCode" "CurrencyCode";
