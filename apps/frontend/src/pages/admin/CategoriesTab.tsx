import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesApi, spacesApi } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useMallStore } from '@/store/mall.store';
import { Controller, useForm } from 'react-hook-form';
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, Tags, DollarSign,
  Building2, RefreshCw, AlertTriangle,
} from 'lucide-react';
import type { Category, CategoryMallPricing, Floor, Zone } from '@/types';
import { flattenCategoryHierarchy, categoryIndentPrefix } from '@/lib/categoryHierarchy';

function formatCurrency(value: number | undefined | null) {
  if (value == null) return 'Kế thừa';
  return new Intl.NumberFormat('vi-VN').format(value);
}

type PricingFormValues = {
  categoryId: string;
  floorId: string;
  zoneId: string;
  minRentPerSqm: string;
  maxRentPerSqm: string;
  suggestedRent: string;
  camPerSqm: string;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function CategoryFormDialog({ open, category, onClose }: {
  open: boolean; category?: Category; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, reset } = useForm();
  // Distinct queryKey from the main tab's tree query below -- both used to share
  // the key ['categories'] despite calling different endpoints (flat list here
  // vs. getTree() there). React Query caches by key only, not by queryFn, so
  // whichever one last resolved silently overwrote the other's cached shape --
  // the main list would intermittently render the flat array (which also
  // carries each row's own one-level `children`) as if every category, parent
  // AND child alike, were a top-level row, with children rendered a second
  // time nested underneath -- the exact "ad1 shows twice" bug this fixes.
  const { data: categoriesData } = useQuery({ queryKey: ['categories', 'flat'], queryFn: () => categoriesApi.list() });
  const categories: Category[] = categoriesData ?? [];

  // CategoryFormDialog stays mounted across opens (AdminPage always renders it,
  // just toggling `open`) -- `defaultValue` on an uncontrolled input only applies
  // at first mount, so without this the form kept showing whichever category (or
  // blank "create" state) was active the very first time the dialog opened,
  // regardless of which row's Pencil button was actually clicked afterwards.
  useEffect(() => {
    if (!open) return;
    reset({
      code: category?.code ?? '',
      name: category?.name ?? '',
      description: category?.description ?? '',
      parentId: category?.parentId ?? '',
      sortOrder: category?.sortOrder ?? 0,
    });
  }, [open, category, reset]);

  const mutation = useMutation({
    mutationFn: (data: any) => category
      ? categoriesApi.update(category.id, data)
      : categoriesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: category ? 'Đã cập nhật ngành hàng' : 'Đã tạo ngành hàng' });
      reset();
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? 'Chỉnh sửa Ngành hàng' : 'Tạo Ngành hàng mới'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mã ngành hàng *</Label>
              <Input {...register('code', { required: true })} placeholder="FNB" className="mt-1 uppercase" />
            </div>
            <div>
              <Label>Tên hiển thị *</Label>
              <Input {...register('name', { required: true })} placeholder="F&B" className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Mô tả</Label>
              <Input {...register('description')} placeholder="Food & Beverage" className="mt-1" />
            </div>
            <div>
              <Label>Ngành hàng cha</Label>
              <select {...register('parentId')} className="mt-1 w-full border rounded-md px-3 py-2 text-sm">
                <option value="">— Không có —</option>
                {categories.filter(c => c.id !== category?.id && !c.parentId).map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Thứ tự sắp xếp</Label>
              <Input {...register('sortOrder')} type="number" className="mt-1" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <RefreshCw size={14} className="animate-spin mr-1" /> : null}
              {category ? 'Lưu' : 'Tạo'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({ category, level = 0, onEdit, onDelete }: {
  category: Category; level?: number; onEdit: (category: Category) => void; onDelete: (category: Category) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = category.children && category.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 group ${level > 0 ? 'ml-6' : ''}`}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="p-0.5">
            {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          </button>
        ) : (
          <div className="w-5" />
        )}
        <Tags size={14} className={level === 0 ? 'text-gray-500' : 'text-gray-400'} />
        <span className="font-medium text-gray-800 flex-1">{category.name}</span>
        <span className="text-xs text-gray-400 font-mono">{category.code}</span>
        <Badge className={category.isActive ? 'bg-green-100 text-green-700 border-0 text-xs' : 'bg-gray-100 text-gray-500 border-0 text-xs'}>
          {category.isActive ? 'Active' : 'Inactive'}
        </Badge>
        {category._count?.units !== undefined && (
          <span className="text-xs text-gray-400">{category._count.units} lô</span>
        )}
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(category)}>
            <Pencil size={12} className="text-gray-400" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDelete(category)}>
            <Trash2 size={12} className="text-red-400" />
          </Button>
        </div>
      </div>
      {expanded && hasChildren && (
        <div>
          {category.children!.map(child => (
            <CategoryRow key={child.id} category={child} level={level + 1} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY PRICING MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function PricingFormDialog({ open, pricing, mallId, onClose }: {
  open: boolean; pricing?: CategoryMallPricing; mallId: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, reset, watch, setValue, control } = useForm<PricingFormValues>();

  const { data: categoriesData } = useQuery({ queryKey: ['categories-options'], queryFn: () => categoriesApi.getOptions() });
  const categories: Category[] = categoriesData ?? [];
  const categoriesHierarchical = useMemo(() => flattenCategoryHierarchy(categories), [categories]);

  const { data: floorsData } = useQuery({
    queryKey: ['floors', mallId],
    queryFn: () => spacesApi.listFloors(mallId),
    enabled: !!mallId,
  });
  const floors: Floor[] = floorsData?.data ?? floorsData ?? [];

  const { data: zonesData } = useQuery({
    queryKey: ['zones', mallId],
    queryFn: () => spacesApi.listZones({ mallId }),
    enabled: !!mallId,
  });
  const zones: Zone[] = zonesData?.data ?? zonesData ?? [];
  const selectedFloorId = watch('floorId');
  const selectedZoneId = watch('zoneId');
  const isOverride = !!selectedFloorId || !!selectedZoneId;
  const visibleZones = selectedFloorId
    ? zones.filter((zone: any) => !zone.floorId || zone.floorId === selectedFloorId)
    : zones;

  useEffect(() => {
    if (!open) return;
    const dateValue = (value?: string | null) => value ? value.slice(0, 10) : '';
    reset({
      categoryId: pricing?.categoryId ?? '',
      floorId: pricing?.floorId ?? '',
      zoneId: pricing?.zoneId ?? '',
      minRentPerSqm: pricing?.minRentPerSqm?.toString() ?? '',
      maxRentPerSqm: pricing?.maxRentPerSqm?.toString() ?? '',
      suggestedRent: pricing?.suggestedRent?.toString() ?? '',
      camPerSqm: pricing?.camPerSqm?.toString() ?? '',
      effectiveFrom: dateValue(pricing?.effectiveFrom),
      effectiveTo: dateValue(pricing?.effectiveTo),
      notes: pricing?.notes ?? '',
    });
  }, [open, pricing, reset]);

  const optionalNumber = (value: unknown, label: string): number | null => {
    if (value == null) return null;
    const normalized = typeof value === 'number'
      ? value
      : String(value).trim().replace(/[\s,]/g, '');
    if (normalized === '') return null;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} phải là số không âm hợp lệ`);
    return parsed;
  };

  const mutation = useMutation({
    mutationFn: (data: PricingFormValues) => {
      const minRentPerSqm = optionalNumber(data.minRentPerSqm, 'Giá sàn');
      const maxRentPerSqm = optionalNumber(data.maxRentPerSqm, 'Giá trần');
      if (!data.floorId && !data.zoneId && (minRentPerSqm == null || maxRentPerSqm == null)) {
        throw new Error('Giá nền toàn Mall bắt buộc có giá sàn và giá trần');
      }
      const values = {
        minRentPerSqm,
        maxRentPerSqm,
        suggestedRent: optionalNumber(data.suggestedRent, 'Giá đề xuất'),
        camPerSqm: optionalNumber(data.camPerSqm, 'CAM'),
        effectiveTo: data.effectiveTo || null,
        notes: data.notes.trim() || null,
      };
      const payload = pricing ? values : {
        ...values,
        mallId,
        categoryId: data.categoryId,
        floorId: data.floorId || undefined,
        zoneId: data.zoneId || undefined,
        effectiveFrom: data.effectiveFrom || undefined,
      };
      return pricing
        ? categoriesApi.updatePricing(pricing.id, payload)
        : categoriesApi.createPricing(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-pricing'] });
      toast({ title: pricing ? 'Đã cập nhật giá' : 'Đã tạo giá mới' });
      reset();
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? e?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{pricing ? 'Chỉnh sửa Giá' : 'Tạo Giá mới'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Ngành hàng *</Label>
              <select {...register('categoryId', { required: true })} className="mt-1 w-full border rounded-md px-3 py-2 text-sm" disabled={!!pricing}>
                <option value="">— Chọn ngành hàng —</option>
                {categoriesHierarchical.map(c => (
                  <option key={c.id} value={c.id}>{categoryIndentPrefix(c.depth)}{c.name} ({c.code})</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Tầng (tùy chọn)</Label>
              <select
                {...register('floorId', {
                  onChange: () => setValue('zoneId', ''),
                })}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                disabled={!!pricing}
              >
                <option value="">— Tất cả tầng —</option>
                {floors.map(f => (
                  <option key={f.id} value={f.id}>{f.name} ({f.level})</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Khu vực (tùy chọn)</Label>
              <select {...register('zoneId')} className="mt-1 w-full border rounded-md px-3 py-2 text-sm" disabled={!!pricing}>
                <option value="">— Tất cả zone —</option>
                {visibleZones.map(z => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Giá sàn (VND/m²) {!isOverride && '*'}</Label>
              <Controller
                name="minRentPerSqm"
                control={control}
                render={({ field }) => <Input {...field} type="number" min="0" placeholder={isOverride ? 'Để trống để kế thừa' : '400000'} className="mt-1" />}
              />
            </div>
            <div>
              <Label>Giá trần (VND/m²) {!isOverride && '*'}</Label>
              <Controller
                name="maxRentPerSqm"
                control={control}
                render={({ field }) => <Input {...field} type="number" min="0" placeholder={isOverride ? 'Để trống để kế thừa' : '800000'} className="mt-1" />}
              />
            </div>
            <div>
              <Label>Giá đề xuất (VND/m²)</Label>
              <Controller
                name="suggestedRent"
                control={control}
                render={({ field }) => <Input {...field} type="number" min="0" placeholder={isOverride ? 'Để trống để kế thừa' : '550000'} className="mt-1" />}
              />
            </div>
            <div>
              <Label>CAM (VND/m²)</Label>
              <Controller
                name="camPerSqm"
                control={control}
                render={({ field }) => <Input {...field} type="number" min="0" placeholder={isOverride ? 'Để trống để kế thừa' : '80000'} className="mt-1" />}
              />
            </div>
            {!pricing && (
              <>
                <div>
                  <Label>Hiệu lực từ</Label>
                  <Input {...register('effectiveFrom')} type="date" className="mt-1" />
                </div>
                <div>
                  <Label>Hiệu lực đến</Label>
                  <Input {...register('effectiveTo')} type="date" className="mt-1" />
                </div>
              </>
            )}
            {pricing && (
              <div className="col-span-2">
                <Label>Hiệu lực đến</Label>
                <Input {...register('effectiveTo')} type="date" className="mt-1" />
              </div>
            )}
            <div className="col-span-2">
              <Label>Ghi chú</Label>
              <Input {...register('notes')} placeholder="Ghi chú..." className="mt-1" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <RefreshCw size={14} className="animate-spin mr-1" /> : null}
              {pricing ? 'Lưu' : 'Tạo'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CATEGORIES TAB
// ═══════════════════════════════════════════════════════════════════════════

export function CategoriesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<'categories' | 'pricing'>('categories');
  const [showCreate, setShowCreate] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);

  // Pricing state
  const selectedMallId = useMallStore((state) => state.selectedMallId) || '';
  const selectedMallName = useMallStore((state) => state.selectedMallName);
  const openMallContextModal = useMallStore((state) => state.openMallContextModal);
  const [showCreatePricing, setShowCreatePricing] = useState(false);
  const [editPricing, setEditPricing] = useState<CategoryMallPricing | null>(null);
  const [confirmDeletePricing, setConfirmDeletePricing] = useState<CategoryMallPricing | null>(null);

  // Queries
  const { data: categoriesData, isLoading: loadingCategories } = useQuery({
    queryKey: ['categories', 'tree'],
    queryFn: () => categoriesApi.getTree(),
  });
  const categories: Category[] = categoriesData ?? [];

  const { data: pricingData, isLoading: loadingPricing } = useQuery({
    queryKey: ['category-pricing', selectedMallId],
    queryFn: () => categoriesApi.listPricing({ mallId: selectedMallId }),
    enabled: !!selectedMallId && view === 'pricing',
  });
  const pricings: CategoryMallPricing[] = pricingData ?? [];

  // Order rows the same way Admin's category tree does (parent immediately
  // followed by its children, indented) instead of the API's alphabetical
  // category-name sort, so e.g. F&B's price bands stay visually grouped with
  // Coffee & Tea/Restaurant's overrides rather than scattered by name.
  const categoryDepthById = useMemo(() => {
    const seen = new Map<string, Category>();
    for (const p of pricings) if (p.category && !seen.has(p.category.id)) seen.set(p.category.id, p.category);
    const ordered = flattenCategoryHierarchy(Array.from(seen.values()));
    return new Map(ordered.map((c, i) => [c.id, { depth: c.depth, order: i }]));
  }, [pricings]);
  const pricingsOrdered = useMemo(() => {
    return [...pricings].sort((a, b) => {
      const orderA = categoryDepthById.get(a.category?.id ?? '')?.order ?? 0;
      const orderB = categoryDepthById.get(b.category?.id ?? '')?.order ?? 0;
      return orderA - orderB;
    });
  }, [pricings, categoryDepthById]);

  // Mutations
  const deleteCategoryMutation = useMutation({
    mutationFn: () => categoriesApi.delete(confirmDelete!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: 'Đã vô hiệu hóa ngành hàng' });
      setConfirmDelete(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const deletePricingMutation = useMutation({
    mutationFn: () => categoriesApi.deletePricing(confirmDeletePricing!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-pricing'] });
      toast({ title: 'Đã vô hiệu hóa giá' });
      setConfirmDeletePricing(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setView('categories')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'categories' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
          >
            <Tags size={14} className="inline mr-1.5" />
            Ngành hàng
          </button>
          <button
            onClick={() => setView('pricing')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'pricing' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
          >
            <DollarSign size={14} className="inline mr-1.5" />
            Giá theo Mall
          </button>
        </div>
        <div className="flex-1" />
        {view === 'categories' ? (
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus size={15} /> Thêm ngành hàng
          </Button>
        ) : (
          <>
            <div className="rounded-lg border bg-gray-50 px-3 py-2 text-sm">{selectedMallName}</div>
            <Button
              onClick={() => {
                if (!selectedMallId) return openMallContextModal();
                setShowCreatePricing(true);
              }}
              className="gap-2"
            >
              <Plus size={15} /> Thêm giá
            </Button>
          </>
        )}
      </div>

      {/* Categories View */}
      {view === 'categories' && (
        <>
          {loadingCategories ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <div className="bg-white rounded-xl border p-2">
              {categories.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Tags size={36} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Chưa có ngành hàng nào</p>
                </div>
              ) : (
                categories.map(cat => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    onEdit={setEditCategory}
                    onDelete={setConfirmDelete}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Pricing View */}
      {view === 'pricing' && (
        <>
          {loadingPricing ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Ngành hàng</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Tầng</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Zone</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Giá sàn</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Giá trần</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Đề xuất</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">CAM</th>
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pricingsOrdered.map((p) => {
                    const depth = categoryDepthById.get(p.category?.id ?? '')?.depth ?? 0;
                    return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3" style={depth > 0 ? { paddingLeft: `${16 + depth * 20}px` } : undefined}>
                        {depth > 0 && <span className="text-gray-300 mr-1">↳</span>}
                        <span className="font-medium">{p.category?.name}</span>
                        <span className="text-xs text-gray-400 ml-1">({p.category?.code})</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{p.floor?.name ?? 'Tất cả'}</td>
                      <td className="px-4 py-3 text-gray-500">{p.zone?.name ?? 'Tất cả'}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(p.minRentPerSqm)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(p.maxRentPerSqm)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-500">{formatCurrency(p.suggestedRent)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-500">{formatCurrency(p.camPerSqm)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditPricing(p)}>
                            <Pencil size={12} className="text-gray-400" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setConfirmDeletePricing(p)}>
                            <Trash2 size={12} className="text-red-400" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {pricings.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <DollarSign size={36} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Chưa có giá nào cho mall này</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <CategoryFormDialog
        open={showCreate || !!editCategory}
        category={editCategory ?? undefined}
        onClose={() => { setShowCreate(false); setEditCategory(null); }}
      />

      {selectedMallId && (
        <PricingFormDialog
          open={showCreatePricing || !!editPricing}
          pricing={editPricing ?? undefined}
          mallId={selectedMallId}
          onClose={() => { setShowCreatePricing(false); setEditPricing(null); }}
        />
      )}

      {/* Confirm Delete Category */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-500" />
              Vô hiệu hóa ngành hàng
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Bạn có chắc muốn vô hiệu hóa ngành hàng "{confirmDelete?.name}"?
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Hủy</Button>
            <Button variant="destructive" onClick={() => deleteCategoryMutation.mutate()} disabled={deleteCategoryMutation.isPending}>
              {deleteCategoryMutation.isPending ? <RefreshCw size={14} className="animate-spin mr-1" /> : null}
              Xác nhận
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Pricing */}
      <Dialog open={!!confirmDeletePricing} onOpenChange={() => setConfirmDeletePricing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-500" />
              Vô hiệu hóa giá
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Bạn có chắc muốn vô hiệu hóa giá của ngành hàng "{confirmDeletePricing?.category?.name}"?
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmDeletePricing(null)}>Hủy</Button>
            <Button variant="destructive" onClick={() => deletePricingMutation.mutate()} disabled={deletePricingMutation.isPending}>
              {deletePricingMutation.isPending ? <RefreshCw size={14} className="animate-spin mr-1" /> : null}
              Xác nhận
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
