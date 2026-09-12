# CR-CRM-CATEGORY-MASTER-001 — CRM Category Master Alignment

**Trạng thái:** code hoàn tất, dry-run backfill đã chạy, **chưa mutate dữ liệu**.
**Ngày:** 2026-09-12

---

## 1. Before state

CRM có **ba nguồn ngành hàng không tương thích nhau**:

| Nơi dùng | Nguồn | Giá trị ví dụ |
|---|---|---|
| Dialog Thêm mới (`UnifiedAddDialog`) | `GET /categories/options` | `F&B`, `Fashion`, `Beauty & Wellness` (tên master) |
| Dialog Chỉnh sửa (`LeadEditDialog`) | `CATEGORY_OPTS` hard-code | `FB`, `FASHION`, `ENTERTAINMENT`, `SERVICES`, `EDUCATION`, `HEALTH`, `RETAIL` |
| Bộ lọc CRM (`CrmPage`) | `LEAD_CATEGORIES` hard-code | `F&B - Ẩm thực`, `Café & Trà`, `Thời trang`, … (nhãn tiếng Việt) |

Cả ba chỉ ghi/đọc **text tự do**. FK `Lead.categoryId` và `Customer.preferredCategoryId`
đã có trong schema nhưng **chưa bao giờ được ghi** bởi CRM.

Trạng thái DB thực tế trước CR (`leasing_platform`):

```
Lead.category        count  categoryId
F&B                    9        0
Fashion                5        0
Entertainment          3        0
Health & Beauty        2        0
Supermarket            1        0
Technology             1        0
                      21        0

Customer.preferredCategory  count  preferredCategoryId
F&B                           4          0
Fashion                       2          0
Health & Beauty               2          0
Entertainment                 1          0
Technology                    1          0
                             10          0
```

### Hậu quả đã xác nhận

1. **Ô "Ngành hàng" trong dialog sửa luôn trống.** Không giá trị nào trong DB
   (`F&B`, `Fashion`, …) trùng option của dialog (`FB`, `FASHION`, … — phân biệt
   hoa/thường), nên `<select>` rơi về option rỗng cho **mọi** lead.
2. **Nguy cơ ghi đè dữ liệu.** Chọn một mã trong list sẽ ghi `Lead.category = "FB"`
   — giá trị rác không có trong Category master.
3. **Bộ lọc ngành hàng chết hoàn toàn.** So sánh chuỗi chính xác giữa nhãn tiếng
   Việt hard-code và giá trị DB → luôn 0 kết quả.
4. **`categoryId` là dead field** ở phía CRM, dù Unit đã dùng nó cho pricing.

---

## 2. Canonical model

| | Authoritative | Legacy |
|---|---|---|
| Lead | `Lead.categoryId` → `Category` | `Lead.category` (text snapshot) |
| Customer | `Customer.preferredCategoryId` → `Category` | `Customer.preferredCategory` |

- **Identity = `Category.id`.** `Category.name` là dữ liệu hiển thị.
- Text legacy **vẫn tồn tại** nhưng **không còn là identity** và **không sửa độc lập được**:
  mỗi khi `categoryId` được ghi, backend tự derive text từ master.
- Frontend **không bao giờ** gửi cặp `(categoryId, text)` mâu thuẫn: text bị bỏ qua.

Thực thi bởi `apps/backend/src/common/services/category-resolver.service.ts`
(đăng ký trong `CommonModule`, là `@Global`).

---

## 3. API changes

### `POST /api/crm/leads`, `PUT /api/crm/leads/:id`

| Field | Trạng thái |
|---|---|
| `categoryId` | **MỚI** — identity. `Category.id`. |
| `category` | **DEPRECATED** (vẫn nhận, xem §5). |

Ngữ nghĩa PATCH của `categoryId`:

| Giá trị | Hành vi |
|---|---|
| *bỏ qua* (`undefined`) | **Không đổi.** Sửa trường khác không bao giờ xoá ngành hàng. |
| `null` | Xoá tường minh cả FK lẫn snapshot. |
| `"<Category.id>"` | Đổi sang category đó; snapshot lấy từ master. |

`categoryId` không tồn tại hoặc `isActive = false` → **400, zero mutation**
(validate trước mọi lệnh ghi).

### `POST /api/crm/customers`, `PUT /api/crm/customers/:id`

`preferredCategoryId` — y hệt quy tắc trên. `preferredCategory` deprecated.

