# SpacesPage Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `SpacesPage.tsx` (3451 lines, 18 inline components) into focused files so each file has one clear responsibility and can be read in isolation.

**Architecture:** Extract shared constants + helpers first, then create the Zustand store and filter hook that extracted components will depend on, then move components out one batch at a time — each move is a pure cut-and-paste with no logic change, verified by TypeScript after each step. SpacesPage ends up as a thin ~150-line orchestrator.

**Tech Stack:** React 18, TypeScript, Zustand, React Query v5, React Router v6 (`useSearchParams`), Tailwind CSS, Lucide icons.

## Global Constraints

- Never change component behavior during extraction — no logic refactor, only file moves.
- Every step must compile: run `npx tsc --noEmit` from `apps/frontend/` after each task.
- Keep all imports using the `@/` alias (maps to `apps/frontend/src/`).
- No new dependencies — only files that already exist in the repo.
- Zustand store must NOT use `persist` middleware (UI state, not user preference).
- URL param keys must be short and URL-safe (no camelCase — use `status`, `floor`, `minArea`, etc.).

---

## File Map

### New files to create

| File | Responsibility |
|------|---------------|
| `src/pages/spaces/spaces.constants.ts` | STATUS_CONFIG, STATUS_ICONS, SPACE_TYPE_OPTIONS, TIER_OPTIONS, LEASE_TERM_OPTIONS, CATEGORIES, API_ORIGIN, mediaUrl, fmtDate, fmtMoney |
| `src/store/spaces.store.ts` | selectedUnit, selectionMode, selectedIds, compareOpen, mergeDialogOpen, mapEditorMode, mapEditorFloorId |
| `src/hooks/useSpacesFilters.ts` | All filter state ↔ URL params (search, status, floor, area, rent, category, spaceType, tier, leaseTerm) |
| `src/components/spaces/dialogs/ConfirmDialog.tsx` | Generic destructive-action confirm dialog |
| `src/components/spaces/dialogs/CreateEditUnitDialog.tsx` | Create/edit unit form dialog |
| `src/components/spaces/dialogs/CreateEditFloorDialog.tsx` | Create/edit floor dialog |
| `src/components/spaces/dialogs/CreateBookingDialog.tsx` | New booking form dialog |
| `src/components/spaces/dialogs/ConvertBookingDialog.tsx` | Convert booking to proposal/contract dialog |
| `src/components/spaces/dialogs/MergeUnitsDialog.tsx` | Merge two units dialog |
| `src/components/spaces/dialogs/BulkDialogs.tsx` | BulkStatusDialog + BulkCategoryDialog + BulkRentDialog (small, grouped) |
| `src/components/spaces/UnitCard.tsx` | Single unit card for grid view |
| `src/components/spaces/SpacesAlerts.tsx` | Expiring lease alert banners |
| `src/components/spaces/AnalyticsView.tsx` | Analytics tab (occupancy tiles, KPI cards, charts) |
| `src/components/spaces/tabs/UnitMediaTab.tsx` | Media upload/display tab inside UnitDetailSheet |
| `src/components/spaces/tabs/SalesPipelineTab.tsx` | Bookings + proposals pipeline tab inside UnitDetailSheet |
| `src/components/spaces/UnitDetailSheet.tsx` | Side sheet with tab switcher, info tab, wraps UnitMediaTab + SalesPipelineTab |
| `src/pages/spaces/SpacesFilters.tsx` | Search input + status select + advanced filter panel |
| `src/pages/spaces/SpacesGrid.tsx` | Grid of UnitCards + bulk selection bar |

### Files modified

| File | Change |
|------|--------|
| `src/pages/spaces/SpacesPage.tsx` | Remove all extracted components + state, import from new files, end at ~150 lines |

---

## Task 1: Shared constants and helpers

**Files:**
- Create: `src/pages/spaces/spaces.constants.ts`
- Modify: `src/pages/spaces/SpacesPage.tsx` (lines 35–117: remove constants/helpers, add import)

**Interfaces:**
- Produces: `STATUS_CONFIG`, `STATUS_ICONS`, `SPACE_TYPE_OPTIONS`, `TIER_OPTIONS`, `LEASE_TERM_OPTIONS`, `CATEGORIES`, `API_ORIGIN`, `mediaUrl(fileUrl?)`, `fmtDate(d?)`, `fmtMoney(n)`

- [ ] **Step 1: Create constants file**

