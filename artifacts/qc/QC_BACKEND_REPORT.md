# Báo cáo QC Backend & Security

**Môi trường:** UAT local `http://localhost:53000/api`  
**Thời điểm:** 19/07/2026 (Asia/Saigon)  
**Phạm vi:** RBAC Super Admin/Tenant, data scoping, validation và workflow Announcements, Tenant Portal, Admin, Tickets, Approvals.  
**Nguyên tắc:** Chỉ kiểm thử đọc hoặc payload không hợp lệ; không thay đổi dữ liệu UAT. Token và thông tin xác thực đã được loại khỏi bằng chứng.

## Kết luận điều hành

- Backend unit/integration test: **44/44 suites đạt, 198/198 tests đạt**.
- Health check: database và Redis `up`; AI, email và SAP đang `disabled` theo cấu hình UAT.
- RBAC lõi của Users, Approvals và Announcements hoạt động đúng trong các ca đã kiểm tra.
- Data scoping danh sách/chi tiết của Tickets, Contracts, Invoices và Fitout hoạt động đúng ở endpoint chính.
- Phát hiện **4 lỗi cần xử lý**, trong đó có một lỗi Critical liên quan quyền tenant thay đổi SLA toàn hệ thống và một lỗi High liên quan IDOR ở API phụ của ticket.

## Ma trận kiểm thử đạt

| Ca kiểm thử | Kết quả |
|---|---|
| Không token gọi `GET /users` | `401` |
| Tenant gọi `GET /users` | `403` |
| Tenant gọi `GET /approvals/pending` | `403` |
| Tenant gọi `GET /announcements/admin` | `403` |
| Tenant gọi `POST /announcements` | `403` |
| Admin gọi `GET /users`, `/approvals/pending`, `/tickets/stats` | `200` |
| Tenant lấy unit qua `GET /tickets/my-units` | `200`, chỉ unit đang thuê |
| Tenant xem danh sách Tickets/Contracts/Invoices/Fitouts | `200`, toàn bộ `tenantId` khớp tenant đăng nhập |
| Tenant dùng ID của tenant khác tại endpoint chi tiết chính | `GET /tickets/:id`, `/contracts/:id`, `/billing/invoices/:id`, `/fitouts/:id` đều `403` |
| Admin gửi payload rỗng khi tạo Announcement/User | `400`, không tạo dữ liệu |
| Tenant gửi payload rỗng khi tạo Ticket | `400`, không tạo dữ liệu |

## Lỗi phát hiện

### QC-BE-001 — Tenant có quyền gọi API thay đổi SLA toàn hệ thống

**Severity: Critical**  
**Phân hệ:** Tickets / SLA / RBAC

Controller đặt `@Roles(...MODULE_ROLES.tickets)` ở cấp lớp và không giới hạn riêng `POST /tickets/sla/policies`. Do `TENANT` thuộc quyền module Tickets, tenant đi qua guard và tới service cập nhật cấu hình SLA. Payload rỗng trả `500` thay vì `403`, chứng minh request đã đi vào luồng xử lý nghiệp vụ.

**Tái hiện**

```http
POST /api/tickets/sla/policies
Authorization: Bearer [REDACTED_TENANT_TOKEN]
Content-Type: application/json

{}
```

**Response**

```http
HTTP/1.1 500 Internal Server Error
```

Ngoài ra tenant đọc được cấu hình và KPI toàn hệ thống:

```http
GET /api/tickets/sla/policies   -> 200
GET /api/tickets/sla/stats      -> 200
GET /api/tickets/ratings/summary -> 200
```

**Rủi ro:** Tenant có thể gửi payload hợp lệ để thay đổi response/resolution time hoặc escalation role, tác động mọi Mall và làm sai cam kết vận hành.

**Đề xuất:** Gắn role riêng cho endpoint ghi SLA, tối thiểu `ADMIN`, `OPERATION`, `MALL_DIRECTOR`; cân nhắc chỉ `ADMIN`. Giới hạn endpoint thống kê cho staff. Thêm e2e test khẳng định tenant luôn nhận `403` trước khi service được gọi.

### QC-BE-002 — IDOR tại escalation và rating của ticket

**Severity: High**  
**Phân hệ:** Tickets / Data scoping

Các route phụ không gọi `validateTicket` và service không nhận current user. Tenant có thể truyền ID ticket của tenant khác và nhận `200`.

