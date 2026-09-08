# Email Delivery Coverage Matrix

Scope: the 13 production-reachable transactional email variants established by CR-119. The administrative SMTP test is intentionally excluded because it is an operator diagnostic, not a production transactional event.

This matrix distinguishes an SMTP attempt from an auditable delivery. `EmailService.sendMail()` has bounded transport retries, but a direct producer is not operationally retryable or manually resendable unless it creates an `EmailDelivery` row. A queued producer is ledger-backed by construction.

## Coverage summary

| Measure | Count | Variants |
|---|---:|---|
| Production variants | 13 | All rows below |
| Queued | 7 | Contract manager, contract tenant, invoice issued, invoice overdue, Fitout breach, Fitout escalation, Fitout submittal approval |
| Direct | 6 | Proposal approval, ticket SLA escalation, ticket inspection, tenant-service activation, proposal-conversion activation, password reset |
| Token-bearing | 3 | Both activation variants and password reset |
| Non-token | 10 | All other variants |

The final CR-120 invariant is that every row creates exactly one auditable `EmailDelivery` for one intentional delivery request while retaining its existing `DIRECT` or `QUEUED` timing. Token-bearing messages must never use stored-payload replay.

## Production producer inventory

Legend:

- **Ledger**: whether the producer's delivery is represented by `EmailDelivery`.
- **Retryable**: `QUEUE/AUTO + OPERATOR` means the worker can retry transport failure and an operator may retry a failed ledger row; `SMTP ONLY` means only the bounded retry inside the synchronous SMTP call exists.
- **Manual resend**: `PAYLOAD_REPLAY` is allowed only for ordinary messages; `REGENERATE_DOMAIN_TOKEN` must call the authoritative tenant domain flow; `NOT_ALLOWED` is the password-reset policy unless an existing secure domain capability is explicitly approved.
- **Mall ownership source** names the authoritative entity path, not the recipient's active Mall and not the operator's current Mall.

| # | Event | Producer | Mode | Ledger | Event key | Retryable | Manual resend | Token based | Mall ownership source |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | `CONTRACT_EXPIRY_MANAGER` | `ContractExpiryScheduler.checkContractExpiryUnlocked()` | QUEUED | Yes | `contract-expiry:{contractId}:{daysLeft}:manager` | QUEUE/AUTO + OPERATOR | `PAYLOAD_REPLAY` | No | `Contract.unit.mallId` |
| 2 | `CONTRACT_EXPIRY_TENANT` | `ContractExpiryScheduler.checkContractExpiryUnlocked()` | QUEUED | Yes | `contract-expiry:{contractId}:{daysLeft}:tenant` | QUEUE/AUTO + OPERATOR | `PAYLOAD_REPLAY` | No | `Contract.unit.mallId` |
| 3 | `PROPOSAL_APPROVAL_REQUIRED` | `ProposalsService.notifyPendingApprovers()` | DIRECT | Yes | `proposal-approval:{proposalId}:{stepId}:{approverId}` | SMTP transport retry + OPERATOR | `PAYLOAD_REPLAY` | No | `Proposal.unit.mallId` |
| 4 | `INVOICE_ISSUED` | `BillingService.enqueueInvoiceIssuedNotification()` | QUEUED | Yes | `invoice-issued:{invoiceId}` | QUEUE/AUTO + OPERATOR | `PAYLOAD_REPLAY` | No | Existing invoice resolver: `Invoice.mallId ?? Invoice.contract.unit.mallId ?? Invoice.contract.unit.floor.mallId ?? Invoice.billingParty.mallId` |
| 5 | `INVOICE_OVERDUE` | `ArDunningService.runDunningUnlocked()` | QUEUED | Yes | `ar-dunning:{invoiceId}:policy:{policyId}:tenant` | QUEUE/AUTO + OPERATOR | `PAYLOAD_REPLAY` | No | Same existing invoice resolver as invoice issued |
| 6 | `FITOUT_SLA_BREACH` | `FitoutSlaService.checkSlaBreachesUnlocked()` | QUEUED | Yes | `fitout-sla:{milestoneId}:manager:{operationManagerId}` | QUEUE/AUTO + OPERATOR | `PAYLOAD_REPLAY` | No | `FitoutProject.unit.mallId` |
| 7 | `FITOUT_SLA_ESCALATION` | `FitoutSlaService.checkSlaBreachesUnlocked()` | QUEUED | Yes | `fitout-sla:{milestoneId}:escalation:{recipientId}` | QUEUE/AUTO + OPERATOR | `PAYLOAD_REPLAY` | No | `FitoutProject.unit.mallId` |
| 8 | `FITOUT_SUBMITTAL_APPROVAL` | `FitoutSubmittalService.notifyPendingApprovers()` | QUEUED | Yes | `fitout-submittal:{submittalId}:step:{stepOrder}:approver:{approverId}` | QUEUE/AUTO + OPERATOR | `PAYLOAD_REPLAY` | No | `FitoutSubmittal.project.unit.mallId` |
| 9 | `TICKET_SLA_ESCALATION` | `TicketSlaService.checkSlaBreachesUnlocked()` | DIRECT | Yes | `ticket-sla:{ticketId}:level:{level}:manager:{userId}` | SMTP transport retry + OPERATOR | `PAYLOAD_REPLAY` | No | `Ticket.unit.mallId` |
| 10 | `TICKET_INSPECTION_CREATED` | `TicketsService.notifyTenantOfInspection()` | DIRECT | Yes | `ticket-inspection:{ticketId}:tenant` | SMTP transport retry + OPERATOR | `PAYLOAD_REPLAY` | No | `Ticket.unit.mallId` |
| 11 | `PORTAL_ACTIVATION_TENANT_CREATE` | `TenantsService.create()` / `createPortalAccount()` via `sendPortalInvitation()` | DIRECT | Yes | `portal-activation:{tenantId}:{issuanceTime}`; raw token excluded | SMTP transport retry + OPERATOR while token remains valid | `REGENERATE_DOMAIN_TOKEN`; not yet exposed through Email Operations | Yes | Fail-closed unowned record: generic Tenant has no canonical single Mall |
| 12 | `PORTAL_ACTIVATION_PROPOSAL_CONVERT` | `ProposalsService.convertToContract()` | DIRECT | Yes | `portal-activation:tenant:{tenantId}:{issuanceTime}`; raw token excluded | SMTP transport retry + OPERATOR while token remains valid | `REGENERATE_DOMAIN_TOKEN`; not yet exposed through Email Operations | Yes | `Proposal.unit.mallId` |
| 13 | `PORTAL_PASSWORD_RESET` | `TenantsService.resetPortalPassword()` via `sendPortalInvitation()` | DIRECT | Yes | `portal-reset:{tenantId}:{issuanceTime}`; raw token excluded | SMTP transport retry; stored-token replay prohibited | `NOT_ALLOWED` | Yes | Fail-closed unowned record: Tenant has no canonical single Mall |

