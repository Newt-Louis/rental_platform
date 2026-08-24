# Dependency Vulnerability Scan

**Status:** PARTIAL (safe fixes applied; remaining items require breaking
major-version bumps, deferred with rationale) · 2026-08-19 · Sprint:
Production Hardening A

Ran `npm audit` in both `apps/backend` and `apps/frontend` as the final
gate re-run's dependency scan.

## Applied

`npm audit fix` (non-breaking, semver-compatible only) in both apps:

- **Backend:** 38 → 37 vulnerabilities. Verified with a full rebuild:
  typecheck (0 errors), full Jest suite (319/319 passed), and a clean
  Docker image build + boot + `/api/health` smoke test.
- **Frontend:** 9 → 7 vulnerabilities (fixed `nanoid`, `postcss`).
  Verified with typecheck (0 errors), full Vitest suite (212/221 — same
  9 pre-existing `BookingsPage.test.tsx` failures as every other check
  this sprint, unrelated), and a clean **no-cache** Docker image rebuild
  + boot + smoke test.

**One attempted fix was caught and reverted, not silently applied:** an
initial `npm audit fix` in `apps/backend` updated `package-lock.json` in a
way that desynced from `package.json` for `sharp`'s platform-specific
optional dependencies (`@emnapi/*`) — the Docker build's `npm ci` failed
with `EUSAGE: lock file's @emnapi/wasi-threads@1.2.2 does not satisfy
@emnapi/wasi-threads@1.2.3`. This would have broken every future clean
build. Reverted (`git checkout -- package-lock.json`) and re-verified the
Docker build succeeds on the original lockfile before proceeding. This is
exactly the kind of thing "run the fix, don't verify the build" would have
shipped broken — flagged here so it isn't repeated casually next time
someone runs `npm audit fix` in this app.

## Deferred — remaining vulnerabilities (require `--force`, breaking version bumps)

**Backend** (37 remaining; overwhelmingly devDependency/build-tooling only):

| Package | Severity | Chain | Why deferred |
|---|---|---|---|
| `tar` | **Critical** | `sharp` → `@mapbox/node-pre-gyp` → `tar` | Used only to unpack `sharp`'s prebuilt native binary during `npm install`/build, not exercised against any attacker-controlled input at runtime. Fixing requires a `sharp` major bump — not attempted without dedicated regression testing of image-processing (unit thumbnails, floor plans). |
| `webpack` (SSRF via `buildHttp`) | High | `@nestjs/cli` → `webpack` | Dev-only CLI tooling, never runs in the built production image. |
| `tmp`, `inquirer`, `external-editor` | High/Moderate | `@angular-devkit/schematics-cli` (a transitive dev tool) | Same — build/scaffolding tooling, not shipped, not reachable at runtime. |
| `uuid` | Moderate | `exceljs` → `uuid` | Fix requires `exceljs@3.4.0` (older major) or forcing `@nestjs/schedule@6.1.3` depending on resolution path — both are real breaking changes to either the reporting export feature or the cron scheduler; not attempted casually right before a gate review. |

**Frontend** (7 remaining):

| Package | Severity | Chain | Why deferred |
|---|---|---|---|
| `vitest`/`vite`/`esbuild` | **Critical**/Moderate | `vitest` → `vite` → `esbuild` | The critical CVE requires the Vitest **UI server** to be listening (`vitest --ui`); this project never runs that mode (CI and local dev both use plain `vitest run`/`vitest`). Test-only devDependency, not shipped to the production Nginx image. Fix requires `vite@8`, a major bump with its own migration risk. |
| `react-router`/`react-router-dom` | Moderate | direct runtime dependency | Fix requires `react-router-dom@7.18.2`; deferred pending a dedicated routing regression pass (this app has ~50+ routes) rather than bundled into a dependency-audit pass. |

## Recommendation

None of the deferred items are reachable via attacker-controlled runtime
input in this application's actual usage (confirmed per-chain above, not
assumed) — the immediate production risk is low. All are legitimate
follow-up work, tracked here so they aren't lost, and should be scheduled
as their own dedicated upgrade passes (each with its own regression
testing: image processing for `sharp`, routing for `react-router`,
reporting export for `exceljs`) rather than forced through during a
hardening sprint focused on security/reliability/data-integrity basics.
