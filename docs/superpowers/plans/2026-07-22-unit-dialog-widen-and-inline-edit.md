# Widen Unit Popup + Editable Info Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen the "Sửa/Tạo mặt bằng" popup and let users view + edit the full field set directly inside the "Thông tin" tab of the unit detail sheet, without needing to open the popup.

**Architecture:** Extract the ~13-field form body currently inline in `CreateEditUnitDialog` into a new shared, presentational component `UnitFormFields`. `CreateEditUnitDialog` is widened and refactored to render it. `UnitDetailSheet` gains its own `react-hook-form` instance and an `isEditingInfo` toggle; when active, it renders the same `UnitFormFields` component in place of the read-only "THÔNG TIN MẶT BẰNG" block and submits via the same `spacesApi.updateUnit` call the popup uses.

**Tech Stack:** React, TypeScript, react-hook-form, @tanstack/react-query, Tailwind CSS. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-unit-dialog-widen-and-inline-edit-design.md` — follow it exactly; do not add scope beyond it.
- Per the spec's Testing section, this component tree has no existing automated tests and the approved approach is manual verification, not new test files. Each task below verifies with a TypeScript typecheck (`npx tsc -p tsconfig.json`) instead of unit tests; the final task is a manual QA pass.
- Trạng thái (status) field stays OUT of `UnitFormFields` — it remains only in `CreateEditUnitDialog`, and the sheet's separate "ĐỔI TRẠNG THÁI" dropdown (with history tracking) is untouched.
- No backend/DTO changes. No changes to `spacesApi.updateUnit` or `spacesApi.createUnit` signatures.
- All new/changed UI text stays in Vietnamese, matching existing copy in these files.

---

### Task 1: Extract shared `UnitFormFields` component

**Files:**
- Create: `apps/frontend/src/components/spaces/dialogs/UnitFormFields.tsx`

**Interfaces:**
- Produces: `UnitFormFields` React component, default export is a named export `UnitFormFields`, props:
  ```ts
  interface UnitFormFieldsProps {
    register: any;
    watch: any;
    setValue: any;
    errors: any;
    floors: any[];
    zones: any[];
    categoryNames: string[];
  }
  ```
  Consumed by `react-hook-form`'s `register`, `watch`, `setValue`, `formState.errors` from any `useForm()` instance whose default values include: `code, name, category, floorId, zoneId, areaGFA, areaNLA, baseRentPerSqm, camPerSqm, spaceType, tier, leaseTermType, isFlexibleArea, minFlexArea, maxFlexArea` (all strings except `isFlexibleArea: boolean`).
- Consumes: nothing from other tasks — this is a leaf component, only depends on existing `@/components/ui/input`, `@/components/ui/select`, and `@/pages/spaces/spaces.constants`.

This is a pure extraction: the JSX body is copied from the current `CreateEditUnitDialog.tsx` (lines 161–359), regrouped into the approved layout (Mã+Tên; Tầng+Khu vực+Ngành hàng; Diện tích GFA+NLA; Giá thuê+CAM; Loại sảnh+Tier+Hình thức thuê; Sảnh linh động checkbox + conditional min/max), with the Trạng thái field removed (that field stays behind in `CreateEditUnitDialog`).

- [ ] **Step 1: Write the component**

```tsx
import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SPACE_TYPE_OPTIONS, TIER_OPTIONS, LEASE_TERM_OPTIONS } from '@/pages/spaces/spaces.constants';

export interface UnitFormFieldsProps {
  register: any;
  watch: any;
  setValue: any;
  errors: any;
  floors: any[];
  zones: any[];
  categoryNames: string[];
}