### Filtering

| Endpoint | Query mới |
|---|---|
| `GET /api/crm/leads` | `categoryId` (lọc FK server-side) |
| `GET /api/crm/customers` | `preferredCategoryId` |

### Response

Mọi read của Lead/Customer nay kèm quan hệ Category:

```jsonc
{
  "categoryId": "cmts3lde8002vbf8kz0ys4m1u",
  "category": "F&B",                    // snapshot, backward-compatible
  "categoryRef": { "id": "...", "code": "FNB", "name": "F&B", "isActive": true }
}
```

`category` / `preferredCategory` **được giữ nguyên** trong response để không phá
consumer cũ (`proposal-pdf.service.ts`, `ProposalEditor.tsx`, reports/exports).

---

## 4. Frontend

`apps/frontend/src/components/crm/CategorySelect.tsx` — **selector ngành hàng duy nhất** của CRM.

- `value` = `Category.id`; label = `Category.name` từ master.
- Có searchable (dùng `SearchableSelect` sẵn có), loading, empty, disabled, error state.
- Inject lại category đã `isActive = false` nếu bản ghi còn trỏ tới nó
  (`… (ngừng sử dụng)`) — nếu không nó sẽ biến mất khỏi list và tái tạo đúng lỗi cũ.
- Shared query layer `useCategoryOptions()` (`queryKey: ['category-options']`).

Dùng ở: Lead Create · Lead Edit · Customer preferred category (tab Hồ sơ + Customer
detail sheet) · CRM filter.

Helper dịch sang payload (dùng chung cho mọi caller):
`categoryIdForCreate()`, `categoryIdForUpdate()`, `initialCategoryValue()`.

Hiển thị: `categoryRef.name ?? category` (`categoryLabel()` / `preferredCategoryLabel()`
trong `CrmPage.tsx`).

---

## 5. Legacy compatibility

Bản ghi chưa backfill (`categoryId = null`, `category = "..."`):

- UI hiện `<giá trị cũ> (Chưa ánh xạ)` — **không** để trống, **không** tự thay.
- Sentinel `LEGACY_CATEGORY_VALUE` (`'__legacy__'`) **không bao giờ** ra khỏi frontend:
  nó được dịch thành `categoryId: undefined` → backend giữ nguyên.
- Người dùng có thể chủ động chọn một Category chuẩn để chuẩn hoá.

Text legacy trong request:

| Tình huống | Hành vi backend |
|---|---|
| `categoryId` + `category` mâu thuẫn | Bỏ qua text, derive từ master, log WARN |
| Chỉ `category`, bản ghi **chưa** có `categoryId` | Chấp nhận (client cũ vẫn gán nhãn được) |
| Chỉ `category`, bản ghi **đã** có `categoryId` | Bỏ qua, log WARN — canonical thắng |

---

## 6. Category rename semantics

**Quy ước hiện hành của repo: phương án A — snapshot chỉ cập nhật ở lần ghi sau.**

Bằng chứng: `CategoriesService.updateCategory()` chỉ `prisma.category.update()`,
không đụng tới bảng nào khác; `Unit`/`Tenant` cũng giữ cặp text+FK theo đúng kiểu
này. Không có cơ chế cascade nào trong repo.

Hệ quả:

- `categoryId` **bất biến** qua rename → filter, pricing, liên kết vẫn đúng.
- Text snapshot có thể **cũ** cho tới lần ghi kế tiếp vào bản ghi đó.
- UI **luôn ưu tiên** `categoryRef.name`, nên người dùng thấy tên mới ngay lập tức
  kể cả khi snapshot chưa đồng bộ.

Không tự phát minh cascade update — không có nhu cầu nghiệp vụ nào chứng minh nó
cần thiết, và nó sẽ biến một thao tác đổi tên thành một lệnh ghi hàng loạt.

---

## 7. CategoryMallPricing impact

**Kết quả: KHÔNG có tích hợp nào giữa CRM category và pricing — trước lẫn sau CR.**

Call-path thực tế (chỉ có duy nhất một):

```
UnitBooking (create / updatePricing / list)
  apps/backend/src/modules/booking/booking.service.ts:101,559,771
    unit.categoryId
      CategoriesService.validateProposedPrice({ categoryId })
      CategoriesService.getApplicablePricing({ categoryId })
        resolvePricing() -> getCategoryLineage(categoryId) -> CategoryMallPricing
```