```typescript
// src/pages/spaces/spaces.constants.ts
import React from 'react';
import {
  AlertCircle, BookmarkPlus, Users, FileText, Building2,
  CheckCircle, GitMerge,
} from 'lucide-react';

export const STATUS_CONFIG: Record<string, {
  label: string; color: string; iconBg: string; leftBorder: string; textColor: string;
}> = {
  VACANT:       { label: 'Trống',          color: 'bg-red-100 text-red-700 border-red-200',          iconBg: 'bg-red-50',    leftBorder: 'border-l-red-400',    textColor: 'text-red-500' },
  BOOKING:      { label: 'Booking',        color: 'bg-amber-100 text-amber-700 border-amber-200',    iconBg: 'bg-amber-50',  leftBorder: 'border-l-amber-400',  textColor: 'text-amber-500' },
  NEGOTIATING:  { label: 'Thương thảo',   color: 'bg-orange-100 text-orange-700 border-orange-200', iconBg: 'bg-orange-50', leftBorder: 'border-l-orange-400', textColor: 'text-orange-500' },
  CONTRACTED:   { label: 'Hợp đồng',      color: 'bg-blue-100 text-gray-700 border-gray-200',       iconBg: 'bg-blue-50',   leftBorder: 'border-l-blue-400',   textColor: 'text-blue-500' },
  UNDER_FITOUT: { label: 'Đang thi công', color: 'bg-purple-100 text-purple-700 border-purple-200', iconBg: 'bg-purple-50', leftBorder: 'border-l-purple-400', textColor: 'text-purple-500' },
  OCCUPIED:     { label: 'Đang thuê',     color: 'bg-green-100 text-green-700 border-green-200',    iconBg: 'bg-green-50',  leftBorder: 'border-l-green-400',  textColor: 'text-green-500' },
  MERGED:       { label: 'Đã gộp',        color: 'bg-gray-100 text-gray-500 border-gray-200',       iconBg: 'bg-gray-50',   leftBorder: 'border-l-gray-300',   textColor: 'text-gray-400' },
};

export const STATUS_ICONS: Record<string, React.ReactNode> = {
  VACANT:       React.createElement(AlertCircle, { size: 14 }),
  BOOKING:      React.createElement(BookmarkPlus, { size: 14 }),
  NEGOTIATING:  React.createElement(Users, { size: 14 }),
  CONTRACTED:   React.createElement(FileText, { size: 14 }),
  UNDER_FITOUT: React.createElement(Building2, { size: 14 }),
  OCCUPIED:     React.createElement(CheckCircle, { size: 14 }),
  MERGED:       React.createElement(GitMerge, { size: 14 }),
};

export const SPACE_TYPE_OPTIONS = [
  { value: 'RETAIL_UNIT',    label: 'Sảnh bán lẻ' },
  { value: 'LED',            label: 'Bảng LED' },
  { value: 'ESCALATOR_WRAP', label: 'Thang cuốn' },
  { value: 'KIOSK_EVENT',   label: 'Kiosk / Sự kiện' },
  { value: 'ADVERTISING',   label: 'Quảng cáo' },
  { value: 'SERVICE',       label: 'Dịch vụ' },
];

export const TIER_OPTIONS = [
  { value: 'A', label: 'Tier A — Prime' },
  { value: 'B', label: 'Tier B — Standard' },
  { value: 'C', label: 'Tier C — Value' },
];

export const LEASE_TERM_OPTIONS = [
  { value: 'LONG',  label: 'Dài hạn (3-5 năm)' },
  { value: 'SHORT', label: 'Ngắn hạn' },
];

export const CATEGORIES = [
  'F&B - Ẩm thực', 'Café & Trà', 'Thời trang', 'Giày dép & Túi xách',
  'Phụ kiện & Trang sức', 'Làm đẹp & Spa', 'Điện tử & Công nghệ',
  'Giải trí & Vui chơi', 'Thể thao & Fitness', 'Siêu thị & FMCG',
  'Cửa hàng tiện lợi', 'Trang trí nội thất', 'Giáo dục & Trẻ em',
  'Sức khỏe & Dược phẩm', 'Dịch vụ tài chính', 'Du lịch & Dịch vụ',
  'Sách & Văn phòng phẩm', 'Thú cưng', 'Khác',
];

export const API_ORIGIN = ((import.meta as any).env?.VITE_API_URL || '/api').replace(/\/api\/?$/, '');

export function mediaUrl(fileUrl?: string | null): string {
  if (!fileUrl) return '';
  if (fileUrl.startsWith('http')) return fileUrl;
  return `${API_ORIGIN}${fileUrl}`;
}

export function fmtDate(d?: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫/m²';
}
```

> **Note on STATUS_ICONS:** The original file used JSX (`<AlertCircle size={14} />`). Since this is a `.ts` file (not `.tsx`), use `React.createElement` as shown above — or rename the file to `spaces.constants.tsx`.

- [ ] **Step 2: Replace constant blocks in SpacesPage.tsx with import**

In `SpacesPage.tsx`, delete lines 35–117 (everything from `const STATUS_CONFIG` through `function fmtMoney`) and add at the top with other imports:

```typescript
import {
  STATUS_CONFIG, STATUS_ICONS, SPACE_TYPE_OPTIONS, TIER_OPTIONS,
  LEASE_TERM_OPTIONS, CATEGORIES, API_ORIGIN, mediaUrl, fmtDate, fmtMoney,
} from './spaces.constants';
```

