# Email Template Inventory

Audit date: 2026-09-07
Scope: committed baseline audit followed by CR-119 implementation classification.
Production count: **13 event variants across 9 renderer families**, plus **1 production-reachable administrative SMTP test** that is excluded from the transactional count.

CR-119 status: all listed reachable variants and the SMTP test now use the shared renderer. Direct-versus-queued delivery, recipient selection, event keys, retry/backoff, schedules, and state eligibility are unchanged. Every send supplies or derives plaintext; newly queued payloads store optional `text`, and historical HTML-only payloads remain supported.

## Current architecture

```text
domain event / command / cron
  -> producer selects recipient and business data
  -> either EmailDeliveryService.enqueue(eventKey, recipient, payload)
       -> EmailDelivery Prisma ledger
       -> 15-second locked worker
       -> EmailService.sendMail
     or direct EmailService.sendMail
  -> DB EmailSettings, falling back to SMTP_* environment variables
  -> Nodemailer / SMTP
  -> recipient
```

- Queued delivery retries failed rows with exponential backoff capped at 1,800 seconds and persists `FAILED`; `eventKey` upsert prevents duplicate intents.
- SMTP itself retries transient failures up to `EMAIL_MAX_ATTEMPTS` (default 3).
- If SMTP configuration is absent, direct sends return `skipped`; queued sends are marked `SKIPPED`.
- Committed templates are server-side TypeScript string renderers. There is no React/MJML/Handlebars email framework.
- The committed baseline sends HTML only; no plaintext alternative is passed to Nodemailer.
- The committed baseline has no shared visual layout. CSS, colors, headings, and footers are duplicated per method; three additional sources are inline at call sites.
- Business-controlled values are interpolated without escaping in the committed baseline.
- `FRONTEND_URL` is the established activation-link origin. The working-tree proposal extends it to entity CTAs.

## Production event inventory

