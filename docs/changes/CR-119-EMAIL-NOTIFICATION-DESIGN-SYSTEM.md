# CR-119 — Leasing Email Notification Design System and Template Remediation

## CHANGE ID
CR-119

## BUSINESS REASON
Transactional emails are difficult to scan, visually inconsistent, not reliably Outlook-safe, and expose business risk through unescaped interpolation, inconsistent deep links, and silent currency fallback. Recipients must be able to identify the event, affected object, urgency, date, and next action within approximately five seconds.

## CURRENT BEHAVIOR
The committed baseline has seven renderer methods in `notifications/email.service.ts` plus inline HTML in Fitout, Proposals, Tenants, and Email Settings. Each renderer owns its own CSS, colors, typography, and structure. Several templates use `display:flex`, have no CTA, have no preheader, and interpolate business-controlled values directly into HTML. Proposal and invoice templates fall back to VND when currency context is absent. Subject prefixes are manually embedded. Some sends use the persisted `EmailDelivery` ledger while others call SMTP synchronously.

The worktree already contained overlapping, uncommitted remediation when this CR was created, including an untracked `email-design-system.ts` and edits across Notifications, Billing, Fitout, Proposals, Tenants, Tickets, and Email Settings. Those edits are treated as an implementation proposal, not as approved platform behavior.

## EXPECTED BEHAVIOR
All reachable production email events use one documented, table-based, inline-style email design system with an approved repository logo, semantic severity tokens, safe interpolation, optional-row omission, centralized subject/environment handling, explicit currency rendering, human-readable dates, preheaders, accessible CTAs, and readable desktop/mobile output. Delivery schedules, recipients, approval rules, expiry thresholds, financial calculations, permissions, and lifecycle transitions remain unchanged.

## PRIMARY DOMAIN
Notifications / Reliability (cross-cutting email capability), with functional review from Leasing, Finance, Fitout, Tenant Experience, Mall Operations, Security, Multi-Currency, and ERP UX owners.

## AFFECTED JOURNEYS
- BP-001 Lead-to-Lease / GS-01: proposal approval and tenant portal activation.
- BP-002 Contract-to-Cash / GS-04 and GS-06: invoice issuance and overdue notices.
- BP-003 Contract-to-Fitout-to-Handover / GS-05: Fitout SLA and submittal approval.
- BP-004 Tenant-to-Ticket-to-Resolution / GS-10: ticket escalation and inspection notice.
- BP-012 Tenant Self-Service / GS-10: account activation/reset and tenant-facing links.
- GS-09: authenticated deep-link destination remains Mall-scoped.
- GS-11, GS-12, GS-13: VND/USD/MMK notification rendering.
- GS-15: persisted email delivery retry behavior remains intact.
- Proposed GS-19: representative transactional email render, escape, route, responsive, and plaintext verification without SMTP delivery.

## UPSTREAM IMPACT
Templates consume Contract, Proposal, Approval, Invoice/BillingParty, FitoutProject/Submittal, Ticket, Tenant/User, BillingConfig, ArDunningPolicy, environment configuration, branding assets, and the existing email-delivery ledger. No upstream record or business-state mutation is required by the visual remediation.

## DOWNSTREAM IMPACT
- SMTP/Nodemailer receives the rendered HTML and, if approved, a plaintext companion.
- `EmailDelivery.payload` persists subject and markup for queued events.
- Gmail, Outlook, Apple Mail, mobile clients, and authenticated frontend routes consume the output.
- Operations job ledger/retry monitoring continues to observe queued deliveries.
- No Dashboard, Reports, Analytics, SAP, export, or PDF values are changed.

## DATA OWNERSHIP IMPACT
No business entity writes. Existing `EmailDelivery` rows remain owned by Notifications. No schema change is planned unless plaintext is persisted in the delivery payload; the preferred implementation keeps the JSON shape backward-compatible by making `text` optional.

## STATE MACHINE IMPACT
N/A — no status, transition, schedule, approval step, expiry threshold, or escalation level changes.

## FINANCIAL IMPACT
Presentation only. Invoice/proposal amounts must remain the authoritative upstream values. No formula, total, rounding rule, payment state, or invoice state changes. Outstanding amount used by dunning remains computed by Billing.

## CURRENCY IMPACT
Notification display is one of the nine mandatory currency surfaces. Every monetary template must receive the record's explicit `CurrencyCode`. Missing currency must be observable and must never silently render as VND. No mixed-currency aggregation or FX behavior is introduced. Verification covers VND, USD, and MMK.

## MALL/COMPANY IMPACT
No new cross-Mall query or recipient selection. Existing producer queries and Mall-scoped recipient resolution remain unchanged. CTA destinations require authentication and must continue to enforce Mall access in the destination API.

## TENANT IMPACT
Tenant recipients receive clearer contract, invoice, inspection, and portal account emails. No new tenant-visible data is added except existing context already selected by the producer. Optional Mall/owner rows are rendered only when actually available.

## AUTHORIZATION IMPACT
No endpoint is added for email actions or unauthenticated entity access. CTAs navigate to existing authenticated application pages. Destructive actions are not embedded. `/activate?token=...` remains the existing, purpose-built activation flow. Deep-link route/parameter pairs are verified against frontend consumers; unsupported record-level links stay blocked rather than fabricated.

## REPORTING IMPACT
N/A — no metric, aggregation, report, dashboard, or analytics change.

## TRANSACTION IMPACT
Template rendering remains side-effect-free. Existing transactional enqueue behavior for invoice issuance must remain inside its current Serializable transaction. No synchronous producer is converted to queued delivery, or vice versa, without a separate reliability decision.

