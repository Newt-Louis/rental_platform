-- ============================================================================
-- RPT-CUR-006 / CUR-002 (UnitSlot + SlotBooking subset)
-- SLOT CURRENCY RECONCILIATION (READ-ONLY)
-- ============================================================================
--
-- `UnitSlot.pricePerDaySqm/pricePerHour/pricePerSqmMonth` and
-- `SlotBooking.baseAmount/totalAmount` are monetary with no currency column.
-- `SlotBooking.totalAmount` feeds the Dashboard SHORT revenue card and can be
-- turned into an Invoice, so the loss is reachable in both reporting and money.
--
-- ⚠ READ-ONLY. No UPDATE, no DELETE, no backfill.
--
-- Usage:
--   psql "$DATABASE_URL" -f prisma/scripts/slot-currency-reconciliation.sql
--
-- ---------------------------------------------------------------------------
-- WHY `Unit.currencyCode` IS NOT AN INFERENCE SOURCE FOR SLOT PRICING
-- ---------------------------------------------------------------------------
-- `Unit.currencyCode` exists, but its own schema comment scopes it explicitly to
-- `baseRentPerSqm / camPerSqm / marketRentPerSqm / askingRentPerSqm` -- the
-- Unit's long-term rent fields. Slot prices are not in that list, nothing in
-- code derives one from the other, and `updateSlot` edits slot prices with no
-- reference to the Unit at all. There is therefore no proven business rule
-- making a slot's pricing currency equal its Unit's, and inheriting it would be
-- an assumption rather than an inference.
--
-- Consequence: `SAFE_TO_INFER_FROM_UNIT` is **unreachable by construction** in
-- this script. It is still emitted as a class so the reasoning is visible rather
-- than silently absent. `unit_currency` is kept as a DIAGNOSTIC column only.
--
-- ---------------------------------------------------------------------------
-- WHAT PROVENANCE MEANS FOR A BOOKING
-- ---------------------------------------------------------------------------
-- A booking's currency may only be inferred from its slot when the persisted
-- `baseAmount` can still be REPRODUCED from that slot's current price -- i.e.
-- the price that produced the stored number is demonstrably the price the slot
-- holds today. `updateSlot` lets prices change freely and `deleteSlot` is a soft
-- delete that deliberately keeps booking history, so a slot's current price is
-- routinely NOT the price a historical booking was calculated from.
--
-- The reproduction below uses the SIMPLE formula only
-- (price x area x duration). `calculatePrice` also applies WEEKEND / PEAK
-- multipliers and VOLUME_DISCOUNT rules, which this script cannot replay. A
-- booking affected by a multiplier will therefore NOT reproduce and is reported
-- as CURRENCY_UNKNOWN -- conservative on purpose: failing to prove provenance
-- must never be read as proving it.
--
-- CLASSIFICATION — UnitSlot
--   NO_MONETARY_VALUE        no price field set
--   SAFE_TO_INFER_FROM_UNIT  unreachable, see above
--   CONFLICT                 not applicable before the column exists; after the
--                            migration, a slot whose currency differs from every
--                            booking it produced
--   AMBIGUOUS                priced, and its bookings disagree about currency
--   CURRENCY_UNKNOWN         priced, no deterministic source -- a human decides
--
-- CLASSIFICATION — SlotBooking
--   OK                       the booking already carries its own currency --
--                            nothing to infer, nothing to decide
--   ALREADY_FINANCIALLY_USED no currency, and an Invoice was already raised from
--                            it -- changing the label now has financial
--                            consequences; resolve with finance first
--   SAFE_TO_INFER_FROM_SLOT  no currency, baseAmount still reproduces from the
--                            slot's current price, AND the slot carries one
--   SAFE_TO_INFER_FROM_UNIT  unreachable, see above
--   CONFLICT                 unreachable for a booking: it has exactly one slot,
--                            so there is no second source to disagree with. A
--                            booking whose currency differs from its slot's
--                            CURRENT currency is the snapshot working as
--                            designed, not a conflict -- reported as the
--                            diagnostic `booking_vs_slot_currency_differs`.
--   CURRENCY_UNKNOWN         everything else -- a human decides
-- ============================================================================

\echo ''
\echo '=== 1. UnitSlot, classified =============================================='
\echo ''

