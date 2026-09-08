# BC-025 — Authoritative Logo for Transactional Email

## TITLE
Which logo source is authoritative for transactional email?

## CONTEXT
Raised during CR-119. The repository contains `apps/frontend/public/logo.png`, used by the application shell, while the Branding module allows an administrator to configure `BrandingSettings.logoUrl` for login/admin surfaces.

## QUESTION
When a runtime branding logo is configured, should transactional email use that runtime logo or always use the repository's THISO shell logo?

## OPTIONS CONSIDERED
A) Always use `apps/frontend/public/logo.png`, providing a stable, email-safe THISO identity.

B) Use `BrandingSettings.logoUrl` when configured, falling back to the repository logo; this permits runtime customization but makes rendering depend on database state and the uploaded asset's public reachability.

## IMPACT IF UNANSWERED
CR-119 may use the repository asset as the prompt explicitly requests, but the long-term authority and behavior after an administrator uploads branding remains unresolved. The CR cannot be marked fully released while this authority is undocumented.

## ANSWER
Always use `apps/frontend/public/logo.png` for transactional email. Runtime
`BrandingSettings.logoUrl` must not override this asset.

Confirmed by the requester for CR-119 on 2026-09-07.

## STATUS
ANSWERED — 2026-09-07
