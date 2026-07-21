# Cột "Quyền truy cập Mall" trong bảng Users (admin?section=users)

## Bối cảnh

Trang Admin > Users (`apps/frontend/src/pages/admin/AdminPage.tsx`, component `UsersTab`) hiện hiển thị bảng tài khoản với các cột: Họ tên, Email, Phòng ban, Vai trò, Trạng thái. Không có cách nào để biết nhanh một user đang có quyền truy cập vào (những) Mall nào mà không mở dialog chỉnh sửa từng user.

API `GET /users` hiện đã tự động lọc theo `activeMallId` (mall mà chính admin đang chọn ở mall switcher trên header), nhưng hành vi này ẩn, không hiển thị rõ cho người dùng và không phải trọng tâm của thay đổi này.

## Mục tiêu

Thêm một cột hiển thị trong bảng Users cho biết user đó đang có quyền truy cập Mall nào, dựa trên dữ liệu `UserMallAccess` (model đã có sẵn trong `schema.prisma`).

## Ngoài phạm vi (Out of scope)

- Không thêm dropdown filter theo Mall trên trang Users. Việc lọc theo mall vẫn dựa vào mall switcher trên header (`activeMallId`) như hiện tại, không thay đổi.
- Không thay đổi DTO/query param của `GET /users`.
- Không thay đổi UI chỉnh sửa mall access trong `UserDialog` (phần "Quyền truy cập Mall" đã có sẵn khi tạo/sửa user).

## Thiết kế

### Backend — `apps/backend/src/modules/users/users.service.ts`

Trong `UsersService.findAll()`, bổ sung quan hệ `mallAccess` vào `select` của `prisma.user.findMany`:

```ts
select: {
  id: true,
  email: true,
  fullName: true,
  role: true,
  phone: true,
  avatar: true,
  department: true,
  tenantId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  mallAccess: {
    where: { isActive: true },
    select: { role: true, mall: { select: { id: true, name: true } } },
  },
},
```

Không thay đổi `where` clause, DTO (`ListUsersDto`), hay controller — filter theo `activeMallId` giữ nguyên như hiện tại.

### Frontend — types

`apps/frontend/src/types/index.ts`, mở rộng `User`:

```ts
export interface User {
  // ...existing fields
  mallAccess?: { role: string; mall: { id: string; name: string } }[];
}
```

### Frontend — `apps/frontend/src/pages/admin/AdminPage.tsx` (`UsersTab`)

Thêm cột "Quyền truy cập Mall" vào `<thead>` và `<tbody>` của bảng, chèn giữa cột Vai trò và Trạng thái.

Logic render theo role của user (`MALL_ACCESS_ROLES` đã định nghĩa sẵn ở dòng ~342: `['MALL_DIRECTOR', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'FINANCE', 'LEGAL', 'OPERATION']`):

- **Role thuộc `MALL_ACCESS_ROLES`**: render danh sách badge nhỏ, mỗi badge = icon `Building2` (size 11) + tên mall, style tương tự badge mall đã dùng trong `UserDialog` (border-blue-100/bg-blue-50). Nếu `mallAccess` rỗng → text xám nhỏ "Chưa gán".
- **Role `ADMIN` hoặc `CEO`**: badge tím nhạt, text "Toàn hệ thống" (không phụ thuộc `mallAccess`, vì 2 role này có quyền toàn cục).
- **Role `TENANT`**: hiển thị "—" (không áp dụng mall access, họ gắn với `tenantId`).

## Edge cases

- User có `mallAccess` rỗng nhưng role thuộc `MALL_ACCESS_ROLES` (chưa được gán mall nào) → "Chưa gán", giúp admin nhận ra ngay user này chưa hoạt động được ở mall nào.
- User có nhiều mall access → hiển thị nhiều badge, wrap dòng nếu cần (dùng `flex flex-wrap gap-1`).
- Không cần phân trang/scroll riêng cho cột này vì số mall trên thực tế nhỏ (không quá vài đơn vị).

## Kiểm thử

- Kiểm tra thủ công trên trình duyệt: mở `admin?section=users`, xác nhận cột mới hiển thị đúng cho từng loại role (ADMIN, CEO, TENANT, và một role thuộc `MALL_ACCESS_ROLES` có/không có mall access).
- Không cần test tự động mới (thay đổi thuần hiển thị, không có logic nghiệp vụ phức tạp); nếu có test hiện hữu cho `UsersService.findAll` hoặc `UsersTab`, đảm bảo chúng vẫn pass.
