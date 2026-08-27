# Security Readiness

Review date: 2026-08-18  
Method: static code/configuration review plus live public health checks. This is not a penetration test.

## Decision

**P0 SECURITY found. Production is NO-GO until containment is complete.**

Tracked deployment files contain non-placeholder credentials, including an external AI API key. Values are intentionally not reproduced here. Treat them as compromised because Git history and any clone/artifact may retain them.

## Findings

| Priority | Finding | Evidence and exposure | Required action |
| --- | --- | --- | --- |
| **P0 SECURITY** | Real secrets are committed | `.env.uat-server` contains non-placeholder database/JWT/API credentials; `artifacts/uat-preflight.env` contains non-placeholder credentials. Both are returned by `git ls-files`. | Immediately revoke/rotate every affected credential; invalidate JWTs as appropriate; remove files from tracking and repository history using an approved history-rewrite process; move secrets to the deployment secret store; add secret scanning/pre-receive protection. Do not merely delete the latest copy. |
| **P1 SECURITY** | Sensitive uploaded files are publicly served | Express mounts the upload root at `/uploads` before Nest guards. Contract scans, billing documents, service/parking contracts, ticket/work-order evidence, Fitout files and floor-plan analyses are stored beneath that root. Possession/guessing of a URL bypasses JWT, RBAC, tenant and Mall checks. | Stop public static serving for protected classes. Serve through authorized download endpoints with resource ownership checks, safe `Content-Disposition`, and short-lived signed links if needed. Separate genuinely public branding/unit media from protected documents. |
| **P1 SECURITY** | Upload validation is inconsistent | AI floor-plan upload has MIME allow-list and size limit, but several contract/billing/operational upload interceptors only set a size limit or use Multer defaults. File extension comes from the original name; public serving amplifies content-sniff/XSS and malware risk. | Centralize upload policy: allow-list MIME and extension, magic-byte inspection, maximum size, randomized extension-safe names, malware scan/quarantine, download headers, and audit result. |
| **P1 SECURITY** | Access-token theft impact is high | Frontend stores a seven-day bearer JWT in `localStorage`; there is no refresh-token rotation. Any XSS can exfiltrate it. Logout revocation depends on Redis availability and is best-effort in the client. | Prefer short-lived access tokens plus rotating HttpOnly/Secure/SameSite refresh cookie, or materially shorten JWT TTL. Add CSP verification/reporting, revoke sessions centrally, and alert on Redis degradation. |
| **P1 SECURITY** | Resource authorization is partly heuristic | Global Mall guard infers resource type from path fragments and selected params. Many controllers add explicit checks, but coverage is not mechanically guaranteed for every nested ID and `any` body. | Introduce explicit resource-policy decorators/services and negative IDOR tests per tenant/Mall resource. Default-deny nested resource access. |
| **P2 HARDENING** | Authentication events lack a dedicated security trail | Request logs show status and request ID; the audit interceptor intentionally skips `/api/auth/`. There is no durable login failure/success/lockout event model. | Record redacted auth events (user/email hash, IP, result, reason, request ID), alert on abuse, and define retention. |
| **P2 HARDENING** | Login/invitation throttling is only global | Global 100 requests/60s applies; expensive AI endpoints have tighter limits. Login and activation lack account/IP-specific policy, backoff or lockout. | Add lower per-IP and per-account limits, progressive delay, and monitoring without enabling user enumeration. |
| **P2 HARDENING** | Validation posture is mixed | Global `ValidationPipe` whitelists input, but `forbidNonWhitelisted` is false and many controllers accept `any`/inline bodies, so validation depth varies. Prisma tagged queries are safe where observed; no unsafe raw query was found. | Replace `any` on security/data mutations with DTOs, enable strict validation incrementally, and fuzz filters/pagination/enum inputs. |
| **P2 HARDENING** | No current automated dependency/DAST evidence | No suitable pentest/DAST evidence was found for this gate. | Run approved SCA, container/image scan and authenticated DAST in UAT after P0 containment. Track exceptions. |

## Control review

### Authentication

- Passwords use bcrypt (cost 10); login uses a generic invalid-credential response.
- JWT expiration is enforced by Passport. Production bootstrap rejects missing/short/placeholder JWT secrets.
- Logout blacklists a token in Redis until expiry; no refresh workflow exists.
- Public registration is disabled in production and cannot self-assign a privileged role.
- Invitation tokens are random, stored as SHA-256 hashes, expire, and are cleared after activation.

Result: **AMBER**, overridden by the committed-secret P0.

### Authorization and tenant isolation

- JWT, role and Mall-access guards are global; Admin bypass is explicit.
- Controllers frequently resolve Contract, Invoice, Fitout and other resource IDs to a Mall before access.
- Option B fixed frontend Tenant access drift; server-side roles remain the authority.
- Protected documents bypass these controls through public `/uploads`.

Result: **RED** until protected-file authorization and negative IDOR coverage are complete.

### Input, query and XSS

- Global body limit is 20 MB; the AI route explicitly allows up to 50 MB.
- Prisma raw SQL uses tagged templates; no `Unsafe` raw query call was found.
- React source search found no `dangerouslySetInnerHTML` application use.
- Upload checks are inconsistent and uploaded content is served from the application origin.

Result: **RED** for protected uploads; otherwise **AMBER**.

### Web security

- Helmet is enabled (including default CSP unless deployment overrides it).
- Production requires explicit CORS origins; bearer tokens are used and no auth cookie is currently issued, so conventional cookie-CSRF is not the primary risk.
- Global throttling is 100 requests per 60 seconds; AI routes are tighter.
- Swagger is disabled in production unless explicitly enabled.

Result: **AMBER**; verify actual response headers at the production edge and add CSP reporting.

## P0 containment exit criteria

1. Credential owners confirm revocation/rotation, with timestamps and affected systems.
2. Git history and build/deployment artifacts are scrubbed; all collaborators are instructed to reclone or clean old refs.
3. Deployment reads secrets only from an approved secret manager/environment injection.
4. Secret scanning passes on the entire reachable history and CI blocks recurrence.
5. UAT authentication, integrations and rollback are retested with rotated credentials.
