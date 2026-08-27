# Spaces Page — Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/spaces` and its Layout mobile-first responsive across all screen sizes (360 px → 1440 px+).

**Architecture:** Two files changed. `Layout.tsx` gets a single `<aside>` that acts as a fixed mobile drawer (< 768 px) and a static flex sidebar (≥ 768 px) using Tailwind `md:` overrides. `SpacesPage.tsx` gets targeted Tailwind class adjustments on the header, filter row, bulk bar, map toolbar, and UnitDetailSheet.

**Tech Stack:** React 18, Tailwind CSS v3, `lucide-react`, `react-router-dom` v6, `cn()` utility from `@/lib/utils`.

## Global Constraints

- Mobile-first: base classes = mobile, `sm:` (640 px) and `md:` (768 px) and `lg:` (1024 px) for larger sizes.
- No new dependencies — pure Tailwind class changes and minimal React state.
- No automated visual tests exist for UI; each task verifies manually in browser at the given viewport.
- Dev server: `cd apps/frontend && npm run dev` (runs on `http://localhost:5173`).
- Keep all existing behavior — only layout/sizing CSS changes.

---

## File Map

| File | Change type |
|---|---|
| `apps/frontend/src/components/Layout.tsx` | Add `mobileSidebarOpen` state, hamburger button, backdrop, refactor `<aside>` classes |
| `apps/frontend/src/pages/spaces/SpacesPage.tsx` | Responsive Tailwind classes on header, sheet, bulk bar, filters, map toolbar |

---

## Task 1: Layout.tsx — Mobile Sidebar Drawer

**Files:**
- Modify: `apps/frontend/src/components/Layout.tsx`

**Interfaces:**
- Produces: `<aside>` doubles as static sidebar on md+ and slide-in drawer on mobile.

### Steps

- [ ] **Step 1.1 — Add missing imports**

  Open `apps/frontend/src/components/Layout.tsx`.

  Line 2 — add `useLocation` to react-router-dom import:
  ```tsx
  import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
  ```

  Lines 7–13 — add `Menu` and `X` to lucide-react imports:
  ```tsx
  import {
    LayoutDashboard, Building2, Users, FileText, CheckSquare, File,
    Hammer, Ticket, Receipt, Cpu, Bot, PieChart,
    Settings, LogOut, Bell, ChevronLeft, ChevronRight, ShoppingBag,
    TrendingUp, BarChart3, Home, Megaphone, Globe, Store, BookmarkCheck, GitBranch,
    UserCircle, ChevronDown, Sun, Moon, Menu, X,
  } from 'lucide-react';
  ```

- [ ] **Step 1.2 — Add state and close-on-navigate effect**

  Inside `export default function Layout()`, after the existing `const [collapsed, setCollapsed] = useState(false);` line (~line 62), add:

  ```tsx
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Close drawer whenever user navigates
  useEffect(() => { setMobileSidebarOpen(false); }, [location.pathname]);
  ```

  Note: `useEffect` is already imported via `react` (check line 1 — if not, add it: `import { useState, useEffect } from 'react';`).

- [ ] **Step 1.3 — Add hamburger button in header**

  Inside `<header ...>`, find the first child `<div className="flex items-center gap-3 shrink-0">` (~line 104).

  Prepend the hamburger button **before** the existing toggle button inside that div:

  ```tsx
  {/* Hamburger — mobile only */}
  <button
    className="md:hidden p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    onClick={() => setMobileSidebarOpen(true)}
    aria-label="Mở menu"
  >
    <Menu size={18} />
  </button>
  ```

  After the change, the div should look like:
  ```tsx
  <div className="flex items-center gap-3 shrink-0">
    {/* Hamburger — mobile only */}
    <button
      className="md:hidden p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => setMobileSidebarOpen(true)}
      aria-label="Mở menu"
    >
      <Menu size={18} />
    </button>
    <button
      onClick={() => setCollapsed(!collapsed)}
      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors hidden md:block"
      title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
    >
      {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
    </button>
    {!collapsed && (
      <img src="/logo.png" alt="THISO" className="h-8 w-auto hidden md:block" />
    )}
  </div>
  ```

  (The desktop collapse toggle and logo are hidden on mobile — they live inside the drawer instead.)

- [ ] **Step 1.4 — Add backdrop overlay before `<aside>`**

  Inside the body `<div className="flex flex-1 overflow-hidden pt-4 pr-4 pb-4 gap-4">`, **before** the existing `<aside>`, add:

  ```tsx
  {/* Mobile backdrop */}
  {mobileSidebarOpen && (
    <div
      className="fixed inset-0 z-40 bg-black/40 md:hidden"
      onClick={() => setMobileSidebarOpen(false)}
      aria-hidden="true"
    />
  )}
  ```

