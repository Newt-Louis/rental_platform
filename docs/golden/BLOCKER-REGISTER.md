# Golden ERP Blocker Register

Status: ACTIVE — ENGINEERING AND PRODUCTION TRACKS SEPARATED

Assessment date: 2026-08-24

Blocking scope: **A** one feature, **B** one module, **C** one business journey,
**D** production release, **E** entire engineering program.

The register applies the Master Execution Prompt stop conditions strictly. A
production no-go is not an engineering-program blocker. Technical debt,
missing tests, reconstructable documentation, ordinary corrective engineering
and automated visual verification are tracked as work, not blockers.

## External blockers

| Blocker ID | Module | Exact decision/evidence required | Why repository/code/schema/tests cannot resolve it | Options and risk | Recommendation | Severity | Blocks |
|---|---|---|---|---|---|---|---|
| EXT-001 | Golden candidates | Named business users must sign off rendered Fitout, CRM, Spaces, Operations, Reporting and Admin workflows | Automated rendering proves layout/runtime properties, not that real operators can complete decisions efficiently | Sign off after guided review (low risk); waive review (high adoption/error risk) | Run the recorded four-viewport human review | P2 | D only |
| EXT-002 | End-to-end journeys | Live evidence for UAT-01–07 and UAT-10–12, including rejected approval and one linked Lead-to-Collection chain | Fixtures and service tests cannot prove real role sessions, human decisions or deployed-environment behavior | Execute full matrix (lowest release risk); accept partial UAT (high escaped-defect risk) | Execute the full matrix in UAT | P1 | C and D |
| EXT-003 | Cross-Mall isolation | A second Mall with scoped users and records, then negative direct-ID/list/export tests | Current local data contains one Mall; fabricating approval-grade evidence would be false | Provision representative second Mall (recommended); rely on mocks only (high leak risk) | Provision second-Mall UAT data | P0 | C and D |

## Business confirmations

| Blocker ID | Module | Exact decision/evidence required | Why repository/code/schema/tests cannot resolve it | Options and risk | Recommendation | Severity | Blocks |
|---|---|---|---|---|---|---|---|
| BC-001 | CRM / Lead | Whether Lead estimated value is VND-only or requires persisted ISO currency | The model has no currency field and both interpretations are commercially plausible | Keep documented VND-only (limits multi-currency); add persisted currency (migration/consumer impact) | Confirm provenance before schema/API change | P1 | A |
| BC-004 | Revenue share / Sales | Authoritative currency and aggregation semantics for VND/USD/MMK revenue share | Existing paths lack enough provenance for safe FX or same-currency assumptions | Separate by persisted currency (safe but may need schema); define FX (major finance design); restrict to VND (functional limitation) | Persist/source currency and keep per-currency totals | P0 | C and D |
| BC-010 | Spaces | Whether `MERGED` is a formal Unit transition and its reversal/audit semantics | Current code writes `MERGED` outside the shared matrix; both terminal and reversible models are plausible | Formal terminal transition; reversible merge; retain exception (drift risk) | Approve a formal audited transition | P1 | A |
| BC-016 | CRM / Customer | Whether Customer is global master data or Mall-owned | `Customer` has no `mallId`; adding ownership requires product policy and likely migration | Global master (cross-Mall visibility); direct Mall owner (migration); relationship-derived access (complex) | Relationship-derived or explicit ownership design before enforcement | P0 | B |
| BC-020-R | Ticket SLA | Whether configured escalation recipients are global-role recipients or Mall-specific assignees | Scheduler currently selects users by role without Mall context; schema has no policy Mall owner | Global escalation (cross-Mall disclosure risk); Mall-scoped recipients (recommended); assigned-chain only (coverage risk) | Resolve Mall-scoped recipient semantics | P1 | A |
| BC-FIT-001 | Fitout | Currency source for newly created change orders | Contract currency exists, but creation currently defaults VND and no approved inheritance rule is recorded | Inherit Contract currency (recommended); explicit per-order currency; remain VND-only (misstatement risk) | Inherit authoritative Contract currency after confirmation | P1 | A |
| BC-SLOT-001 | Slots / Spaces | Currency provenance for slot price and booking amounts | Slot models contain money without currency; UI cannot infer safely | Add persisted currency (migration); inherit owning Mall/Unit currency (historical drift); VND-only policy | Approve persisted currency source | P1 | B |
| BC-CEO-001 | Authorization | Authoritative CEO operational write capabilities | Current decorators permit writes that conflict with the documented executive/read persona | Preserve current writes (least restriction); narrow to oversight reads (recommended); per-module grants (complex) | Approve a capability matrix, then align backend and UI | P0 | D |
| BC-FIN-001 | Penalty / Dunning | Authoritative invoice/contract currency source for penalties and dunning amounts | Existing Golden Billing decision explicitly separated this correctness CR; silent inference may misstate liabilities | Inherit invoice currency; inherit contract currency; explicit persisted currency | Use invoice/receivable currency where provenance is approved | P0 | C and D |

## Infrastructure / credential blockers

