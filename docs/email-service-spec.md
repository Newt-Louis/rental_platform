# Standalone Email Service — Spec

Separate service (own repo/deploy or own Nest app), API-driven, config from DB not env. Callers (leasing backend, other apps) send a `profileCode` + payload, service resolves SMTP profile from DB and sends.

## Goals

- Multiple SMTP profiles (e.g. `LEASING_NOREPLY`, `LEASING_BILLING`, `MARKETING`), each own host/port/auth/from-address.
- Config editable at runtime (admin UI/API), no redeploy to rotate creds or add sender.
- Callers stay dumb: pass `profileCode` + `to`/`subject`/`html`, get back delivery id.
- Keep what already works in leasing backend: retry w/ backoff, transient-error detection, DB outbox for durability, idempotent `eventKey`. Port those patterns, don't reinvent.

## Out of scope (v1)

- Template management UI (templates stay caller-side HTML, same as today).
- Multi-provider (SES/SendGrid) abstraction — SMTP only, nodemailer.
- Multi-tenant auth beyond a single shared API key/service token.

## Architecture

```
Caller (leasing backend, other services)
    │  POST /emails  { profileCode, to, subject, html, cc?, eventKey? }
    ▼
Email Service (NestJS, standalone)
    ├── EmailProfileRepository  → reads EmailProfile from Postgres (cached in-memory, TTL)
    ├── EmailDeliveryService    → outbox: writes EmailDelivery row (PENDING), returns id
    ├── Cron worker             → polls PENDING/FAILED rows, resolves profile, sends via nodemailer
    └── GET /emails/:id         → delivery status lookup
```

Same split as current leasing-backend `EmailService`/`EmailDeliveryService`, minus env-based transporter — profile lookup replaces `process.env.SMTP_*`.

## Data model (Postgres / Prisma)

```prisma
model EmailProfile {
  id                String   @id @default(cuid())
  code              String   @unique          // e.g. "LEASING_NOREPLY"
  name              String                    // display name
  host              String
  port              Int      @default(587)
  secure            Boolean  @default(false)
  authUser          String
  authPassEncrypted String                    // encrypted at rest, see Security
  fromAddress       String                    // "THISO Leasing <noreply@thiso.com.vn>"
  tlsRejectUnauthorized Boolean @default(true)
  connectionTimeoutMs  Int    @default(15000)
  maxAttempts       Int      @default(3)
  retryBaseMs       Int      @default(250)
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  deliveries EmailDelivery[]
}

model EmailDelivery {
  id                String   @id @default(cuid())
  eventKey          String?  @unique           // caller-supplied idempotency key, optional
  profileCode       String
  profile           EmailProfile @relation(fields: [profileCode], references: [code])
  recipient         Json                        // { to, cc }
  payload           Json                        // { subject, html }
  status            EmailDeliveryStatus @default(PENDING)
  attempts          Int      @default(0)
  nextAttemptAt     DateTime @default(now())
  providerMessageId String?
  lastError         String?
  deliveredAt       DateTime?
  createdAt         DateTime @default(now())
}

enum EmailDeliveryStatus {
  PENDING
  DELIVERED
  FAILED
  SKIPPED
}
```

