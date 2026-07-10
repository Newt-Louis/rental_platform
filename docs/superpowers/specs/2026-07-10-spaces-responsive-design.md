# Spaces Page — Responsive Design Spec

**Date:** 2026-07-10  
**Scope:** `apps/frontend/src/components/Layout.tsx` + `apps/frontend/src/pages/spaces/SpacesPage.tsx`  
**Approach:** Mobile-first, Tailwind breakpoints (`sm` 640px, `md` 768px, `lg` 1024px)

---

## 1. Layout.tsx — Mobile Sidebar

### Problem
The sidebar is always visible and takes `w-60` or `w-16`. On screens < 768px it pushes main content into an unusable narrow column.

### Solution: Hamburger + Slide-in Drawer

**State:**
- Add `mobileSidebarOpen: boolean` (default `false`) to Layout component.

**Sidebar element:**
- Change from always-rendered `<aside>` to:
  - Hidden on mobile: `hidden md:flex md:flex-col` (existing styling preserved)
  - Separate mobile drawer: `fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-gray-900 text-white transition-transform duration-300` — `translate-x-0` when open, `-translate-x-full` when closed
  - Backdrop overlay: `fixed inset-0 z-40 bg-black/40 md:hidden` shown when `mobileSidebarOpen`; clicking it closes the drawer

**Header hamburger button:**
- Insert before the logo area: `<button className="md:hidden p-1.5 ..." onClick={() => setMobileSidebarOpen(true)}><Menu size={18} /></button>`
- Import `Menu` icon from `lucide-react`

**MallSelector on mobile:**
- Keep in header (already visible). No change needed — MallSelector is in the header for all sizes.

**Close behavior:**
- Clicking backdrop closes drawer
- Navigating to a new route closes drawer (via `useEffect` on `location.pathname`)

---

## 2. SpacesPage.tsx — Responsive Sections

### 2a. Page Header (line ~2808)

**Current:** Single `flex items-center justify-between` row — overflows on mobile.

**New layout:**
```
Mobile (< sm):
  Row 1: [Title + subtitle]
  Row 2: [View toggle (icon-only)] [Chọn nhiều] [+ icon]

sm+:
  Row 1: [Title + subtitle]   [View toggle + text] [Chọn nhiều] [+ Thêm mặt bằng]
```

**Changes:**
- Outer wrapper: `flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5`
- Right side button group: `flex items-center gap-2 flex-wrap`
- View toggle text labels: wrap each in `<span className="hidden sm:inline">...</span>`
- "Thêm mặt bằng" button text: `<span className="hidden sm:inline">Thêm mặt bằng</span>` — icon always shown

### 2b. UnitDetailSheet (line ~1649)

**Current:** `className="w-[720px]"` — overflows on mobile.

**New:** `className="w-full sm:w-[720px]"`

**Inner padding:** `px-3 sm:px-6` on the content wrapper (`div.px-6.pb-8`).

### 2c. Bulk Selection Bar (line ~3129)

**Current:** `flex items-center justify-between` — action buttons row overflows on mobile.

**New:**
```
flex flex-col sm:flex-row sm:items-center gap-3 p-3 mb-4 bg-gray-50 border border-gray-200 rounded-lg
```
- Row 1 (left side): count + "Chọn tất cả" + "Bỏ chọn"
- Row 2 / right on sm+: action buttons with `flex flex-wrap gap-2`

### 2d. Filter Row (line ~2982)

**Current:** `flex gap-3 flex-wrap` with `flex-1 max-w-sm` on search and `w-44` on select.

**New:**
- Search input: `w-full sm:flex-1 sm:max-w-sm`
- Status select: `w-full sm:w-44`
- Outer wrapper: `flex flex-col sm:flex-row gap-3 flex-wrap`

### 2e. Map View Toolbar (line ~3231)

**Current:** `flex items-center gap-3` — Xem/Chỉnh sửa toggle can wrap.

**New:** `flex items-center gap-3 flex-wrap`

---

## 3. Unchanged / Already Responsive

| Element | Status |
|---|---|
| Occupancy stats grid | `grid-cols-2 md:grid-cols-5` ✓ |
| Unit cards grid | `grid-cols-2 md:grid-cols-4 lg:grid-cols-5` ✓ |
| Floor tabs | `overflow-x-auto scrollbar-none` ✓ |
| Advanced filters panel | `grid-cols-2 md:grid-cols-4` ✓ |
| Dialogs (CreateEditUnitDialog etc.) | `max-w-lg max-h-[90vh]` ✓ |

---

## 4. Files Changed

| File | Change |
|---|---|
| `apps/frontend/src/components/Layout.tsx` | Add mobile sidebar drawer + hamburger |
| `apps/frontend/src/pages/spaces/SpacesPage.tsx` | Responsive header, sheet width, bulk bar, filter row, map toolbar |

---

## 5. Testing Checklist

- [ ] 375px (iPhone SE): sidebar opens/closes via hamburger, SpacesPage scrolls without horizontal overflow
- [ ] 768px (iPad): sidebar shows in collapsed state, SpacesPage header in single row
- [ ] 1280px (desktop): no visual regression from current layout
- [ ] UnitDetailSheet opens full-width on 375px
- [ ] Bulk selection bar wraps cleanly on 375px
- [ ] Floor tabs scroll horizontally on all sizes
