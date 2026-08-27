# Design: Widen Unit Popup + Editable Info Tab

Date: 2026-07-22

## Problem

Two related UX gaps in the mặt bằng (unit/space) editing flow:

1. `CreateEditUnitDialog` (used for both "Tạo mặt bằng" and "Sửa mặt bằng") is `max-w-lg` (~512px) and stacks every field in a single column, making it feel cramped for ~15 fields.
2. `UnitDetailSheet`'s "Thông tin" tab shows only a subset of the unit's fields, entirely read-only (except a status dropdown). To edit anything else, the user must leave the detail panel and open the separate popup dialog.

## Goals

- Widen the popup and lay out its fields more efficiently.
- Let users view and edit the full field set directly inside the "Thông tin" tab of the detail sheet, without needing to open the popup.
- Avoid duplicating the ~15-field form across two components.

## Non-goals

- No changes to the backend DTO, API contracts, or validation rules.
- No changes to the "ĐỔI TRẠNG THÁI" quick status-change flow (kept separate, with its history tracking).
- No changes to the Kanban/list "Sửa" entry point, which continues to open the popup dialog.

## Part 1: Widen `CreateEditUnitDialog`

File: `apps/frontend/src/components/spaces/dialogs/CreateEditUnitDialog.tsx`

- `DialogContent` className: `max-w-lg max-h-[90vh] overflow-y-auto` → `max-w-3xl max-h-[90vh] overflow-y-auto`.
- Replace the stacked single-column field layout with a responsive grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`.
- Field grouping (each bullet = one grid row):
  - Mã mặt bằng | Tên
  - Tầng | Khu vực | Ngành hàng
  - Trạng thái (own row, remains in the popup only)
  - Diện tích GFA | Diện tích NLA
  - Giá thuê cơ bản | Phí CAM
  - Loại sảnh | Tier | Hình thức thuê
  - Checkbox "Sảnh linh động" (full width)
  - minFlexArea | maxFlexArea (conditional on the checkbox, side by side)
- Pure layout/CSS change — no changes to field logic, validation, or submit behavior.
- The secondary "unsaved changes" confirm dialog (`max-w-sm`) is unaffected.

## Part 2: Editable "Thông tin" tab in `UnitDetailSheet`

### Shared form fields component

Extract the field-set currently inline in `CreateEditUnitDialog` into a new presentational component:

`apps/frontend/src/components/spaces/dialogs/UnitFormFields.tsx`

- Props: `register`, `control`, `errors`, `watch` (react-hook-form bindings) plus the option lists already used today (floors, zones filtered by floor, categories, `STATUS_CONFIG`, `SPACE_TYPE_OPTIONS`, `TIER_OPTIONS`, `LEASE_TERM_OPTIONS`).
- Renders the grid layout from Part 1.
- Trạng thái is NOT part of this shared component — it stays only in `CreateEditUnitDialog` (per the decision to keep status changes going through the separate "ĐỔI TRẠNG THÁI" flow with history tracking).
- `CreateEditUnitDialog` is refactored to render `<UnitFormFields ... />` plus its own Trạng thái field, instead of its current inline JSX. No behavior change for the popup.

### `UnitDetailSheet` changes

File: `apps/frontend/src/components/spaces/UnitDetailSheet.tsx`

- New local state: `isEditingInfo: boolean` (default `false`).
- New `useForm` instance scoped to the sheet, initialized from the selected `unit` when edit-mode is entered.
- "Sửa" button behavior inside the sheet changes: instead of calling `onEdit(unit)` (which today triggers `SpacesPage` to open the popup), it sets `isEditingInfo = true` and the button label switches to "Hủy" (cancel).
- While `isEditingInfo` is true, a "Lưu" (save) button appears next to "Hủy".
  - "Lưu" submits via `spacesApi.updateUnit(unit.id, payload)` — the same call the popup already uses.
  - On success: exit edit-mode, refresh the unit data shown in the sheet (existing query invalidation pattern), matching how `statusMutation` already refreshes data in this file.
  - On error: show an inline/toast error (matching existing mutation error handling in this file) and remain in edit-mode so the user doesn't lose their input.
  - "Hủy" discards the form state and exits edit-mode without saving.
- Rendering: the existing "THÔNG TIN MẶT BẰNG" `SheetSection` (read-only `SheetRow`s) is shown when `!isEditingInfo`; when `isEditingInfo` is true, that block is replaced by `<UnitFormFields ... />` bound to the sheet's local form.
- All other sections in the Info tab (slot booking summary, "ĐỔI TRẠNG THÁI", "THÔNG TIN SẢNH GỘP", "KHÁCH THUÊ HIỆN TẠI", "THỜI HẠN THUÊ", active contracts, sales pipeline card, Tạo Booking/Xóa buttons) are unaffected and remain visible/read-only regardless of `isEditingInfo`.
- The `onEdit` prop on `UnitDetailSheet` is no longer called by the sheet's own "Sửa" button. Since `SpacesPage` still needs a separate edit entry point for the Kanban/list view (unchanged, per non-goals), `onEdit` stays as a prop for that purpose if `SpacesPage` still passes it in for another use; if it turns out `onEdit` becomes entirely unused after this change, it will be removed along with its wiring in `SpacesPage.tsx`.

### Data flow

```
User clicks "Sửa" in sheet
  → isEditingInfo = true, form seeded from `unit`
  → UnitFormFields renders inputs bound to sheet-local form
User clicks "Lưu"
  → spacesApi.updateUnit(unit.id, payload)
  → on success: invalidate/refetch unit data, isEditingInfo = false
  → on error: toast, stay in edit-mode
User clicks "Hủy"
  → isEditingInfo = false, form state discarded
```

### Error handling

Reuses the existing `useMutation` + toast pattern already present in `UnitDetailSheet.tsx` (as used by `statusMutation`) — no new error-handling pattern introduced.

## Testing

Manual verification (no automated test infra identified for this component tree):

1. Open a unit's detail sheet, confirm "Thông tin" tab renders read-only as today.
2. Click "Sửa" → confirm fields become editable, pre-filled with current values, Trạng thái is NOT shown in this inline form.
3. Edit a few fields, click "Lưu" → confirm sheet updates and returns to read-only view with new values reflected.
4. Edit fields, click "Hủy" → confirm changes are discarded and original values are shown.
5. Confirm the Kanban/list "Sửa" action still opens the (now wider) `CreateEditUnitDialog` popup with the grid layout, unaffected by the sheet changes.
6. Confirm "Tạo mặt bằng" still opens the popup correctly at the new width.
7. Confirm "ĐỔI TRẠNG THÁI" dropdown still works independently and is unaffected by entering/exiting Info-tab edit-mode.
