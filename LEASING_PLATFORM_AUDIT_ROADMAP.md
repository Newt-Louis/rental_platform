# Leasing Platform Audit & Roadmap

## 1) Muc tieu danh gia

Danh gia muc do dap ung cua he thong voi full leasing lifecycle:

Lead -> Space -> Quotation -> Approval -> Contract -> Fitout -> Tenant Operation -> Billing/AR -> Sales Reporting -> SAP FI/CO.

---

## 2) Coverage theo phan he

| Phan he | Muc do | Danh gia nhanh |
|---|---|---|
| Tenant CRM | Partial | Co lead/customer/activity, thieu lead scoring va SLA governance |
| Space Management | Done core | Co mall/floor/zone/unit + occupancy summary |
| Quotation/Deal | Partial | Co proposal tinh toan + PDF, thieu versioning/compare/scenario |
| Deal Approval Workflow | Basic demo | Co approve/reject, rule con hard-code |
| Contract Lifecycle | Partial | Co CRUD + expiry alert, thieu template/clause engine |
| Fitout Management | Partial | Co checklist/status, thieu gate theo ho so bat buoc + SLA escalation |
| Tenant Operation | Partial | Co tenant profile + ticket, portal self-service chua enterprise-ready |
| Billing & Receivable | Partial | Co invoice/payment/AR aging, thieu billing schedule tu contract + dunning framework |
| Sales Reporting | Basic demo | Co report co ban, thieu BI drilldown/forecast |
| SAP Integration | Basic demo | Co sync + log + retry, thieu reconciliation/idempotency/mapping layer |

---

## 3) Top 10 critical gaps

1. Dynamic approval policy engine (hien hard-code theo dieu kien gioi han).
2. Quote versioning + compare de truy vet thuong thao.
3. Contract template & clause library.
4. Billing schedule automation theo hop dong (rent-free, escalation, cycle).
5. AR dunning workflow da cap (nhac no, escalate, promise-to-pay).
6. Occupancy & commercial analytics nang cao.
7. Multi-mall governance model (policy/KPI/segregation theo mall).
8. Audit trail completeness (before/after diff, forensic-friendly eventing).
9. SAP reconciliation + idempotency + mapping production-grade.
10. API contract consistency front-back o cac luong phuc tap.

---

## 4) Rui ro neu giu hien trang

- Cham TAT deal do approval/contract xu ly thu cong nhieu.
- Sai lech billing/AR co the gay that thoat doanh thu va tang DSO.
- Tranh chap phap ly de xay ra neu thieu quote history/clause governance.
- Sai lech so lieu giua leasing platform va SAP khi volume tang.
- Kho scale sang nhieu mall neu thieu operating model thong nhat.

---

## 5) Roadmap nang cap 180 ngay

## Phase 0-30 ngay (quick control + stabilization)

1. Approval rule config-driven (M)  
   - Value: enforce policy dong, giam bottleneck duyet.
2. Quote versioning + immutable snapshot (M)  
   - Value: truy vet dam phan, rollback/compare ro rang.
3. Contract/Billing audit diff timeline (M)  
   - Value: compliance, forensic, giam rui ro tranh chap.
4. AR reminder level 1/2 (S)  
   - Value: cai thien thu no som.
5. API contract hardening (S)  
   - Value: giam bug release front-back.

## Phase 31-90 ngay (industrialize operations)

1. Billing schedule engine (L)  
   - Value: tu dong hoa don tu hop dong.
2. AR dunning workflow (L)  
   - Value: giam DSO, tang collection rate.
3. Contract template + clause library (M)  
   - Value: legal turnaround nhanh, dong nhat.
4. Fitout governance + SLA escalation (M)  
   - Value: giam tre khai truong tenant.
5. Sales/occupancy analytics v2 (M)  
   - Value: toi uu tenant mix va doanh thu/sqm.

## Phase 90-180 ngay (enterprise scale)

1. SAP hardening + reconciliation dashboard (L)
2. Multi-mall operating model (L)
3. Reusable workflow engine cho approval/contract/fitout/AR (L)
4. Forecast renewal risk/occupancy/revenue uplift (M)
5. Compliance package (audit export, retention, governance) (M)

---

## 6) Thu tu uu tien khuyen nghi (business-first)

1. Approval policy engine  
2. Billing schedule automation  
3. AR dunning v1  
4. Quote versioning  
5. SAP reconciliation baseline

Neu ban dong y, buoc tiep theo la tach backlog thanh sprint 2 tuan va implement theo 3 stream:

- Commercial stream: CRM -> Quote -> Approval
- Finance stream: Billing -> AR -> SAP
- Operations stream: Contract -> Fitout -> Tenant Ops

