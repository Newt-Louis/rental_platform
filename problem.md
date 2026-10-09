# problem.md — vấn đề đã phát hiện, cần audit lại

File này ghi các vấn đề **phát hiện trong lúc làm module cho thuê ngắn hạn** nhưng không nằm trong requirement
gốc (5 nhóm: quản lý mặt bằng, booking, thời gian thuê, phê duyệt, hợp đồng), để audit sau.
Mỗi mục có: hiện trạng, bằng chứng, trạng thái xử lý, cách kiểm tra lại.

Trạng thái: `OPEN` (chưa xử lý) · `MITIGATED` (đã giảm thiểu, cần audit) · `FIXED`.

---

## PRB-001 — Hóa đơn của hợp đồng ngắn hạn bị tính sai (lịch thanh toán hàng tháng chia theo ngày) — `MITIGATED`

**Không có trong requirement.** Requirement không đề cập thanh toán / hóa đơn. Đây là lỗi có sẵn từ luồng
"booking ngắn hạn → Proposal → hợp đồng" của hệ thống (trước khi làm lại module), không phải do phần làm mới.

### Nguyên nhân
Hợp đồng sinh từ booking ngắn hạn đi qua đường billing của hợp đồng **dài hạn**, vốn tính tiền thuê **theo tháng, chia theo số ngày**:

1. `apps/backend/src/modules/slots/slots.service.ts` — `convertToProposal`: đặt `monthlyRent = totalAmount` (giá **trọn gói** của booking) như thể là tiền thuê một tháng.
2. `apps/backend/src/modules/proposals/proposals.service.ts` — `createContractFromProposal`: hợp đồng lấy `rent` từ `monthlyRent` đó.
3. `apps/backend/src/modules/billing/billing-schedule.util.ts` — `generateBillingPeriods`: chia `rent` theo số ngày trong từng tháng.

### Bằng chứng (đã chạy thử `generateBillingPeriods`, rent = 1.000.000, chu kỳ MONTHLY)
| Hợp đồng | Hóa đơn sinh ra | Đúng phải là |
|---|---|---|
| 2 ngày trong một tháng | 66.667 | 1.000.000 |
| 2 ngày vắt qua hai tháng | 33.333 + 32.258 = 65.591 | 1.000.000 |
| 40 ngày | 1.000.000 + 322.581 = 1.322.581 | 1.000.000 |

Nghĩa là hóa đơn có thể thấp hơn nhiều hoặc cao hơn số tiền đã thỏa thuận.

### Xử lý đã làm (cần audit)
- `billing-schedule.service.ts` — `buildScheduleForContractUnsafe`: nếu hợp đồng có `proposal.slotBookingId` thì **không tạo lịch thanh toán hàng tháng** (trả `skipped: 'SHORT_TERM_BOOKING'`).
- `billing.service.ts`: nguồn công nợ `SHORT_TERM_BOOKING` nhận thêm trạng thái `CONTRACTED` (trước chỉ `CONFIRMED`/`COMPLETED`), cả ở danh sách công nợ chờ xuất hóa đơn và khi tạo hóa đơn → hóa đơn xuất **một lần** bằng tổng tiền booking, kèm VAT 10%.
- `common/utils/lease-term-analytics.ts`: doanh thu ngắn hạn tính cả booking `CONTRACTED`.
- Test: `billing-schedule.service.spec.ts` (2 test mới), `e2e/short-term-billing-chain.spec.ts` (chuỗi thật đến hóa đơn).

### Cần audit lại
- [ ] Kế toán xác nhận hướng "một hóa đơn trọn gói, VAT 10%" đúng nghiệp vụ (hiện VAT 10% là hằng số có sẵn ở `billing.service.ts`, không cấu hình được).
- [ ] Hóa đơn xuất khi nào: hiện `dueDate = startDatetime` của booking; có cần cọc / thanh toán trước / chia đợt?
- [ ] Doanh thu ngắn hạn trên dashboard: đã gồm `CONTRACTED`; xác nhận không đếm trùng với `CONFIRMED` (booking đi theo luồng mới không qua `CONFIRMED`).
- [ ] Booking cũ đã `CONVERTED`/hợp đồng ngắn hạn tạo **trước** bản sửa có thể đã có lịch thanh toán hàng tháng — kiểm tra bảng `BillingScheduleEntry` của các hợp đồng có `proposal.slotBookingId`.

