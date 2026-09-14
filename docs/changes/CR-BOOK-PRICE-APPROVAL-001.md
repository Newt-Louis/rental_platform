# CR-BOOK-PRICE-APPROVAL-001 — Booking Price Approval Workflow

**Ngày:** 2026-09-12 · **Trạng thái:** hoàn tất, đã deploy local, **chưa commit/push**

Kiến trúc đích:

```
Booking proposed price
        │
        ▼
Pricing Policy Evaluation          PriceApprovalPolicyService.evaluate()
        ├─ CategoryMallPricing     mall/category/floor/zone/currency
        ├─ Unit.baseRentPerSqm     CHỈ khi ngành hàng chưa khai khung giá
        └─ trả về                  deviation · approvalRequired · basis · policy/rule · approver step(s)
        │
        ▼
Price Approval Workflow            BookingPriceApprovalStep
        ├─ ApprovalPolicyRule      mall · PRICE_* · threshold/operator · approverRole/approverId
        ├─ notifications/email
        ├─ audit
        └─ SoD
        │
        ▼
Proposal conversion                chỉ khi APPROVED / NOT_REQUIRED
```

---

## 1. Before state

Phần **phát hiện** lệch giá đã hoạt động. Phần **định tuyến và thực thi** thì không tồn tại.

| Vấn đề | Bằng chứng |
|---|---|
| Cấp phê duyệt được tính rồi **vứt đi** | `validateProposedPrice` trả `approvalLevel` MANAGER/DIRECTOR/CEO; `booking.service.ts` chỉ lấy `deviationPercent`. `UnitBooking` không có cột nào lưu cấp duyệt |
| **Không có cơ chế chỉ định người duyệt** | Chỉ một cờ `priceApprovalStatus` phẳng, một bước, không gắn với ai |
| **Sale tự duyệt giá của mình** | `approvePrice`/`rejectPrice` **không có `@Roles`** → rơi về mức lớp `@ModuleRoles('bookings')` gồm `LEASING_EXECUTIVE`. Probe thực tế: executive gọi approve trả **404** (qua guard) |
| **CEO không duyệt được** | `MODULE_ROLES.booking` không có `CEO`. Probe: CEO trả **403** trên chính escalation dành cho mình |
| Ngưỡng 5%/10% **hard-code** | `categories.service.ts:693-702`, không theo mall, không cấu hình được. **Đã gỡ hoàn toàn ở CR-...-ALWAYS-WARN-004** — ngưỡng và người duyệt nay chỉ nằm trong `ApprovalPolicyRule` |
| **Không có thông báo nào** | `BookingModule` không import `NotificationsModule`; 0 lần `notifications.create`, 0 lần `sendMail` trong toàn module |
| Cổng convert hở | Chỉ chặn `PENDING`/`REJECTED`, nên `NULL` (giá **chưa từng được thẩm định**) lọt qua |

---

## 2. Pricing Policy Evaluation

`apps/backend/src/modules/approvals/price-approval-policy.service.ts`

Một lời gọi trả về: độ lệch, có cần duyệt không, rule giá nào quyết định, và **ai phải ký**.

```ts
evaluate({ mallId, categoryId, floorId, zoneId, proposedRentPerSqm, currencyCode,
           unitBaseRentPerSqm, unitCurrencyCode })
  -> { evaluated, requiresApproval, deviationPercent, approvalLevel, basis,
       pricingRuleId, pricingSnapshot, steps[], unrouted, message }
```

`basis` cho biết giá được đối chiếu với cái gì: `CATEGORY_BAND` (khung ngành
hàng), `UNIT_BASE_RENT` (giá cơ bản của mặt bằng — chỉ khi ngành hàng chưa khai
khung, xem §12), hoặc `NONE`.

Ba trạng thái, không phải hai:

| Kết quả | Ý nghĩa | `priceApprovalStatus` |
|---|---|---|
| `evaluated: false` | Mặt bằng **chưa gán ngành hàng** → không có khung để đối chiếu | `NULL` |
| `requiresApproval: false` | Đã thẩm định, giá **trong khung** | `NOT_REQUIRED` *(enum mới)* |
| `requiresApproval: true` | Đã thẩm định, **ngoài khung** | `PENDING` |

`NULL` trước đây vừa nghĩa là "chưa có giá" vừa là "không cần duyệt" — chính sự nhập nhằng đó làm cổng convert hở.

---

## 3. Định tuyến người duyệt