Notes:
- `eventKey` optional unique → same idempotent-upsert behavior as current `emailDelivery.upsert`. If caller omits it, treat as always-new (no dedupe).
- `profileCode` on delivery kept denormalized (not just relation) so historic deliveries stay queryable even if a profile is later renamed/deleted (soft-delete profiles, don't hard-delete if deliveries reference them).

## Security

- `authPassEncrypted`: encrypt with app-level key (`EMAIL_SVC_ENCRYPTION_KEY` env, AES-256-GCM) before insert, decrypt only in-memory when building transporter. Never return decrypted value from any API response.
- API auth: service-to-service — require `Authorization: Bearer <SERVICE_TOKEN>` (shared secret via env, rotated manually) or mTLS if deployed internal-only. Admin endpoints (profile CRUD) require a stricter role/token than the send endpoint.
- Log payloads without full recipient PII in plaintext logs beyond what's needed for debugging (mask if compliance requires).

## API

Base path `/api/v1`.

### `POST /emails` — enqueue send
Request:
```json
{
  "profileCode": "LEASING_NOREPLY",
  "to": ["tenant@example.com"],
  "cc": ["ops@thiso.com.vn"],
  "subject": "Hợp đồng sắp hết hạn",
  "html": "<html>...</html>",
  "eventKey": "contract-expiry:CT-2026-001:30d"
}
```
Response `202 Accepted`:
```json
{ "id": "clv...", "status": "PENDING" }
```
Errors: `404` unknown/inactive `profileCode`, `409` if `eventKey` already exists with different payload (or just return existing id — match current upsert-is-noop semantics), `422` validation.

### `GET /emails/:id` — delivery status
```json
{ "id": "clv...", "status": "DELIVERED", "attempts": 1, "providerMessageId": "...", "deliveredAt": "2026-09-12T03:00:00Z" }
```

### `GET /emails?eventKey=...` — lookup by idempotency key

### Profile management (admin-only)
- `POST /email-profiles` — create profile (accepts plaintext `authPass`, encrypts server-side)
- `GET /email-profiles` — list (never returns `authPassEncrypted`/decrypted pass)
- `GET /email-profiles/:code`
- `PATCH /email-profiles/:code` — update host/port/auth/from/limits, or `isActive` toggle
- `DELETE /email-profiles/:code` — soft delete (`isActive=false`); block hard delete if deliveries reference it

### `POST /email-profiles/:code/test` — send test email through profile, returns transporter verify + optional test send result (for admin UI "test connection" button)

## Sending logic (port from leasing-backend)

1. Cron (`*/15 * * * * *`, exclusive lock — reuse `SchedulerLockService` pattern or `pg_advisory_lock`) pulls `PENDING`/`FAILED` rows where `nextAttemptAt <= now()`, batch limit 50.
2. Group by `profileCode`, resolve/build transporter per profile (cache transporters in-memory keyed by `profileCode` + config hash, invalidate cache on profile update).
3. `sendMail` retry loop: same transient-error set (`ECONNRESET, ECONNREFUSED, EAI_AGAIN, ETIMEDOUT, ESOCKET`, SMTP 4xx) with backoff `retryBaseMs * 2^(attempt-1)`, bounded by profile's `maxAttempts`.
4. On success → `DELIVERED` + `providerMessageId`. On exhausted retries → `FAILED`, `nextAttemptAt = now + min(1800, 2^attempts)s`, same as current backoff cap.
5. Inactive profile (`isActive=false`) at send time → mark delivery `FAILED` with `lastError = "profile inactive"`, don't retry until profile reactivated (check on next poll — reactivation just lets it pick up again since `nextAttemptAt` already passed).

## Caller migration (leasing backend)

Replace `EmailService`/`EmailDeliveryService` internals with an HTTP client wrapper:
- `EmailClient.send({ profileCode, to, subject, html, cc, eventKey })` → `POST {EMAIL_SERVICE_URL}/api/v1/emails`.
- Existing call sites (`contract-expiry.scheduler.ts`, `ar-dunning.service.ts`, `billing.service.ts`, `fitout-sla.service.ts`, `fitout-submittal.service.ts`, `tenants.service.ts`, `tickets.service.ts`/`ticket-sla.service.ts`) swap `emailDelivery.enqueue(...)`/`email.sendMail(...)` calls for `emailClient.send(...)`, each passing an appropriate `profileCode` (map current single `EMAIL_FROM` to e.g. `LEASING_NOREPLY`, split billing/dunning to `LEASING_BILLING` if a distinct from-address is wanted).
- Templates (`contractExpiryHtml`, `proposalApprovalHtml`, etc.) stay in leasing-backend — they're caller concerns, service just transports HTML.
- Keep `EMAIL_SERVICE_URL` + `EMAIL_SERVICE_TOKEN` as the only new env vars in leasing-backend; drop `SMTP_*`/`EMAIL_FROM`/`EMAIL_MAX_ATTEMPTS`/etc.

## Seed / bootstrap

Ship a migration that inserts one `EmailProfile` row seeded from current env vars (`SMTP_HOST` etc.) under code `LEASING_NOREPLY`, so cutover doesn't require manual profile creation before first deploy.

## Open questions (confirm before build)

- Single shared DB with leasing backend, or fully separate DB for the email service? (Affects whether it's a new Prisma schema/service or a module in an existing shared infra DB.)
- One `SERVICE_TOKEN` for all callers, or per-caller API keys with per-key profile-code allowlists?
- Does `eventKey` collision with *different* payload return `409` or silently return the original (current leasing-backend behavior is silent upsert-noop)?
