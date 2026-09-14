-- SAP-004 — give the reconciliation comparison a unit of account.
--
-- `SapReconciliationRecord` compared `ourAmount` against `sapAmount` with no
-- currency on either side, and marked MATCHED on |difference| < 1. That means
-- 100 VND and 100 USD reconciled as equal.
--
-- Three changes:
--
-- 1. ourAmount becomes NULLABLE. Only entityType 'INVOICE' has a sourced amount;
--    every other type persisted a fabricated 0 that could MATCH a SAP zero on
--    two meaningless numbers. An unsourced side is now NULL, not 0.
--
-- 2. ourCurrencyCode added. Provable: it is Invoice.currencyCode for the invoice
--    the integration log points at.
--
-- 3. sapCurrencyCode added but DELIBERATELY NEVER POPULATED. log.response is raw
--    text from the external SAP endpoint; no verified field carries a currency
--    and no verified meaning exists for it (document / transaction / local /
--    company-code / group currency are different things). Copying
--    Invoice.currencyCode into it would assert SAP answered in our currency --
--    the exact unproven assumption SAP-004 exists to remove. The column makes
--    the gap visible and gives the external contract somewhere to land.
--
-- Both currency columns are NULLABLE with NO DEFAULT. No backfill: 0 rows exist
-- (verified), and even with rows, our side would be inferable while the SAP side
-- would not.
--
-- Lock: brief ACCESS EXCLUSIVE per statement. Table rewrite: NO -- ADD COLUMN
-- nullable-no-default is metadata-only, and DROP NOT NULL is a catalogue change.
-- Existing data impact: none (0 rows).
-- Duplicate precheck: not applicable, no uniqueness added.
-- Rollback:
--   ALTER TABLE "SapReconciliationRecord" DROP COLUMN "sapCurrencyCode";
--   ALTER TABLE "SapReconciliationRecord" DROP COLUMN "ourCurrencyCode";
--   ALTER TABLE "SapReconciliationRecord" ALTER COLUMN "ourAmount" SET NOT NULL;
--   -- (the SET NOT NULL rollback only succeeds while no NULL ourAmount exists)

ALTER TABLE "SapReconciliationRecord" ALTER COLUMN "ourAmount" DROP NOT NULL;
ALTER TABLE "SapReconciliationRecord" ADD COLUMN "ourCurrencyCode" "CurrencyCode";
ALTER TABLE "SapReconciliationRecord" ADD COLUMN "sapCurrencyCode" "CurrencyCode";