## Metadata normalization

All seven queued variants now supply `eventType`, `entityType`, `entityId`, and authoritative `mallId` without changing queue timing. All six direct variants use the synchronous ledger wrapper and preserve their existing exception behavior.

The direct variants must pass the same metadata into the direct-send ledger wrapper. Direct business semantics remain unchanged: create the ledger row, attempt SMTP synchronously, persist `SENT` plus provider message ID or `FAILED` plus a sanitized error, and propagate or swallow the exception exactly as the producer did before tracking.

## Token ownership and lifecycle

All three token-bearing variants use the Tenant Portal invitation credential model:

1. The domain generates 32 random bytes and exposes only the raw value in the activation URL.
2. SHA-256 of the token is stored in `User.inviteTokenHash`; the raw token must not appear in delivery metadata, audit payloads, event keys, or logs.
3. `User.inviteExpiresAt` is 72 hours after issuance and `mustChangePassword` is set.
4. A later issuance overwrites `inviteTokenHash`, invalidating the prior link.
5. Successful `AuthService.activateInvitation()` clears both token fields and `mustChangePassword`, making the link one-time.

Consequences for Email Operations:

- A failed SMTP attempt for a newly generated activation may be retried only while the authoritative token is still valid; this is a retry of the same delivery, not a later resend.
- A later activation resend is a **reissue**. It must call the authoritative Tenant/Proposal domain flow to generate and persist a new token, render a new payload, and link a new delivery to the original. `EmailDeliveryService` must not duplicate token generation.
- Administrative password-reset resend is not a separate business capability in the current domain. Email Operations must expose `NOT_ALLOWED`, not replay stored HTML and not silently invoke another password invalidation.

## Mall ownership rules

The owning Mall is resolved from the business entity before any Email Operations row is listed, previewed, retried, or resent:

- Contract, Proposal, Fitout, and Ticket events inherit Mall ownership from their Unit.
- Invoice events use the existing invoice resolver order documented in `MallAccessService`; CR-120 must not invent a different precedence.
- Recipient Mall grants are authorization evidence, not ownership data.
- `User.activeMallId` and the requesting operator's Mall are context, not an acceptable fallback for missing entity ownership.
- A generic Tenant is not single-Mall-owned in the schema. If the initiating domain command cannot establish exactly one Mall, persist no fabricated `mallId` and fail closed for Mall-scoped Email Operations users. Platform-wide roles may handle explicitly global/unowned records only if the endpoint policy says so.

## Delivery action policy

| Delivery state/type | Retry | Resend |
|---|---|---|
| Failed ordinary delivery | Allowed as an auditable retry, with original immutable | Not the primary action |
| Sent ordinary delivery | Not applicable | Allowed as a new linked delivery using `PAYLOAD_REPLAY` |
| Failed activation whose token is still valid | Allowed as a retry of that delivery | Not applicable |
| Activation reissue after the original delivery | Not payload replay | Only through `REGENERATE_DOMAIN_TOKEN` |
| Password reset, any state requiring a new token | Do not replay stale payload | `NOT_ALLOWED` in Email Operations |

The backend must return these capabilities (`canRetry`, `canResend`, and `resendMode`) so the frontend never derives token security rules from event-name strings.

## Completion gate

CR-120 production email coverage is complete only when all 13 rows:

- create an `EmailDelivery` record;
- carry stable event identity, event/entity metadata, and authoritative Mall ownership (or an explicitly fail-closed unowned classification);
- preserve their original direct-versus-queued behavior and exception semantics;
- persist provider acceptance as `SENT`, without claiming recipient delivery or read status;
- expose only backend-authorized retry/resend capabilities; and
- never replay a stored activation or password-reset token as a new intentional delivery.
