# CRM Category Mapping & Backfill

**CR:** CR-CRM-CATEGORY-MASTER-001
**Script:** `apps/backend/prisma/scripts/backfill-crm-category-ids.ts`
**Trạng thái:** dry-run đã chạy · **chưa mutate dữ liệu**

---

## 1. Mục đích

Liên kết `Lead.categoryId` và `Customer.preferredCategoryId` (đang `NULL` 100%)
với Category master, dựa trên text legacy đã lưu — **không đoán**.

## 2. Cách chạy

```bash
# Dry run (mặc định) — in bảng ánh xạ, không ghi gì
docker compose exec backend npx ts-node --compiler-options '{"module":"commonjs"}' \
  prisma/scripts/backfill-crm-category-ids.ts

# JSON cho pipeline / lưu vết
... prisma/scripts/backfill-crm-category-ids.ts --json

# Thực thi (chỉ sau khi bảng ánh xạ đã được nghiệp vụ duyệt)
... prisma/scripts/backfill-crm-category-ids.ts --apply
```

> Container `leasing-backend` chỉ bind-mount `src/`, nên file script mới cần
> `docker compose cp apps/backend/prisma/scripts/backfill-crm-category-ids.ts backend:/app/prisma/scripts/`
> trước lần chạy đầu (hoặc rebuild image).

## 3. Bảo đảm an toàn

| Thuộc tính | Cách đạt được |
|---|---|
| **Dry-run mặc định** | Không ghi gì trừ khi có `--apply` |
| **Non-destructive** | Chỉ chọn dòng `categoryId IS NULL AND category IS NOT NULL` |
| **Idempotent** | Dòng đã liên kết không còn là candidate → lần chạy 2 đổi 0 dòng |
| **Transaction-safe** | Toàn bộ ghi trong một `prisma.$transaction([...])` |
| **Không tạo Category** | Không có `prisma.category.create` ở bất kỳ đâu |
| **Không hard-code id** | Alias trỏ tới `Category.code`, id được resolve lúc chạy |
| **Auditable** | In đủ bảng ánh xạ trước khi ghi |

## 4. Phân loại

| Class | Định nghĩa | Auto-migrate |
|---|---|---|
| `EXACT` | Trùng chính xác **đúng một** `Category.name` | ✅ |
| `CASE_ONLY` | Trùng khi bỏ qua hoa/thường + khoảng trắng, **đúng một** | ✅ |
| `APPROVED_ALIAS` | Có trong bảng alias đã duyệt, resolve ra **đúng một** code | ✅ |
| `AMBIGUOUS` | Nhiều hơn một ứng viên | ❌ để nguyên, báo cáo |
| `NO_MATCH` | Không ứng viên nào và không có alias | ❌ để nguyên, báo cáo |

Ngoại lệ bổ sung: nếu Category ứng viên có `isActive = false`, `autoMigrate = NO`
kể cả khi khớp EXACT — cần nghiệp vụ xác nhận trước khi gán vào một ngành đã ngừng.

## 5. Bảng alias đã duyệt

```ts
const APPROVED_ALIASES: Record<string, string> = {
  'health & beauty': 'BEAUTY',
};
```

**Chỉ một entry**, và nó **không phải phỏng đoán**: ánh xạ
`'Health & Beauty': 'BEAUTY'` đã tồn tại sẵn trong repo tại
`apps/backend/prisma/scripts/migrate-categories.ts`, viết từ khi Category master
được đưa vào. CR này chỉ trích lại nó dưới dạng tường minh và có kiểm soát.

Những giá trị **cố ý KHÔNG** đưa vào alias:

| Giá trị | Lý do |
|---|---|
| `Supermarket` | Đã khớp EXACT với `Supermarket`, không cần alias |
| `Technology` | Đã khớp EXACT với `Technology` |
| `Beauty` (giả định) | Chia sẻ một từ với `Beauty & Wellness` **không đủ** để suy ra — phải NO_MATCH |

Thêm alias mới = một quyết định nghiệp vụ, phải review, không tự suy diễn.

## 6. Quy tắc riêng cho Customer — provenance

`Lead.customerId` là liên kết nguồn gốc có thẩm quyền (`createFromLead` ghi nó).
Nếu **mọi** Lead gắn với một Customer đều đã trỏ tới **cùng một** `categoryId`,
script dùng thẳng quan hệ đó thay vì so text — quan hệ mạnh hơn chuỗi ký tự.

Customer có các Lead **bất đồng** về category, hoặc không có Lead nào đã liên kết,
sẽ quay lại quy tắc text an toàn ở §4.

**Không bao giờ** suy diễn từ độ giống tên công ty / tenant.

## 7. Kết quả DRY RUN (môi trường dev `leasing_platform`, 2026-09-12)

