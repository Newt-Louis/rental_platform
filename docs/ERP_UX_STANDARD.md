# ERP UX Standard

## Goal

Every page must answer four questions immediately:

1. Where am I in the business process?
2. What requires my attention?
3. What is the recommended next action?
4. What will happen if I press this button?

## Action hierarchy

- One primary action per page or dialog.
- Secondary actions use outline/secondary styling.
- Navigation or low-priority actions use ghost styling.
- Destructive and irreversible actions use destructive styling and confirmation.
- Icon-only buttons require a Vietnamese `aria-label` and tooltip/title.
- Buttons performing API calls show a pending label and cannot be clicked twice.

## Naming rules

Use business outcomes instead of technical verbs:

| Avoid | Use |
|---|---|
| Save | Lưu thay đổi |
| Submit | Gửi phê duyệt / Gửi báo cáo |
| Update | Cập nhật khách hàng / Cập nhật trạng thái |
| Convert | Tạo đề xuất từ booking |
| Close | Hoàn tất vấn đề / Đóng hộp thoại |
| Sync | Đồng bộ sang SAP |
| Run | Chạy tính phí phạt / Tạo hóa đơn đến hạn |

Labels must use one language per screen. Technical codes may appear as secondary
metadata, not as the main user-facing label.

## Workflow screens

- Display current status in Vietnamese and state who owns the next action.
- Explain prerequisites before disabling an action.
- Show the recommended next step near the record header.
- Record history and comments separately from editable fields.
- Approval actions require decision context; rejection requires a reason.
- Do not allow users to select arbitrary backend statuses when a controlled
  transition action is expected.

## List and dashboard screens

- Header: page title, one-sentence purpose and primary action.
- First section: items needing attention, not decorative KPIs.
- Filters show active-filter count and provide “Xóa bộ lọc”.
- Empty state explains why the list is empty and offers a relevant action.
- Loading uses skeletons; API failure offers retry.
- Bulk actions appear only after selection and show the selected count.

## Forms

- Group fields according to the business decision.
- Required fields have visible labels; placeholders are examples, not labels.
- Validation is displayed next to the affected field.
- Currency, area, dates and percentages include units.
- Unsaved changes are confirmed before closing complex forms.
- Success messages state the result and the next available action.

## ERP process guide

Internal users see the end-to-end path:

`Khách hàng → Giữ mặt bằng → Đề xuất thuê → Phê duyệt → Hợp đồng → Fitout → Vận hành → Thu phí`

Only steps available to the current role are displayed. The active step uses
`aria-current="step"` and completed preceding steps are visually distinguished.

## Mobile and accessibility

- Touch targets are at least 36×36 px, preferably 44×44 px for primary actions.
- Tab bars and process steps scroll horizontally instead of compressing labels.
- Dialogs have title, description and a Vietnamese close label.
- Color is never the only status indicator.
- Keyboard focus is visible and follows the visual order.
- Tables provide a card/list fallback when horizontal comparison is unnecessary.

## Definition of done

- A first-time user can identify the primary action without training.
- Dangerous actions cannot be triggered accidentally.
- Every asynchronous action has loading, success and error feedback.
- Empty, loading, error and permission-denied states are designed.
- Desktop and mobile flows are usable.
- Labels follow the terminology standard.
- Unit tests cover permission navigation and critical interaction rules.