### Cách kiểm tra lại
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend npx jest src/modules/billing/billing-schedule.service
E2E_FULL_CHAIN=1 npx playwright test e2e/short-term-billing-chain.spec.ts   # tạo hồ sơ không xóa được qua API
```

---

## PRB-002 — Hợp đồng ngắn hạn không thể kích hoạt (ACTIVE) — `OPEN`

**Không có trong requirement** (requirement dừng ở "hợp đồng được xác lập → slot ghi nhận đã khai thác", phần đó đã làm: booking → `CONTRACTED`).

### Hiện trạng
`GET /contracts/:id/activation-readiness` của hợp đồng sinh từ booking ngắn hạn trả:
`Unit must be CONTRACTED before activation (current: VACANT)`.

- `apps/backend/src/modules/contracts/contracts.service.ts` (~dòng 100): điều kiện `contract.unit.status === CONTRACTED` áp dụng cho **mọi** hợp đồng, không có ngoại lệ cho unit `SHORT`.
- Unit ngắn hạn cố ý **không** chuyển `CONTRACTED` (một unit chứa nhiều hợp đồng đồng thời — xem `proposals.service.ts`, nhánh `leaseTermType !== 'SHORT'`), nên điều kiện này không bao giờ thỏa.

### Hệ quả
Hợp đồng ngắn hạn kẹt ở `DRAFT`. Hóa đơn vẫn xuất được vì đi thẳng từ booking `CONTRACTED` (PRB-001), nhưng các luồng phụ thuộc hợp đồng `ACTIVE` (tình trạng hợp đồng, báo cáo, hết hạn…) không chạy cho hợp đồng ngắn hạn.

### Việc cần làm
- [ ] Quyết định nghiệp vụ: hợp đồng ngắn hạn có cần `ACTIVE`? Nếu có, bỏ/điều chỉnh điều kiện "Unit must be CONTRACTED" cho unit `SHORT` (thay bằng: slot/booking còn hiệu lực).
- [ ] Nếu cho `ACTIVE`: đảm bảo `buildScheduleForContract` (đã skip) và `contract.activated` (outbox) không tạo hóa đơn / lịch bàn giao sai cho hợp đồng ngắn hạn.

---

## PRB-003 — Booking ngắn hạn xuất hóa đơn trực tiếp còn hai đường song song — `OPEN` (rủi ro trùng hóa đơn)

Hiện có **hai nguồn** có thể xuất hóa đơn cho cùng một giao dịch ngắn hạn:
1. Nguồn `SHORT_TERM_BOOKING` (từ `SlotBooking`, `ST-BOOKING-<id>`) — đường đã được sửa ở PRB-001.
2. Lịch thanh toán theo hợp đồng (`BillingScheduleEntry`) — đã bị chặn cho hợp đồng ngắn hạn.

Nếu sau này bỏ chặn (1) hoặc mở lại (2) mà không bỏ cái còn lại thì sẽ **xuất trùng hóa đơn**. Hóa đơn nguồn booking có khóa chống trùng `ST-BOOKING-<bookingId>` + kiểm tra `sourceType/sourceId`, nhưng không có ràng buộc chéo với hóa đơn theo hợp đồng.
- [ ] Khi audit: xác nhận chỉ còn **một** đường xuất hóa đơn cho hợp đồng ngắn hạn, và thêm ràng buộc/kiểm tra chéo nếu cần.

---

## Ghi chú vận hành (không phải lỗi, nhưng dễ vấp)
- **Docker dev không tự biên dịch lại controller mới** (chế độ watch trên bind mount Windows): route mới trả 404 cho đến khi `docker compose ... restart backend`.
- **`schema.prisma` chỉ được dùng ký tự ASCII** (comment không dấu): ký tự có dấu làm `prisma generate` lỗi `Invalid character`.
- **E2E `short-term-booking-approval.spec.ts`** mỗi lần chạy để lại một mặt bằng thử đã vô hiệu (`E2E-xxxxx`, `isActive=false`).
- **`proposal-send-permission.spec.ts`** có 3 test đỏ sẵn từ trước (độc lập với module ngắn hạn).
