# Golden Booking P3 Localization Backlog

**Origin:** CR-BOOKING-UX final human visual sign-off

**Priority:** P3

**Golden Booking impact:** None; Golden Booking is approved and closed

**Recorded:** 2026-08-24

## Accepted cleanup items

- Localize remaining presentation occurrences of `VACANT`.
- Localize remaining presentation occurrences of `IMMEDIATE`.
- Review the user-facing use of `Lead` and replace it with the approved locale
  term where appropriate.

## Constraints for any future cleanup

- Presentation/localization only.
- Do not change backend enums, status values, eligibility modes, API contracts,
  Booking business logic, queue semantics, schema, database, or migrations.
- Preserve authoritative reason information and English/Vietnamese locale
  separation.
- Treat the cleanup as independent P3 work; it must not reopen Golden Booking.
