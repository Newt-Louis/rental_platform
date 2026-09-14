-- BILL-002 / FIN-10 — at most one LIVE revenue-share invoice per contract+period.
--
-- Business key proven by tracing the generator and every predicate that reads it:
--   (contractId, period) WHERE type = 'REVENUE_SHARE'
-- restricted to live invoices, because `voidInvoice()` sets status = CANCELLED
-- and KEEPS the row (isActive stays true). A unique index over the bare triple
-- would permanently block re-issuing a revenue-share invoice for a voided
-- period — a regression, not a fix.
--
-- tenantId is deliberately excluded: Contract.tenantId is NOT NULL, so the
-- tenant is functionally determined by the contract. Including it would be
-- redundant and would let the same contract+period through under a different
-- tenantId.
--
-- Prisma's schema language cannot express a partial unique index (no WHERE
-- clause on @@unique), so this is raw SQL. Do NOT replace it with a plain
-- @@unique([contractId, period, type]) — that would be a broader rule than the
-- business key and would block legitimate re-billing after a void.
--
-- PRE-FLIGHT: run prisma/scripts/revenue-share-duplicate-reconciliation.sql
-- first. This statement FAILS (loudly, without corrupting anything) if any
-- duplicate live key already exists; resolve those with the business first.
--
-- ROLLBACK: DROP INDEX "Invoice_revenue_share_contract_period_live_key";
--
-- LOCKING: a plain CREATE UNIQUE INDEX takes a SHARE lock on "Invoice",
-- blocking writes for the duration of the build. Prisma runs migrations inside
-- a transaction so CONCURRENTLY is not available here. On a large Invoice table
-- prefer applying this in a maintenance window, or build it manually with
-- CREATE UNIQUE INDEX CONCURRENTLY outside Prisma and then mark the migration
-- as applied.
CREATE UNIQUE INDEX "Invoice_revenue_share_contract_period_live_key"
  ON "Invoice" ("contractId", "period")
  WHERE "type" = 'REVENUE_SHARE'
    AND "isActive" = true
    AND "status" <> 'CANCELLED';
