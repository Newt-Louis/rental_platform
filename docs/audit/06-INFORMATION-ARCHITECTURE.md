# 06 — Information Architecture

> Phase 6. Full audit of `apps/frontend/src/lib/permissions.ts` (`NAV_GROUPS`,
> `TENANT_NAV`) and `Layout.tsx`.

## Current IA (staff sidebar, 8 groups)

| Group | Items | Organizing principle |
|---|---|---|
| Tổng quan | Dashboard, Mặt bằng | Landing/overview |
| Quy trình bán hàng | Booking, Đề xuất, Phê duyệt, Hợp đồng, Khách thuê, Thống kê | **Task-sequence** (deliberate, per code comment) |
| CRM | Điều hành CRM, Xử lý Lead | Task-sequence (pre-unit-selection stage, deliberately split from sales process) |
| Vận hành | Hợp đồng dịch vụ, Kho vận hành, Điều phối công việc, Tuần tra, Vận hành bãi xe, Fitout, Ticket | **Technical/module** (7 unrelated subjects bundled by backend domain) |
| Tài chính | Doanh thu, Billing & AR, SAP | Technical/module |
| Phân tích | Deal Pipeline, Báo cáo, Analytics, AI Assistant, Cross-Mall CEO | Technical/module, and overlaps functionally with items already in other groups (Deal Pipeline vs. Quy trình bán hàng's own pipeline view) |
| Hệ thống | Thông báo Mall, Tenant Portal, Nhật ký hệ thống, Quản trị | Technical/catch-all |
| Parking Central | Báo cáo bãi đỗ xe, Giao dịch bãi đỗ xe | Fragment of "Vận hành" (FR-03) |

Plus a compensating device: `ErpProcessGuide`, an 8-step horizontal strip
(Khách hàng → Giữ mặt bằng → Đề xuất thuê → Phê duyệt → Hợp đồng → Fitout → Vận
hành → Thu phí) rendered above every page, filtered by role, highlighting the
current step. **Its existence is itself evidence that the grouped sidebar does not
communicate the end-to-end flow on its own** — the team already reached for a
task-sequence solution once; this audit recommends extending that instinct to the
sidebar itself rather than only living as a separate strip.

Tenant gets an entirely separate, flat 5-item nav (`TENANT_NAV`) + mobile bottom
tabs — architecturally correct (tenants should never see the staff module list).

## Diagnosis

Two different organizing principles coexist in the same sidebar with no visual
distinction between them: `salesProcess`/`crm` are sequences of *what a leasing
user does, in order*; `operations`/`finance`/`analytics`/`system` are *lists of
backend modules that happen to relate to a department*. A new user has no way to
know, just by looking at the sidebar, that the top two groups behave differently
from the bottom four. This is the single largest structural finding of this audit —
consistent with the platform-wide symptom named in the audit brief ("Menu/chức
năng có thể đang được tổ chức theo góc nhìn kỹ thuật thay vì nghiệp vụ").

## Proposed IA

Do not adopt the generic "Home / My Work / Workspaces / Analytics / Administration"
template mechanically (per Phase 26 guidance) — adapt it to what this platform's
personas actually do, keeping the two things that already work (`ErpProcessGuide`,
the `salesProcess`/`crm` task grouping) and fixing what doesn't.

```text
Trang chủ (Home/Dashboard)

Việc của tôi (My Work) — NEW
 ├─ Cần tôi duyệt (approvals awaiting me)
 ├─ Ticket của tôi / chưa phân công
 ├─ Đề xuất của tôi
 └─ Thông báo

Bán hàng & Cho thuê (unchanged — already task-sequenced)
 ├─ Mặt bằng
 ├─ Khách hàng tiềm năng (CRM)
 ├─ Booking
 ├─ Đề xuất
 ├─ Phê duyệt
 ├─ Hợp đồng
 └─ Khách thuê

Vận hành mặt bằng (regrouped from the 7-item technical dump into 3 task clusters)
 ├─ Thi công & Bàn giao — Fitout
 ├─ Xử lý sự cố — Tickets, Work Orders
 └─ An ninh & Bãi đỗ xe — Patrol, Parking (merges Vận hành bãi xe + Parking Central — fixes FR-03)

Tài chính
 ├─ Billing & Công nợ
 ├─ Doanh thu khách thuê
 ├─ Hợp đồng dịch vụ
 └─ SAP

Báo cáo & Phân tích (consolidated per FR-11 — see below)
 ├─ Báo cáo vận hành (occupancy, tickets, fitout — replaces scattered Dashboard-adjacent views)
 ├─ Hiệu quả kinh doanh (pipeline, deal conversion — merges Deal Pipeline + Pipeline Stats)
 ├─ Tài chính & Tuân thủ (finance/compliance reports)
 └─ Cross-Mall (CEO/Admin only)

Trợ lý AI

Hệ thống
 ├─ Thông báo Mall
 ├─ Nhật ký hệ thống
 └─ Quản trị (Users, Mall Access, Categories, Approval Policy, System — per V2's
     admin-monolith split recommendation)
```

Tenant nav is unchanged — it already follows the target pattern.

## What this fixes

- FR-03 (parking fragmentation) — merged into one cluster.
- FR-11 (6 overlapping reporting surfaces) — consolidated to 3 named-purpose
  surfaces + Cross-Mall, matching V2 Sprint D's recommendation but expressed as an
  IA tree instead of a backlog item.
- FR-12 (inconsistent grouping principle) — every group is now a task cluster,
  matching the already-proven `salesProcess` pattern.
- Persona E's overload (Operation role seeing 7 unrelated items) — 3 clusters
  instead of 7 flat items reduces scanning cost even without changing RBAC.

## What NOT to change

- Keep `ErpProcessGuide` — it works, and the redesigned sidebar makes it
  reinforcing rather than compensating.
- Keep the Tenant/staff nav split as-is.
- Do not collapse Approvals into a sub-item of Contracts or Proposals — it's a
  distinct persona-facing surface (Manager/Director/CEO/Finance/Legal) and deserves
  its own top-level visibility, consistent with "My Work → Cần tôi duyệt" above.
- Do not remove any of the 21 major features — this is a regrouping, not a scope
  cut (Rule from the master audit brief: "Không xóa chức năng").