## EVENT/JOB IMPACT
Existing event keys, cron schedules, retry/backoff rules, recipients, and at-least-once/idempotent behavior are preserved. `EmailDeliveryService` continues to upsert by deterministic `eventKey`. The remediation must not register the dead duplicate analytics contract-expiry scheduler.

## DOCUMENT IMPACT
Adds `docs/EMAIL_DESIGN_SYSTEM.md` and `docs/EMAIL_TEMPLATE_INVENTORY.md`. No contract PDF, invoice PDF, CSV, or Excel output changes.

## API IMPACT
No request/response contract change is required. If plaintext is added to `sendMail`, it is optional and internal. Existing frontend routes remain unchanged.

## MIGRATION
No database migration planned. Stored pending email payloads created before deployment remain deliverable by the existing payload reader.

## BACKWARD COMPATIBILITY
Old queued HTML remains valid. Producer schedules and eligibility rules remain unchanged. Environment subject prefixing must preserve no prefix for production and derive non-production labels from configuration.

## GOLDEN E2E SCENARIOS
- GS-01, GS-04, GS-05, GS-06, GS-09, GS-10, GS-11, GS-12, GS-13, GS-15.
- Proposed GS-19: render seven representative events using non-sensitive fixtures; assert content, escaping, route, semantic severity, currency, dates, optional omission, Outlook-safe table structure, mobile render, and plaintext; do not send SMTP email.

## RECONCILIATION
- Proposal and invoice monetary values/currency in email match their source records.
- Contract number, tenant, unit, expiry date, and days-left match the scheduler inputs.
- Notification-center entity links and email CTA destinations resolve to the same entity where record-level routes exist.
- Direct and queued delivery paths use the same subject/environment and template system without altering recipient selection.

## ROLLBACK
Revert renderer/helper and producer wiring while retaining existing queued payload compatibility. No data rollback or schema rollback is required. Already-rendered queued HTML can still be delivered by the unchanged delivery worker.

## OPEN BUSINESS QUESTIONS
- None. BC-025 was answered on 2026-09-07: always use `apps/frontend/public/logo.png` and never runtime `BrandingSettings.logoUrl`.
- BC-026 was answered on 2026-09-07: omit the Finance contact and never use `SMTP_USER` or a guessed address.

---

## Severity classification
Priority: P1 — Tier: 0. Email is a platform cross-cutting capability; incorrect currency, recipient context, activation links, or deep links can break Tier 1/2 journeys even though the intended change is presentation-focused.

## Gate results
- Shared renderer, safe interpolation, subjects, preheaders, explicit currency, dates, plaintext, template migrations, and preview harness: **PASS**.
- Targeted backend regression: **PASS — 10 suites, 90 tests**.
- Backend full regression: **PASS — 140 suites, 1,303 tests**.
- Backend and frontend TypeScript: **PASS**.
- Frontend full regression: **PRE-EXISTING FAILURE — 9 tests** in Service Contracts and Work Orders render fixtures that omit a Router after those pages adopted `useSearchParams`; CR-119 changes no frontend source.
- Preview generation: **PASS — 7 HTML, 7 plaintext, index, and manifest**; no SMTP call.
- Final release-acceptance rerun (2026-09-08): **PASS — 3 focused suites, 28 tests; backend TypeScript PASS; previews regenerated with `smtpSent: false`**.
- Desktop/mobile browser screenshots: **BLOCKED — rechecked 2026-09-08; no in-app browser instance was available in the execution session**. No alternate browser driver was substituted, so no visual PASS is claimed.
- Production asset delivery: **PUBLIC ASSET PASS / DEPLOYMENT CONFIG OPEN**. The authoritative checked UAT proxy is `https://uatls.thisoretail.store`; unauthenticated `GET https://uatls.thisoretail.store/logo.png` returned HTTP 200, `image/png`, 45,070 bytes, a valid PNG signature, and the exact SHA-256 of `apps/frontend/public/logo.png`. The stale `https://leasing.thiso.com.vn` example in `docs/OPERATIONS_RUNBOOK.md` is not the current UAT host. The server-owned `.env` is outside the repository; checked local/example backend environments do not establish its `FRONTEND_URL` value.

## EMAIL-ASSET-01 — deployment acceptance
- Before deploying CR-119, set the backend `FRONTEND_URL` to the authoritative HTTPS frontend origin (`https://uatls.thisoretail.store` for the checked UAT deployment).
- After deployment, render one notification and confirm its HTML contains `https://uatls.thisoretail.store/logo.png`.
- Recheck unauthenticated HTTP 200, `image/png`, and valid image bytes. The public endpoint portion passed on 2026-09-08; confirmation of the actual server-side environment value remains a deployment responsibility.
- Classification: deployment acceptance item, not a CR-119 code defect.

## Implementation result
CR-119 implementation is complete and regression-safe at code/test level. Release remains conditional until desktop/mobile browser screenshots are reviewed and EMAIL-ASSET-01 confirms the deployed backend environment value.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Chief ERP Architect |  |  | PENDING |
| Reliability Architect |  |  | PENDING |
| ERP UX Architect |  |  | PENDING |
| Leasing Functional Consultant |  |  | PENDING |
| Finance Functional Consultant |  |  | PENDING |
| Fitout Functional Consultant |  |  | PENDING |
| Tenant Experience Consultant |  |  | PENDING |
| Multi-Currency Architect |  |  | PENDING |
| Security Architect |  |  | PENDING |
