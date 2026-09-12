# CR-BOOKING-PRICE-APPROVAL-ALWAYS-WARN-004 — Pricing Decision luôn hiển thị

**Ngày:** 2026-09-12 · Kế thừa `CR-BOOK-PRICE-APPROVAL-001`

Hai mục tiêu, tách bạch có chủ ý:

1. **Không có quyết định giá nào im lặng.** Mọi lần đánh giá giá booking trả về
   một `PricingDecision` có thông điệp người dùng đọc được — kể cả khi không cần
   phê duyệt.
2. **Thẩm quyền phê duyệt là cấu hình, không phải code.** Tầng giá tính *sự kiện*;
   `ApprovalPolicyRule` quyết định *ai ký*.

---

## 1. Vì sao cần

Trước CR này, phản hồi duy nhất về giá là booking âm thầm rơi vào `PENDING`
**sau khi đã tạo xong**. Tệ hơn: một mức giá **không cần duyệt** và một mức giá
**không ai đánh giá được** trông y hệt nhau — đều không có cảnh báo gì.

Và tầng giá tự quyết định thẩm quyền:

```ts
// categories.service.ts — ĐÃ GỠ
if (deviationPercent <= 5)       approvalLevel = 'MANAGER';
else if (deviationPercent <= 10) approvalLevel = 'DIRECTOR';
else                             approvalLevel = 'CEO';
message = `... Requires Leasing Manager approval.`;
```

Nghịch lý: nó vừa **hard-code một chuỗi thẩm quyền**, vừa **vứt kết quả đi** —
`UnitBooking` không có cột nào lưu cấp duyệt, nên chẳng ai được định tuyến.

---

## 2. Contract

`apps/backend/src/modules/approvals/pricing-decision.types.ts`

```ts
PricingDecision {
  status   // NOT_REQUIRED | ROUTED | POLICY_NOT_CONFIGURED
           // | POLICY_AMBIGUOUS | PRICING_REFERENCE_MISSING | CURRENCY_MISMATCH
  severity · requiresAcknowledgement · blocking
  basis    // CATEGORY_BAND | UNIT_BASE_RENT | NONE
  proposedRentPerSqm
  reference { minRentPerSqm?, maxRentPerSqm?, unitBaseRentPerSqm?, currency, referenceCurrency? }
  deviationPercent   // null khi không có tham chiếu — KHÔNG bịa 100%
  approval { required, policyConfigured, steps[] }
  categoryPricingId · warningCode · message · evaluatedAt · fingerprint
}
```

`severity`/`requiresAcknowledgement`/`blocking` là thuộc tính **của status**
(`PRICING_DECISION_PRESENTATION`), không phải của màn hình — nên mọi surface
trình bày giống hệt nhau.

| status | severity | xác nhận | chặn ghi |
|---|---|---|---|
| `NOT_REQUIRED` | INFO | không | không |
| `ROUTED` | WARNING | có | **không** — cần duyệt là kết quả nghiệp vụ bình thường |
| `POLICY_NOT_CONFIGURED` | WARNING | có | không (lưu được, chưa convert được) |
| `PRICING_REFERENCE_MISSING` | WARNING | có | không |
| `CURRENCY_MISMATCH` | WARNING | có | không |
| `POLICY_AMBIGUOUS` | ERROR | — | **có** |

Chỉ `POLICY_AMBIGUOUS` chặn: không xác nhận nào làm cho một cấu hình bất định
trở nên xác định được.

---

## 3. Thẩm quyền là cấu hình — và bằng chứng

Runtime **không** chứa ngưỡng hay tên vai trò nào. Định tuyến lấy từ
`ApprovalPolicyRule` (`mallId` + `conditionType ∈ {PRICE_DEVIATION_PCT, PRICE_BELOW_MIN}`).

Chứng minh chạy trên PostgreSQL thật, **không sửa source giữa các case**:

| | Thao tác | Kết quả |
|---|---|---|
| **A** | Không có rule | `POLICY_NOT_CONFIGURED`, `steps: []`, message **không chứa** Manager/Director/CEO |
| **B** | `INSERT` rule vào DB | `ROUTED`, người ký đúng rule |
| **C** | `UPDATE ... SET approverId` | Cùng facts, **người ký đổi**, `deviationPercent` không đổi |
| **D** | Giá trong khung | `NOT_REQUIRED` + thông điệp — **không im lặng** |

Thêm: tắt rule (`isActive=false`) → quay về cảnh báo, không im lặng.

### Ngưỡng 5% / 10% là DỮ LIỆU, không phải quy tắc nghiệp vụ ở tầng code

Bảng dưới là **nội dung `ApprovalPolicyRule` đang seed** cho THISO Mall Sala,
không phải hằng số trong mã nguồn. Admin sửa được qua *Quản trị › Chính sách duyệt*
mà không cần deploy:

| Rule | Điều kiện | Người duyệt |
|---|---|---|
| `PRICE_BELOW_MIN_5` | `BETWEEN 0–5` | Leasing Manager (đích danh) |
| `PRICE_BELOW_MIN_10` | `BETWEEN 5–10` | Mall Director (đích danh) |
| `PRICE_BELOW_MIN_OVER_10` | `> 10` | CEO (đích danh) |

