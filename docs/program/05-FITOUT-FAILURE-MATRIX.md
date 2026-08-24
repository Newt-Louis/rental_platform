# 05 — Fitout & Handover: Failure Matrix

**Date:** 2026-08-19.

## Fitout auto-creation (`FitoutService.createFromContract`)

| Failure point | Pre-Phase-5 | Post-Phase-5 |
|---|---|---|
| `FitoutProject.create` succeeds, `FitoutMilestone.upsert` throws | **Persistent, no-transaction state: a `FitoutProject` exists with no milestone record.** The outer `handleContractActivated` try/catch only logs the error — the outbox event is already `PROCESSED` (the listener didn't throw past the catch), so there is **no automatic retry**, and the project is left in a state the SLA cron can't track (no milestone = no SLA target date, no breach detection for stage 1). | **Rolled back entirely — no `FitoutProject`, no milestone.** `handleContractActivated`'s catch still only logs (unchanged — this event-handler boundary wasn't touched), but now a *retry of the whole operation* (e.g. a manual "recreate fitout project" admin action, or contract re-activation) starts from a clean slate instead of finding a half-created project it can't safely repair. |
| Two `contract.activated` deliveries for the same contract (outbox redelivery, or a hypothetical duplicate emit) race | **Race-prone `findUnique` → `create`**: both could pass the pre-check before either commits, and the second's `create` would throw an unhandled `P2002` — caught only by the outer log-and-swallow, silently losing that delivery's execution with no created project confirmed anywhere else. | **Resolved via the DB unique constraint + repair pattern**: second request's transaction catches `P2002`, re-fetches, returns the winner's project. No error surfaces, no data lost. |

## Fitout stage advance (`FitoutService.advanceStatus`)

| Failure point | Pre-Phase-5 | Post-Phase-5 |
|---|---|---|
| `UnitStatusService.transition` succeeds, `FitoutProject.update` fails | **`Unit.status` already changed (e.g. to `UNDER_FITOUT`) while `FitoutProject.status` never advanced** — the exact "Stage N+1 unit, Stage N project" inconsistency section 13 warns about. No automatic reconciliation; an operator would see a unit marked under-fitout with a project still shown at the prior stage. | **Rolled back together** — `unitStatus.transition` now runs inside the same transaction; a failure anywhere after it aborts the unit-status change too. |
| `FitoutProject.update` succeeds, milestone writes fail | **Stage advanced with no SLA tracking for the new stage, and the old stage's milestone never marked complete** — silently breaks the SLA-breach cron's accuracy for this project going forward. | **Rolled back together.** |
| Gate-override audit-log write fails | Pre: stage already advanced, override happened, but **no audit trail of an overridden gate requirement** — a compliance-relevant gap (someone bypassed a required document check and there's no record). | Post: rolled back — an override that can't be logged doesn't take effect either. |
| Two users advance the same project concurrently to different targets | **Undefined/not analyzed before this phase** — whichever `update` ran last would win, silently overwriting the other's stage advance with no error to either caller and no record that a conflict occurred. | **Resolved deterministically**: in-transaction re-read rejects the loser with a clear "status changed, please refresh" error if the project moved to a *different* status than what was validated; if the project already reached the *exact* target status, it's an idempotent no-op success instead. A genuine same-instant commit race (`P2034`) resolves to the winning outcome. |

## Fitout-submittal approver notification

| Failure point | Pre-Phase-5 | Post-Phase-5 |
|---|---|---|
| SMTP send fails | **Lost — no retry, no visibility.** `emailService.sendMail()` is fire-and-forget from the caller's perspective (the in-app `Notification` still gets created first, so the approver isn't *entirely* unaware — they'd see it in-app — but the email channel silently fails with no record). | **Queued via `EmailDeliveryService`** (same retryable infrastructure as SLA-breach/AR-dunning) — 15s poll, exponential backoff to 30 min, failures visible in the `EmailDelivery` table. |
| Same step re-triggers `notifyPendingApprovers` (e.g. a duplicate `step-advanced` emit, or a manual re-check) | Would send a **second** email to the same approvers — no dedup. | Deterministic `eventKey` (`fitout-submittal:<id>:step:<order>:approver:<id>`) makes a re-enqueue a safe no-op via the existing upsert-based queue. |

## Mall-access / document security (Submittal controller)

| Failure point | Pre-Phase-5 | Post-Phase-5 |
|---|---|---|
| A staff user with role access to `fitout-submittals` endpoints but no mall assignment for the project's mall calls any submittal route | **Allowed** — no mall-scoping check existed on this controller at all, unlike the main `FitoutController`. | Every route now resolves the target project (directly or via the submittal id) and calls the same `mallAccess.extractAndValidateMallAccess` check `FitoutController` already used — `ForbiddenException` if the user isn't scoped to that mall. |
