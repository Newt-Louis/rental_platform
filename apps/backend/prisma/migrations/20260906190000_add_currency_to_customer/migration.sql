-- CUR-002-CUSTOMER
--
-- Adds a currency to Customer's budget range (budgetMin, budgetMax).
--
-- NULLABLE with NO DEFAULT, on purpose. Run
-- `prisma/scripts/customer-budget-currency-reconciliation.sql` before and after.
-- On the reference dataset all 10 active customers carry a budget and the
-- linked-Lead rule labels every one SAFE_TO_INFER -- but the script's provenance
-- column shows `budget_equals_lead_rent = false` for all 10, i.e. the budgets
-- were written directly by CustomersService.create/the seed and never copied
-- from those Leads. Inheriting the Lead's currency would therefore attach it to
-- a different number. A DEFAULT 'VND' would be worse still.
--
-- This migration adds a column and touches no rows. Nullable, no default, no
-- constraint, so no table rewrite -- only a brief ACCESS EXCLUSIVE lock.
-- Rollback: ALTER TABLE "Customer" DROP COLUMN "currencyCode".

ALTER TABLE "Customer" ADD COLUMN "currencyCode" "CurrencyCode";
