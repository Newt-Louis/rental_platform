-- RPT-CUR-006 / CUR-002 (UnitSlot + SlotBooking subset)
--
-- UnitSlot.currencyCode  = the pricing currency for pricePerDaySqm /
--                          pricePerHour / pricePerSqmMonth.
-- SlotBooking.currencyCode = an immutable snapshot of the currency that governed
--                          baseAmount/totalAmount at booking time.
--
-- Both NULLABLE with NO DEFAULT, on purpose.
--
-- Neither may be backfilled from Unit.currencyCode: that column is scoped by its
-- own schema comment to the Unit's long-term rent fields, and nothing ties slot
-- pricing to it. A booking may only inherit from its slot when the stored
-- baseAmount still reproduces from that slot's current price -- updateSlot edits
-- prices freely and deleteSlot keeps booking history, so today's price is
-- routinely not the price a historical booking was calculated from. Run
-- prisma/scripts/slot-currency-reconciliation.sql before and after.
--
-- Two ADD COLUMNs, no rows touched. Nullable, no default, no constraint, so no
-- table rewrite -- only a brief ACCESS EXCLUSIVE lock per table.
-- Rollback:
--   ALTER TABLE "UnitSlot"    DROP COLUMN "currencyCode";
--   ALTER TABLE "SlotBooking" DROP COLUMN "currencyCode";

ALTER TABLE "UnitSlot"    ADD COLUMN "currencyCode" "CurrencyCode";
ALTER TABLE "SlotBooking" ADD COLUMN "currencyCode" "CurrencyCode";