| Template ID | Event | Subject (committed pattern) | Recipient | Module | Current HTML source | Variables | CTA / route evidence | Severity from current business rule | Reachable | Duplicate / inline / shared |
|---|---|---|---|---|---|---|---|---|---|---|
| EMAIL-CONTRACT-EXPIRY-MANAGER | Contract reaches 180/90/60/30-day threshold | `[THISO] Hợp đồng {number} còn {days} ngày — {tenant}` | `Contract.managedBy.email` | Contracts / Notifications | `EmailService.contractExpiryHtml` | tenant, unit, contract, end date, days, contact | Baseline none; proposed `/contracts?id={contractId}` is consumed by `ContractsPage` | INFO >60; WARNING <=60; CRITICAL <=30, matching existing blue/amber/red split | Yes, daily cron | Shares renderer with tenant event; not inline; no committed shared layout |
| EMAIL-CONTRACT-EXPIRY-TENANT | Same threshold, tenant notices only at <=60 days | `[THISO Mall] Hợp đồng thuê mặt bằng của {tenant} còn {days} ngày` | `Tenant.contactEmail` | Contracts / Notifications | `EmailService.contractExpiryHtml` | same; tenant contact | Proposed `/contracts?id=...`; route consumes `id`, but tenant role access to Contracts page requires authorization verification | WARNING/CRITICAL by existing split | Yes, daily cron | Same renderer as manager event |
| EMAIL-PROPOSAL-APPROVAL-REQUIRED | Proposal approval step becomes pending | `[THISO] Phê duyệt Proposal {number}` | Users resolved for pending approver role | Proposals / Approvals | `EmailService.proposalApprovalHtml` | approver, proposal, tenant, unit, rent/m2, monthly rent, discount, creator, currency | Baseline none; proposed `/proposals?id={proposalId}` is consumed by `ProposalsPage` | INFO / action required; no business severity escalation found | Yes | Dedicated renderer; direct SMTP; no committed shared layout |
| EMAIL-INVOICE-OVERDUE | AR dunning policy fires | `[THISO] Nhắc thanh toán hóa đơn {number} (L{level})` | Tenant or billing-party email when policy enables tenant notice | Billing | `EmailService.invoiceOverdueHtml` | party, invoice, outstanding amount, currency, due date, overdue days, contact | Baseline none; proposed `/billing?invoiceId={id}` is consumed by `BillingPage` | CRITICAL in proposed presentation; dunning level remains authoritative | Yes, scheduled dunning | Dedicated renderer; queued |
| EMAIL-INVOICE-ISSUED | Invoice transitions to ISSUED and config enables notice | `[THISO] Hóa đơn {number} đã phát hành` | Tenant or billing-party email | Billing | `EmailService.invoiceIssuedHtml` | party, invoice, total, currency, due date, period | Baseline none; proposed `/billing?invoiceId={id}` is consumed by `BillingPage` | INFO | Yes | Dedicated renderer; transactionally queued |
| EMAIL-FITOUT-SLA-BREACH | Fitout milestone exceeds SLA target | `⚠️ Fitout SLA breach — {tenant}` | Project operation manager | Fitout | `EmailService.fitoutSlaHtml` | manager, tenant, unit, stage, target date, escalation flag | Baseline none; proposed `/fitout?projectId={id}` is consumed by `FitoutPage` | WARNING | Yes, scheduled SLA check | Shares renderer with escalation; queued |
| EMAIL-FITOUT-SLA-ESCALATION | Fitout SLA escalates to configured role | `🚨 Fitout escalation — {tenant}` | Mall-scoped users resolved for escalation role | Fitout | `EmailService.fitoutSlaHtml` | same | Proposed `/fitout?projectId={id}` | CRITICAL | Yes, scheduled SLA check | Same renderer as breach; queued |
| EMAIL-FITOUT-SUBMITTAL-APPROVAL | Submittal approval step becomes pending | `[Fitout] Submittal chờ duyệt — {formType}` | Mall-scoped approvers for step role | Fitout / Approvals | Inline HTML in `fitout-submittal.service.ts` | approver, title, form type, tenant, unit | `/fitout-approvals` exists, but no supported record-level query parameter was found | INFO / action required | Yes | Inline in committed baseline; proposed shared renderer; queued |
| EMAIL-TICKET-SLA-ESCALATION | Ticket exceeds SLA escalation threshold | `[THISO] Ticket SLA L{level} — {number}` | Up to three active managers selected for the escalation roles and ticket Mall | Tickets | `EmailService.ticketSlaHtml` | manager, number, subject, tenant, level | Baseline none; proposed `/tickets?id={ticketId}` is consumed by `TicketsPage` | WARNING; level remains authoritative | Yes, scheduled SLA check | Dedicated renderer; direct SMTP |
| EMAIL-TICKET-INSPECTION-CREATED | Operations creates an inspection ticket | `[THISO] Phiếu kiểm tra mới — {number}` | Tenant contact email; in-app notice also goes to active tenant portal users | Tickets / Tenant Portal | `EmailService.ticketInspectionHtml` | tenant, number, subject, unit | `/tenant-portal` exists; no supported inspection/ticket record parameter was found there | INFO | Yes | Dedicated renderer; direct SMTP |
| EMAIL-PORTAL-ACTIVATION-TENANT-CREATE | Tenant creation or explicit portal-account creation creates an invite | `[THISO] Kích hoạt tài khoản Tenant Portal` | Tenant contact / portal user email | Tenants | Inline HTML in `tenants.service.ts` | contact name, signed random token URL, 72-hour expiry meaning | `/activate?token={token}` is consumed by `ActivateInvitationPage` | INFO / security-sensitive | Yes | Inline; duplicates proposal-conversion activation |
| EMAIL-PORTAL-ACTIVATION-PROPOSAL-CONVERT | Proposal conversion creates tenant portal identity | `[THISO] Kích hoạt tài khoản Tenant Portal` | Converted lead/tenant contact email | Proposals / Tenants | Inline HTML in `proposals.service.ts` | contact name, token URL, expiry meaning | `/activate?token={token}` verified | INFO / security-sensitive | Yes | Inline duplicate of tenant activation |
| EMAIL-PORTAL-PASSWORD-RESET | Administrator invalidates current password and creates new invite | `[THISO] Đặt lại mật khẩu Tenant Portal` | Existing portal user email | Tenants | Conditional inline HTML in `tenants.service.ts` | contact name, token URL, 72-hour expiry meaning | `/activate?token={token}` verified | INFO / security-sensitive | Yes | Shares source with portal activation |