| Blocker ID | Module | Exact decision/evidence required | Why repository/code/schema/tests cannot resolve it | Options and risk | Recommendation | Severity | Blocks |
|---|---|---|---|---|---|---|---|
| INF-001 | Secrets | Rotate and revoke PostgreSQL, JWT, Anthropic, SSH and applicable SMTP/Redis credentials | Requires control of external secret stores/services and knowledge of deployed consumers | Coordinated rotation (temporary rollout risk); leave exposed (critical compromise risk) | Rotate, verify revocation, record evidence | P0 | D |
| INF-002 | Git/security | Approval and coordination for reachable-history remediation after rotation | History rewrite is destructive/irreversible for collaborators and cannot precede credential rotation | Coordinated rewrite (clone/rebase disruption); no rewrite (secret remains recoverable) | Rotate first, then approved history rewrite | P0 | D |
| INF-003 | Backup | Approved off-site storage destination and credentials, plus restore evidence | Repository can provide safe scripts but cannot provision or authorize external storage | Managed immutable storage (recommended); second local disk (same-site risk); no off-site copy (no-go) | Provision encrypted immutable off-site storage | P0 | D |
| INF-004 | Observability | Production logging, alert delivery, error tracking provider and named on-call owners | Code exposes health/metrics, but destinations, retention and responders are organizational/external | Managed platform (cost/vendor); self-hosted stack (operations burden); none (blind failure risk) | Select managed platform and owners | P1 | D |
| INF-005 | UAT access | UAT endpoints, role credentials and approved performance window | Local Docker cannot prove target environment, identity provider or capacity | Provide isolated UAT access (recommended); test production directly (unacceptable risk) | Use isolated production-like UAT | P1 | D |

## Production-only blockers

| Blocker ID | Module | Exact decision/evidence required | Why repository/code/schema/tests cannot resolve it | Options and risk | Recommendation | Severity | Blocks |
|---|---|---|---|---|---|---|---|
| PROD-001 | Deployment | Target environment preflight, production configuration and applied migration evidence | Local Compose is not the deployment target | Controlled UAT/production preflight (recommended); infer from local (configuration-drift risk) | Run `RELEASE_MODE=uat` with approved evidence | P1 | D only |
| PROD-002 | Recovery | Production-scale RTO/RPO acceptance and release rollback rehearsal | Local isolated drills cannot establish organizational recovery targets or production duration | Rehearse rollback/restore (recommended); paper acceptance only (execution risk) | Perform timed representative rehearsal | P1 | D only |
| PROD-003 | Rate limiting/capacity | Approved load window and production-representative throttle evidence | Safe automation rejects non-local targets without explicit approval | UAT performance run (recommended); production-hours test (outage risk); skip (capacity unknown) | Execute in isolated UAT | P2 | D only |
| PROD-004 | Release governance | Named release approver, image/version cut and go/no-go record | Repository cannot appoint owners or authorize deployment | Controlled RC sign-off (recommended); informal rollout (traceability risk) | Use the documented release/rollback procedure | P1 | D only |

## Engineering blockers

No valid blocker currently stops the entire engineering program.

The protected Dashboard and Proposal/Approval working-tree changes are a
scope/ownership constraint, not a global blocker. Any future task that must edit
those exact paths is blocked only at scope **A** until the owner reconciles the
overlap; independent modules must continue.

## Challenged findings — not blockers

| Finding | Classification after challenge | Autonomous action |
|---|---|---|
| CRM unified-deals Mall scope | Proven security defect; Lead already has authoritative `mallId` and controller already has the scope helper | RESOLVED in Wave 16 with pre-pagination scope tests |
| Ticket escalation/rate/rating ownership | Proven defect; reuse the same authoritative Ticket validation used by core CRUD | RESOLVED in Wave 15 with ownership tests |
| Ticket SLA policy access | Proven exploitable role defect; source comment and global policy model establish ADMIN-only intent | RESOLVED in Wave 15 with role/scope tests |
| Analytics Compliance export Mall scope | Proven security defect; export records persist `mallId`, business entities have authoritative Mall relations and Analytics already has a scope helper | RESOLVED in Wave 17 with ownership checks, payload predicates and negative tests |
| Payment remaining mismatch | Not a blocker; backend `balance` is already the approved authority | Keep UI on backend value; isolate any formula divergence test |
| Contract/Work Order/Patrol atomicity | Proven all-or-nothing invariants, not business blockers | RESOLVED in Waves 18, 20–22 with transaction boundaries and focused tests |
| Slot allocation concurrency | Proven engineering correctness work | RESOLVED in Wave 19 with Serializable conflict checks and bounded retry |
| Financial export caps and disclosure | Proven engineering quality work | RESOLVED for Golden Billing and Reports; remaining generic worklist scaling is P3 and not a blocker |
| Protected concurrent Billing Add-in Prisma-client mismatch | Scope/ownership constraint, not a program blocker; the owning change has schema and generated-client responsibility | Exclude it from Golden commits and retain the last clean owned backend baseline until reconciled |
| Human visual verification | Automated verification exists; human review blocks approval/release only | Continue engineering independently |

## Program impact

- **Engineering Golden Completion** continues independently of every scope-D
  production blocker.
- **Production Readiness** remains NOT READY until P0 security, isolation,
  credential and backup evidence is closed.
- No current item validly blocks scope **E**.