**Tái hiện**

```http
GET /api/tickets/{FOREIGN_TICKET_ID}/escalations
Authorization: Bearer [REDACTED_TENANT_TOKEN]

HTTP/1.1 200 OK
{"success":true,"data":[]}
```

```http
GET /api/tickets/{FOREIGN_TICKET_ID}/rating
Authorization: Bearer [REDACTED_TENANT_TOKEN]

HTTP/1.1 200 OK
{"success":true,"data":null}
```

Endpoint `POST /tickets/:id/rate` cũng không kiểm tra ownership tại controller; không gửi payload hợp lệ để tránh làm thay đổi UAT.

**Rủi ro:** Khi ticket có escalation/rating, tenant có thể đọc dữ liệu ticket khác; endpoint rate có khả năng cho phép ghi chéo tenant.

**Đề xuất:** Gọi `validateTicket(user, id)` cho cả `getEscalations`, `rateTicket`, `getTicketRating`; truyền current user xuống service và kiểm tra ownership lần hai. Thêm e2e test với hai tenant độc lập.

### QC-BE-003 — Tenant xem và có bề mặt thao tác lịch bảo trì cấp Mall

**Severity: High**  
**Phân hệ:** Tickets / Maintenance / RBAC

```http
GET /api/tickets/maintenance
Authorization: Bearer [REDACTED_TENANT_TOKEN]

HTTP/1.1 200 OK
{"success":true,"data":{"data":[{"id":"...","mallId":"..."}]}}
```

Các endpoint tạo, sửa, start và complete maintenance không có role restriction riêng; chúng chỉ xác thực mall/unit access. Tenant cùng Mall vì vậy có bề mặt quyền vận hành không phù hợp. Payload rỗng tới `POST /tickets/maintenance` trả `400`, không phải `403`.

**Rủi ro:** Lộ kế hoạch bảo trì của Mall; tenant có khả năng tạo hoặc thay đổi chu kỳ/trạng thái/evidence của kế hoạch nếu payload hợp lệ.

**Đề xuất:** Giới hạn list/create/update/start/complete maintenance cho `ADMIN`, `OPERATION`, `MALL_DIRECTOR` và nhóm kỹ thuật được định nghĩa rõ. Nếu tenant cần xem lịch ảnh hưởng unit, tạo endpoint read-only riêng và scope theo unit/tenant.

### QC-BE-004 — Payload SLA không hợp lệ gây lỗi 500

**Severity: Medium**  
**Phân hệ:** Validation / Error handling

Payload `{}` tại `POST /tickets/sla/policies` trả `500` thay vì `400` với danh sách trường không hợp lệ. Route đang dùng inline object type, không có DTO/class-validator runtime.

**Rủi ro:** Trải nghiệm API kém, log lỗi nhiễu và tăng bề mặt DoS bằng request sai định dạng.

**Đề xuất:** Tạo `UpsertTicketSlaPolicyDto` với enum và ràng buộc số dương; trả error envelope chuẩn `400`. Áp dụng cùng nguyên tắc cho maintenance DTO và JSON `checklistResult` để tránh `JSON.parse` ném lỗi ngoài kiểm soát.

## Nhận xét độ phủ kiểm thử

198 test hiện tại đều đạt nhưng chưa bắt được các lỗi RBAC ở route phụ. Cần bổ sung suite e2e theo ma trận `role × endpoint × own/foreign resource`, đặc biệt:

1. Tenant không thể gọi mọi endpoint cấu hình và vận hành SLA/maintenance.
2. Tenant không thể đọc/ghi escalation và rating của ticket khác.
3. Super Admin vẫn truy cập toàn bộ endpoint staff sau khi siết role.
4. Payload sai phải trả `400`, không được trả `500`.
5. Kiểm thử hai tenant thuộc cùng Mall để tránh nhầm mall-level access với tenant ownership.

## Thứ tự khắc phục đề xuất

1. **P0:** Chặn tenant khỏi `POST /tickets/sla/policies`.
2. **P0:** Bổ sung ownership guard cho escalation/rating.
3. **P1:** Siết toàn bộ maintenance workflow về nhóm staff và cung cấp read-only tenant endpoint nếu cần.
4. **P1:** Chuẩn hóa DTO/validation và bổ sung e2e regression test.