- [ ] **Step 3: Type-check**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/spaces/spaces.constants.ts apps/frontend/src/pages/spaces/SpacesPage.tsx
git commit -m "refactor(spaces): extract shared constants and helpers"
```

---

## Task 2: Filter state → URL params (`useSpacesFilters`)

**Files:**
- Create: `src/hooks/useSpacesFilters.ts`
- Modify: `src/pages/spaces/SpacesPage.tsx` (remove 11 filter useState, replace with hook)

**Interfaces:**
- Consumes: `useSearchParams` from `react-router-dom`
- Produces:
```typescript
useSpacesFilters(): {
  search: string; setSearch(v: string): void;
  statusFilter: string; setStatusFilter(v: string): void;
  floorFilter: string; setFloorFilter(v: string): void;
  minArea: string; setMinArea(v: string): void;
  maxArea: string; setMaxArea(v: string): void;
  minRent: string; setMinRent(v: string): void;
  maxRent: string; setMaxRent(v: string): void;
  categoryFilter: string; setCategoryFilter(v: string): void;
  spaceTypeFilter: string; setSpaceTypeFilter(v: string): void;
  tierFilter: string; setTierFilter(v: string): void;
  leaseTermFilter: string; setLeaseTermFilter(v: string): void;
  hasAdvancedFilters: boolean;
  clearFilters(): void;
}
```

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useSpacesFilters.ts
import { useSearchParams } from 'react-router-dom';

const FILTER_KEYS = ['search', 'status', 'floor', 'minArea', 'maxArea', 'minRent', 'maxRent', 'category', 'spaceType', 'tier', 'leaseTerm'] as const;

function set1(setSearchParams: ReturnType<typeof useSearchParams>[1], key: string, value: string) {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (value) next.set(key, value);
    else next.delete(key);
    return next;
  }, { replace: true });
}

export function useSpacesFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const search         = searchParams.get('search')     ?? '';
  const statusFilter   = searchParams.get('status')     ?? '';
  const floorFilter    = searchParams.get('floor')      ?? '';
  const minArea        = searchParams.get('minArea')    ?? '';
  const maxArea        = searchParams.get('maxArea')    ?? '';
  const minRent        = searchParams.get('minRent')    ?? '';
  const maxRent        = searchParams.get('maxRent')    ?? '';
  const categoryFilter = searchParams.get('category')  ?? '';
  const spaceTypeFilter= searchParams.get('spaceType') ?? '';
  const tierFilter     = searchParams.get('tier')       ?? '';
  const leaseTermFilter= searchParams.get('leaseTerm') ?? '';

  const hasAdvancedFilters = !!(minArea || maxArea || minRent || maxRent || categoryFilter || spaceTypeFilter || tierFilter || leaseTermFilter);

  const clearFilters = () => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    FILTER_KEYS.forEach((k) => next.delete(k));
    return next;
  }, { replace: true });

  return {
    search,         setSearch:         (v: string) => set1(setSearchParams, 'search',     v),
    statusFilter,   setStatusFilter:   (v: string) => set1(setSearchParams, 'status',     v),
    floorFilter,    setFloorFilter:    (v: string) => set1(setSearchParams, 'floor',      v),
    minArea,        setMinArea:        (v: string) => set1(setSearchParams, 'minArea',    v),
    maxArea,        setMaxArea:        (v: string) => set1(setSearchParams, 'maxArea',    v),
    minRent,        setMinRent:        (v: string) => set1(setSearchParams, 'minRent',    v),
    maxRent,        setMaxRent:        (v: string) => set1(setSearchParams, 'maxRent',    v),
    categoryFilter, setCategoryFilter: (v: string) => set1(setSearchParams, 'category',  v),
    spaceTypeFilter,setSpaceTypeFilter:(v: string) => set1(setSearchParams, 'spaceType', v),
    tierFilter,     setTierFilter:     (v: string) => set1(setSearchParams, 'tier',       v),
    leaseTermFilter,setLeaseTermFilter:(v: string) => set1(setSearchParams, 'leaseTerm', v),
    hasAdvancedFilters,
    clearFilters,
  };
}
```

- [ ] **Step 2: Wire hook into SpacesPage**

In `SpacesPage.tsx`:

**Remove** these 11 `useState` lines (they are next to each other after the `view` state):
```typescript
const [search, setSearch] = useState('');
const [statusFilter, setStatusFilter] = useState('');
const [floorFilter, setFloorFilter] = useState(() => searchParams.get('floorId') ?? '');
const [showFilters, setShowFilters] = useState(false);
const [minArea, setMinArea] = useState('');
const [maxArea, setMaxArea] = useState('');
const [minRent, setMinRent] = useState('');
const [maxRent, setMaxRent] = useState('');
const [categoryFilter, setCategoryFilter] = useState('');
const [spaceTypeFilter, setSpaceTypeFilter] = useState('');
const [tierFilter, setTierFilter] = useState('');
const [leaseTermFilter, setLeaseTermFilter] = useState('');
```

Also remove the `hasAdvancedFilters` derived variable and the `clearFilters` function (hook handles these).

Also remove the `floorId` cleanup effect (the hook initialises from URL, no one-time sync needed):
```typescript
// DELETE this effect:
useEffect(() => {
  if (searchParams.get('floorId')) { ... }
}, []);
```