## Administrative template

| Template ID | Event | Recipient | Source | Reachable | Classification |
|---|---|---|---|---|---|
| EMAIL-SMTP-TEST | Admin invokes `POST /email-settings/test` | Explicit DTO address or current admin email | Inline paragraph in committed `email-settings.controller.ts` | Yes, authenticated ADMIN endpoint | Operational test, not transactional production event; must carry environment labeling and never be emitted by preview tooling |

## Brand assets

| Asset | Classification | Email suitability |
|---|---|---|
| `apps/frontend/public/logo.png` | THISO symbol + wordmark; used in application shell and loading UI; transparent background | Preferred repository asset for white email card |
| `apps/frontend/public/logo2.png` | Large symbol + wordmark on near-white raster canvas | Poor email payload/spacing efficiency; not preferred |
| `apps/frontend/public/logo3.png` | Wordmark only; transparent background | Secondary compact variant; lacks symbol |
| `apps/frontend/public/favicon.png` | App favicon | Not a header logo |
| `BrandingSettings.logoUrl` | Runtime administrator-uploaded logo used by login/admin views | Authoritative email precedence is unconfirmed; tracked in CR-119 |

## Deep-link audit

| Destination | Registered | Consumes entity parameter | Result |
|---|---|---|---|
| `/contracts?id={contractId}` | Yes | `ContractsPage` reads `id` | Structurally valid; role/Mall negative test required |
| `/proposals?id={proposalId}` | Yes | `ProposalsPage` reads `id` | Structurally valid; role/Mall negative test required |
| `/billing?invoiceId={invoiceId}` | Yes | `BillingPage` reads `invoiceId` | Structurally valid; role/Mall/tenant negative test required |
| `/fitout?projectId={projectId}` | Yes | `FitoutPage` reads `projectId` | Structurally valid; role/Mall negative test required |
| `/tickets?id={ticketId}` | Yes | `TicketsPage` reads `id` | Structurally valid; role/Mall negative test required |
| `/activate?token={token}` | Yes | `ActivateInvitationPage` reads the query token | Existing intended unauthenticated activation flow |
| `/fitout-approvals` | Yes | No record-level submittal parameter found | List destination only; record deep link BLOCKED |
| `/tenant-portal` | Yes | No inspection/ticket record parameter found | Portal destination only; record deep link BLOCKED |

## Migration status at audit time

| Family | Status | Notes |
|---|---|---|
| Deadline / expiry | PROPOSED IN DIRTY WORKTREE | Contract expiry and Fitout SLA call a new untracked shared renderer; not approved or verified |
| Approval | PROPOSED IN DIRTY WORKTREE | Proposal and Fitout submittal use proposed shared templates; submittal remains list-only CTA |
| Finance | PROPOSED IN DIRTY WORKTREE | Invoice issued/overdue proposed with explicit currency and CTA |
| Operations | PROPOSED IN DIRTY WORKTREE | Ticket escalation/inspection proposed; inspection remains portal-only CTA |
| System / security | PROPOSED IN DIRTY WORKTREE | Portal activation/reset and SMTP test proposed on shared renderer |
| Payment received / failed | NOT REACHABLE | No production email producer/template found |
| Proposal approved/rejected email | NOT REACHABLE | In-app notification paths exist, but no production email template found |
| Work-order assigned email | NOT REACHABLE | In-app notifications exist; no production email producer/template found |
| Service-contract event email | NOT REACHABLE | Reminder/notification logic exists; no production email producer/template found |
| SAP issue email | NOT REACHABLE | No production email producer/template found |

## Confirmed risks and constraints

- The worktree overlaps this task and must be reviewed before further edits.
- Committed templates do not escape tenant names, unit codes, ticket subjects, proposal numbers, or contact names.
- Committed proposal/invoice renderers silently default missing currency to VND.
- Committed HTML depends on `display:flex`, CSS classes, and `<style>` blocks that are unreliable in desktop Outlook.
- The email ledger stores rendered HTML at enqueue time; branding/subject changes do not retroactively update pending rows.
- Direct SMTP paths and queued paths have different retry/observability semantics. CR-119 explicitly preserves them unless separately approved.
- No preview generator or desktop/mobile render artifacts were found.
