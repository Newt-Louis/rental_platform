# Auto-fill & khóa field "Phụ trách" khi Tạo Lead/Khách hàng

## Bối cảnh

Dialog tạo Lead/Khách hàng (`UnifiedAddDialog` trong `apps/frontend/src/pages/crm/CrmPage.tsx`) có field "Phụ trách" (`assignedToId`) dùng chung cho cả 2 mode (Lead và Customer). Hiện tại field này là `<select>` để trống mặc định, cho phép chọn bất kỳ user nào trong danh sách `usersApi.listUsers`.

Yêu cầu nghiệp vụ: người tạo Lead/Customer mặc định là người phụ trách, và nhân viên vai trò Leasing Executive không được gán việc cho người khác (không tự đẩy việc cho đồng nghiệp).

## Mục tiêu

- Field "Phụ trách" tự động điền tên account đang tạo Lead/Customer.
- Nếu account có vai trò `LEASING_EXECUTIVE`: field bị khóa — ẩn dropdown, chỉ hiển thị text tĩnh tên chính mình, không cho chọn người khác.
- Các vai trò còn lại: vẫn là dropdown, mặc định chọn sẵn chính mình, nhưng chọn được người khác trong danh sách.

## Ngoài phạm vi (Out of scope)

- Không thay đổi `LeadEditDialog` (sửa Lead đã tồn tại) — dialog đó vẫn cho mọi vai trò tự do đổi Phụ trách để hỗ trợ chuyển giao lead.
- Không thay đổi API/DTO của `createLead`/`createCustomer` — chỉ đổi giá trị mặc định và điều kiện hiển thị ở frontend.
- Không thay đổi danh sách user trả về từ `usersApi.listUsers` (vẫn load toàn bộ như hiện tại).

## Thiết kế

### `apps/frontend/src/pages/crm/CrmPage.tsx` — `UnifiedAddDialog`

Lấy user hiện tại:

```ts
const { user } = useAuthStore();
```

Khởi tạo state mặc định bằng chính mình thay vì rỗng:

```ts
const [assignedToId, setAssignedToId] = useState(user?.id ?? '');
```

Thêm cờ xác định vai trò bị khóa:

```ts
const isSelfOnly = user?.role === 'LEASING_EXECUTIVE';
```

Trong khối field "Phụ trách" (hiện ở dòng ~387-393), render có điều kiện:

- Nếu `isSelfOnly`: không render `<select>`, thay bằng đoạn text tĩnh dùng key i18n mới `fieldAssigneeSelf` (vd: "Phụ trách: {{name}} (bạn)"), giá trị `assignedToId` không đổi (đã set sẵn = `user.id` và không có setter nào khác gọi tới trong nhánh này nên tự động giữ nguyên).
- Nếu không: giữ nguyên `<select>` hiện tại, chỉ khác giá trị khởi tạo (đã set ở bước trên).

Không cần thay đổi mutation `createLead`/`createCustomer` — cả hai đã dùng `assignedToId || undefined` từ state, vẫn hoạt động đúng vì state luôn có giá trị hợp lệ (id của chính user).

### i18n

Thêm key mới vào `apps/frontend/src/locales/vi/crm.json` và `en/crm.json`, trong namespace `addDialog`:

```json
"fieldAssigneeSelf": "Phụ trách: {{name}} (bạn)"   // vi
"fieldAssigneeSelf": "Assigned to: {{name}} (you)"  // en
```

## Edge cases

- User chưa đăng nhập / `user` null (không nên xảy ra vì dialog nằm sau route bảo vệ auth) → `assignedToId` fallback về `''`, giữ hành vi cũ (dropdown hiển thị, không có ai được chọn sẵn).
- Vai trò `LEASING_EXECUTIVE` mở dialog nhiều lần (đóng rồi mở lại) → mỗi lần `UnifiedAddDialog` mount lại, `useState` khởi tạo lại đúng `user.id`, không bị dính giá trị cũ.
- Vai trò khác chọn người khác rồi đổi ý muốn quay lại chính mình → vẫn chọn được vì mình cũng nằm trong danh sách `users` (API trả về toàn bộ user, gồm cả bản thân).

## Kiểm thử

- Kiểm tra thủ công trên trình duyệt:
  - Đăng nhập bằng account role `LEASING_EXECUTIVE` → mở dialog Tạo Lead và Tạo Customer, xác nhận field "Phụ trách" hiển thị text tĩnh tên chính mình, không có dropdown.
  - Đăng nhập bằng account role khác (vd. `LEASING_MANAGER`) → xác nhận dropdown hiển thị, mặc định chọn sẵn chính mình, chọn được người khác.
  - Submit tạo Lead ở cả 2 trường hợp, xác nhận `assignedToId` gửi lên đúng.
- Không cần test tự động mới trừ khi project đã có test hiện hữu cho `CrmPage`/`UnifiedAddDialog` — nếu có, đảm bảo vẫn pass.