**Add** at the top of the component body (after `const [searchParams, setSearchParams] = useSearchParams();`):
```typescript
const {
  search, setSearch,
  statusFilter, setStatusFilter,
  floorFilter, setFloorFilter,
  minArea, setMinArea,
  maxArea, setMaxArea,
  minRent, setMinRent,
  maxRent, setMaxRent,
  categoryFilter, setCategoryFilter,
  spaceTypeFilter, setSpaceTypeFilter,
  tierFilter, setTierFilter,
  leaseTermFilter, setLeaseTermFilter,
  hasAdvancedFilters,
  clearFilters,
} = useSpacesFilters();
```

**Add** import at top of file:
```typescript
import { useSpacesFilters } from '@/hooks/useSpacesFilters';
```

> **Migration note for `floorFilter`:** The old code read `?floorId=` (from Admin navigation links). After this change the hook reads `?floor=`. Update any links in the Admin page that navigate to `?floorId=` to use `?floor=` instead. Search for `floorId` in the codebase: `grep -r "floorId" apps/frontend/src --include="*.tsx"`.

- [ ] **Step 3: Type-check**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Smoke test filters in browser**
  - Open Spaces page, type in search box — URL should show `?search=xxx`
  - Change status filter — URL should show `?status=VACANT`
  - Click "Xóa bộ lọc" — all filter params removed from URL
  - Hit browser Back — filters should restore

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useSpacesFilters.ts apps/frontend/src/pages/spaces/SpacesPage.tsx
git commit -m "refactor(spaces): move filter state to URL params via useSpacesFilters hook"
```

---

## Task 3: Create `useSpacesStore`

**Files:**
- Create: `src/store/spaces.store.ts`
- Modify: `src/pages/spaces/SpacesPage.tsx` (replace 8 useState with store)

**Interfaces:**
- Produces:
```typescript
useSpacesStore(): {
  selectedUnit: Unit | null;
  setSelectedUnit(unit: Unit | null): void;
  selectionMode: boolean;
  setSelectionMode(v: boolean): void;
  selectedIds: Set<string>;
  toggleSelect(id: string): void;
  selectAll(ids: string[]): void;
  clearSelection(): void;
  compareOpen: boolean;
  setCompareOpen(v: boolean): void;
  mergeDialogOpen: boolean;
  setMergeDialogOpen(v: boolean): void;
  mapEditorMode: boolean;
  setMapEditorMode(v: boolean): void;
  mapEditorFloorId: string | null;
  setMapEditorFloorId(id: string | null): void;
  reset(): void;
}
```

- [ ] **Step 1: Create store**

```typescript
// src/store/spaces.store.ts
import { create } from 'zustand';
import type { Unit } from '@/types';

interface SpacesState {
  selectedUnit: Unit | null;
  setSelectedUnit: (unit: Unit | null) => void;
  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  compareOpen: boolean;
  setCompareOpen: (v: boolean) => void;
  mergeDialogOpen: boolean;
  setMergeDialogOpen: (v: boolean) => void;
  mapEditorMode: boolean;
  setMapEditorMode: (v: boolean) => void;
  mapEditorFloorId: string | null;
  setMapEditorFloorId: (id: string | null) => void;
  reset: () => void;
}