- [ ] **Step 1.5 — Refactor `<aside>` for dual mobile/desktop behavior**

  Replace the existing `<aside className={cn(...)} >` opening tag with:

  ```tsx
  <aside
    className={cn(
      'flex flex-col bg-gray-900 text-white overflow-hidden transition-all duration-300',
      // Mobile: fixed drawer overlay
      'fixed inset-y-0 left-0 z-50 w-64',
      mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
      // Desktop: static in flex flow, collapsible
      'md:relative md:translate-x-0 md:z-auto md:shrink-0 md:rounded-r-xl',
      collapsed ? 'md:w-16' : 'md:w-60',
    )}
  >
  ```

  At the very top of the aside content, add a mobile close button row (visible only on mobile):

  ```tsx
  {/* Mobile drawer header */}
  <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
    <img src="/logo.png" alt="THISO" className="h-7 w-auto" />
    <button
      onClick={() => setMobileSidebarOpen(false)}
      className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      aria-label="Đóng menu"
    >
      <X size={16} />
    </button>
  </div>
  ```

  Place this div as the **first child** inside `<aside>`, before the existing `<nav ...>`.

- [ ] **Step 1.6 — Visual verification**

  Start dev server if not running:
  ```bash
  cd apps/frontend && npm run dev
  ```

  Open Chrome DevTools → toggle device toolbar → set to **375 × 812 (iPhone 14)**:
  - Sidebar should be hidden (off-screen).
  - Hamburger `☰` button visible in header top-left.
  - Click hamburger → sidebar slides in from left with dark backdrop.
  - Click backdrop → sidebar closes.
  - Click a nav item → sidebar closes automatically.

  Switch to **768 × 1024 (iPad)**:
  - No hamburger visible.
  - Sidebar shows at full width (`w-60`).
  - Collapse toggle (`‹`) still works.

  Switch to **1280 × 800 (desktop)**: no regression.

- [ ] **Step 1.7 — Commit**

  ```bash
  git add apps/frontend/src/components/Layout.tsx
  git commit -m "feat(layout): mobile-first sidebar drawer with hamburger toggle"
  ```

---

## Task 2: SpacesPage — Header & UnitDetailSheet

**Files:**
- Modify: `apps/frontend/src/pages/spaces/SpacesPage.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 (independent change in a different component).
- Produces: responsive page header and full-width sheet on mobile.

### Steps

- [ ] **Step 2.1 — Responsive page header outer wrapper**

  Find (around line 2808):
  ```tsx
  <div className="flex items-center justify-between mb-5">
  ```
  Replace with:
  ```tsx
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
  ```

- [ ] **Step 2.2 — Responsive right-side button group**

  Find the right-side wrapper (around line 2813):
  ```tsx
  <div className="flex items-center gap-2">
  ```
  Replace with:
  ```tsx
  <div className="flex items-center gap-2 flex-wrap">
  ```

- [ ] **Step 2.3 — View toggle: icon-only on mobile, text on sm+**

  The view toggle block (around lines 2815–2848) has 4 buttons. For each button, wrap the text label in `<span className="hidden sm:inline">`. Apply to all 4 buttons:

  ```tsx
  {/* Danh sách */}
  <button
    onClick={() => setView('grid')}
    className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
      view === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
    }`}
    title="Danh sách"
  >
    <LayoutGrid size={14} /> <span className="hidden sm:inline">Danh sách</span>
  </button>
  <button
    onClick={() => setView('floor')}
    className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
      view === 'floor' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
    }`}
    title="Sơ đồ tầng"
  >
    <Map size={14} /> <span className="hidden sm:inline">Sơ đồ tầng</span>
  </button>
  <button
    onClick={() => { setView('map'); setMapEditorMode(false); }}
    className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
      view === 'map' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
    }`}
    title="Bản đồ số"
  >
    <Map size={14} /> <span className="hidden sm:inline">Bản đồ số</span>
  </button>
  <button
    onClick={() => setView('analytics')}
    className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
      view === 'analytics' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
    }`}
    title="Analytics"
  >
    <BarChart3 size={14} /> <span className="hidden sm:inline">Analytics</span>
  </button>
  ```

- [ ] **Step 2.4 — "Thêm mặt bằng" button: icon-only on mobile**

  Find (around line 2861):
  ```tsx
  <Button onClick={() => setCreateOpen(true)} className="gap-2">
    <Plus size={15} /> Thêm mặt bằng
  </Button>
  ```
  Replace with:
  ```tsx
  <Button onClick={() => setCreateOpen(true)} className="gap-2" title="Thêm mặt bằng">
    <Plus size={15} /> <span className="hidden sm:inline">Thêm mặt bằng</span>
  </Button>
  ```

- [ ] **Step 2.5 — UnitDetailSheet: responsive width**

  Find (around line 1654):
  ```tsx
  className="w-[720px]"
  ```
  Replace with:
  ```tsx
  className="w-full sm:w-[720px]"
  ```

- [ ] **Step 2.6 — UnitDetailSheet: responsive padding**

  Find (around line 1657):
  ```tsx
  <div className="px-6 pb-8 space-y-4 pt-4">
  ```
  Replace with:
  ```tsx
  <div className="px-3 sm:px-6 pb-8 space-y-4 pt-4">
  ```

- [ ] **Step 2.7 — Visual verification**

  At **375 px** mobile:
  - Page header title stacks above button group.
  - View toggle shows icons only (no text labels); title tooltip shows on hover.
  - "Thêm mặt bằng" button shows `+` icon only.
  - Click a unit card → UnitDetailSheet opens full-width.

  At **640 px+**:
  - Header is single row again.
  - View toggle shows text labels.
  - Sheet is `720 px` wide from the right.

- [ ] **Step 2.8 — Commit**

  ```bash
  git add apps/frontend/src/pages/spaces/SpacesPage.tsx
  git commit -m "feat(spaces): responsive header and full-width unit detail sheet on mobile"
  ```

---

## Task 3: SpacesPage — Bulk Bar, Filter Row & Map Toolbar

**Files:**
- Modify: `apps/frontend/src/pages/spaces/SpacesPage.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no horizontal overflow in filter row, bulk actions bar, or map toolbar on mobile.

