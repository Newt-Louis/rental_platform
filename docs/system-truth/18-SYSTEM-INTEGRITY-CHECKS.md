# System Truth — 18 — System Integrity Checks

## Status
No dedicated cross-module reconciliation/integrity-check mechanism exists platform-wide (confirmed — see `00-SYSTEM-OVERVIEW.md`'s cross-cutting capability inventory: "Reconciliation" is PARTIAL, SAP-only). The checks below are proposed, not yet implemented as running code, unless noted.

## Candidate checks (derived directly from this reconstruction's confirmed findings)

| Check | Verifies | Currently implemented? |
|---|---|---|
| No `Invoice` row has a `currencyCode` inconsistent with its source Contract/ServiceContract/ParkingContract currency | INV-001 | No — this check would have caught the ServiceContracts transfer-path bug and the penalty-interest bug immediately |
| `findAllInvoices()`-style aggregates never mix currencies | INV-002 | No — partially covered by the VND-filter convention elsewhere, but not as an enforced check |
| Every `Unit.status` write goes through `UnitStatusService.transition()` | INV-003 | No — would have caught the merge/split bypass |
| No two `SlotBooking` rows for the same Slot have overlapping time windows | INV-005 | No — no DB constraint exists; this is the direct fix for the confirmed double-booking bug |
| Every Ticket read/mutation is scoped to `currentUser.tenantId` for TENANT-role callers | INV-006 | No — would have caught the `escalations`/`rate`/`rating` gap |
| Every Mall-scoped resource read/write validates the caller's `UserMallAccess` | INV-007 | No — would have caught the entire Mall-scoping gap cluster; this is the single highest-value check to build |
| A completed `ContractTermination` always has a corresponding `Unit.status = VACANT` | INV-010 | No |
| SAP `SapIntegrationLog` rows in PENDING/FAILED status are retried within a bounded window | BP-010 | No — currently no automation triggers retry at all |

## Recommended implementation priority

1. **INV-007 (Mall-scoping)** — highest value, would have caught roughly half of this reconstruction's confirmed findings. Best implemented as a build-time or CI lint rule (e.g., "every controller method must either be role-restricted to `[ADMIN, CEO]`-only or call `MallAccessService`") rather than a runtime check, since the gap is structural (missing code), not a data-consistency drift.
2. **INV-005 (Slot double-booking)** — a DB unique/exclusion constraint on `(slotId, timeRange)` would close this at the data layer regardless of application-code discipline.
3. **INV-001/INV-002 (currency consistency)** — a scheduled reconciliation job comparing `Invoice.currencyCode` against its source's currency, and flagging/blocking any cross-currency aggregate query, would close the confirmed financial bugs and prevent regression.
4. **INV-003, INV-006, INV-010** — narrower blast radius, lower priority but still real.

## This document's role going forward

Once any of the above checks are actually implemented as running code (not merely proposed here), update this document with: script/query location, frequency, last-run result, and owning role, per the template structure. Until then, treat every row above as **NOT YET IMPLEMENTED**, not as evidence the underlying risk is monitored.