export function UnitFormFields({
  register, watch, setValue, errors, floors, zones, categoryNames,
}: UnitFormFieldsProps) {
  return (
    <div className="space-y-4">
      {/* Code + Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Mã mặt bằng *</label>
          <Input
            {...register('code', { required: true })}
            placeholder="GF-A01"
            className={errors.code ? 'border-red-400' : ''}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Tên (tuỳ chọn)</label>
          <Input {...register('name')} placeholder="Unit A01..." />
        </div>
      </div>

      {/* Floor + Zone + Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Tầng</label>
          <Select value={watch('floorId')} onValueChange={(v) => { setValue('floorId', v); setValue('zoneId', ''); }}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn tầng..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">— Không chọn —</SelectItem>
              {floors.map((f: any) => (
                <SelectItem key={f.id} value={f.id}>{f.name} ({f.level})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('floorId')} />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Khu vực (Zone)</label>
          <Select value={watch('zoneId')} onValueChange={(v) => setValue('zoneId', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn zone..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">— Không chọn —</SelectItem>
              {zones.map((z: any) => (
                <SelectItem key={z.id} value={z.id}>{z.name}{z.code ? ` (${z.code})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('zoneId')} />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Ngành hàng</label>
          <Select value={watch('category')} onValueChange={(v) => setValue('category', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn ngành hàng..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">— Không chọn —</SelectItem>
              {categoryNames.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('category')} />
        </div>
      </div>

      {/* Areas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Diện tích GFA (m²) *</label>
          <Input
            {...register('areaGFA', { required: true })}
            value={watch('areaGFA')}
            onChange={(e) => setValue('areaGFA', e.target.value, { shouldDirty: true, shouldValidate: true })}
            type="number" step="0.01" placeholder="120"
            className={errors.areaGFA ? 'border-red-400' : ''}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Diện tích NLA (m²)</label>
          <Input
            {...register('areaNLA')}
            value={watch('areaNLA')}
            onChange={(e) => setValue('areaNLA', e.target.value, { shouldDirty: true })}
            type="number" step="0.01" placeholder="100"
            className={errors.areaNLA ? 'border-red-400' : ''}
          />
        </div>
      </div>

      {/* Rents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Giá thuê cơ bản (₫/m²)</label>
          <Input
            {...register('baseRentPerSqm')}
            value={watch('baseRentPerSqm')}
            onChange={(e) => setValue('baseRentPerSqm', e.target.value, { shouldDirty: true })}
            type="number" placeholder="450000"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Phí CAM (₫/m²)</label>
          <Input
            {...register('camPerSqm')}
            value={watch('camPerSqm')}
            onChange={(e) => setValue('camPerSqm', e.target.value, { shouldDirty: true })}
            type="number" placeholder="80000"
          />
        </div>
      </div>

      {/* Space type / Tier / Lease term */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Loại sảnh</label>
          <Select value={watch('spaceType')} onValueChange={(v) => setValue('spaceType', v)}>
            <SelectTrigger><SelectValue placeholder="Chọn loại..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— Tất cả —</SelectItem>
              {SPACE_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('spaceType')} />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Tier</label>
          <Select value={watch('tier')} onValueChange={(v) => setValue('tier', v)}>
            <SelectTrigger><SelectValue placeholder="Chọn tier..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— Không chọn —</SelectItem>
              {TIER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('tier')} />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Hình thức thuê</label>
          <Select value={watch('leaseTermType')} onValueChange={(v) => setValue('leaseTermType', v)}>
            <SelectTrigger><SelectValue placeholder="Chọn..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— Không chọn —</SelectItem>
              {LEASE_TERM_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('leaseTermType')} />
        </div>
      </div>

      {/* Flexible area */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            {...register('isFlexibleArea')}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm font-medium text-gray-700">Sảnh linh động (cho thuê theo m² không cố định)</span>
        </label>
        {watch('isFlexibleArea') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2 max-w-md">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Diện tích tối thiểu (m²)</label>
              <Input
                {...register('minFlexArea')}
                value={watch('minFlexArea')}
                onChange={(e) => setValue('minFlexArea', e.target.value, { shouldDirty: true })}
                type="number" step="0.1" placeholder="50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Diện tích tối đa (m²)</label>
              <Input
                {...register('maxFlexArea')}
                value={watch('maxFlexArea')}
                onChange={(e) => setValue('maxFlexArea', e.target.value, { shouldDirty: true })}
                type="number" step="0.1" placeholder="200"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && npx tsc -p tsconfig.json`
Expected: no errors related to `UnitFormFields.tsx` (this file isn't imported anywhere yet, so it must compile standalone with no unused-import errors — `noUnusedLocals` is `false` in `tsconfig.json`, so unused imports won't fail the build, but the file must still typecheck cleanly).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/spaces/dialogs/UnitFormFields.tsx
git commit -m "feat: extract shared UnitFormFields component from unit edit popup"
```

---

### Task 2: Widen `CreateEditUnitDialog` and use `UnitFormFields`

**Files:**
- Modify: `apps/frontend/src/components/spaces/dialogs/CreateEditUnitDialog.tsx`

**Interfaces:**
- Consumes: `UnitFormFields` from Task 1 (`./UnitFormFields`), props as defined above.
- Produces: no change to `CreateEditUnitDialog`'s own exported props/behavior — same `{ open, unit, mallId, defaultFloorId, onClose }` signature, same submit behavior (`spacesApi.updateUnit` / `spacesApi.createUnit`).

The Trạng thái (status) field moves to its own compact row above the shared fields (previously it was paired with Ngành hàng in a 2-column row; Ngành hàng is now inside `UnitFormFields`, so Trạng thái becomes a standalone field at the top of the form, right after the dialog title).

- [ ] **Step 1: Update imports**

In `apps/frontend/src/components/spaces/dialogs/CreateEditUnitDialog.tsx`, replace lines 1–12:

```tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { spacesApi, categoriesApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_CONFIG, CATEGORIES } from '@/pages/spaces/spaces.constants';
import { UnitFormFields } from './UnitFormFields';
```

(This drops the now-unused `Input` import and the `SPACE_TYPE_OPTIONS`, `TIER_OPTIONS`, `LEASE_TERM_OPTIONS` imports, since those only appear inside `UnitFormFields` now; adds the `UnitFormFields` import.)

- [ ] **Step 2: Replace the main form Dialog**

Replace lines 154–370 (the second `<Dialog open={open} ...>` block, from its opening tag through its closing `</Dialog>`) with:

```tsx
      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? `Sửa mặt bằng: ${unit.code}` : 'Thêm mặt bằng mới'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 pb-2">

            {/* Status */}
            <div className="max-w-xs">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Trạng thái</label>
              <Select value={watch('status')} onValueChange={(v) => setValue('status', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" {...register('status')} />
            </div>

            <UnitFormFields
              register={register}
              watch={watch}
              setValue={setValue}
              errors={errors}
              floors={floors}
              zones={zones}
              categoryNames={categoryNames}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Hủy</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo mặt bằng'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

Everything above this block (the unsaved-changes confirm `Dialog`, the `useForm` setup, the `useQuery` calls for floors/zones/categories, `mutation`, `handleClose`) stays unchanged — only the main form `Dialog`'s JSX body and the `DialogContent` className change.

- [ ] **Step 3: Typecheck**

Run: `cd apps/frontend && npx tsc -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual smoke check**

Run: `cd apps/frontend && npm run dev` (or use the project's existing dev workflow), open the Spaces page, click "Tạo mặt bằng mới". Confirm:
- The dialog is visibly wider than before (roughly 768px instead of 512px).
- Trạng thái field appears near the top, on its own, followed by the grouped fields (Mã+Tên, Tầng+Khu vực+Ngành hàng, etc.).
- Filling in Mã mặt bằng + Diện tích GFA and submitting still creates a unit successfully.
Stop the dev server after checking.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/spaces/dialogs/CreateEditUnitDialog.tsx
git commit -m "feat: widen unit create/edit popup and reuse shared form fields"
```

---

### Task 3: Editable "Thông tin" tab in `UnitDetailSheet`

**Files:**
- Modify: `apps/frontend/src/components/spaces/UnitDetailSheet.tsx`

**Interfaces:**
- Consumes: `UnitFormFields` from Task 1 (`./dialogs/UnitFormFields`), `spacesApi.updateUnit(id, payload)`, `spacesApi.listFloors(mallId)`, `spacesApi.listZones({ mallId })`, `categoriesApi.getOptions()` (all already used elsewhere in the codebase, same signatures as in `CreateEditUnitDialog.tsx`).
- Produces: no change to `UnitDetailSheet`'s exported props signature `{ unit, onClose, onEdit, onDelete }` — `onEdit` is kept (still used for other flows outside this file) but the sheet's own "Sửa" button no longer calls it; it now toggles local edit state instead.

- [ ] **Step 1: Update imports**

In `apps/frontend/src/components/spaces/UnitDetailSheet.tsx`, replace lines 1–28 with:

```tsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { spacesApi, bookingApi, proposalsApi, slotsApi, categoriesApi } from '@/api';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { FloorPlanEditor } from '@/components/FloorPlanEditor';
import { SlotSummaryBadge } from '@/components/SlotSummaryBadge';
import { useToast } from '@/components/ui/use-toast';
import {
  Building2, DollarSign, User, Mail, Phone, FileText, Pencil, Trash2,
  BookmarkPlus, Clock, TrendingUp, Users, Star, SlidersHorizontal,
  Calendar, Image, LayoutList, Scissors, GitMerge, Save, X,
} from 'lucide-react';
import type { Unit, UnitSlotSummary } from '@/types';
import {
  STATUS_CONFIG, STATUS_ICONS, SPACE_TYPE_OPTIONS, TIER_OPTIONS, LEASE_TERM_OPTIONS,
  CATEGORIES, mediaUrl, fmtDate, fmtMoney,
} from '@/pages/spaces/spaces.constants';
import { UnitMediaTab } from './tabs/UnitMediaTab';
import { SalesPipelineTab } from './tabs/SalesPipelineTab';
import { CreateBookingDialog } from './dialogs/CreateBookingDialog';
import { ConvertBookingDialog } from './dialogs/ConvertBookingDialog';
import { UnitFormFields } from './dialogs/UnitFormFields';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { ReasonActionDialog } from '@/components/ui/reason-action-dialog';
import { useAuthStore } from '@/store/auth.store';
```

- [ ] **Step 2: Add edit-mode state, form, and option queries**

Replace the block from `const [bookingOpen, setBookingOpen] = useState(false);` through `const [splitConfirmOpen, setSplitConfirmOpen] = useState(false);` (current lines 44–48) with:

```tsx
  const [bookingOpen, setBookingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'sales' | 'media' | 'slots'>('info');
  const [convertBooking, setConvertBooking] = useState<any | null>(null);
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);
  const [splitConfirmOpen, setSplitConfirmOpen] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);

  const {
    register: editRegister, handleSubmit: handleEditSubmit, watch: editWatch,
    setValue: editSetValue, reset: editReset, formState: { errors: editErrors },
  } = useForm({
    defaultValues: {
      code: '', name: '', category: '', floorId: '', zoneId: '',
      areaGFA: '', areaNLA: '', baseRentPerSqm: '', camPerSqm: '',
      spaceType: '', leaseTermType: '', tier: '', isFlexibleArea: false,
      minFlexArea: '', maxFlexArea: '',
    },
  });
```

Then, directly after the existing `slotSummary` query block (current lines 75–82, the `useQuery<UnitSlotSummary | null>` call), add these three new queries:

```tsx
  const { data: floorsData } = useQuery({
    queryKey: ['floors', unit?.mallId],
    queryFn: () => spacesApi.listFloors(unit!.mallId),
    enabled: isEditingInfo && !!unit?.mallId,
  });
  const { data: zonesData } = useQuery({
    queryKey: ['zones', unit?.mallId],
    queryFn: () => spacesApi.listZones({ mallId: unit!.mallId }),
    enabled: isEditingInfo && !!unit?.mallId,
  });
  const { data: categoryOptions } = useQuery({
    queryKey: ['category-options'],
    queryFn: categoriesApi.getOptions,
    staleTime: 300_000,
    enabled: isEditingInfo,
  });
```

- [ ] **Step 3: Add the update mutation**

Directly after the existing `statusMutation` block (current lines 97–106), add:

```tsx
  const updateInfoMutation = useMutation({
    mutationFn: (data: any) => {
      const payload = {
        ...data,
        mallId: unit!.mallId,
        areaGFA: Number(data.areaGFA),
        areaNLA: data.areaNLA ? Number(data.areaNLA) : undefined,
        baseRentPerSqm: data.baseRentPerSqm ? Number(data.baseRentPerSqm) : undefined,
        camPerSqm: data.camPerSqm ? Number(data.camPerSqm) : undefined,
        floorId: data.floorId || undefined,
        zoneId: data.zoneId || undefined,
        name: data.name || undefined,
        category: data.category || undefined,
        spaceType: data.spaceType || undefined,
        leaseTermType: data.leaseTermType || undefined,
        tier: data.tier || undefined,
        minFlexArea: data.minFlexArea ? Number(data.minFlexArea) : undefined,
        maxFlexArea: data.maxFlexArea ? Number(data.maxFlexArea) : undefined,
        isFlexibleArea: !!data.isFlexibleArea,
      };
      return spacesApi.updateUnit(detail?.id ?? unit!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      qc.invalidateQueries({ queryKey: ['floor-map'] });
      toast({ title: 'Đã cập nhật mặt bằng' });
      setIsEditingInfo(false);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });
```

- [ ] **Step 4: Add derived data and handlers after `d`/`monthlyEst`**

Replace the current lines 121–123:

```tsx
  const d: any = detail ?? unit;
  const cfg = d ? STATUS_CONFIG[d.status] : null;
  const monthlyEst = d ? ((d.baseRentPerSqm ?? 0) + (d.camPerSqm ?? 0)) * d.areaNLA : 0;
```

with:

```tsx
  const d: any = detail ?? unit;
  const cfg = d ? STATUS_CONFIG[d.status] : null;
  const monthlyEst = d ? ((d.baseRentPerSqm ?? 0) + (d.camPerSqm ?? 0)) * d.areaNLA : 0;

  const floors: any[] = (floorsData?.data ?? floorsData ?? []).slice().sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  const allZones: any[] = zonesData?.data ?? zonesData ?? [];
  const editFloorId = editWatch('floorId');
  const zones = editFloorId ? allZones.filter((z: any) => z.floorId === editFloorId) : allZones;
  const categoryNames: string[] = useMemo(() => {
    const fromApi = (categoryOptions as any[])?.map((c: any) => c.name).filter(Boolean) ?? [];
    return fromApi.length > 0 ? fromApi : CATEGORIES;
  }, [categoryOptions]);

  const handleStartEdit = () => {
    editReset({
      code: d.code ?? '',
      name: d.name ?? '',
      category: d.category ?? '',
      floorId: d.floorId ?? '',
      zoneId: d.zoneId ?? '',
      areaGFA: d.areaGFA?.toString() ?? '',
      areaNLA: d.areaNLA?.toString() ?? '',
      baseRentPerSqm: d.baseRentPerSqm?.toString() ?? '',
      camPerSqm: d.camPerSqm?.toString() ?? '',
      spaceType: d.spaceType ?? '',
      leaseTermType: d.leaseTermType ?? '',
      tier: d.tier ?? '',
      isFlexibleArea: d.isFlexibleArea ?? false,
      minFlexArea: d.minFlexArea?.toString() ?? '',
      maxFlexArea: d.maxFlexArea?.toString() ?? '',
    });
    setIsEditingInfo(true);
  };

  const handleCancelEdit = () => {
    editReset();
    setIsEditingInfo(false);
  };
```

`useMemo` here is a hook called during render, not conditionally, which is safe since it always runs on every render of this component (same as the other hooks above it).

- [ ] **Step 5: Swap the "THÔNG TIN MẶT BẰNG" section for edit-mode**

Replace the current `SheetSection` block (lines 248–277):

```tsx
          {/* Space info */}
          <SheetSection label="THÔNG TIN MẶT BẰNG" className="bg-gray-50">
            <SheetRow label="Diện tích GFA"      value={`${d.areaGFA?.toLocaleString()} m²`}  icon={Building2} />
            <SheetRow label="Diện tích NLA"      value={`${d.areaNLA?.toLocaleString()} m²`}  icon={Building2} />
            <SheetRow label="Giá thuê cơ bản"    value={d.baseRentPerSqm ? fmtMoney(d.baseRentPerSqm) : '—'} icon={DollarSign} />
            <SheetRow label="Phí CAM"            value={d.camPerSqm ? fmtMoney(d.camPerSqm) : '—'} icon={DollarSign} />
            {monthlyEst > 0 && (
              <SheetRow
                label="Ước tính / tháng"
                value={<span className="text-gray-700 font-semibold">{new Intl.NumberFormat('vi-VN').format(monthlyEst)} ₫</span>}
                icon={DollarSign}
              />
            )}
            {d.spaceType && (
              <SheetRow label="Loại sảnh" value={SPACE_TYPE_OPTIONS.find(o => o.value === d.spaceType)?.label ?? d.spaceType} icon={Building2} />
            )}
            {d.tier && (
              <SheetRow label="Tier" value={TIER_OPTIONS.find(o => o.value === d.tier)?.label ?? d.tier} icon={Star} />
            )}
            {d.leaseTermType && (
              <SheetRow label="Hình thức thuê" value={LEASE_TERM_OPTIONS.find(o => o.value === d.leaseTermType)?.label ?? d.leaseTermType} icon={Clock} />
            )}
            {d.isFlexibleArea && (
              <SheetRow
                label="Diện tích linh động"
                value={`${d.minFlexArea?.toLocaleString() ?? '?'} – ${d.maxFlexArea?.toLocaleString() ?? '?'} m²`}
                icon={SlidersHorizontal}
              />
            )}
          </SheetSection>
```

with:

```tsx
          {/* Space info */}
          {!isEditingInfo ? (
            <SheetSection label="THÔNG TIN MẶT BẰNG" className="bg-gray-50">
              <SheetRow label="Diện tích GFA"      value={`${d.areaGFA?.toLocaleString()} m²`}  icon={Building2} />
              <SheetRow label="Diện tích NLA"      value={`${d.areaNLA?.toLocaleString()} m²`}  icon={Building2} />
              <SheetRow label="Giá thuê cơ bản"    value={d.baseRentPerSqm ? fmtMoney(d.baseRentPerSqm) : '—'} icon={DollarSign} />
              <SheetRow label="Phí CAM"            value={d.camPerSqm ? fmtMoney(d.camPerSqm) : '—'} icon={DollarSign} />
              {monthlyEst > 0 && (
                <SheetRow
                  label="Ước tính / tháng"
                  value={<span className="text-gray-700 font-semibold">{new Intl.NumberFormat('vi-VN').format(monthlyEst)} ₫</span>}
                  icon={DollarSign}
                />
              )}
              {d.spaceType && (
                <SheetRow label="Loại sảnh" value={SPACE_TYPE_OPTIONS.find(o => o.value === d.spaceType)?.label ?? d.spaceType} icon={Building2} />
              )}
              {d.tier && (
                <SheetRow label="Tier" value={TIER_OPTIONS.find(o => o.value === d.tier)?.label ?? d.tier} icon={Star} />
              )}
              {d.leaseTermType && (
                <SheetRow label="Hình thức thuê" value={LEASE_TERM_OPTIONS.find(o => o.value === d.leaseTermType)?.label ?? d.leaseTermType} icon={Clock} />
              )}
              {d.isFlexibleArea && (
                <SheetRow
                  label="Diện tích linh động"
                  value={`${d.minFlexArea?.toLocaleString() ?? '?'} – ${d.maxFlexArea?.toLocaleString() ?? '?'} m²`}
                  icon={SlidersHorizontal}
                />
              )}
            </SheetSection>
          ) : (
            <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
              <div className="text-xs font-semibold tracking-wider text-gray-400 mb-3">THÔNG TIN MẶT BẰNG</div>
              <form
                id="unit-info-edit-form"
                onSubmit={handleEditSubmit((data) => updateInfoMutation.mutate(data))}
              >
                <UnitFormFields
                  register={editRegister}
                  watch={editWatch}
                  setValue={editSetValue}
                  errors={editErrors}
                  floors={floors}
                  zones={zones}
                  categoryNames={categoryNames}
                />
              </form>
            </div>
          )}
```

- [ ] **Step 6: Update the "Sửa" action button**

Replace the current Actions block (lines 376–399):

```tsx
          {/* Actions */}
          {(canManageSpaces || canManageSales) && <div className="flex gap-2 pt-2 border-t border-gray-100">
            {canManageSales && (d.status === 'VACANT' || d.status === 'BOOKING') && (
              <Button
                className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => { setBookingOpen(true); }}
              >
                <BookmarkPlus size={14} /> Tạo Booking
              </Button>
            )}
            {canManageSpaces && <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => { onEdit(d); }}
            >
              <Pencil size={14} /> Sửa
            </Button>}
            {canManageSpaces && <Button
              variant="outline"
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => { onDelete(d); }}
            >
              <Trash2 size={14} /> Xóa
            </Button>}
          </div>}
```

with:

```tsx
          {/* Actions */}
          {(canManageSpaces || canManageSales) && <div className="flex gap-2 pt-2 border-t border-gray-100">
            {canManageSales && !isEditingInfo && (d.status === 'VACANT' || d.status === 'BOOKING') && (
              <Button
                className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => { setBookingOpen(true); }}
              >
                <BookmarkPlus size={14} /> Tạo Booking
              </Button>
            )}
            {canManageSpaces && !isEditingInfo && <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleStartEdit}
            >
              <Pencil size={14} /> Sửa
            </Button>}
            {canManageSpaces && isEditingInfo && <Button
              type="button"
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleCancelEdit}
            >
              <X size={14} /> Hủy
            </Button>}
            {canManageSpaces && isEditingInfo && <Button
              type="submit"
              form="unit-info-edit-form"
              className="flex-1 gap-2"
              disabled={updateInfoMutation.isPending}
            >
              <Save size={14} /> {updateInfoMutation.isPending ? 'Đang lưu...' : 'Lưu'}
            </Button>}
            {canManageSpaces && !isEditingInfo && <Button
              variant="outline"
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => { onDelete(d); }}
            >
              <Trash2 size={14} /> Xóa
            </Button>}
          </div>}