Lấy từ `ApprovalPolicyRule` — **cùng bảng, cùng màn hình quản trị** mà workflow duyệt Proposal đang dùng. Không còn ngưỡng hard-code.

```
mallId + isActive + conditionType ∈ { PRICE_DEVIATION_PCT, PRICE_BELOW_MIN }
  → policyRuleMatches(rule, { priceDeviationPct })
  → khử trùng lặp → sắp theo stepOrder → đánh số lại 1..n
```

Dữ liệu `ApprovalPolicyRule` đang seed cho THISO Mall Sala — **là dữ liệu cấu hình, không phải hằng số trong mã nguồn**; admin sửa được mà không cần deploy:

| Rule | Điều kiện | Người duyệt |
|---|---|---|
| `PRICE_BELOW_MIN_5` | BETWEEN 0–5% | Leasing Manager (đích danh) |
| `PRICE_BELOW_MIN_10` | BETWEEN 5–10% | Mall Director (đích danh) |
| `PRICE_BELOW_MIN_OVER_10` | > 10% | CEO (đích danh) |

**Chỉ rule PRICE_\* được đưa vào.** Matcher dùng chung coi `isRequired: true` là "luôn khớp", nên nếu truyền cả bộ rule thì Finance Review + Legal Review + base Leasing Manager của quy trình duyệt *deal* sẽ bị kéo vào mọi quyết định *giá*. Hai việc khác nhau.

**Hai rule chỉ định hai người khác nhau cho cùng một bước = hai chữ ký thật**, không gộp.

### Khi không có rule nào khớp

Không thả lỏng. `unrouted: true`, booking vẫn giữ `PENDING`, **chỉ ADMIN** mới gỡ được, và UI hiện "Chưa có chính sách duyệt" thay vì cột trống.

---

## 4. Workflow

`BookingPriceApprovalStep` (model mới) — tuần tự, bước hành động là `stepOrder` nhỏ nhất còn `PENDING`.

**Vì sao không dùng `ApprovalWorkflow`/`ApprovalStep`:** `ApprovalsService.parseEntityType` chỉ chấp nhận `PROPOSAL` và `FITOUT_SUBMITTAL`, và **mọi nhánh mall-scoping trong đó được viết riêng cho hai loại này** (`proposalMallBranch` / `fitoutMallBranch`). Thêm entity thứ ba sẽ đẩy booking qua các predicate chưa từng được thiết kế để lọc nó — đúng dạng lỗi rò dữ liệu chéo mall mà repo đã từng gặp. Bảng riêng giữ ranh giới mall tường minh qua `unit` của chính booking.

Quy tắc:
- Bước trung gian ký xong → booking **vẫn PENDING**, chuyển tiếp cho người kế.
- Chỉ bước **cuối** mới lật `priceApprovalStatus = APPROVED`.
- Từ chối ở bất kỳ bước nào → `REJECTED`, các bước sau chuyển `SKIPPED`.
- Đổi giá → **xoá toàn bộ chuỗi cũ và dựng lại**; chữ ký cũ duyệt cho con số không còn tồn tại nên bị huỷ, kèm xoá `priceApprovedById/At/Note`.

---

## 5. Separation of Duties

```
approver ≠ booking.priceProposedById   (người đặt con số)
approver ≠ booking.createdById         (người mở booking)
```

`priceProposedById` là cột mới, ghi mỗi khi `proposedRentPerSqm` được viết.

**Áp dụng cho cả ADMIN.** Miễn trừ ADMIN sẽ vô hiệu hoá chốt chặn đúng trên tài khoản dễ kiêm nhiệm nhất. Mall một người thì giải pháp là tài khoản duyệt thứ hai, không phải nới quy tắc.

---

## 6. Thông báo

| Thời điểm | Người nhận | In-app | Email |
|---|---|---|---|
| Vào `PENDING` (tạo mới hoặc đổi giá) | Người duyệt bước hiện tại | `PRICE_APPROVAL_PENDING` | `bookingPriceApprovalHtml` |
| Bước trung gian ký xong | Người duyệt **kế tiếp** | ✅ | ✅ |
| Duyệt xong / Từ chối | Người đề xuất giá | `PRICE_APPROVAL_APPROVED` / `_REJECTED` | — |

