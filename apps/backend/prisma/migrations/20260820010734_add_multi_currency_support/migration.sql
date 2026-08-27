-- Multi-Currency Foundation (docs/program/MULTI_CURRENCY_ARCHITECTURE.md)
-- Adds VND/USD/MMK as a closed-set CurrencyCode enum and threads an explicit
-- currency field through the core leasing lifecycle: UnitBooking, Proposal,
-- Contract, BillingScheduleEntry, Invoice, Payment.
--
-- Every existing monetary row today is implicitly VND (confirmed by audit —
-- Proposal.rentCurrency has zero non-VND rows in the current dataset). All
-- new/converted columns therefore default to 'VND', which backfills existing
-- rows atomically as part of adding the column (Postgres 11+: ADD COLUMN
-- ... NOT NULL DEFAULT <constant> is a metadata-only operation, no table
-- rewrite, no historical row is left with a null currency).

CREATE TYPE "CurrencyCode" AS ENUM ('VND', 'USD', 'MMK');

-- UnitBooking: new, defaults VND (no currency existed before this pass)
ALTER TABLE "UnitBooking" ADD COLUMN "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'VND';

-- Proposal: convert existing free-text rentCurrency ("VND" on every row today)
-- to the enum type. USING cast is safe because every existing value is a
-- valid CurrencyCode member (verified live: SELECT DISTINCT rentCurrency
-- returns only 'VND').
ALTER TABLE "Proposal" ALTER COLUMN "rentCurrency" DROP DEFAULT;
ALTER TABLE "Proposal" ALTER COLUMN "rentCurrency" TYPE "CurrencyCode" USING "rentCurrency"::"CurrencyCode";
ALTER TABLE "Proposal" ALTER COLUMN "rentCurrency" SET DEFAULT 'VND';

-- Contract: new, authoritative for the rest of the lifecycle downstream of it
ALTER TABLE "Contract" ADD COLUMN "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'VND';

-- BillingScheduleEntry: new, derived from Contract.currencyCode
ALTER TABLE "BillingScheduleEntry" ADD COLUMN "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'VND';

-- Invoice: new, derived from the source Contract/BillingScheduleEntry
ALTER TABLE "Invoice" ADD COLUMN "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'VND';

-- Payment: new, always equal to Invoice.currencyCode
ALTER TABLE "Payment" ADD COLUMN "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'VND';