SELECT
  s.id,
  u.code                       AS unit_code,
  s.code                       AS slot_code,
  s.area,
  s."pricePerDaySqm",
  s."pricePerHour",
  s."pricePerSqmMonth",
  u."currencyCode"             AS unit_currency_DIAGNOSTIC_ONLY,
  (SELECT count(*) FROM "SlotBooking" b WHERE b."slotId" = s.id) AS bookings,
  s."currencyCode"             AS slot_currency,
  CASE
    WHEN s."currencyCode" IS NOT NULL          THEN 'OK'
    WHEN s."pricePerDaySqm" IS NULL
     AND s."pricePerHour" IS NULL
     AND s."pricePerSqmMonth" IS NULL          THEN 'NO_MONETARY_VALUE'
    ELSE 'CURRENCY_UNKNOWN'
  END                          AS classification
FROM "UnitSlot" s
JOIN "Unit" u ON u.id = s."unitId"
WHERE s."isActive"
ORDER BY u.code, s.code;

\echo ''
\echo '=== 2. UnitSlot summary =================================================='
\echo ''

SELECT
  CASE
    WHEN s."currencyCode" IS NOT NULL THEN 'OK'
    WHEN s."pricePerDaySqm" IS NULL
     AND s."pricePerHour" IS NULL
     AND s."pricePerSqmMonth" IS NULL THEN 'NO_MONETARY_VALUE'
    ELSE 'CURRENCY_UNKNOWN'
  END AS classification,
  count(*) AS slots
FROM "UnitSlot" s
WHERE s."isActive"
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '=== 3. SlotBooking, classified ==========================================='
\echo ''

WITH b AS (
  SELECT
    bk.id,
    bk."bookingRef",
    bk.type,
    bk.status,
    bk."baseAmount",
    bk."totalAmount",
    bk."discountPct",
    bk."currencyCode"          AS booking_currency,
    s."currencyCode"           AS slot_currency,
    s.id                       AS slot_id,
    s.code                     AS slot_code,
    s.area                     AS slot_area,
    s."pricePerDaySqm",
    s."pricePerHour",
    s."pricePerSqmMonth",
    u.code                     AS unit_code,
    u."currencyCode"           AS unit_currency,
    -- Reproduce baseAmount from the slot's CURRENT price, simple formula only.
    CASE bk.type
      WHEN 'DAILY'   THEN s."pricePerDaySqm"   * s.area
                          * GREATEST(CEIL(EXTRACT(EPOCH FROM (bk."endDatetime" - bk."startDatetime")) / 86400.0), 1)
      WHEN 'HOURLY'  THEN s."pricePerHour"
                          * GREATEST(CEIL(EXTRACT(EPOCH FROM (bk."endDatetime" - bk."startDatetime")) / 3600.0), 1)
      WHEN 'MONTHLY' THEN s."pricePerSqmMonth" * s.area
                          * GREATEST(CEIL(EXTRACT(EPOCH FROM (bk."endDatetime" - bk."startDatetime")) / 2592000.0), 1)
      ELSE NULL
    END                        AS reproduced_base,
    EXISTS (SELECT 1 FROM "Invoice" i
             WHERE i."sourceType" = 'SHORT_TERM_BOOKING'
               AND i."sourceId" = bk.id
               AND i."isActive")                 AS has_invoice
  FROM "SlotBooking" bk
  JOIN "UnitSlot" s ON s.id = bk."slotId"
  JOIN "Unit" u     ON u.id = s."unitId"
)
SELECT
  "bookingRef",
  unit_code,
  slot_code,
  type,
  status,
  "baseAmount",
  "totalAmount",
  round(reproduced_base::numeric, 2) AS reproduced_base,
  -- Provenance: does the stored amount still come from this slot's price?
  (reproduced_base IS NOT NULL
     AND abs(COALESCE("baseAmount", 0) - reproduced_base) < 0.01) AS base_reproduces_from_slot,
  booking_currency,
  slot_currency,
  (booking_currency IS NOT NULL AND slot_currency IS NOT NULL
     AND booking_currency <> slot_currency)          AS booking_vs_slot_currency_differs,
  unit_currency AS unit_currency_DIAGNOSTIC_ONLY,
  has_invoice,
  CASE
    WHEN booking_currency IS NOT NULL                    THEN 'OK'
    WHEN has_invoice                                     THEN 'ALREADY_FINANCIALLY_USED'
    WHEN reproduced_base IS NULL                         THEN 'CURRENCY_UNKNOWN'
    WHEN abs(COALESCE("baseAmount", 0) - reproduced_base) >= 0.01
                                                         THEN 'CURRENCY_UNKNOWN'
    WHEN slot_currency IS NULL                           THEN 'CURRENCY_UNKNOWN'
    ELSE 'SAFE_TO_INFER_FROM_SLOT'
  END AS classification
