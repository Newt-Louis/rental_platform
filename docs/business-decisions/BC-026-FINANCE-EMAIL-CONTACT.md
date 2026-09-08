# BC-026 — Approved Finance Contact in Overdue Email

## TITLE
What approved, monitored Finance contact may appear in overdue notices?

## CONTEXT
Raised during CR-119. The current dunning producer passes `SMTP_USER ?? 'finance@thiso.com.vn'` into the template. Neither value proves that the mailbox is an approved, monitored recipient-contact address.

## QUESTION
Should overdue invoice emails show a Finance contact address, and if so, what authoritative configuration or data field supplies it?

## OPTIONS CONSIDERED
A) Omit the contact row until an approved monitored address is available.

B) Add/use an authoritative Finance support contact setting and render it only when configured.

## IMPACT IF UNANSWERED
The overdue template can be migrated safely only by omitting the contact row. A guessed address must not be shown to tenants.

## ANSWER
Omit the Finance contact from overdue email. Do not use `SMTP_USER` and do not
guess or hard-code a Finance mailbox.

Confirmed by the requester for CR-119 on 2026-09-07.

## STATUS
ANSWERED — 2026-09-07