**Quan sát về cấu hình hiện tại (không phải lỗi code):** `BETWEEN` bao gồm cả hai
đầu, nên ở **đúng 5,00%** cả hai rule đầu cùng khớp → chuỗi hai chữ ký, trong khi
5,01% chỉ cần một. Hệ thống xử lý xác định và đúng: hai rule ở **hai `stepOrder`
khác nhau** nghĩa là "cả hai cùng ký, theo thứ tự đó".

Nếu nghiệp vụ muốn mốc 5,00% chỉ một người ký, đó là **thay đổi dữ liệu**: sửa
biên của một trong hai rule. Không cần đụng vào code, và **không phải** một
`BUSINESS_CONFIRMATION_REQUIRED` ở tầng triển khai.

---

## 4. Mơ hồ vs tuần tự

| Cấu hình | Ý nghĩa | Kết quả |
|---|---|---|
| Nhiều rule khớp, **khác `stepOrder`** | Cấu hình đang nói "cùng ký, theo thứ tự này" | `ROUTED`, chuỗi tuần tự |
| Nhiều rule khớp, **cùng `stepOrder`**, khác người | Không diễn đạt thứ tự nào cả | `POLICY_AMBIGUOUS`, chặn |

Phân biệt này rút ra từ **ngữ nghĩa của chính cấu hình** (`stepOrder`), không
phải từ phỏng đoán. Trước đó thứ tự thừa hưởng row order của Postgres — cùng dữ
liệu có thể ra hai chuỗi khác nhau giữa hai lần chạy.

---

## 5. Nguồn tham chiếu

| Điều kiện | Đối chiếu với | `basis` |
|---|---|---|
| Ngành hàng **có** khung giá | `CategoryMallPricing` sàn/trần | `CATEGORY_BAND` |
| Ngành hàng **không** có khung, unit **có** base rent | `Unit.baseRentPerSqm` làm **giá sàn** | `UNIT_BASE_RENT` |
| Có khung nhưng **khác đơn vị tiền tệ** | — | `CURRENCY_MISMATCH` |
| Không có cả hai | — | `PRICING_REFERENCE_MISSING` |

Không bao giờ dùng song song band và base rent — 10/30 unit đang có base rent
**thấp hơn** chính giá sàn ngành hàng của nó, nên để cả hai cùng ràng buộc sẽ kẹt
1/3 danh mục vì **mâu thuẫn dữ liệu**, không phải vì quyết định thương mại.

**Không FX.** Quy đổi một ngưỡng duyệt là bịa ra con số chưa ai phê chuẩn.

---

## 6. Preview và TOCTOU

`POST /api/bookings/price-preview` — đánh giá **không ghi gì**, để cảnh báo hiện
ra *trước khi* booking tồn tại. Unit đọc live từ server nên không preview được
trên unit mà client chỉ "nhớ".

Preview **không phải** uỷ quyền. Client gửi lại `acknowledgedPricingFingerprint`;
server re-evaluate mọi lần ghi và nếu khác → **409 `PRICING_DECISION_CHANGED`**
kèm decision mới. `fingerprint` loại `evaluatedAt` để hai lần đánh giá cùng input
cho cùng digest.

## 7. Snapshot

`pricingSnapshot` lưu status, basis, reference, deviation, `categoryPricingId`,
`policyRuleCodes`, `policyApproverIds`, fingerprint, `evaluatedAt`, message —
**không chỉ lưu câu chữ**. Một booking cũ phải giải thích được sau khi policy
hoặc khung giá đã đổi.

## 8. Cổng convert

Nêu **đúng lý do**, không gộp tất cả thành "chưa được duyệt": `PENDING` ·
`POLICY_NOT_CONFIGURED` · `CURRENCY_MISMATCH` · `POLICY_AMBIGUOUS` ·
`PRICING_REFERENCE_MISSING` · `REJECTED`. Booking **không đề xuất giá** vẫn
convert được — Proposal mang `rentPerSqm` riêng và có vòng kiểm giá riêng.

## 9. Frontend

`PricingDecisionAlert` — một nơi duy nhất render. Component **chỉ báo cáo**:
severity, có cần duyệt, ai ký đều do server quyết. Một frontend tự suy ra "không
cần duyệt" sẽ có ngày mâu thuẫn với các bước duyệt server thực sự ghi.

## 10. Kiểm thử

- `price-approval-policy.service.spec.ts` — 20 test, gồm `BOOK-WARN-010` chạy đủ **6/6 status**.
- `PricingDecisionAlert.test.tsx` — 11 test, gồm payload **mâu thuẫn có chủ ý** để chứng minh FE đi theo server.
- `test/booking-price-approval.e2e-spec.ts` — **34 test PostgreSQL thật**: TEST A–D, TOCTOU, concurrency, mall isolation, SoD.

## 11. Audit hard-code

Runtime (`categories` / `booking` / `approvals`, trừ spec): **0 hit** cho
`approvalLevel`, `'MANAGER'|'DIRECTOR'|'CEO'`, và ngưỡng 5/10.
Còn lại đã phân loại: **TEST** (spec), **SEED/CONFIGURATION** (`seed.ts`),
**UNRELATED** (fitout comment, i18n key).
