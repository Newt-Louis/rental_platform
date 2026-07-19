# Báo cáo QC UX/UI — Leasing Platform UAT

**Ngày kiểm thử:** 19/07/2026  
**Môi trường:** `http://localhost:58080`, API `http://localhost:53000/api`  
**Phạm vi:** Announcements, Tenant Portal, Admin và các luồng điều hướng/phân quyền liên quan  
**Phương pháp:** kiểm thử HTTP/API theo vai trò trên dữ liệu UAT, đối chiếu giao diện và source code. Không thay đổi dữ liệu nghiệp vụ, không sửa mã nguồn.

## Tóm tắt điều hành

| Mức độ | Số lỗi |
|---|---:|
| Critical | 1 |
| High | 2 |
| Medium | 3 |
| Low | 1 |

UAT và health API đều phản hồi `200`; database và Redis ở trạng thái `up`. Rủi ro lớn nhất nằm ở quy trình thanh toán của Tenant Portal: khách thuê có thể ghi thẳng một payment vào sổ nghiệp vụ và làm đổi trạng thái hóa đơn mà không có bước Finance xác minh.

## Lỗi chi tiết

### QC-UI-001 — Tenant có thể tự ghi nhận thanh toán chính thức

- **Severity:** Critical
- **Khu vực:** Tenant Portal → Hóa đơn → Thanh toán
- **Bước tái hiện:**
  1. Đăng nhập bằng tài khoản tenant có hóa đơn `ISSUED` hoặc `OVERDUE`.
  2. Mở **Tenant Portal** → tab **Hóa đơn**.
  3. Chọn **Thanh toán**, nhập số tiền và xác nhận.
- **Actual:** Frontend gọi trực tiếp `POST /billing/invoices/:id/payment`. Backend cho vai trò `TENANT` gọi endpoint này, tạo bản ghi `payment` và chạy `recomputeInvoiceStatusFromPayments`, có thể chuyển hóa đơn sang `PARTIALLY_PAID` hoặc `PAID`.
- **Expected:** Tenant chỉ gửi **thông báo/chứng từ thanh toán** ở trạng thái `PENDING_VERIFICATION`; chỉ Finance/Admin mới được xác nhận và ghi payment chính thức.
- **Bằng chứng:**
  - `TenantPortalPage.tsx:428-485`, `:747`, `:935` hiển thị và thực thi `RecordPaymentDialog`.
  - `billing.controller.ts:114-128` không áp dụng `billingStaff` cho endpoint payment.
  - `billing.service.ts:257-327` tạo payment và tính lại trạng thái hóa đơn ngay.
- **Rủi ro:** Sai lệch AR, báo cáo doanh thu và đồng bộ SAP; tenant cũng có thể nhập số tiền vượt dư nợ vì service chưa chặn overpayment.
- **Đề xuất:** Tách `payment-submissions` khỏi `payments`; thêm workflow tải bằng chứng → Finance xác minh/từ chối → ghi payment với audit log và idempotency. Chặn tổng payment vượt balance nếu không phải credit/advance được phê duyệt.

### QC-UI-002 — Menu Tenant Portal được mở cho nhân viên nhưng các chức năng bên trong bị 403/không thao tác được

- **Severity:** High
- **Khu vực:** Menu Hệ thống → Tenant Portal
- **Vai trò tái hiện:** `LEASING_MANAGER` (`manager@thiso.com`)
- **Bước tái hiện:**
  1. Đăng nhập Leasing Manager.
  2. Mở **Tenant Portal** từ menu Hệ thống.
  3. Chuyển qua tab hóa đơn; bấm **Gửi yêu cầu hỗ trợ**.
- **Actual:** Route cho phép Manager mở trang nhưng API `/billing/invoices` trả `403`; form tạo ticket báo tài khoản chưa liên kết tenant vì nhân viên không có `tenantId`. Các khu vực khác có thể rỗng theo phạm vi Mall, tạo cảm giác hệ thống lỗi.
- **Expected:** Tenant Portal chỉ xuất hiện với tenant; hoặc với nhân viên phải có chế độ “Xem như tenant” và bắt buộc chọn tenant trước, tất cả API dùng cùng context.
- **Bằng chứng API:**
  - Manager: `/contracts` → `200`; `/tickets` → `200`; `/billing/invoices` → `403`; `/tickets/my-units` → `403`.
  - `permissions.ts:62` cấp Tenant Portal cho `ADMIN`, `MALL_DIRECTOR`, `LEASING_MANAGER`, `LEASING_EXECUTIVE`, `OPERATION` và `TENANT`.
  - `TenantPortalPage.tsx:105-109`, `:554` yêu cầu `user.tenantId` nhưng vẫn luôn hiển thị CTA tạo ticket.
- **Đề xuất:** Trước mắt chỉ cấp route/menu cho `TENANT`. Nếu nghiệp vụ cần staff support, xây “Tenant 360 / Impersonation read-only” có selector tenant, banner nhận diện rõ và audit log.

### QC-UI-003 — Tổng “chờ thanh toán” bỏ sót hóa đơn đã thanh toán một phần