FROM b
ORDER BY has_invoice DESC, unit_code, slot_code, "bookingRef";

\echo ''
\echo '=== 4. SlotBooking summary ==============================================='
\echo ''

WITH b AS (
  SELECT
    bk.id, bk.type, bk."baseAmount",
    bk."currencyCode" AS booking_currency,
    s."currencyCode"  AS slot_currency,
    s.area AS slot_area, s."pricePerDaySqm", s."pricePerHour", s."pricePerSqmMonth",
    CASE bk.type
      WHEN 'DAILY'   THEN s."pricePerDaySqm"   * s.area
                          * GREATEST(CEIL(EXTRACT(EPOCH FROM (bk."endDatetime" - bk."startDatetime")) / 86400.0), 1)
      WHEN 'HOURLY'  THEN s."pricePerHour"
                          * GREATEST(CEIL(EXTRACT(EPOCH FROM (bk."endDatetime" - bk."startDatetime")) / 3600.0), 1)
      WHEN 'MONTHLY' THEN s."pricePerSqmMonth" * s.area
                          * GREATEST(CEIL(EXTRACT(EPOCH FROM (bk."endDatetime" - bk."startDatetime")) / 2592000.0), 1)
      ELSE NULL
    END AS reproduced_base,
    EXISTS (SELECT 1 FROM "Invoice" i
             WHERE i."sourceType" = 'SHORT_TERM_BOOKING'
               AND i."sourceId" = bk.id AND i."isActive") AS has_invoice
  FROM "SlotBooking" bk
  JOIN "UnitSlot" s ON s.id = bk."slotId"
)
SELECT
  CASE
    WHEN booking_currency IS NOT NULL THEN 'OK'
    WHEN has_invoice                  THEN 'ALREADY_FINANCIALLY_USED'
    WHEN reproduced_base IS NULL      THEN 'CURRENCY_UNKNOWN'
    WHEN abs(COALESCE("baseAmount", 0) - reproduced_base) >= 0.01
                                      THEN 'CURRENCY_UNKNOWN'
    WHEN slot_currency IS NULL        THEN 'CURRENCY_UNKNOWN'
    ELSE 'SAFE_TO_INFER_FROM_SLOT'
  END AS classification,
  count(*) AS bookings
FROM b
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '=== 5. Invoices already raised from a currency-less booking =============='
\echo ''
\echo 'These invoices took Invoice.currencyCode from its @default(VND) because the'
\echo 'SHORT_TERM_BOOKING path never set it. Where the booking was not actually'
\echo 'priced in VND, the invoice carries a wrong currency label on real money.'
\echo ''

SELECT
  i."invoiceNumber",
  i."currencyCode"    AS invoice_currency,
  i."totalAmount"     AS invoice_total,
  bk."bookingRef",
  bk."totalAmount"    AS booking_total,
  u."currencyCode"    AS unit_currency_DIAGNOSTIC_ONLY
FROM "Invoice" i
JOIN "SlotBooking" bk ON bk.id = i."sourceId"
JOIN "UnitSlot" s     ON s.id = bk."slotId"
JOIN "Unit" u         ON u.id = s."unitId"
WHERE i."sourceType" = 'SHORT_TERM_BOOKING' AND i."isActive"
ORDER BY i."invoiceNumber";

\echo ''
\echo '=== 6. Post-migration: rows still carrying money with no currency ========='
\echo ''

SELECT
  (SELECT count(*) FROM "UnitSlot"
    WHERE "isActive" AND "currencyCode" IS NULL
      AND ("pricePerDaySqm" IS NOT NULL OR "pricePerHour" IS NOT NULL OR "pricePerSqmMonth" IS NOT NULL))
                                                    AS slots_priced_without_currency,
  (SELECT count(*) FROM "UnitSlot" WHERE "isActive" AND "currencyCode" IS NOT NULL)
                                                    AS slots_with_currency,
  (SELECT count(*) FROM "SlotBooking" WHERE "currencyCode" IS NULL)
                                                    AS bookings_without_currency,
  (SELECT count(*) FROM "SlotBooking" WHERE "currencyCode" IS NOT NULL)
                                                    AS bookings_with_currency;

\echo ''
\echo 'Nothing here may be backfilled from Unit.currencyCode or from a slot price'
\echo 'that has since changed. Unknown historical rows stay UNKNOWN.'
\echo ''