- Nguồn `categoryId` là **`Unit.categoryId`**, không phải Lead/Customer.
- `grep -rn "category" apps/backend/src/modules/approvals/*.ts` → **0 kết quả**.
  Approval threshold không phụ thuộc category ở bất kỳ đâu; escalation giá đi qua
  `PriceApprovalStatus` do `validateProposedPrice` trả về, vẫn dựa trên Unit.
- Do đó: **populate `Lead.categoryId` KHÔNG bật pricing lên.** Không tuyên bố ngược lại.

Được khoá lại bằng test `CRM-CAT-023` / `CRM-CAT-024`.

### Phát hiện phụ (đã sửa trong CR này)

`deal-scoring.service.ts:105` so sánh `proposal.unit.category === customer.preferredCategory`
— **so khớp bằng text**. Một Unit `Beauty & Wellness` với Customer `Health & Beauty`
(cùng một ngành) bị chấm là lệch ngành. Đã đổi sang so khớp `categoryId` khi cả hai
phía có FK, fallback về text cho dữ liệu chưa backfill.

---

## 8. Hard-coded sources

| Nguồn | Vị trí cũ | Xử lý |
|---|---|---|
| `CATEGORY_OPTS` | `components/crm/lead-constants.ts` | **Đã xoá** (thay bằng comment giải thích) |
| `LEAD_CATEGORIES` | `pages/crm/CrmPage.tsx` | **Đã xoá** |
| `categoryNames` fallback | `pages/crm/CrmPage.tsx:231` | **Đã xoá** (không còn fallback hard-code) |

### Các list `CATEGORIES` khác trong repo — **không** thuộc phạm vi CR

Đã rà và xác nhận **không** phải ngành hàng cho thuê, không trùng Category master:

| Vị trí | Nội dung | Kết luận |
|---|---|---|
| `pages/announcements/AnnouncementsPage.tsx:18` | loại thông báo | Khác domain |
| `pages/service-contracts/ServiceContractsPage.tsx:63` | loại hợp đồng dịch vụ | Khác domain |
| `pages/work-orders/WorkOrderTemplates.tsx:19` | `TECHNICAL/CLEANING/…` | Khác domain |
| `pages/spaces/spaces.constants.tsx:54` | **ngành hàng của Unit** | ⚠️ Cùng domain, xem dưới |
| `components/fitout/RiskChangeControl.tsx:100` | loại rủi ro fitout | Khác domain |

`spaces.constants.tsx` `CATEGORIES` **là** cùng domain nhưng Spaces đã được chuyển
sang `categoriesApi.getOptions` từ CR trước (`CreateEditUnitDialog`, `BulkDialogs`,
`UnitDetailSheet`, `SpacesPage` đều gọi API). Hằng còn lại chỉ phục vụ màu/icon
hiển thị. **Đã báo cáo, không sửa trong CR này** để giữ đúng phạm vi CRM.

---

## 9. Mapping decisions

Xem `docs/CRM_CATEGORY_MAPPING_BACKFILL.md`.

Tóm tắt: 21/21 Lead và 10/10 Customer auto-mappable, 0 ambiguous, 0 no-match.
Chỉ một alias được dùng — `Health & Beauty → BEAUTY (Beauty & Wellness)` — và nó
**không phải phỏng đoán**: repo đã có sẵn ánh xạ này trong
`prisma/scripts/migrate-categories.ts` từ khi Category master ra đời.

---

## 10. Unresolved values

Không có. 0 AMBIGUOUS, 0 NO_MATCH trên dữ liệu hiện tại.

---

## 11. Schema change

**Không có.** `Lead.categoryId`, `Lead.categoryRef`, `Customer.preferredCategoryId`,
`Customer.preferredCategoryRef` đã tồn tại trong `schema.prisma`. CR này chỉ bắt đầu
**sử dụng** chúng. **Không có Prisma migration.**

---

## 12. Rollback

Code là revert thuần (không schema change):

1. `git revert` các commit của CR → CRM quay lại ghi text tự do.
2. Dữ liệu đã backfill **vẫn an toàn**: `categoryId` chỉ được *thêm* vào các dòng
   trước đó là `null`; `category` text bị ghi lại đúng bằng tên master (với dữ liệu
   hiện tại: `Health & Beauty` → `Beauty & Wellness`, 2 Lead + 2 Customer; các giá
   trị khác không đổi vì đã trùng tên).