### Steps

- [ ] **Step 3.1 — Filter row: full-width stacked on mobile**

  Find (around line 2982):
  ```tsx
  <div className="flex gap-3 flex-wrap">
  ```
  Replace with:
  ```tsx
  <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
  ```

- [ ] **Step 3.2 — Search input: full-width on mobile**

  Find (around line 2983):
  ```tsx
  <div className="relative flex-1 max-w-sm">
  ```
  Replace with:
  ```tsx
  <div className="relative w-full sm:flex-1 sm:max-w-sm">
  ```

- [ ] **Step 3.3 — Status select: full-width on mobile**

  Find (around line 2992):
  ```tsx
  <SelectTrigger className="w-44">
  ```
  Replace with:
  ```tsx
  <SelectTrigger className="w-full sm:w-44">
  ```

- [ ] **Step 3.4 — Bulk selection bar: wrap on mobile**

  Find (around line 3129):
  ```tsx
  <div className="flex items-center justify-between p-3 mb-4 bg-gray-50 border border-gray-200 rounded-lg">
  ```
  Replace with:
  ```tsx
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 mb-4 bg-gray-50 border border-gray-200 rounded-lg">
  ```

- [ ] **Step 3.5 — Bulk bar action buttons: allow wrap**

  Find (around line 3141):
  ```tsx
  <div className="flex items-center gap-2">
  ```
  (This is the second `div` inside the bulk bar, containing the action buttons.)
  Replace with:
  ```tsx
  <div className="flex items-center gap-2 flex-wrap">
  ```

- [ ] **Step 3.6 — Map view toolbar: allow wrap**

  Find (around line 3231):
  ```tsx
  <div className="flex items-center gap-3">
  ```
  (Inside the `view === 'map'` block, the toolbar row.)
  Replace with:
  ```tsx
  <div className="flex items-center gap-3 flex-wrap">
  ```

- [ ] **Step 3.7 — Visual verification**

  At **375 px** mobile:
  - Filter row: search input + status select each take full width, stack vertically.
  - "Bộ lọc nâng cao" and "Xóa bộ lọc" buttons appear below, properly wrapped.
  - Enter selection mode, select units → bulk bar wraps into two rows cleanly.
  - Switch to "Bản đồ số" view → toolbar row wraps without overflow.

  At **640 px+**: all rows return to horizontal layout, no visual regression.

- [ ] **Step 3.8 — Commit**

  ```bash
  git add apps/frontend/src/pages/spaces/SpacesPage.tsx
  git commit -m "feat(spaces): responsive filter row, bulk bar and map toolbar"
  ```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Layout sidebar — hamburger + drawer on mobile | Task 1 |
| Layout sidebar — close on navigate | Task 1 step 1.2 |
| SpacesPage header — flex-wrap on mobile | Task 2 steps 2.1–2.4 |
| UnitDetailSheet — full-width on mobile | Task 2 steps 2.5–2.6 |
| Bulk selection bar — wrap on mobile | Task 3 steps 3.4–3.5 |
| Filter row — stack on mobile | Task 3 steps 3.1–3.3 |
| Map toolbar — wrap on mobile | Task 3 step 3.6 |
| Occupancy stats, unit grid, floor tabs, advanced filters — already responsive | No change needed ✓ |
