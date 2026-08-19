# 08 — Global Search

> Phase 9. Current state: **no global/universal search exists.** There is no
> `Ctrl+K` command palette and no cross-entity search bar in `Layout.tsx`'s header
> (the header has mall selector, language, theme, AI shortcut, notifications, user
> menu — no search input). Each module has only its own local list-filter/search
> field (e.g., Tickets' search+status+priority filters, CRM's pipeline filters).

## Why this matters here specifically

Given the platform's actual shape — one lead can become a booking, a proposal, a
tenant, and a contract, each a different entity with its own ID — a user who
remembers "the Highlands Coffee deal" has no way to jump straight to it without
knowing which module currently holds the record they want. This is a direct
instance of the master brief's "recognition rather than recall" heuristic failing
platform-wide, not module-by-module.

## Recommendation

Introduce a `Ctrl+K` command palette (`cmdk`-style, consistent with the shadcn/ui
stack already in use) searching across the entities that already have clear
identity fields and cross-module significance:

```text
Search anything...  (Ctrl+K)

  Khách thuê / Tenant       — companyName, brandName, taxCode
  Đề xuất / Proposal        — id, tenant/unit
  Hợp đồng / Contract       — contract number, tenant
  Ticket                    — id, subject
  Mặt bằng / Unit           — unit code
  Khách hàng tiềm năng/Lead — brandName, contactName
```

Each result row navigates directly to the entity's detail view (reusing the
existing `entityLink()` mapping already implemented for notifications in
`NotificationCenter.tsx` — the routing logic to jump from an entity type to its
detail URL already exists in the codebase and can be reused here almost as-is).

## Scope discipline (per Phase 39 — don't over-build)

- Do **not** attempt full-text search over documents/comments/photos in phase 1 —
  start with the 6 entity types above, matched by their existing indexed
  identifier fields (name/code/number).
- Respect RBAC: search results must be filtered server-side by the same
  `MODULE_ROLES`/`MallAccessGuard` checks each entity's own list endpoint already
  applies — a search result must never reveal a record the user couldn't otherwise
  see. This is a backend requirement, not just a frontend filter.
- Do not add this as a "nice to have AI feature" — this is plain structured
  search, no AI/LLM call needed; keep AI Assistant (already in the platform)
  separate for natural-language questions ("tenants with overdue debt in Sala"),
  per the existing `/ai` module.

## Priority

P1 — not a Go-Live blocker (users can still navigate via existing lists), but high
value/low effort once the entity-link mapping is reused rather than rebuilt. See
[14-IMPROVEMENT-ROADMAP](14-IMPROVEMENT-ROADMAP.md).