```
=== CR-CRM-CATEGORY-MASTER-001 CRM category backfill (DRY RUN) ===

Category master records: 15

ENTITY    LEGACY VALUE     COUNT  CANDIDATE ID               CANDIDATE NAME     METHOD          CONF  AUTO  REASON
--------  ---------------  -----  -------------------------  -----------------  --------------  ----  ----  --------------------------------------
Lead      F&B              9      cmts3lde8002vbf8kz0ys4m1u  F&B                EXACT           HIGH  YES   Trung khop chinh xac Category.name
Lead      Fashion          5      cmts3ldeh002wbf8kmyo1fh95  Fashion            EXACT           HIGH  YES   Trung khop chinh xac Category.name
Lead      Entertainment    3      cmts3ldew002zbf8kajhenqic  Entertainment      EXACT           HIGH  YES   Trung khop chinh xac Category.name
Lead      Health & Beauty  2      cmts3ldem002xbf8kwbynme6t  Beauty & Wellness  APPROVED_ALIAS  HIGH  YES   Alias da duyet -> Category.code BEAUTY
Lead      Technology       1      cmts3lder002ybf8kdtt351vh  Technology         EXACT           HIGH  YES   Trung khop chinh xac Category.name
Lead      Supermarket      1      cmts3ldf70031bf8k5loek3tr  Supermarket        EXACT           HIGH  YES   Trung khop chinh xac Category.name
Customer  F&B              4      cmts3lde8002vbf8kz0ys4m1u  F&B                EXACT           HIGH  YES   Trung khop chinh xac Category.name
Customer  Health & Beauty  2      cmts3ldem002xbf8kwbynme6t  Beauty & Wellness  APPROVED_ALIAS  HIGH  YES   Alias da duyet -> Category.code BEAUTY
Customer  Fashion          2      cmts3ldeh002wbf8kmyo1fh95  Fashion            EXACT           HIGH  YES   Trung khop chinh xac Category.name
Customer  Entertainment    1      cmts3ldew002zbf8kajhenqic  Entertainment      EXACT           HIGH  YES   Trung khop chinh xac Category.name
Customer  Technology       1      cmts3lder002ybf8kdtt351vh  Technology         EXACT           HIGH  YES   Trung khop chinh xac Category.name

Lead     - total 21, auto 21, ambiguous 0, no-match 0
Customer - total 10, auto 10 (0 tu Lead lien ket), ambiguous 0, no-match 0
```

### Tóm tắt

| | Total | Auto-mappable | Ambiguous | No match |
|---|---|---|---|---|
| Lead | 21 | 21 | 0 | 0 |
| Customer | 10 | 10 | 0 | 0 |

`fromProvenance = 0` vì tại thời điểm dry-run **chưa** Lead nào có `categoryId`
(đúng như trạng thái trước CR). Sau `--apply` mọi Lead sẽ có FK, và một lần chạy
lại sẽ dùng provenance — nhưng lúc đó không còn Customer nào là candidate nữa.
Với dữ liệu hiện tại hai đường cho kết quả **giống hệt nhau**.

### Giá trị cần nghiệp vụ quyết định

**Không có.** Nếu môi trường khác (UAT/PROD) xuất hiện AMBIGUOUS hoặc NO_MATCH,
script sẽ **để nguyên** và in ra; xử lý bằng một trong hai cách:

1. Thêm Category tương ứng vào master (Admin → Ngành hàng), hoặc
2. Bổ sung alias vào `APPROVED_ALIASES` sau khi nghiệp vụ duyệt,

rồi chạy lại dry-run.

## 8. Thay đổi dữ liệu dự kiến khi `--apply`

- 21 `Lead`: set `categoryId`; `category` được ghi lại bằng tên master.
  → 19 dòng text **không đổi**, 2 dòng `Health & Beauty` → `Beauty & Wellness`.
- 10 `Customer`: set `preferredCategoryId`; tương tự, 2 dòng đổi text.

## 9. Script cũ đã bị thay thế

`apps/backend/prisma/scripts/migrate-categories.ts` **không được chạy nữa**. Nó:

- **tạo** Category master từ chuỗi legacy bất kỳ (`catString.toUpperCase().replace(...)`),
  sinh ra rác kiểu `HEALTH___BEAUTY` bên cạnh `BEAUTY` thật;
- không có dry-run;
- không phân biệt được ambiguous.

Script đã được thêm guard, sẽ từ chối chạy trừ khi truyền
`--i-understand-this-creates-categories`.

## 10. Test coverage

`apps/backend/src/modules/crm/crm-category-backfill.spec.ts` — CRM-CAT-014..019:
exact, case-only, approved alias, không fuzzy-match, ambiguous (2 dạng),
no-match, category inactive, idempotence, dry-run-by-default.