export const useSpacesStore = create<SpacesState>()((set) => ({
  selectedUnit: null,
  setSelectedUnit: (unit) => set({ selectedUnit: unit }),

  selectionMode: false,
  setSelectionMode: (v) => set({ selectionMode: v }),

  selectedIds: new Set<string>(),
  toggleSelect: (id) => set((s) => {
    const next = new Set(s.selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    return { selectedIds: next };
  }),
  selectAll: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),

  compareOpen: false,
  setCompareOpen: (v) => set({ compareOpen: v }),

  mergeDialogOpen: false,
  setMergeDialogOpen: (v) => set({ mergeDialogOpen: v }),

  mapEditorMode: false,
  setMapEditorMode: (v) => set({ mapEditorMode: v }),

  mapEditorFloorId: null,
  setMapEditorFloorId: (id) => set({ mapEditorFloorId: id }),

  reset: () => set({
    selectedUnit: null, selectionMode: false, selectedIds: new Set(),
    compareOpen: false, mergeDialogOpen: false,
    mapEditorMode: false, mapEditorFloorId: null,
  }),
}));
```

- [ ] **Step 2: Wire into SpacesPage**

**Remove** these from `SpacesPage.tsx`:
```typescript
const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
const [selectionMode, setSelectionMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [compareOpen, setCompareOpen] = useState(false);
const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
const [mapEditorMode, setMapEditorMode] = useState(false);
const [mapEditorFloorId, setMapEditorFloorId] = useState<string | null>(null);
```

Also remove the `toggleSelect` and `selectAll` helper functions (now in store).

Also remove the `useEffect` that clears selectedIds when exiting selectionMode:
```typescript
useEffect(() => { if (!selectionMode) setSelectedIds(new Set()); }, [selectionMode]);
```
Replace with a store-based effect:
```typescript
useEffect(() => { if (!selectionMode) clearSelection(); }, [selectionMode]);
```

**Add** at top of component body:
```typescript
const {
  selectedUnit, setSelectedUnit,
  selectionMode, setSelectionMode,
  selectedIds, toggleSelect, selectAll, clearSelection,
  compareOpen, setCompareOpen,
  mergeDialogOpen, setMergeDialogOpen,
  mapEditorMode, setMapEditorMode,
  mapEditorFloorId, setMapEditorFloorId,
  reset: resetSpacesStore,
} = useSpacesStore();
```

**Add** a reset effect so store clears when leaving the page:
```typescript
useEffect(() => () => { resetSpacesStore(); }, []);
```

**Add** import:
```typescript
import { useSpacesStore } from '@/store/spaces.store';
```

- [ ] **Step 3: Fix references to old helper names**

In `SpacesPage.tsx`, the old code used inline `toggleSelect` and `selectAll` functions. After removing them, the component must call `toggleSelect` and `selectAll` from the store. Search the JSX for these calls and verify they reference the destructured store values (same names, no changes needed).

- [ ] **Step 4: Type-check**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Smoke test**
  - Toggle selection mode — bulk bar appears
  - Select multiple units — count updates
  - Exit selection mode — selection clears
  - Click unit card — detail sheet opens

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/store/spaces.store.ts apps/frontend/src/pages/spaces/SpacesPage.tsx
git commit -m "refactor(spaces): extract shared UI state to useSpacesStore"
```

---

## Task 4: Extract dialogs and simple standalone components

This task moves components that have no internal sub-components of their own. Each move is: create the file, paste the function, add the necessary imports, delete the original from SpacesPage, add the import at the top of SpacesPage. TypeScript catches any missing import.

**Files — create:**
- `src/components/spaces/dialogs/ConfirmDialog.tsx`
- `src/components/spaces/dialogs/CreateEditUnitDialog.tsx`
- `src/components/spaces/dialogs/CreateEditFloorDialog.tsx`
- `src/components/spaces/dialogs/CreateBookingDialog.tsx`
- `src/components/spaces/dialogs/ConvertBookingDialog.tsx` (was `ConvertBookingFromSpacesDialog`)
- `src/components/spaces/dialogs/MergeUnitsDialog.tsx`
- `src/components/spaces/dialogs/BulkDialogs.tsx` (contains BulkStatusDialog + BulkCategoryDialog + BulkRentDialog)
- `src/components/spaces/UnitCard.tsx`
- `src/components/spaces/SpacesAlerts.tsx`
- `src/components/spaces/AnalyticsView.tsx`

**Files — modify:**
- `src/pages/spaces/SpacesPage.tsx` (remove extracted functions, add imports)

**Interfaces:**
- All components keep their existing props signatures unchanged.
- Consumes from Task 1: `STATUS_CONFIG`, `STATUS_ICONS`, `mediaUrl`, `fmtDate`, `fmtMoney` (import from `@/pages/spaces/spaces.constants`)
- Consumes from Task 3: `useSpacesStore` (only `CompareModal` and `MergeUnitsDialog` need it — for the `selectedIds` passed as prop, not direct store access)

- [ ] **Step 1: Create `src/components/spaces/dialogs/` directory structure**

Just create the files — the directory is created implicitly.

- [ ] **Step 2: Move ConfirmDialog**

Create `src/components/spaces/dialogs/ConfirmDialog.tsx`:
```typescript
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function ConfirmDialog({
  open, title, description, onConfirm, onCancel, loading,
}: {
  open: boolean; title: string; description: string;
  onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-full bg-red-100">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        <p className="text-sm text-gray-500">{description}</p>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Hủy</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? 'Đang xóa...' : 'Xác nhận xóa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Move CreateEditUnitDialog**

Create `src/components/spaces/dialogs/CreateEditUnitDialog.tsx`. Copy the entire `function CreateEditUnitDialog` block from SpacesPage.tsx (currently lines ~152–454). Add these imports at the top of the new file:

```typescript
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { spacesApi, categoriesApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';  // verify this import path exists
import {
  STATUS_CONFIG, SPACE_TYPE_OPTIONS, TIER_OPTIONS, LEASE_TERM_OPTIONS, CATEGORIES,
} from '@/pages/spaces/spaces.constants';
```

Export the function: add `export` before `function CreateEditUnitDialog`.

- [ ] **Step 4: Move CreateEditFloorDialog**

Create `src/components/spaces/dialogs/CreateEditFloorDialog.tsx`. Copy the `function CreateEditFloorDialog` block (lines ~455–538). Imports needed:

```typescript
import React, { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { spacesApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
```

- [ ] **Step 5: Move CreateBookingDialog**

Create `src/components/spaces/dialogs/CreateBookingDialog.tsx`. Copy the `function CreateBookingDialog` block (lines ~539–873). Imports needed:

```typescript
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { spacesApi, bookingApi, crmApi, customersApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fmtDate } from '@/pages/spaces/spaces.constants';
```

- [ ] **Step 6: Move ConvertBookingFromSpacesDialog**

Create `src/components/spaces/dialogs/ConvertBookingDialog.tsx`. Copy the `function ConvertBookingFromSpacesDialog` block (lines ~1031–1243). **Rename the export** to `ConvertBookingDialog` for brevity. Imports: similar to CreateBookingDialog — check what APIs and UI components are used inside the function body.

- [ ] **Step 7: Move MergeUnitsDialog**

Create `src/components/spaces/dialogs/MergeUnitsDialog.tsx`. Copy `function MergeUnitsDialog` (lines ~2036–2144). Imports: `spacesApi`, `useToast`, `useQueryClient`, `useMutation`, `Dialog`, `Button`, `fmtMoney`, `STATUS_CONFIG`, `fmtDate`.

- [ ] **Step 8: Move BulkDialogs**

Create `src/components/spaces/dialogs/BulkDialogs.tsx`. Copy all three functions: `BulkStatusDialog` (lines ~2145–2181), `BulkCategoryDialog` (lines ~2182–2223), `BulkRentDialog` (lines ~2224–2274). Export all three from the same file. Imports: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Button`, `Input`, `Select`, `STATUS_CONFIG`, `CATEGORIES`.

- [ ] **Step 9: Move UnitCard**

Create `src/components/spaces/UnitCard.tsx`. Copy `function UnitCard` (lines ~1968–2035). Imports: `STATUS_CONFIG`, `STATUS_ICONS`, `Badge`, `CheckSquare`, `Square`, and `UnitSlotSummary` type. Also needs `useSpacesStore` (for `selectionMode`, `selectedIds`, `toggleSelect`) — **or** keep these as props to avoid tight coupling. Preferred: keep as props (`selectionMode`, `isSelected`, `onToggle`) so UnitCard stays pure.

- [ ] **Step 10: Move SpacesAlerts**

Create `src/components/spaces/SpacesAlerts.tsx`. Copy `function SpacesAlerts` (lines ~2275–2325). Imports: `spacesApi`, `useQuery`, `AlertTriangle`, `Clock`, `ArrowRight`, `useNavigate`.

- [ ] **Step 11: Move AnalyticsView**

Create `src/components/spaces/AnalyticsView.tsx`. Copy `function AnalyticsView` (lines ~2471–2708, updated in previous session to include occupancy tiles). Imports: `spacesApi`, `useQuery`, `Card`, `CardContent`, `Skeleton`, `STATUS_CONFIG`, `STATUS_ICONS`, `BarChart3`, `Layers`, `Calendar`, `Clock`, `Building2`.

- [ ] **Step 12: Update SpacesPage.tsx imports**

Remove all 10 extracted functions from SpacesPage.tsx and add imports:

```typescript
import { ConfirmDialog } from '@/components/spaces/dialogs/ConfirmDialog';
import { CreateEditUnitDialog } from '@/components/spaces/dialogs/CreateEditUnitDialog';
import { CreateEditFloorDialog } from '@/components/spaces/dialogs/CreateEditFloorDialog';
import { CreateBookingDialog } from '@/components/spaces/dialogs/CreateBookingDialog';
import { ConvertBookingDialog } from '@/components/spaces/dialogs/ConvertBookingDialog';
import { MergeUnitsDialog } from '@/components/spaces/dialogs/MergeUnitsDialog';
import { BulkStatusDialog, BulkCategoryDialog, BulkRentDialog } from '@/components/spaces/dialogs/BulkDialogs';
import { UnitCard } from '@/components/spaces/UnitCard';
import { SpacesAlerts } from '@/components/spaces/SpacesAlerts';
import { AnalyticsView } from '@/components/spaces/AnalyticsView';
```

Also update JSX: any usage of `ConvertBookingFromSpacesDialog` → `ConvertBookingDialog`.

- [ ] **Step 13: Type-check**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: 0 errors. Fix any missing imports TypeScript reports — they're always fixable by adding the specific import to the new file.

- [ ] **Step 14: Commit**

```bash
git add apps/frontend/src/components/spaces/ apps/frontend/src/pages/spaces/SpacesPage.tsx
git commit -m "refactor(spaces): extract dialogs, UnitCard, SpacesAlerts, AnalyticsView to separate files"
```

---

## Task 5: Extract tab components and UnitDetailSheet

**Files:**
- Create: `src/components/spaces/tabs/UnitMediaTab.tsx`
- Create: `src/components/spaces/tabs/SalesPipelineTab.tsx` (includes ConvertBookingDialog usage)
- Create: `src/components/spaces/UnitDetailSheet.tsx`
- Modify: `src/pages/spaces/SpacesPage.tsx`

**Interfaces:**
- `UnitMediaTab` props: `{ unitId: string }`
- `SalesPipelineTab` props: same as existing (copy unchanged)
- `UnitDetailSheet` props: same as existing (copy unchanged)
- All three consume `useSpacesStore` for `selectedUnit`/`setSelectedUnit` if needed — check existing prop interface first and keep it if small enough.

- [ ] **Step 1: Move UnitMediaTab**

Create `src/components/spaces/tabs/UnitMediaTab.tsx`. Copy `function UnitMediaTab` (lines ~874–1030). Imports: `spacesApi`, `useQuery`, `useMutation`, `useQueryClient`, `useToast`, `mediaUrl`, `Upload`, `Image`, `Trash2`, `Star`, UI components as needed.

- [ ] **Step 2: Move SalesPipelineTab**

Create `src/components/spaces/tabs/SalesPipelineTab.tsx`. Copy `function SalesPipelineTab` and its helper constants `PROP_STATUS_CFG`, `CONTRACT_STATUS_CFG` (lines ~1233–1579). Imports: `proposalsApi`, `contractsApi`, `bookingApi`, `ConvertBookingDialog` from dialogs, `fmtDate`, `fmtMoney`, various Lucide icons and UI components.

- [ ] **Step 3: Move UnitDetailSheet**

Create `src/components/spaces/UnitDetailSheet.tsx`. Copy `function UnitDetailSheet` (lines ~1580–1967). Imports:

```typescript
import { UnitMediaTab } from './tabs/UnitMediaTab';
import { SalesPipelineTab } from './tabs/SalesPipelineTab';
import { CreateBookingDialog } from './dialogs/CreateBookingDialog';
import { FloorPlanEditor } from '@/components/FloorPlanEditor';
import { useSpacesStore } from '@/store/spaces.store';
import { fmtDate, fmtMoney, mediaUrl, STATUS_CONFIG, STATUS_ICONS } from '@/pages/spaces/spaces.constants';
// ... sheet UI components, icons as needed
```

- [ ] **Step 4: Update SpacesPage imports**

Remove the three function bodies and add:

```typescript
import { UnitDetailSheet } from '@/components/spaces/UnitDetailSheet';
```

(`UnitMediaTab` and `SalesPipelineTab` are no longer referenced directly by SpacesPage — they're internal to `UnitDetailSheet`.)

- [ ] **Step 5: Type-check**

```bash
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 6: Smoke test UnitDetailSheet**
  - Click a unit card — sheet opens
  - Switch between tabs: Thông tin / Bán hàng / Media / Booking Slot
  - Upload a media file, verify it appears
  - Open Tạo Booking dialog from within the sheet

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/spaces/ apps/frontend/src/pages/spaces/SpacesPage.tsx
git commit -m "refactor(spaces): extract UnitDetailSheet and tab components"
```

---

## Task 6: Extract SpacesFilters and SpacesGrid, slim SpacesPage

**Files:**
- Create: `src/pages/spaces/SpacesFilters.tsx`
- Create: `src/pages/spaces/SpacesGrid.tsx`
- Modify: `src/pages/spaces/SpacesPage.tsx` (final trim to ~150 lines)

**Interfaces:**
- `SpacesFilters` — no props; reads `useSpacesFilters()` internally
- `SpacesGrid` props:
```typescript
{
  units: Unit[];
  slotSummaries: Record<string, UnitSlotSummary>;
  isLoading: boolean;
  isAdmin: boolean;
  onUnitClick: (unit: Unit) => void;
  onEditUnit: (unit: any) => void;
  onDeleteUnit: (unit: any) => void;
}
```

- [ ] **Step 1: Create SpacesFilters**

`SpacesFilters` owns the filter UI. It calls `useSpacesFilters()` internally — no props needed.

```typescript
// src/pages/spaces/SpacesFilters.tsx
import React, { useState } from 'react';
import { Search, SlidersHorizontal, X, CheckSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSpacesFilters } from '@/hooks/useSpacesFilters';
import { useSpacesStore } from '@/store/spaces.store';
import {
  STATUS_CONFIG, SPACE_TYPE_OPTIONS, TIER_OPTIONS, LEASE_TERM_OPTIONS,
} from './spaces.constants';
// (also import category options query and CATEGORIES fallback)

export function SpacesFilters({ categoryNames }: { categoryNames: string[] }) {
  const [showFilters, setShowFilters] = useState(false);
  const {
    search, setSearch,
    statusFilter, setStatusFilter,
    floorFilter,  // read-only here; floor tabs in SpacesPage set this
    minArea, setMinArea,
    maxArea, setMaxArea,
    minRent, setMinRent,
    maxRent, setMaxRent,
    categoryFilter, setCategoryFilter,
    spaceTypeFilter, setSpaceTypeFilter,
    tierFilter, setTierFilter,
    leaseTermFilter, setLeaseTermFilter,
    hasAdvancedFilters,
    clearFilters,
  } = useSpacesFilters();
  const { selectionMode, setSelectionMode } = useSpacesStore();

  // ... paste the filter JSX from SpacesPage here (currently inside {view === 'grid' && ...})
}
```

Note: `categoryNames` is passed as a prop because it requires a `useQuery` call that SpacesPage already makes (for `categoriesApi.getOptions`). Alternatively, move that query inside `SpacesFilters` — either approach works.

- [ ] **Step 2: Create SpacesGrid**

`SpacesGrid` renders the unit grid, loading skeletons, empty state, and the bulk action bar.

```typescript
// src/pages/spaces/SpacesGrid.tsx
import React from 'react';
import { useSpacesStore } from '@/store/spaces.store';
import { UnitCard } from '@/components/spaces/UnitCard';
import { BulkStatusDialog, BulkCategoryDialog, BulkRentDialog } from '@/components/spaces/dialogs/BulkDialogs';
import { CompareModal } from '@/components/spaces/CompareModal'; // (extract CompareModal in this step too)
import { Skeleton } from '@/components/ui/skeleton';
import type { Unit, UnitSlotSummary } from '@/types';
// icons for empty state + bulk bar

export function SpacesGrid({
  units, slotSummaries, isLoading, isAdmin,
  onUnitClick, onEditUnit, onDeleteUnit,
}: {
  units: Unit[];
  slotSummaries: Record<string, UnitSlotSummary>;
  isLoading: boolean;
  isAdmin: boolean;
  onUnitClick: (unit: Unit) => void;
  onEditUnit: (unit: any) => void;
  onDeleteUnit: (unit: any) => void;
}) {
  const {
    selectionMode, selectedIds, toggleSelect, selectAll, clearSelection,
    compareOpen, setCompareOpen,
  } = useSpacesStore();

  // ... paste grid JSX + bulk bar + CompareModal usage from SpacesPage
}
```

Also move `CompareModal` to `src/components/spaces/CompareModal.tsx` in this step (copy function, same process as Task 4).

- [ ] **Step 3: Slim SpacesPage**

After removing `SpacesFilters` and `SpacesGrid` content, SpacesPage should look like:

```typescript
export default function SpacesPage() {
  const { selectedMallId } = useMallStore();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { floorFilter } = useSpacesFilters();
  const {
    selectedUnit, setSelectedUnit,
    mergeDialogOpen, setMergeDialogOpen,
  } = useSpacesStore();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'LEASING_MANAGER' || user?.role === 'MALL_DIRECTOR';
  const view = (searchParams.get('view') as ViewMode) ?? 'grid';
  const setView = (v: ViewMode) => ...;

  // dialog state that only SpacesPage controls (not shared)
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingUnit, setDeletingUnit] = useState<any>(null);
  const [floorDialogOpen, setFloorDialogOpen] = useState(false);
  const [editingFloor, setEditingFloor] = useState<any>(null);
  const [deletingFloor, setDeletingFloor] = useState<any>(null);
  const [bulkActionOpen, setBulkActionOpen] = useState<'status'|'category'|'rent'|null>(null);

  // queries
  const { data: floorsData } = useQuery(...);
  const { data, isLoading } = useQuery(...);  // units
  const units: Unit[] = data?.data ?? [];
  const unitIds = units.map(u => u.id);
  const { data: slotSummaries = {} } = useQuery(...);

  // mutations
  const deleteMutation = ...;
  const deleteFloorMutation = ...;
  const bulkMutation = ...;

  return (
    <div>
      {/* Header */}
      {/* Floor tabs */}
      {/* Alerts */}
      {view === 'analytics' && <AnalyticsView mallId={selectedMallId} />}
      {view === 'grid' && <SpacesFilters categoryNames={categoryNames} />}
      {view === 'grid' && <SpacesGrid units={units} ... />}
      {view === 'floor' && <FloorPlan ... />}
      {view === 'map' && <MallMapViewer ... />}

      {/* Dialogs */}
      <UnitDetailSheet unit={selectedUnit} onClose={() => setSelectedUnit(null)} ... />
      <CreateEditUnitDialog ... />
      <CreateEditFloorDialog ... />
      <ConfirmDialog ... />  {/* delete unit */}
      <ConfirmDialog ... />  {/* delete floor */}
      <MergeUnitsDialog ... />
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 5: Full smoke test**
  - All 4 view tabs work (Danh sách, Sơ đồ tầng, Bản đồ số, Analytics)
  - Filters update URL and filter the list
  - Create / edit / delete unit
  - Create / edit / delete floor
  - Bulk status update
  - Unit detail sheet + all 4 tabs inside it
  - Compare modal
  - Merge dialog

- [ ] **Step 6: Final commit**

```bash
git add apps/frontend/src/pages/spaces/ apps/frontend/src/components/spaces/
git commit -m "refactor(spaces): extract SpacesFilters and SpacesGrid, slim SpacesPage to orchestrator"
```

---

## Self-Review

**Spec coverage:**
- [x] URL params for all filter state → Task 2
- [x] useSpacesStore for shared UI state → Task 3
- [x] Extract all dialogs → Task 4
- [x] Extract UnitCard, SpacesAlerts, AnalyticsView → Task 4
- [x] Extract tab components → Task 5
- [x] Extract UnitDetailSheet → Task 5
- [x] Extract SpacesFilters, SpacesGrid → Task 6
- [x] SpacesPage slims to ~150 lines → Task 6
- [x] Shared constants reusable by all components → Task 1

**Migration note:** The `?floorId=` URL param (used by Admin navigation links to pre-select a floor) changes to `?floor=` in Task 2. Search for any other pages that generate this link and update them.

**Type note:** `Set<string>` in Zustand state works fine without `persist`. Do not add `persist` to `spaces.store.ts`.