- Gửi **sau khi transaction commit**: thông báo cho một booking đã rollback tệ hơn là thông báo trễ.
- Lỗi gửi mail **log, không throw** — sự cố SMTP không được làm hỏng lệnh ghi đã thành công.
- `eventKey` = `booking-price-approval:{bookingId}:{stepId}` → retry cùng bước không gửi trùng, chuỗi mới (giá mới) có key mới.
- Email kèm **giá sàn/trần** của khung: "lệch 12%" vô nghĩa nếu không biết lệch so với mức nào.

---

## 7. Audit

- `BookingActivity` ghi rõ bước nào, ai quyết, còn mấy bước, lý do.
- `BookingPriceApprovalStep.policyRuleCode` lưu **rule nào sinh ra bước đó** — rule có thể bị sửa hoặc tắt sau này, quyết định vẫn phải giải thích được.
- `pricingSnapshot` lưu khung giá tại thời điểm thẩm định.
- `AuditLogInterceptor` toàn cục vẫn ghi mọi write như cũ.

---

## 8. Cổng convert

```ts
PENDING   → chặn
REJECTED  → chặn
có proposedRentPerSqm nhưng status ∉ {APPROVED, NOT_REQUIRED} → chặn   // lỗ hổng cũ
không có proposedRentPerSqm → cho qua   // Proposal tự thẩm định giá khi submit
```

Lưu ý phạm vi: bản đầu tôi allow-list cứng cả hai trạng thái và nó **chặn nhầm** booking không hề đề xuất giá — một luồng hợp lệ, vì Proposal mang `rentPerSqm` riêng và có vòng duyệt riêng. Đã thu hẹp lại đúng lỗ hổng thật.

---

## 9. Quyền

| | Trước | Sau |
|---|---|---|
| `approvePrice` / `rejectPrice` | **không `@Roles`** | `ADMIN, LEASING_MANAGER, MALL_DIRECTOR, CEO` + service kiểm tra **đúng người của bước** + SoD |
| `MODULE_ROLES.booking` | không có CEO | **thêm CEO** |
| FE `permissions.ts` bookings | không có CEO | **thêm CEO** (đồng bộ theo CLAUDE.md) |
| Hàng đợi duyệt giá | ADMIN/LM/MD | **+ CEO** |

Probe thực tế trên hệ thống đang chạy:

| Vai trò | Trước (queue/approve) | Sau (queue/approve) |
|---|---|---|
| Leasing Executive | 403 / **404 ⟵ duyệt được** | 403 / **403** |
| CEO | **403 / 403** | **200 / 404** |
| Leasing Manager | 200 / 404 | 200 / 404 |

---

## 10. Schema & migration

`20260912104912_booking_price_approval_workflow`

- `PriceApprovalStatus` **+ `NOT_REQUIRED`**
- `UnitBooking` **+ `priceProposedById`, `priceProposedAt`**
- **Model mới `BookingPriceApprovalStep`**

> Migration `20260909095239_add_service_contract_share` đang **pending** trong DB dev cũng được apply cùng lúc. Sau khi `prisma generate` lại, **14 lỗi typecheck và 5 suite test `service-contracts` vốn là baseline đã biến mất** — nguyên nhân đúng là migration chưa chạy + client cũ.

---

## 11. Kiểm thử

**Backend: 156/156 suite · 1532/1532 test PASS** (không còn baseline nào).
Frontend: 470 pass, 4 fail = baseline `WorkOrdersPage` (Router context, không liên quan).

Test mới:
- `price-approval-policy.service.spec.ts` (7): định tuyến theo ngưỡng, không kéo step Finance/Legal vào, unrouted, chưa-thẩm-định, trong khung, hai người cùng bước.
- `booking.price-approval-workflow.spec.ts` (11): SoD (người đề xuất / người tạo / **cả ADMIN**), sai người, đúng người, giữ PENDING tới bước cuối, không nhảy bước, unrouted chỉ ADMIN, từ chối kết thúc chuỗi, thông báo.

Hai bug do chính tôi viết ra rồi test bắt được:
1. Handler `catch` deref `step.approver.id` — bản thân error handler có thể throw. Đổi sang `step.approverId`.
2. `booking.priceApprovalSteps[0]` giả định quan hệ luôn được load. Đổi sang optional chaining.

### E2E trên stack local