```

(`Tạo Booking` and `Xóa` are hidden while editing to avoid conflicting actions on the same sheet; `onEdit` prop remains declared in the component signature — it's still used by other call sites — but is no longer invoked from within this file.)

- [ ] **Step 7: Typecheck**

Run: `cd apps/frontend && npx tsc -p tsconfig.json`
Expected: no errors. If TypeScript flags `onEdit` as an unused parameter, that's fine — `noUnusedParameters` is `false` in `tsconfig.json`.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/components/spaces/UnitDetailSheet.tsx
git commit -m "feat: make unit detail sheet's info tab editable in place"
```

---

### Task 4: Manual verification pass

No files change in this task — this is the acceptance check from the spec's Testing section, run against the dev server.

- [ ] **Step 1: Start the app**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` (per `README.md`), or `cd apps/frontend && npm run dev` if the backend is already running separately.

- [ ] **Step 2: Walk through the scenarios**

1. Open a unit's detail sheet, confirm "Thông tin" tab renders read-only, as before.
2. Click "Sửa" → fields become editable, pre-filled with the unit's current values, and Trạng thái is NOT shown in this inline form.
3. Edit a few fields (e.g. Tên, Giá thuê cơ bản), click "Lưu" → sheet returns to read-only view showing the new values, and a "Đã cập nhật mặt bằng" toast appears.
4. Click "Sửa" again, change a field, click "Hủy" → changes are discarded, original values shown.
5. Open the Kanban/list view's "Sửa" action → confirm it still opens the (now wider, `max-w-3xl`) `CreateEditUnitDialog` popup with the grouped grid layout, unaffected by the sheet changes.
6. Click "Tạo mặt bằng" → confirm the popup opens at the new width and creates a unit successfully.
7. In the sheet, confirm "ĐỔI TRẠNG THÁI" dropdown still works independently, both before and after toggling Info-tab edit-mode.

- [ ] **Step 3: Report results**

If all 7 checks pass, the feature is complete. If any fail, note which step failed and fix before considering the plan done — do not mark this task's checkbox until every check passes.