3. Nếu cần hoàn nguyên dữ liệu:

```sql
-- Chỉ chạy khi thực sự muốn quay lại trạng thái trước backfill.
UPDATE "Lead"     SET "categoryId" = NULL          WHERE "categoryId" IS NOT NULL;
UPDATE "Customer" SET "preferredCategoryId" = NULL WHERE "preferredCategoryId" IS NOT NULL;
-- Khôi phục text 'Health & Beauty' nếu cần (2 Lead + 2 Customer, xem báo cáo dry-run).
```

Snapshot text nên được dump trước khi `--apply` (xem deployment order).

---

## 13. Deployment order

1. **Deploy backend trước.** Backend mới chấp nhận cả `categoryId` (mới) lẫn
   `category` (cũ), nên frontend cũ vẫn chạy bình thường.
2. **Deploy frontend.** Từ đây mọi thao tác CRM ghi `categoryId`.
3. **Dump snapshot** trước khi backfill:
   ```sql
   \copy (SELECT id, category, "categoryId" FROM "Lead") TO 'lead-category-before.csv' CSV HEADER;
   \copy (SELECT id, "preferredCategory", "preferredCategoryId" FROM "Customer") TO 'customer-category-before.csv' CSV HEADER;
   ```
4. **Chạy dry-run** trên môi trường đích, duyệt bảng ánh xạ.
5. **Chạy `--apply`.**
6. Kiểm tra: `SELECT COUNT(*) FROM "Lead" WHERE "categoryId" IS NULL AND category IS NOT NULL;`

Backend và frontend **không** phụ thuộc thứ tự chặt (backward compatible hai chiều),
nhưng backfill **phải** sau bước 1–2 để tránh ghi đè bởi client cũ.

---

## 14. Files changed

### Backend

| File | Thay đổi |
|---|---|
| `src/common/services/category-resolver.service.ts` | **MỚI** — phân giải & validate identity |
| `src/common/common.module.ts` | Đăng ký resolver |
| `src/modules/crm/dto/create-lead.dto.ts` | `categoryId` (create + update), deprecate `category` |
| `src/modules/crm/dto/create-customer.dto.ts` | `preferredCategoryId`, deprecate `preferredCategory` |
| `src/modules/crm/crm.service.ts` | Resolve khi create/update, filter `categoryId`, include `categoryRef` |
| `src/modules/crm/customers.service.ts` | Như trên + conversion mang `categoryId` sang |
| `src/modules/crm/crm.controller.ts` | `@ApiQuery categoryId` |
| `src/modules/crm/customers.controller.ts` | `@ApiQuery preferredCategoryId` |
| `src/modules/proposals/deal-scoring.service.ts` | `industryFit` khớp theo identity |
| `prisma/scripts/backfill-crm-category-ids.ts` | **MỚI** — backfill an toàn, dry-run mặc định |
| `prisma/scripts/migrate-categories.ts` | Guard: từ chối chạy (superseded, tự tạo Category) |
| `src/modules/crm/crm-category-master.spec.ts` | **MỚI** — CRM-CAT-001..013, 023, 024 |
| `src/modules/crm/crm-category-backfill.spec.ts` | **MỚI** — CRM-CAT-014..019 |
| 5 spec CRM hiện có | Cập nhật constructor (thêm resolver) |

### Frontend

| File | Thay đổi |
|---|---|
| `src/components/crm/CategorySelect.tsx` | **MỚI** — selector dùng chung |
| `src/components/crm/CategorySelect.test.tsx` | **MỚI** — CRM-CAT-003, 009, 010, 020, 021, 022 |
| `src/components/crm/LeadEditDialog.tsx` | Dùng CategorySelect (cả tab Lead và Hồ sơ KH) |
| `src/components/crm/lead-constants.ts` | Xoá `CATEGORY_OPTS` |
| `src/components/crm/index.ts` | Export selector, bỏ `CATEGORY_OPTS` |
| `src/pages/crm/CrmPage.tsx` | Xoá `LEAD_CATEGORIES`; create/filter/display/customer-edit theo identity |
| `src/types/index.ts` | `CategoryRef`, `categoryId`, `preferredCategoryId` |
| `src/pages/bookings/LeadEditDialog.test.tsx` | Mock `categoriesApi` + 4 test CRM-CAT |