| Kịch bản | Kết quả |
|---|---|
| Manager tạo booking 700.000 (sàn 900.000) | PENDING, lệch 22,2% |
| Định tuyến | 1 bước → **CEO Price Review / ceo@thiso.com** (`PRICE_BELOW_MIN_OVER_10`) |
| SoD — người đề xuất tự duyệt | **403** "Bạn là người đề xuất mức giá này…" |
| Cổng convert khi PENDING | **400** chặn |
| CEO duyệt bước của mình | APPROVED, step APPROVED, thông báo về người đề xuất |
| Booking 630.000 (sàn 650.000) lệch 3,1% | → **Leasing Manager Price Review**, đúng ngưỡng 0–5% |
| CEO duyệt bước của Manager | **403** "…đã được chỉ định cho người khác" |
| Thông báo lúc vào PENDING | `PRICE_APPROVAL_PENDING` gửi đúng người |

Email không tạo `EmailDelivery` vì stack local đang `Email: DISABLED (no SMTP config)` — đúng như cấu hình.

---

## 12. Điểm còn để ngỏ

### Giá thuê cơ bản — ĐÃ QUYẾT (2026-09-12)

Nghiệp vụ chốt: **chỉ dùng giá thuê cơ bản của mặt bằng khi ngành hàng chưa khai
báo khung giá.** Không bao giờ dùng song song với khung.

Lý do lựa chọn này đúng, dựa trên dữ liệu thật: **10/30 mặt bằng đang có
`baseRentPerSqm` THẤP HƠN chính giá sàn ngành hàng của nó** (8 F&B, 1 Beauty,
1 Fashion — ví dụ sàn F&B 900.000 nhưng có unit khai base 580.000). Nếu để cả
hai cùng ràng buộc một mức giá, 1/3 danh mục sẽ lập tức kẹt vì **mâu thuẫn dữ
liệu**, không phải vì quyết định thương mại. Dùng làm dự phòng thì hai nguồn
không bao giờ gặp nhau.

Ngữ nghĩa:

| Tình huống | Đối chiếu với | Kết quả |
|---|---|---|
| Ngành hàng **có** khung giá | `CategoryMallPricing` (sàn/trần) | như cũ, `basis = CATEGORY_BAND` |
| Ngành hàng **không** có khung, unit **có** base rent | `Unit.baseRentPerSqm` làm **giá sàn** | `basis = UNIT_BASE_RENT` |
| Không có cả hai | — | giữ nguyên escalation CEO, fail-closed |

Base rent được xử lý **đúng như một giá sàn**: bằng hoặc cao hơn thì không cần
duyệt; thấp hơn thì tính % lệch và đi qua **cùng một thang chính sách**
(`ApprovalPolicyRule`). **Không có giá trần** — chào cao hơn giá chào thuê không
phải là nhân nhượng nên không cần ai phê duyệt.

Hai trường hợp cố ý **không** áp dụng dự phòng, để rơi về escalation an toàn:
- Unit chưa khai base rent (0 hoặc null) — không có gì để so.
- Booking và unit khác đơn vị tiền tệ — hệ thống **không có FX engine**, quy đổi
  một ngưỡng duyệt là bịa ra con số chưa ai phê chuẩn.

Giá trị dùng để so và cơ sở so sánh được ghi vào `pricingSnapshot`
(`basis`, `unitBaseRentPerSqm`) nên quyết định luôn giải thích được về sau.

**Vì sao thay đổi này đáng làm, ngoài việc lấp lỗ hổng:** trước đó ngành hàng
chưa khai khung giá khiến `deviationPercent = 100` và **mọi mức giá đều bị đẩy
lên CEO**, dù hợp lý đến đâu. Giờ 4% dưới giá cơ bản đi đúng Leasing Manager,
30% mới lên CEO.

**Cấu hình rule `PRICE_*` trong màn Admin**: màn `ApprovalPolicyTab` đã có sẵn và bảng `ApprovalPolicyRule` dùng chung, nên rule giá khai báo được ngay. Chưa kiểm tra kỹ phần UI của tab này có lọc/hiển thị riêng cho nhóm điều kiện giá hay không.

## 13. Files changed

**Backend:** `price-approval-policy.service.ts` (mới) · `price-approval-policy.service.spec.ts` (mới) · `approval-policy.util.ts` (export matcher) · `approvals.module.ts` · `booking.service.ts` · `booking.controller.ts` · `booking.module.ts` · `booking.price-approval-workflow.spec.ts` (mới) · 5 spec booking (collaborator mới) · `email.service.ts` (template) · `role-permissions.ts` · `schema.prisma` + migration

**Frontend:** `ApprovalsPage.tsx` (cột Bước duyệt, khoá nút theo người được chỉ định, CEO vào được) · `permissions.ts`
