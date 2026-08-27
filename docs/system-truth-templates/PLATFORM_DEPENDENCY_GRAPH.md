# System Truth — Platform Dependency Graph

> **TEMPLATE — NOT YET POPULATED.** A visual/structural map of which
> modules depend on which others, built from verified imports/API
> calls, not assumed from domain grouping.

## Method

1. For each module, list direct code-level dependencies (imports,
   injected services from other modules, direct API calls).
2. Render as a dependency graph (diagram or adjacency list) — arrows
   point from dependent → dependency.
3. Flag any cycle found (module A depends on B which depends on A) as an
   architecture finding.

## Adjacency list (fill per module)

```text
[module] → depends on → [module, module, ...]
```

## Diagram

(Insert a Mermaid or equivalent diagram once dependencies are gathered —
keep it readable; split into sub-diagrams per domain group from
`docs/ai-governance/01-PLATFORM-SCOPE.md` if the full graph is too dense
for one view.)

## Cycles found

(List any circular dependency — these are near-automatic
`ARCHITECTURE_CONTRADICTIONS.md` entries.)

## Highest-fan-in modules

(Modules many others depend on — these are de facto Tier 0/1 regardless
of their business-function grouping; cross-reference
`docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`'s Tier model.)