- **Severity:** High
- **Khu vực:** Tenant Portal → thẻ KPI Tổng chờ thanh toán
- **Bước tái hiện:** Tạo hoặc dùng hóa đơn `PARTIALLY_PAID`, sau đó mở Tenant Portal.
- **Actual:** KPI chỉ cộng hóa đơn `ISSUED` và `OVERDUE`; toàn bộ dư nợ còn lại của `PARTIALLY_PAID` bị loại. Giá trị cũng cộng `totalAmount`, không trừ `totalPaid`.
- **Expected:** KPI phản ánh outstanding balance của mọi hóa đơn chưa tất toán: `totalAmount - activePayments`, bao gồm `PARTIALLY_PAID`.
- **Bằng chứng:** `TenantPortalPage.tsx:537-539`; mapping trạng thái `PARTIALLY_PAID` tồn tại tại dòng `60` nhưng không được đưa vào KPI/filter nhanh.
- **Đề xuất:** Backend trả trường `balance`; KPI cộng balance cho `ISSUED`, `OVERDUE`, `PARTIALLY_PAID`. Thêm filter “Thanh toán một phần”.

### QC-UI-004 — Bảng tài khoản Admin không dùng được hoàn toàn bằng bàn phím

- **Severity:** Medium
- **Khu vực:** Admin → Tài khoản
- **Bước tái hiện:** Mở trang bằng bàn phím, nhấn `Tab` để tìm cách mở chi tiết một tài khoản.
- **Actual:** Toàn bộ hàng dùng `<tr onClick>` nhưng không có `tabIndex`, role hoặc handler Enter/Space. Nút icon mở chi tiết không có accessible name.
- **Expected:** Hàng có thể focus và kích hoạt bằng Enter/Space, hoặc có link/nút “Xem chi tiết” với nhãn rõ ràng.
- **Bằng chứng:** `AdminPage.tsx:366`, `:377`.
- **Đề xuất:** Dùng `<button>`/`<Link>` trong cột hành động; thêm `aria-label="Xem chi tiết {fullName}"`, focus ring và không dùng row click làm đường thao tác duy nhất.

### QC-UI-005 — Nhiều nút icon Admin không có tên truy cập và vùng bấm quá nhỏ

- **Severity:** Medium
- **Khu vực:** Admin → Mall; Cấu trúc không gian
- **Bước tái hiện:** Dùng screen reader hoặc chỉ quan sát icon bút chì/thùng rác; thử thao tác trên màn hình cảm ứng.
- **Actual:** Các nút chỉ có icon, không `aria-label`; một số nút `h-7 w-7` (28px), thấp hơn vùng chạm khuyến nghị 44px.
- **Expected:** Tên thao tác và đối tượng được đọc rõ; vùng chạm tối thiểu khoảng 40–44px trên mobile.
- **Bằng chứng:** `AdminPage.tsx:741-746`, `:904-914`.
- **Đề xuất:** Thêm accessible label động, tooltip nhất quán và tăng vùng bấm; giữ icon là `aria-hidden`.

### QC-UI-006 — Khởi tạo Mall mặc định bằng setState ngay trong render

- **Severity:** Medium
- **Khu vực:** Admin → Cấu trúc không gian
- **Bước tái hiện:** Tải trực tiếp `/admin?section=structure` khi danh sách Mall được trả về lần đầu; quan sát React warning/Profiler và request/render lặp.
- **Actual:** Component gọi `setSelectedMallId(malls[0].id)` trực tiếp trong pha render.
- **Expected:** Khởi tạo selection trong `useEffect`, hoặc suy ra `effectiveMallId` không tạo side effect khi render.
- **Bằng chứng:** `AdminPage.tsx:987`.
- **Rủi ro UX:** Render thừa, warning trong React và hành vi khó đoán khi danh sách Mall đổi.

### QC-UI-007 — Bộ lọc Announcements thiếu trạng thái thời gian và tìm kiếm

- **Severity:** Low
- **Khu vực:** Announcements
- **Bước tái hiện:** Đăng nhập staff, mở danh sách có nhiều thông báo; cần tìm một thông báo cũ/đã hết hạn hoặc đã lên lịch.
- **Actual:** Chỉ lọc theo category; không có tìm kiếm, trạng thái “Đang hiển thị / Đã lên lịch / Hết hạn” hay khoảng ngày. Người dùng phải đọc tuần tự và mở rộng từng item.
- **Expected:** Có tìm kiếm theo tiêu đề/nội dung, filter trạng thái và ngày; staff thấy status chip rõ ràng và tenant chỉ thấy nội dung hiện hành.
- **Bằng chứng:** `AnnouncementsPage.tsx:166-187` chỉ triển khai category filter.

## Ma trận smoke test API

| Vai trò | Contracts | Billing invoices | Tickets | Announcements | Announcements admin | My units |
|---|---:|---:|---:|---:|---:|---:|
| Admin | 200 | 200 | 200 | 200 | 200 | 400 |
| Leasing Manager | 200 | **403** | 200 | 200 | 200 | 403 |
| Tenant Highlands | 200 | 200 | 200 | 200 | 403 | 200 |

Điểm đạt: tenant bị chặn khỏi `/announcements/admin`; endpoint `/tickets/my-units` của tenant trả đúng dữ liệu unit; API health, database và Redis hoạt động.

## Thứ tự xử lý đề xuất

1. Khóa quyền ghi payment của tenant và xây workflow xác minh thanh toán.
2. Quyết định rõ đối tượng của Tenant Portal, đồng bộ route/menu/API theo cùng một mô hình quyền.
3. Sửa cách tính outstanding balance và bổ sung trạng thái thanh toán một phần.
4. Hoàn thiện keyboard/screen-reader/touch target cho Admin.
5. Cải thiện công cụ tra cứu Announcements.

## Ghi chú giới hạn

Phiên QC này không có browser automation package trong frontend; bằng chứng thao tác được đối chiếu bằng API UAT và source đang phục vụ. Không thực hiện mutation trên dữ liệu UAT để tránh làm thay đổi hóa đơn, thanh toán hoặc cấu hình quản trị.
