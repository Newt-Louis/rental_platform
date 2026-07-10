import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { spacesApi, bookingApi, crmApi, customersApi, categoriesApi, slotsApi, proposalsApi, contractsApi } from '@/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMallStore } from '@/store/mall.store';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FloorPlan } from '@/components/FloorPlan';
import { FloorPlanEditor } from '@/components/FloorPlanEditor';
import { MallMapViewer } from '@/components/MallMapViewer';
import { MallMapEditor } from '@/components/MallMapEditor';
import { SlotSummaryBadge } from '@/components/SlotSummaryBadge';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/components/ui/use-toast';
import {
  Building2, Search, LayoutGrid, Map, Calendar, DollarSign,
  User, Mail, Phone, FileText, Plus, Pencil, Trash2, AlertTriangle, Layers,
  BookmarkPlus, Clock, ChevronUp, ChevronDown, X, Users, ArrowRight,
  Image, Upload, Star, LayoutList, BarChart3, Filter, CheckSquare, Square,
  Columns, RefreshCw, TrendingUp, AlertCircle, SlidersHorizontal, CheckCircle, Lock,
  GitMerge, Scissors, BadgeCheck,
} from 'lucide-react';
import type { Unit, UnitMedia, UnitSlotSummary } from '@/types';
import {
  STATUS_CONFIG, STATUS_ICONS, SPACE_TYPE_OPTIONS, TIER_OPTIONS,
  LEASE_TERM_OPTIONS, CATEGORIES, API_ORIGIN, mediaUrl, fmtDate, fmtMoney,
} from './spaces.constants';
import { useSpacesFilters } from '@/hooks/useSpacesFilters';

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
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

// ─── Create / Edit Unit Dialog ────────────────────────────────────────────────

function CreateEditUnitDialog({
  open, unit, mallId, defaultFloorId, onClose,
}: {
  open: boolean;
  unit?: any;
  mallId: string;
  defaultFloorId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!unit;

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm({
    defaultValues: {
      code: '', name: '', category: '', floorId: defaultFloorId ?? '',
      zoneId: '', areaGFA: '', areaNLA: '', baseRentPerSqm: '', camPerSqm: '', status: 'VACANT',
      spaceType: '', leaseTermType: '', tier: '', isFlexibleArea: false,
      minFlexArea: '', maxFlexArea: '',
    },
  });

  const selectedFloorId = watch('floorId');

  useEffect(() => {
    if (open) {
      reset(unit ? {
        code: unit.code ?? '',
        name: unit.name ?? '',
        category: unit.category ?? '',
        floorId: unit.floorId ?? defaultFloorId ?? '',
        zoneId: unit.zoneId ?? '',
        areaGFA: unit.areaGFA?.toString() ?? '',
        areaNLA: unit.areaNLA?.toString() ?? '',
        baseRentPerSqm: unit.baseRentPerSqm?.toString() ?? '',
        camPerSqm: unit.camPerSqm?.toString() ?? '',
        status: unit.status ?? 'VACANT',
        spaceType: (unit as any).spaceType ?? '',
        leaseTermType: (unit as any).leaseTermType ?? '',
        tier: (unit as any).tier ?? '',
        isFlexibleArea: (unit as any).isFlexibleArea ?? false,
        minFlexArea: (unit as any).minFlexArea?.toString() ?? '',
        maxFlexArea: (unit as any).maxFlexArea?.toString() ?? '',
      } : {
        code: '', name: '', category: '', floorId: defaultFloorId ?? '',
        zoneId: '', areaGFA: '', areaNLA: '', baseRentPerSqm: '', camPerSqm: '', status: 'VACANT',
        spaceType: '', leaseTermType: '', tier: '', isFlexibleArea: false,
        minFlexArea: '', maxFlexArea: '',
      });
    }
  }, [open, unit, defaultFloorId]);

  const { data: floorsData } = useQuery({
    queryKey: ['floors', mallId],
    queryFn: () => spacesApi.listFloors(mallId),
    enabled: open && !!mallId,
  });
  const { data: zonesData } = useQuery({
    queryKey: ['zones', mallId],
    queryFn: () => spacesApi.listZones({ mallId }),
    enabled: open && !!mallId,
  });

  const floors: any[] = (floorsData?.data ?? floorsData ?? []).sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  const allZones: any[] = zonesData?.data ?? zonesData ?? [];
  const zones = selectedFloorId ? allZones.filter((z: any) => z.floorId === selectedFloorId) : allZones;

  const { data: categoryOptions } = useQuery({ queryKey: ['category-options'], queryFn: categoriesApi.getOptions, staleTime: 300_000, enabled: open });
  const categoryNames: string[] = useMemo(() => {
    const fromApi = (categoryOptions as any[])?.map((c: any) => c.name).filter(Boolean) ?? [];
    return fromApi.length > 0 ? fromApi : CATEGORIES;
  }, [categoryOptions]);

  const mutation = useMutation({
    mutationFn: (data: any) => {
      const payload = {
        ...data,
        mallId,
        areaGFA: Number(data.areaGFA),
        areaNLA: Number(data.areaNLA),
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
      return isEdit ? spacesApi.updateUnit(unit.id, payload) : spacesApi.createUnit(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      qc.invalidateQueries({ queryKey: ['floor-map'] });
      toast({ title: isEdit ? 'Đã cập nhật mặt bằng' : 'Đã tạo mặt bằng mới' });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Sửa mặt bằng: ${unit.code}` : 'Thêm mặt bằng mới'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 pb-2">

          {/* Code + Name */}
          <div className="grid grid-cols-2 gap-3">
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

          {/* Floor + Zone */}
          <div className="grid grid-cols-2 gap-3">
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
          </div>

          {/* Category + Status */}
          <div className="grid grid-cols-2 gap-3">
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
            <div>
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
          </div>

          {/* Areas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Diện tích GFA (m²) *</label>
              <Input
                {...register('areaGFA', { required: true })}
                type="number" step="0.01" placeholder="120"
                className={errors.areaGFA ? 'border-red-400' : ''}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Diện tích NLA (m²) *</label>
              <Input
                {...register('areaNLA', { required: true })}
                type="number" step="0.01" placeholder="100"
                className={errors.areaNLA ? 'border-red-400' : ''}
              />
            </div>
          </div>

          {/* Rents */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Giá thuê cơ bản (₫/m²)</label>
              <Input {...register('baseRentPerSqm')} type="number" placeholder="450000" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Phí CAM (₫/m²)</label>
              <Input {...register('camPerSqm')} type="number" placeholder="80000" />
            </div>
          </div>

          {/* GAP #4 + #6 + #3 — Loại sảnh / Tier / Hình thức thuê */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Loại sảnh</label>
              <Select value={watch('spaceType')} onValueChange={(v) => setValue('spaceType', v)}>
                <SelectTrigger><SelectValue placeholder="Chọn loại..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Tất cả —</SelectItem>
                  {SPACE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
                  {TIER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
                  {LEASE_TERM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <input type="hidden" {...register('leaseTermType')} />
            </div>
          </div>

          {/* GAP #5 — Sảnh linh động */}
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
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Diện tích tối thiểu (m²)</label>
                  <Input {...register('minFlexArea')} type="number" step="0.1" placeholder="50" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Diện tích tối đa (m²)</label>
                  <Input {...register('maxFlexArea')} type="number" step="0.1" placeholder="200" />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo mặt bằng'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create / Edit Floor Dialog ───────────────────────────────────────────────

function CreateEditFloorDialog({
  open, floor, mallId, onClose,
}: {
  open: boolean; floor?: any; mallId: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!floor;
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { name: '', level: '', sortOrder: '0' },
  });

  useEffect(() => {
    if (open) {
      reset(floor
        ? { name: floor.name ?? '', level: floor.level ?? '', sortOrder: String(floor.sortOrder ?? 0) }
        : { name: '', level: '', sortOrder: '0' });
    }
  }, [open, floor]);

  const mutation = useMutation({
    mutationFn: (data: any) => {
      const payload = { name: data.name, level: data.level, sortOrder: Number(data.sortOrder) || 0 };
      return isEdit ? spacesApi.updateFloor(floor.id, payload) : spacesApi.createFloor({ ...payload, mallId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floors'] });
      toast({ title: isEdit ? 'Đã cập nhật tầng' : 'Đã tạo tầng mới' });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Sửa tầng: ${floor.name}` : 'Thêm tầng mới'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 pb-2">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Tên tầng *</label>
            <Input
              {...register('name', { required: true })}
              placeholder="Ground Floor"
              className={errors.name ? 'border-red-400' : ''}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Mã tầng (level) *</label>
            <Input
              {...register('level', { required: true })}
              placeholder="GF"
              className={errors.level ? 'border-red-400' : ''}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Thứ tự hiển thị</label>
            <Input {...register('sortOrder')} type="number" placeholder="0" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo tầng'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Unit Detail Sheet ────────────────────────────────────────────────────────

// ─── Create Booking Dialog ────────────────────────────────────────────────────

const BOOKING_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ACTIVE:    { label: 'Đang giữ',  color: 'bg-amber-100 text-amber-700' },
  PENDING:   { label: 'Chờ',       color: 'bg-blue-100 text-gray-700' },
  EXPIRED:   { label: 'Hết hạn',   color: 'bg-gray-100 text-gray-500' },
  CANCELLED: { label: 'Đã hủy',    color: 'bg-red-100 text-red-600' },
  CONVERTED: { label: 'Đã convert',color: 'bg-green-100 text-green-700' },
};

function CreateBookingDialog({ unitId, unitCode, unit, open, onClose }: {
  unitId: string; unitCode: string; unit?: Unit; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm({
    defaultValues: {
      sourceType: 'lead',
      leadId: '', customerId: '',
      requestedArea: '', requestedTerm: '36', expectedRent: '',
      proposedRentPerSqm: '', proposedCamPerSqm: '',
      holdDays: '30', notes: '',
    },
  });

  const sourceType = watch('sourceType');
  const proposedRent = watch('proposedRentPerSqm');
  const selectedCustomerId = watch('customerId');
  const priceAutofilledRef = useRef(false);

  // Mỗi lần mở dialog: reset form, tự điền diện tích đề xuất = full diện tích NLA của mặt bằng
  // (mặc định đề xuất thuê trọn mặt bằng — người dùng vẫn có thể sửa nếu chỉ thuê một phần).
  useEffect(() => {
    if (open) {
      priceAutofilledRef.current = false;
      reset({
        sourceType: 'lead',
        leadId: '', customerId: '',
        requestedArea: unit?.areaNLA ? String(unit.areaNLA) : '',
        requestedTerm: '36', expectedRent: '',
        proposedRentPerSqm: '', proposedCamPerSqm: '',
        holdDays: '30', notes: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit?.id]);

  const { data: leadsData } = useQuery({
    queryKey: ['leads-all'],
    queryFn: () => crmApi.listLeads({ limit: 200, status: 'QUALIFIED' }),
    enabled: open,
  });
  const { data: customersData } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => customersApi.listCustomers({ limit: 200 }),
    enabled: open,
  });

  // Get category pricing for this unit
  const { data: pricingData } = useQuery({
    queryKey: ['category-pricing-lookup', unit?.mall?.id, unit?.categoryId, unit?.floor?.id, unit?.zone?.id],
    queryFn: () => categoriesApi.lookupPricing({
      mallId: unit!.mall!.id,
      categoryId: unit!.categoryId!,
      floorId: unit?.floor?.id,
      zoneId: unit?.zone?.id,
    }),
    enabled: open && !!unit?.mall?.id && !!unit?.categoryId,
  });

  // Validate proposed price when it changes
  const { data: priceValidation } = useQuery({
    queryKey: ['price-validation', unit?.mall?.id, unit?.categoryId, proposedRent],
    queryFn: () => categoriesApi.validatePrice({
      mallId: unit!.mall!.id,
      categoryId: unit!.categoryId!,
      floorId: unit?.floor?.id,
      zoneId: unit?.zone?.id,
      proposedRentPerSqm: Number(proposedRent),
    }),
    enabled: open && !!unit?.mall?.id && !!unit?.categoryId && !!proposedRent && Number(proposedRent) > 0,
  });

  const categoryPricing = pricingData?.pricing;

  // Khi tra được giá ngành hàng (master data) lần đầu trong phiên mở dialog này: tự điền giá đề xuất
  // theo suggestedRent/camPerSqm đã đăng ký — không ghi đè nếu người dùng đã tự sửa sau đó.
  useEffect(() => {
    if (open && !priceAutofilledRef.current && categoryPricing) {
      if (categoryPricing.suggestedRent) {
        setValue('expectedRent', String(categoryPricing.suggestedRent));
        setValue('proposedRentPerSqm', String(categoryPricing.suggestedRent));
      }
      if (categoryPricing.camPerSqm) {
        setValue('proposedCamPerSqm', String(categoryPricing.camPerSqm));
      }
      priceAutofilledRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, categoryPricing]);

  // GAP #14 — Khách hiện hữu: check if selected customer has active contracts
  const { data: activeContractsData } = useQuery({
    queryKey: ['customer-active-contracts', selectedCustomerId],
    queryFn: () => contractsApi.listContracts({ customerId: selectedCustomerId, status: 'ACTIVE', limit: 1 }),
    enabled: open && sourceType === 'customer' && !!selectedCustomerId,
    staleTime: 30_000,
  });
  const isExistingTenant = (activeContractsData?.total ?? activeContractsData?.data?.length ?? 0) > 0;

  const leads: any[] = leadsData?.data ?? [];
  const customers: any[] = customersData?.data ?? [];

  const mutation = useMutation({
    mutationFn: (data: any) => bookingApi.create({
      unitId,
      leadId: data.sourceType === 'lead' && data.leadId ? data.leadId : undefined,
      customerId: data.sourceType === 'customer' && data.customerId ? data.customerId : undefined,
      requestedArea: data.requestedArea ? Number(data.requestedArea) : undefined,
      requestedTerm: data.requestedTerm ? Number(data.requestedTerm) : undefined,
      expectedRent: data.expectedRent ? Number(data.expectedRent) : undefined,
      proposedRentPerSqm: data.proposedRentPerSqm ? Number(data.proposedRentPerSqm) : undefined,
      proposedCamPerSqm: data.proposedCamPerSqm ? Number(data.proposedCamPerSqm) : undefined,
      holdDays: Number(data.holdDays),
      notes: data.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-detail'] });
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'Đã tạo booking thành công' });
      reset();
      onClose();
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? 'Lỗi tạo booking',
      variant: 'destructive',
    }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus size={18} className="text-amber-500" />
            Tạo booking — {unitCode}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 pt-1">

          {/* Nguồn khách */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Loại khách hàng</label>
            <div className="flex gap-2">
              {[{ v: 'lead', label: 'Lead (CRM)' }, { v: 'customer', label: 'Customer' }].map(({ v, label }) => (
                <button
                  key={v} type="button"
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    sourceType === v
                      ? 'border-amber-400 bg-amber-50 text-amber-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                  onClick={() => setValue('sourceType', v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Chọn Lead */}
          {sourceType === 'lead' && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Lead *</label>
              <Select value={watch('leadId')} onValueChange={(v) => setValue('leadId', v)}>
                <SelectTrigger className={errors.leadId ? 'border-red-400' : ''}>
                  <SelectValue placeholder="Chọn lead..." />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.brandName} — {l.contactName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" {...register('leadId')} />
            </div>
          )}

          {/* Chọn Customer */}
          {sourceType === 'customer' && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Customer *</label>
              <Select value={watch('customerId')} onValueChange={(v) => setValue('customerId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn customer..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.customerCode} — {c.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" {...register('customerId')} />
              {/* GAP #14 — Khách hiện hữu badge */}
              {isExistingTenant && (
                <div className="flex items-center gap-1.5 mt-1.5 px-2.5 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                  <BadgeCheck size={13} className="text-green-600 shrink-0" />
                  <span className="font-medium">Khách hiện hữu</span>
                  <span className="text-green-500">— đang có hợp đồng hiện hành</span>
                </div>
              )}
            </div>
          )}

          {/* Thông số yêu cầu */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Diện tích (m²)</label>
              <Input {...register('requestedArea')} type="number" placeholder="120" />
              {unit?.areaNLA != null && (
                <p className="text-xs text-gray-400 mt-1">Gợi ý: trọn diện tích NLA ({unit.areaNLA.toLocaleString('vi-VN')} m²) — có thể sửa nếu thuê một phần</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Thời hạn (tháng)</label>
              <Input {...register('requestedTerm')} type="number" placeholder="36" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Giá kỳ vọng (₫/m²)</label>
              <Input {...register('expectedRent')} type="number" placeholder="650000" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Giữ slot (ngày) *</label>
              <Input {...register('holdDays', { required: true })} type="number" min={1} />
            </div>
          </div>

          {/* Category Pricing Info */}
          {categoryPricing && (
            <div className="bg-gray-50 p-3 rounded-lg text-sm">
              <div className="text-blue-800 font-medium mb-1 flex items-center gap-1">
                <DollarSign size={14} />
                Giá ngành hàng: {unit?.category ?? unit?.categoryRef?.name}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Sàn:</span>
                  <span className="ml-1 font-medium">{categoryPricing.minRentPerSqm?.toLocaleString()} ₫</span>
                </div>
                <div>
                  <span className="text-gray-500">Trần:</span>
                  <span className="ml-1 font-medium">{categoryPricing.maxRentPerSqm?.toLocaleString()} ₫</span>
                </div>
                {categoryPricing.suggestedRent && (
                  <div>
                    <span className="text-gray-500">Đề xuất:</span>
                    <span className="ml-1 font-medium">{categoryPricing.suggestedRent?.toLocaleString()} ₫</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Proposed Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Giá sale đề xuất (₫/m²)</label>
              <Input {...register('proposedRentPerSqm')} type="number" placeholder="550000" />
              {categoryPricing?.suggestedRent != null && (
                <p className="text-xs text-gray-400 mt-1">Gợi ý theo ngành hàng: {categoryPricing.suggestedRent.toLocaleString('vi-VN')} ₫</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">CAM đề xuất (₫/m²)</label>
              <Input {...register('proposedCamPerSqm')} type="number" placeholder="80000" />
              {categoryPricing?.camPerSqm != null && (
                <p className="text-xs text-gray-400 mt-1">Gợi ý theo ngành hàng: {categoryPricing.camPerSqm.toLocaleString('vi-VN')} ₫</p>
              )}
            </div>
          </div>

          {/* Price Validation Warning */}
          {priceValidation && !priceValidation.isValid && (
            <div className={`p-3 rounded-lg text-sm ${
              priceValidation.approvalLevel === 'CEO' ? 'bg-red-50 text-red-700 border border-red-200' :
              priceValidation.approvalLevel === 'DIRECTOR' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
              'bg-yellow-50 text-yellow-700 border border-yellow-200'
            }`}>
              <div className="font-medium flex items-center gap-1">
                <AlertTriangle size={14} />
                Giá cần phê duyệt
              </div>
              <p className="mt-1">{priceValidation.message}</p>
              <div className="mt-1 text-xs opacity-80">
                Chênh lệch: {priceValidation.deviationPercent?.toFixed(1)}% so với giá sàn
              </div>
            </div>
          )}

          {priceValidation?.isValid && proposedRent && Number(proposedRent) > 0 && (
            <div className="p-3 rounded-lg text-sm bg-green-50 text-green-700 border border-green-200">
              <div className="flex items-center gap-1">
                <CheckCircle size={14} />
                <span className="font-medium">Giá đề xuất hợp lệ</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú</label>
            <Textarea {...register('notes')} placeholder="Khách đã site visit, có tiềm năng cao..." rows={2} />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending} className="bg-amber-500 hover:bg-amber-600 text-white gap-2">
              <BookmarkPlus size={15} />
              {mutation.isPending ? 'Đang tạo...' : 'Tạo Booking'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Unit Media Tab ───────────────────────────────────────────────────────────

const MEDIA_TYPE_LABELS: Record<string, string> = {
  PHOTO: 'Ảnh',
  FLOOR_PLAN: 'Floor Plan',
  VIDEO: 'Video',
  RENDER_3D: '3D Render',
  BROCHURE: 'Brochure',
  SITE_MAP: 'Sơ đồ',
};

function UnitMediaTab({ unitId }: { unitId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mediaType, setMediaType] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useState<HTMLInputElement | null>(null);

  const { data: mediaList = [], isLoading } = useQuery<UnitMedia[]>({
    queryKey: ['unit-media', unitId, mediaType],
    queryFn: () => spacesApi.listUnitMedia(unitId, mediaType || undefined),
    enabled: !!unitId,
  });

  const deleteMutation = useMutation({
    mutationFn: (mediaId: string) => spacesApi.deleteUnitMedia(unitId, mediaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-media', unitId] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unitId] });
      toast({ title: 'Đã xóa media' });
    },
    onError: () => toast({ title: 'Lỗi xóa media', variant: 'destructive' }),
  });

  const setCoverMutation = useMutation({
    mutationFn: (mediaId: string) => spacesApi.updateUnitMedia(unitId, mediaId, { isCover: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-media', unitId] });
      toast({ title: 'Đã đặt ảnh bìa' });
    },
    onError: () => toast({ title: 'Lỗi', variant: 'destructive' }),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const ext = file.name.split('.').pop()?.toLowerCase();
      const typeByExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext ?? '') ? 'PHOTO'
        : ['pdf'].includes(ext ?? '') ? 'BROCHURE'
        : ['mp4', 'mov', 'avi'].includes(ext ?? '') ? 'VIDEO'
        : 'PHOTO';
      const type = mediaType || typeByExt;
      fd.append('type', type);
      await spacesApi.uploadUnitMedia(unitId, fd);
      qc.invalidateQueries({ queryKey: ['unit-media', unitId] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unitId] });
      toast({ title: 'Đã tải lên thành công' });
    } catch {
      toast({ title: 'Lỗi tải lên', variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {['', ...Object.keys(MEDIA_TYPE_LABELS)].map((t) => (
            <button
              key={t}
              onClick={() => setMediaType(t)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                mediaType === t
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t === '' ? 'Tất cả' : MEDIA_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium cursor-pointer hover:bg-gray-800 transition-colors">
          <Upload size={12} />
          {uploading ? 'Đang tải...' : 'Thêm'}
          <input
            type="file"
            className="hidden"
            accept="image/*,video/*,application/pdf"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : mediaList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
          <Image size={32} className="opacity-30" />
          <p className="text-sm">Chưa có tài liệu nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {mediaList.map((m) => (
            <div
              key={m.id}
              className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${
                m.isCover ? 'border-amber-400' : 'border-transparent hover:border-gray-200'
              }`}
            >
              {m.type === 'PHOTO' || m.type === 'RENDER_3D' || m.type === 'FLOOR_PLAN' || m.type === 'SITE_MAP' ? (
                <img
                  src={mediaUrl(m.fileUrl)}
                  alt={m.caption ?? m.fileName}
                  className="w-full aspect-square object-cover bg-gray-100"
                />
              ) : (
                <div className="w-full aspect-square bg-gray-100 flex flex-col items-center justify-center text-gray-400 gap-1">
                  <FileText size={24} />
                  <span className="text-xs text-center px-1 leading-tight">{MEDIA_TYPE_LABELS[m.type] ?? m.type}</span>
                </div>
              )}
              {m.isCover && (
                <div className="absolute top-1 left-1 bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Cover</div>
              )}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!m.isCover && (m.type === 'PHOTO' || m.type === 'RENDER_3D') && (
                  <button
                    className="w-5 h-5 rounded bg-amber-400 text-white flex items-center justify-center hover:bg-amber-500"
                    title="Đặt làm ảnh bìa"
                    onClick={() => setCoverMutation.mutate(m.id)}
                  >
                    <Star size={10} />
                  </button>
                )}
                <button
                  className="w-5 h-5 rounded bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                  title="Xóa"
                  onClick={() => deleteMutation.mutate(m.id)}
                >
                  <X size={10} />
                </button>
              </div>
              {m.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate">
                  {m.caption}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Convert Booking Dialog (from SpacesPage) ────────────────────────────────

function ConvertBookingFromSpacesDialog({
  booking, onClose,
}: {
  booking: any | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      area: booking?.requestedArea?.toString() ?? '',
      term: booking?.requestedTerm?.toString() ?? '12',
      startDate: new Date().toISOString().split('T')[0],
      rentPerSqm: booking?.expectedRent?.toString() ?? '',
      camPerSqm: '',
      deposit: '3',
      rentFree: '0',
      escalationPercent: '5',
      rentCurrency: 'VND',
      businessModel: '',
      serviceFeeSqm: '',
      businessSupportFeeSqm: '',
      fitoutDays: '90',
      handoverDate: '',
      openingDate: '',
      specialConditions: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: any) => bookingApi.convertToProposal(booking!.id, {
      area: Number(data.area),
      term: Number(data.term),
      startDate: data.startDate,
      rentPerSqm: Number(data.rentPerSqm),
      camPerSqm: data.camPerSqm ? Number(data.camPerSqm) : undefined,
      deposit: data.deposit ? Number(data.deposit) : undefined,
      rentFree: Number(data.rentFree),
      escalationPercent: Number(data.escalationPercent),
      rentCurrency: data.rentCurrency || 'VND',
      businessModel: data.businessModel || undefined,
      serviceFeeSqm: data.serviceFeeSqm ? Number(data.serviceFeeSqm) : undefined,
      businessSupportFeeSqm: data.businessSupportFeeSqm ? Number(data.businessSupportFeeSqm) : undefined,
      fitoutDays: data.fitoutDays ? Number(data.fitoutDays) : undefined,
      handoverDate: data.handoverDate || undefined,
      openingDate: data.openingDate || undefined,
      specialConditions: data.specialConditions || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-detail'] });
      qc.invalidateQueries({ queryKey: ['units'] });
      toast({ title: 'Đã tạo đề xuất thành công' });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const area = Number(watch('area') || 0);
  const rent = Number(watch('rentPerSqm') || 0);
  const cam = Number(watch('camPerSqm') || 0);
  const monthly = area * (rent + cam);

  const currency = watch('rentCurrency');

  return (
    <Dialog open={!!booking} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lập Tờ Trình Đề xuất từ Booking #{booking?.bookingNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 pb-2 text-sm">

          {/* ── Điều khoản cơ bản ── */}
          <div className="font-medium text-xs text-gray-400 uppercase tracking-wider pt-1">Mặt bằng & Thời hạn</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Diện tích (m²) *</label>
              <Input {...register('area', { required: true })} type="number" placeholder="100" className={errors.area ? 'border-red-400' : ''} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Thời hạn (tháng) *</label>
              <Input {...register('term', { required: true })} type="number" placeholder="36" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Ngày bắt đầu *</label>
              <Input {...register('startDate', { required: true })} type="date" />
            </div>
          </div>

          {/* ── Mô hình KD ── */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Mô hình Kinh doanh</label>
            <Select value={watch('businessModel')} onValueChange={(v) => setValue('businessModel', v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Chọn mô hình kinh doanh..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SHOP">Gian hàng (SHOP)</SelectItem>
                <SelectItem value="KIOSK">Kiosk</SelectItem>
                <SelectItem value="POP_UP">Pop-up</SelectItem>
                <SelectItem value="EVENT">Sự kiện (EVENT)</SelectItem>
                <SelectItem value="CHAIN">Chuỗi (CHAIN)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Giá thuê ── */}
          <div className="font-medium text-xs text-gray-400 uppercase tracking-wider pt-1">Điều khoản Tài chính</div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Đơn vị tiền tệ</label>
              <Select value={currency} onValueChange={(v) => setValue('rentCurrency', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VND">VND</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Giá thuê/m² ({currency}) *</label>
              <Input {...register('rentPerSqm', { required: true })} type="number" step="0.01" placeholder="0" className={errors.rentPerSqm ? 'border-red-400' : ''} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Phí Dịch vụ/m²</label>
              <Input {...register('serviceFeeSqm')} type="number" step="0.01" placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Phí HT KD/m²</label>
              <Input {...register('businessSupportFeeSqm')} type="number" step="0.01" placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Đặt cọc (số tháng)</label>
              <Input {...register('deposit')} type="number" placeholder="3" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Rent-free (tháng)</label>
              <Input {...register('rentFree')} type="number" placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Tăng giá/năm (%)</label>
              <Input {...register('escalationPercent')} type="number" placeholder="5" step="0.1" />
            </div>
          </div>

          {/* ── Preview ── */}
          {(() => {
            const a = Number(watch('area') || 0);
            const r = Number(watch('rentPerSqm') || 0);
            const s = Number(watch('serviceFeeSqm') || 0);
            const b = Number(watch('businessSupportFeeSqm') || 0);
            const total = a * (r + s + b);
            if (total <= 0) return null;
            return (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex justify-between items-center">
                <span className="text-xs text-blue-600">Ước tính tổng tiền/tháng</span>
                <span className="font-bold text-blue-700">
                  {currency === 'USD' ? `$${total.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD` : `${new Intl.NumberFormat('vi-VN').format(total)} ₫`}
                </span>
              </div>
            );
          })()}

          {/* ── Ngày bàn giao & Fitout ── */}
          <div className="font-medium text-xs text-gray-400 uppercase tracking-wider pt-1">Tiến độ & Bàn giao</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Ngày Bàn giao dự kiến</label>
              <Input {...register('handoverDate')} type="date" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">TG Hoàn thiện nội thất (ngày)</label>
              <Input {...register('fitoutDays')} type="number" placeholder="90" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Ngày Khai trương dự kiến</label>
              <Input {...register('openingDate')} type="date" />
            </div>
          </div>

          {/* ── Điều kiện đặc biệt ── */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Điều kiện đặc biệt (Mục 21)</label>
            <textarea
              {...register('specialConditions')}
              className="w-full border rounded-md p-2 text-sm resize-none h-16"
              placeholder="Các điều khoản đặc biệt đã thỏa thuận..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang tạo...' : 'Lập Tờ Trình Đề xuất'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sales Pipeline Tab ───────────────────────────────────────────────────────

const PROP_STATUS_CFG: Record<string, { label: string; color: string }> = {
  DRAFT:        { label: 'Draft',      color: 'bg-gray-100 text-gray-600' },
  SUBMITTED:    { label: 'Chờ duyệt', color: 'bg-yellow-100 text-yellow-700' },
  UNDER_REVIEW: { label: 'Đang xem',  color: 'bg-blue-100 text-blue-700' },
  APPROVED:     { label: 'Đã duyệt',  color: 'bg-green-100 text-green-700' },
  REJECTED:     { label: 'Từ chối',   color: 'bg-red-100 text-red-700' },
  CONVERTED:    { label: 'Đã ký HĐ', color: 'bg-purple-100 text-purple-700' },
};

function SalesPipelineTab({
  unit, onCreateBooking, onConvertBooking, onCancelBooking,
  onSubmitProposal, onConvertProposal, onNavigateProposals,
  cancelLoading, submitLoading, convertLoading,
}: {
  unit: any;
  onCreateBooking: () => void;
  onConvertBooking: (b: any) => void;
  onCancelBooking: (id: string) => void;
  onSubmitProposal: (id: string) => void;
  onConvertProposal: (id: string) => void;
  onNavigateProposals: () => void;
  cancelLoading: boolean;
  submitLoading: boolean;
  convertLoading: boolean;
}) {
  const bookings: any[] = unit.bookings ?? [];
  const proposals: any[] = unit.proposals ?? [];

  const activeBookings = bookings.filter((b) => ['ACTIVE','PENDING'].includes(b.status));
  const historyBookings = bookings.filter((b) => !['ACTIVE','PENDING'].includes(b.status));

  // Mặt bằng đã có khách thuê chính thức — không cho tạo booking mới chồng lên (khớp chặn ở backend)
  const isCommitted = ['OCCUPIED', 'CONTRACTED', 'UNDER_FITOUT'].includes(unit.status);

  const fmtVND = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  return (
    <div className="space-y-5">

      {/* Cảnh báo khi mặt bằng đã có khách thuê chính thức — không thể tạo booking mới */}
      {isCommitted && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 flex items-start gap-2 text-xs text-gray-500">
          <Lock size={13} className="mt-0.5 shrink-0" />
          <span>Mặt bằng đang ở trạng thái "{STATUS_CONFIG[unit.status]?.label ?? unit.status}" — đã có khách thuê chính thức nên không thể tạo booking mới cho khách khác.</span>
        </div>
      )}

      {/* CTA khi trống */}
      {bookings.length === 0 && proposals.length === 0 && !isCommitted && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center space-y-2">
          <p className="text-sm text-amber-700 font-medium">Mặt bằng chưa có khách — tạo booking để bắt đầu</p>
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white gap-2" onClick={onCreateBooking}>
            <BookmarkPlus size={14} /> Tạo Booking
          </Button>
        </div>
      )}

      {/* Active bookings */}
      {activeBookings.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold tracking-wider text-gray-400 flex items-center gap-1.5">
              <Users size={11} /> HÀNG ĐỢI BOOKING ({activeBookings.length})
            </span>
            {!isCommitted && (
              <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={onCreateBooking}>
                <Plus size={10} /> Thêm
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {activeBookings.map((b: any) => {
              const bcfg = BOOKING_STATUS_CONFIG[b.status] ?? BOOKING_STATUS_CONFIG.PENDING;
              const name = b.lead?.brandName ?? b.customer?.companyName ?? '—';
              const contact = b.lead?.contactName ?? b.customer?.brandName ?? '';
              const dl = b.expiresAt
                ? Math.max(0, Math.ceil((new Date(b.expiresAt).getTime() - Date.now()) / 86400000))
                : null;
              return (
                <div key={b.id} className={`rounded-xl border p-3 ${
                  b.priority === 1 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        b.priority === 1 ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>{b.priority}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{name}</div>
                        {contact && <div className="text-xs text-gray-400 truncate">{contact}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {dl !== null && b.status === 'ACTIVE' && (
                        <span className={`text-xs flex items-center gap-0.5 font-medium ${dl <= 7 ? 'text-red-500' : 'text-gray-400'}`}>
                          <Clock size={10} /> {dl}d
                        </span>
                      )}
                      <Badge className={`text-xs border-0 ${bcfg.color}`}>{bcfg.label}</Badge>
                    </div>
                  </div>

                  {/* Booking details */}
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-500">
                    {b.requestedArea && <span>DT: {b.requestedArea.toLocaleString()} m²</span>}
                    {b.requestedTerm && <span>Hạn: {b.requestedTerm} th</span>}
                    {b.expectedRent && <span>Kỳ vọng: {fmtVND(b.expectedRent)} ₫/m²</span>}
                    {b.proposedRentPerSqm && <span>Đề xuất: {fmtVND(b.proposedRentPerSqm)} ₫/m²</span>}
                    {b.assignedTo && <span className="col-span-2">Sale: {b.assignedTo.fullName}</span>}
                  </div>

                  {/* Linked proposal */}
                  {b.proposal && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <FileText size={11} className="text-gray-400" />
                      <span className="font-mono">{b.proposal.proposalNumber}</span>
                      <Badge className={`text-xs border-0 ${PROP_STATUS_CFG[b.proposal.status]?.color}`}>
                        {PROP_STATUS_CFG[b.proposal.status]?.label}
                      </Badge>
                      <button className="text-gray-400 hover:text-gray-700 ml-auto" onClick={onNavigateProposals}>
                        Xem →
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    {b.status === 'ACTIVE' && !b.proposal && (
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1 text-green-700 border-green-200 hover:bg-green-50"
                        onClick={() => onConvertBooking(b)}>
                        <ArrowRight size={10} /> Lập đề xuất
                      </Button>
                    )}
                    {['ACTIVE','PENDING'].includes(b.status) && (
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                        disabled={cancelLoading} onClick={() => onCancelBooking(b.id)}>
                        <X size={10} /> Hủy
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Proposals */}
      {proposals.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold tracking-wider text-gray-400 flex items-center gap-1.5">
              <FileText size={11} /> ĐỀ XUẤT ({proposals.length})
            </span>
            <button className="text-xs text-gray-500 hover:underline" onClick={onNavigateProposals}>
              Quản lý →
            </button>
          </div>
          <div className="space-y-3">
            {proposals.map((pr: any) => {
              const ps = PROP_STATUS_CFG[pr.status] ?? PROP_STATUS_CFG.DRAFT;
              const clientName = pr.tenant?.brandName ?? pr.lead?.brandName ?? '—';
              const steps: any[] = pr.approvalWorkflow?.steps ?? [];

              return (
                <div key={pr.id} className={`rounded-xl border p-3 space-y-3 ${
                  pr.status === 'APPROVED' ? 'border-green-200 bg-green-50' :
                  pr.status === 'REJECTED' ? 'border-red-100 bg-red-50/40' :
                  pr.status === 'CONVERTED' ? 'border-purple-100 bg-purple-50/30' :
                  pr.status === 'SUBMITTED' || pr.status === 'UNDER_REVIEW' ? 'border-yellow-200 bg-yellow-50/40' :
                  'border-gray-200 bg-white'
                }`}>
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-sm font-mono font-semibold">{pr.proposalNumber}</span>
                      <span className="text-xs text-gray-500 ml-2">{clientName}</span>
                    </div>
                    <Badge className={`text-xs border-0 flex-shrink-0 ${ps.color}`}>{ps.label}</Badge>
                  </div>

                  {/* Financial summary */}
                  {(() => {
                    const totalMonthly = (pr.monthlyRent ?? 0)
                      + (pr.monthlyCAM ?? 0)
                      + ((pr.area ?? 0) * (pr.serviceFeeSqm ?? 0))
                      + ((pr.area ?? 0) * (pr.businessSupportFeeSqm ?? 0));
                    return (
                      <div className="space-y-1 text-xs">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <div>
                            <span className="text-gray-400">Diện tích: </span>
                            <span className="font-medium">{pr.area?.toLocaleString()} m²</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Thời hạn: </span>
                            <span className="font-medium">{pr.term} tháng</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Giá thuê/m²: </span>
                            <span className="font-medium">{fmtVND(pr.rentPerSqm)} ₫</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Tiền thuê/tháng: </span>
                            <span className="font-medium">{fmtVND(pr.monthlyRent)} ₫</span>
                          </div>
                          {(pr.monthlyCAM ?? 0) > 0 && (
                            <div>
                              <span className="text-gray-400">Phí DVPT/tháng: </span>
                              <span className="font-medium">{fmtVND(pr.monthlyCAM)} ₫</span>
                            </div>
                          )}
                          {(pr.serviceFeeSqm ?? 0) > 0 && (
                            <div>
                              <span className="text-gray-400">Phí DV/tháng: </span>
                              <span className="font-medium">{fmtVND((pr.area ?? 0) * pr.serviceFeeSqm)} ₫</span>
                            </div>
                          )}
                          {(pr.businessSupportFeeSqm ?? 0) > 0 && (
                            <div>
                              <span className="text-gray-400">Phí HT KD/tháng: </span>
                              <span className="font-medium">{fmtVND((pr.area ?? 0) * pr.businessSupportFeeSqm)} ₫</span>
                            </div>
                          )}
                          {pr.discount > 0 && (
                            <div>
                              <span className="text-gray-400">Chiết khấu: </span>
                              <span className="text-red-600 font-medium">{pr.discount}%</span>
                            </div>
                          )}
                          {pr.rentFree > 0 && (
                            <div>
                              <span className="text-gray-400">Rent-free: </span>
                              <span className="font-medium">{pr.rentFree} tháng</span>
                            </div>
                          )}
                        </div>
                        {/* Total monthly highlight */}
                        <div className="flex items-center justify-between bg-gray-50 rounded px-2 py-1 mt-1">
                          <span className="text-gray-500">Tổng phải trả/tháng:</span>
                          <span className="font-bold text-gray-900">{fmtVND(totalMonthly)} ₫</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Tổng giá trị HĐ:</span>
                          <span className="font-bold text-green-700">{fmtVND(pr.totalContractValue)} ₫</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 text-gray-400">
                          <span>Bắt đầu: {fmtDate(pr.startDate)}</span>
                          <span>Kết thúc: {fmtDate(pr.endDate)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Approval steps */}
                  {steps.length > 0 && (
                    <div className="border-t border-dashed border-gray-200 pt-2">
                      <div className="text-xs text-gray-400 mb-1.5 font-medium">QUY TRÌNH PHÊ DUYỆT</div>
                      <div className="space-y-1">
                        {steps.map((s: any) => (
                          <div key={s.id} className="flex items-center gap-2 text-xs">
                            {s.status === 'APPROVED' ? (
                              <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                            ) : s.status === 'REJECTED' ? (
                              <X size={12} className="text-red-500 flex-shrink-0" />
                            ) : (
                              <div className="w-3 h-3 rounded-full border-2 border-gray-300 flex-shrink-0" />
                            )}
                            <span className={`flex-1 ${s.status === 'PENDING' ? 'text-gray-500' : 'text-gray-700'}`}>
                              Bước {s.stepOrder}: {s.approver?.fullName ?? s.approverRole}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              s.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                              s.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {s.status === 'APPROVED' ? 'Duyệt' : s.status === 'REJECTED' ? 'Từ chối' : 'Chờ'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contract link */}
                  {pr.contract && (
                    <div className="flex items-center gap-2 text-xs bg-purple-50 border border-purple-100 rounded-lg p-2">
                      <FileText size={12} className="text-purple-500" />
                      <span className="font-mono font-medium">{pr.contract.contractNumber}</span>
                      <Badge className="text-xs border-0 bg-purple-100 text-purple-700 ml-auto">{pr.contract.status}</Badge>
                    </div>
                  )}

                  {/* Quick actions */}
                  <div className="flex gap-1.5 flex-wrap">
                    {pr.status === 'DRAFT' && (
                      <Button size="sm" className="h-7 text-xs px-2 gap-1 bg-gray-900 hover:bg-gray-800 text-white"
                        disabled={submitLoading} onClick={() => onSubmitProposal(pr.id)}>
                        <ArrowRight size={11} /> Gửi phê duyệt
                      </Button>
                    )}
                    {pr.status === 'APPROVED' && !pr.contract && (
                      <Button size="sm" className="h-7 text-xs px-2 gap-1 bg-green-600 hover:bg-green-700 text-white"
                        disabled={convertLoading} onClick={() => onConvertProposal(pr.id)}>
                        <CheckCircle size={11} /> Ký Hợp đồng
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-gray-500"
                      onClick={onNavigateProposals}>
                      Chi tiết →
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Booking history */}
      {historyBookings.length > 0 && (
        <div>
          <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2">LỊCH SỬ BOOKING</div>
          <div className="space-y-1">
            {historyBookings.map((b: any) => {
              const bcfg = BOOKING_STATUS_CONFIG[b.status] ?? BOOKING_STATUS_CONFIG.EXPIRED;
              const name = b.lead?.brandName ?? b.customer?.companyName ?? '—';
              return (
                <div key={b.id} className="flex items-center justify-between py-1.5 px-2 text-xs text-gray-500 border border-gray-100 rounded-lg bg-gray-50">
                  <span className="font-medium text-gray-700">{name}</span>
                  <Badge className={`text-xs border-0 ${bcfg.color}`}>{bcfg.label}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Unit Detail Sheet ────────────────────────────────────────────────────────

function UnitDetailSheet({
  unit, onClose, onEdit, onDelete,
}: {
  unit: Unit | null;
  onClose: () => void;
  onEdit: (unit: any) => void;
  onDelete: (unit: any) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'sales' | 'media' | 'slots'>('info');
  const [convertBooking, setConvertBooking] = useState<any | null>(null);

  const submitProposalMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.submitProposal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      toast({ title: 'Đã gửi phê duyệt' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const convertProposalMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.convertProposal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['units'] });
      toast({ title: 'Đã chuyển thành hợp đồng' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['unit-detail', unit?.id],
    queryFn: () => spacesApi.getUnit(unit!.id),
    enabled: !!unit?.id,
  });

  const { data: slotSummary } = useQuery<UnitSlotSummary | null>({
    queryKey: ['slot-summary', unit?.id],
    queryFn: async () => {
      const summaries = await slotsApi.getSummaries([unit!.id]);
      return summaries[unit!.id] ?? null;
    },
    enabled: !!unit?.id,
  });

  const cancelBookingMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      bookingApi.cancel(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'Đã hủy booking' });
    },
    onError: () => toast({ title: 'Lỗi hủy booking', variant: 'destructive' }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => spacesApi.updateUnitWithHistory(detail?.id ?? unit!.id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'Đã cập nhật trạng thái' });
    },
    onError: () => toast({ title: 'Lỗi cập nhật trạng thái', variant: 'destructive' }),
  });

  const splitMutation = useMutation({
    mutationFn: () => spacesApi.splitUnit((detail as any)?.id ?? unit!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'Đã tách sảnh thành công' });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi tách sảnh', variant: 'destructive' }),
  });

  const d: any = detail ?? unit;
  const cfg = d ? STATUS_CONFIG[d.status] : null;
  const monthlyEst = d ? ((d.baseRentPerSqm ?? 0) + (d.camPerSqm ?? 0)) * d.areaNLA : 0;

  return (
    <Sheet
      open={!!unit}
      onClose={onClose}
      title={d?.code ?? ''}
      subtitle={`${d?.floor?.name ?? ''}${d?.zone?.name ? ' · ' + d.zone.name : ''}`}
      className="w-full sm:w-[720px]"
    >
      {d && (
        <div className="px-3 sm:px-6 pb-8 space-y-4 pt-4">
          {/* Status + category */}
          <div className="flex items-center gap-2 flex-wrap">
            {cfg && (
              <Badge className={`${cfg.color} border px-3 py-1 text-sm font-medium`}>{cfg.label}</Badge>
            )}
            {d.category && <Badge variant="outline" className="text-sm">{d.category}</Badge>}
            {d.mall?.name && <Badge variant="outline" className="text-xs text-gray-500">{d.mall.name}</Badge>}
          </div>

          {/* Tab switcher */}
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {([
              ['info', 'Thông tin', LayoutList],
              ['sales', 'Bán hàng', TrendingUp],
              ['media', 'Media', Image],
              ['slots', 'Booking Slot', BookmarkPlus],
            ] as const).map(([tab, label, Icon]) => {
              const hasBadge = tab === 'sales' && (
                (d.bookings?.filter((b: any) => ['ACTIVE', 'PENDING'].includes(b.status)).length ?? 0) +
                (d.proposals?.filter((p: any) => ['DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED'].includes(p.status)).length ?? 0)
              ) > 0;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex-shrink-0 ${
                    activeTab === tab
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon size={14} /> {label}
                  {hasBadge && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 absolute top-1.5 right-1.5" />}
                </button>
              );
            })}
          </div>

          {/* Media tab */}
          {activeTab === 'media' && <UnitMediaTab unitId={d.id} />}

          {/* Slots tab */}
          {activeTab === 'slots' && (
            <FloorPlanEditor
              unitId={d.id}
              unitStatus={d.status}
              floorPlanUrl={mediaUrl(d.media?.find((m: any) => m.type === 'FLOOR_PLAN')?.fileUrl)}
              unitArea={d.areaNLA}
            />
          )}

          {/* Sales Pipeline tab */}
          {activeTab === 'sales' && detailLoading && (
            <div className="space-y-3 pt-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}
          {activeTab === 'sales' && !detailLoading && (
            <SalesPipelineTab
              unit={d}
              onCreateBooking={() => setBookingOpen(true)}
              onConvertBooking={(b) => setConvertBooking(b)}
              onCancelBooking={(id) => cancelBookingMutation.mutate({ id, reason: 'Hủy từ UI' })}
              onSubmitProposal={(id) => submitProposalMutation.mutate(id)}
              onConvertProposal={(id) => convertProposalMutation.mutate(id)}
              onNavigateProposals={() => { navigate('/proposals'); onClose(); }}
              cancelLoading={cancelBookingMutation.isPending}
              submitLoading={submitProposalMutation.isPending}
              convertLoading={convertProposalMutation.isPending}
            />
          )}

          {/* Info tab content */}
          {activeTab === 'info' && (<>

          {/* Slot booking summary on main unit */}
          {slotSummary && slotSummary.totalSlots > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold tracking-wider text-gray-700">BOOKING SLOT (Ô NHỎ)</span>
                <button
                  onClick={() => setActiveTab('slots')}
                  className="text-xs text-gray-700 hover:underline"
                >
                  Xem chi tiết →
                </button>
              </div>
              <SlotSummaryBadge summary={slotSummary} />
            </div>
          )}

          {/* Change status */}
          <div>
            <label className="text-xs font-semibold tracking-wider text-gray-400 block mb-1.5">ĐỔI TRẠNG THÁI</label>
            <Select
              value={d.status}
              onValueChange={(v) => statusMutation.mutate(v)}
              disabled={statusMutation.isPending}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          {/* GAP #2 — Sảnh gộp info + Tách sảnh */}
          {d.isCombined && (
            <SheetSection label="THÔNG TIN SẢNH GỘP" className="bg-violet-50">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-violet-700">
                  <GitMerge size={14} />
                  <span>Sảnh này được gộp từ {Array.isArray(d.mergedFromIds) ? d.mergedFromIds.length : '?'} sảnh nguồn</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-violet-300 text-violet-700 hover:bg-violet-100"
                  disabled={splitMutation.isPending || d.status === 'OCCUPIED' || d.status === 'CONTRACTED' || d.status === 'UNDER_FITOUT'}
                  onClick={() => splitMutation.mutate()}
                >
                  <Scissors size={12} />
                  {splitMutation.isPending ? 'Đang tách...' : 'Tách sảnh'}
                </Button>
              </div>
              {(d.status === 'OCCUPIED' || d.status === 'CONTRACTED' || d.status === 'UNDER_FITOUT') && (
                <p className="text-xs text-violet-500 px-3 pb-2">Không thể tách khi sảnh đang được sử dụng.</p>
              )}
            </SheetSection>
          )}

          {/* Tenant */}
          {d.tenant && (
            <SheetSection label="KHÁCH THUÊ HIỆN TẠI" className="bg-green-50">
              <SheetRow label="Thương hiệu"  value={d.tenant.brandName}    icon={User} />
              <SheetRow label="Công ty"      value={d.tenant.companyName}  icon={Building2} />
              <SheetRow label="Liên hệ"      value={d.tenant.contactName}  icon={User} />
              <SheetRow label="Email"         value={d.tenant.contactEmail} icon={Mail} />
              <SheetRow label="Điện thoại"   value={d.tenant.contactPhone} icon={Phone} />
            </SheetSection>
          )}

          {/* Lease dates */}
          {(d.leaseStartDate || d.leaseEndDate) && (
            <SheetSection label="THỜI HẠN THUÊ" className="bg-gray-50">
              <SheetRow label="Ngày bắt đầu"  value={fmtDate(d.leaseStartDate)} icon={Calendar} />
              <SheetRow label="Ngày kết thúc" value={fmtDate(d.leaseEndDate)}   icon={Calendar} />
            </SheetSection>
          )}

          {/* Active contracts */}
          {Array.isArray(d.contracts) && d.contracts.length > 0 && (
            <div>
              <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2">HỢP ĐỒNG HIỆN TẠI</div>
              <div className="space-y-2">
                {d.contracts.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-gray-400" />
                      <span className="text-sm font-mono font-medium">{c.contractNumber}</span>
                    </div>
                    <Badge className="text-xs bg-green-100 text-green-700 border-0">{c.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sales pipeline summary on info tab */}
          {(() => {
            const activeBookings = (d.bookings ?? []).filter((b: any) => ['ACTIVE','PENDING'].includes(b.status));
            const activeProposals = (d.proposals ?? []).filter((p: any) => !['CONVERTED'].includes(p.status));
            if (activeBookings.length === 0 && activeProposals.length === 0) return null;
            return (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                    <TrendingUp size={12} /> PIPELINE BÁN HÀNG
                  </span>
                  <button
                    className="text-xs text-amber-700 hover:underline font-medium"
                    onClick={() => setActiveTab('sales')}
                  >
                    Xem chi tiết →
                  </button>
                </div>
                <div className="flex gap-3 text-xs flex-wrap">
                  {activeBookings.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-700">
                      <Users size={11} /> {activeBookings.length} booking đang chờ
                    </span>
                  )}
                  {activeProposals.length > 0 && (
                    <span className="flex items-center gap-1 text-gray-700">
                      <FileText size={11} /> {activeProposals.length} đề xuất
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            {(d.status === 'VACANT' || d.status === 'BOOKING') && (
              <Button
                className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => { setBookingOpen(true); }}
              >
                <BookmarkPlus size={14} /> Tạo Booking
              </Button>
            )}
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => { onEdit(d); }}
            >
              <Pencil size={14} /> Sửa
            </Button>
            <Button
              variant="outline"
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => { onDelete(d); }}
            >
              <Trash2 size={14} /> Xóa
            </Button>
          </div>
          </>)}

          {/* Booking Dialog — đặt ngoài khối activeTab === 'info' vì "Tạo Booking" ở tab Bán hàng
              (SalesPipelineTab) cũng mở dialog này; trước đây bị lồng trong info nên bấm từ tab
              khác không thấy popup cho tới khi quay lại tab Thông tin. */}
          <CreateBookingDialog
            unitId={d.id}
            unitCode={d.code}
            unit={d}
            open={bookingOpen}
            onClose={() => setBookingOpen(false)}
          />

          {/* Convert Booking → Proposal */}
          <ConvertBookingFromSpacesDialog
            booking={convertBooking}
            onClose={() => setConvertBooking(null)}
          />
        </div>
      )}
    </Sheet>
  );
}

// ─── Unit Card ────────────────────────────────────────────────────────────────

function UnitCard({ 
  unit, 
  onClick,
  selectionMode,
  isSelected,
  onToggleSelect,
  slotSummary,
}: { 
  unit: Unit; 
  onClick: () => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  slotSummary?: UnitSlotSummary | null;
}) {
  const cfg = STATUS_CONFIG[unit.status] ?? STATUS_CONFIG.VACANT;
  return (
    <Card
      className={`hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5 group ${
        isSelected ? 'ring-2 ring-blue-500 bg-gray-50' : ''
      }`}
      onClick={selectionMode ? onToggleSelect : onClick}
    >
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-start gap-2">
            {selectionMode && (
              <div className="pt-0.5">
                {isSelected ? (
                  <CheckSquare size={16} className="text-gray-700" />
                ) : (
                  <Square size={16} className="text-gray-300" />
                )}
              </div>
            )}
            <div>
              <div className="font-semibold text-sm">{unit.code}</div>
              {unit.name && <div className="text-xs text-gray-400">{unit.name}</div>}
            </div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>{cfg.label}</span>
        </div>
        <div className="text-xs text-gray-500 space-y-0.5">
          <div className="flex items-center gap-1">
            <span>{unit.floor?.name ?? '—'} · {unit.zone?.name ?? '—'}</span>
            {(unit as any).isCombined && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-violet-100 text-violet-600 rounded text-[10px] font-medium">
                <GitMerge size={9} /> Gộp
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>{unit.areaNLA.toLocaleString()} m² NLA</span>
            {unit.baseRentPerSqm > 0 && (
              <span className="text-green-600">{unit.baseRentPerSqm.toLocaleString()} ₫/m²</span>
            )}
          </div>
          {unit.category && <div className="text-gray-700">{unit.category}</div>}
          <SlotSummaryBadge summary={slotSummary} compact />
          {unit.tenant && <div className="font-medium text-gray-700 pt-1">{unit.tenant.brandName}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Merge Units Dialog (GAP #2) ─────────────────────────────────────────────

function MergeUnitsDialog({
  open,
  units,
  mallId,
  onClose,
}: {
  open: boolean;
  units: Unit[];
  mallId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { code: '', name: '' },
  });

  useEffect(() => {
    if (open) reset({ code: '', name: '' });
  }, [open]);

  const totalArea = units.reduce((s, u) => s + (u.areaNLA ?? 0), 0);
  const allVacant = units.every((u) => u.status === 'VACANT');

  const mergeMutation = useMutation({
    mutationFn: (data: any) => spacesApi.mergeUnits({
      unitIds: units.map((u) => u.id),
      code: data.code,
      name: data.name || undefined,
    }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: `Đã gộp thành công → ${result.combinedUnit?.code ?? ''}` });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi gộp sảnh', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge size={18} className="text-violet-500" />
            Gộp sảnh
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {/* Units to merge */}
          <div>
            <p className="text-xs font-semibold tracking-wider text-gray-400 mb-2">SẢNH ĐANG GỘP ({units.length})</p>
            <div className="space-y-1">
              {units.map((u) => (
                <div key={u.id} className="flex items-center justify-between text-sm px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="font-mono font-semibold">{u.code}</span>
                  <span className="text-gray-500">{u.areaNLA?.toLocaleString()} m²</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-sm px-3 py-1.5 bg-violet-50 rounded-lg border border-violet-100 mt-1">
              <span className="font-medium text-violet-700">Tổng diện tích NLA</span>
              <span className="font-bold text-violet-700">{totalArea.toLocaleString()} m²</span>
            </div>
          </div>

          {!allVacant && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle size={14} />
              Tất cả các sảnh phải có trạng thái <strong>Trống</strong> để có thể gộp.
            </div>
          )}

          {/* New unit code */}
          <form id="merge-form" onSubmit={handleSubmit((d) => mergeMutation.mutate(d))} className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Mã sảnh mới *</label>
              <Input
                {...register('code', { required: true })}
                placeholder="GF-A01+A02"
                className={errors.code ? 'border-red-400' : ''}
              />
              <p className="text-xs text-gray-400 mt-1">Sảnh gộp sẽ có mã mới này. Sảnh nguồn sẽ chuyển sang trạng thái "Đã gộp".</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Tên sảnh (tuỳ chọn)</label>
              <Input {...register('name')} placeholder="Sảnh A01 + A02 gộp" />
            </div>
          </form>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button
            form="merge-form"
            type="submit"
            disabled={mergeMutation.isPending || !allVacant}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
          >
            <GitMerge size={14} />
            {mergeMutation.isPending ? 'Đang gộp...' : 'Xác nhận gộp'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Action Dialogs ──────────────────────────────────────────────────────

function BulkStatusDialog({ open, count, onClose, onConfirm, loading }: {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: (status: string) => void;
  loading: boolean;
}) {
  const [status, setStatus] = useState('');
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Đổi trạng thái {count} mặt bằng</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn trạng thái mới" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => onConfirm(status)} disabled={!status || loading}>
            {loading ? 'Đang cập nhật...' : 'Xác nhận'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkCategoryDialog({ open, count, onClose, onConfirm, loading }: {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: (category: string) => void;
  loading: boolean;
}) {
  const [category, setCategory] = useState('');
  const { data: categoryOptions } = useQuery({ queryKey: ['category-options'], queryFn: categoriesApi.getOptions, staleTime: 300_000, enabled: open });
  const categoryNames: string[] = useMemo(() => {
    const fromApi = (categoryOptions as any[])?.map((c: any) => c.name).filter(Boolean) ?? [];
    return fromApi.length > 0 ? fromApi : CATEGORIES;
  }, [categoryOptions]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Đổi ngành hàng {count} mặt bằng</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn ngành hàng mới" />
            </SelectTrigger>
            <SelectContent>
              {categoryNames.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => onConfirm(category)} disabled={!category || loading}>
            {loading ? 'Đang cập nhật...' : 'Xác nhận'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkRentDialog({ open, count, onClose, onConfirm, loading }: {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: (rent: number | undefined, cam: number | undefined) => void;
  loading: boolean;
}) {
  const [rent, setRent] = useState('');
  const [cam, setCam] = useState('');
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Đổi giá thuê {count} mặt bằng</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Giá thuê cơ bản (₫/m²)</label>
            <Input
              type="number"
              placeholder="450000"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Phí CAM (₫/m²)</label>
            <Input
              type="number"
              placeholder="80000"
              value={cam}
              onChange={(e) => setCam(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button
            onClick={() => onConfirm(rent ? Number(rent) : undefined, cam ? Number(cam) : undefined)}
            disabled={(!rent && !cam) || loading}
          >
            {loading ? 'Đang cập nhật...' : 'Xác nhận'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Alerts Component ─────────────────────────────────────────────────────────

function SpacesAlerts({ mallId }: { mallId?: string | null }) {
  const { data: staleData } = useQuery({
    queryKey: ['stale-vacant', mallId],
    queryFn: () => spacesApi.staleVacantUnits({ mallId: mallId ?? undefined, days: 60 }),
    enabled: true,
  });

  const { data: expiringData } = useQuery({
    queryKey: ['expiring-leases', mallId],
    queryFn: () => spacesApi.expiringLeases({ mallId: mallId ?? undefined, days: 90 }),
    enabled: true,
  });

  const staleCount = staleData?.total ?? 0;
  const expiringCritical = expiringData?.summary?.critical ?? 0;
  const expiringWarning = expiringData?.summary?.warning ?? 0;

  if (staleCount === 0 && expiringCritical === 0 && expiringWarning === 0) return null;

  return (
    <div className="flex gap-3 mb-4 flex-wrap">
      {staleCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm">
          <AlertCircle size={16} className="text-red-500" />
          <span className="text-red-700">
            <strong>{staleCount}</strong> units trống &gt;60 ngày
          </span>
        </div>
      )}
      {expiringCritical > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm">
          <Clock size={16} className="text-orange-500" />
          <span className="text-orange-700">
            <strong>{expiringCritical}</strong> lease hết hạn trong 30 ngày
          </span>
        </div>
      )}
      {expiringWarning > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <Clock size={16} className="text-amber-500" />
          <span className="text-amber-700">
            <strong>{expiringWarning}</strong> lease hết hạn trong 60 ngày
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Compare Modal ────────────────────────────────────────────────────────────

function CompareModal({ 
  unitIds, 
  open, 
  onClose 
}: { 
  unitIds: string[]; 
  open: boolean; 
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['compare-units', unitIds],
    queryFn: () => spacesApi.compareUnits(unitIds),
    enabled: open && unitIds.length >= 2,
  });

  const units = data?.units ?? [];
  const summary = data?.summary;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns size={18} className="text-gray-500" />
            So sánh {unitIds.length} mặt bằng
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="py-10 text-center text-gray-400">Đang tải...</div>
        ) : units.length > 0 && (
          <div className="space-y-4">
            {/* Summary */}
            {summary && (
              <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-xs text-gray-500">Giá thuê TB</div>
                  <div className="font-semibold">{Number(summary.avgRent).toLocaleString()} ₫/m²</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Diện tích TB</div>
                  <div className="font-semibold">{Number(summary.avgArea).toLocaleString()} m²</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Range giá</div>
                  <div className="font-semibold text-sm">{summary.minRent.toLocaleString()} - {summary.maxRent.toLocaleString()}</div>
                </div>
              </div>
            )}

            {/* Comparison table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Thuộc tính</th>
                    {units.map((u: any) => (
                      <th key={u.id} className="text-left py-2 px-3 font-semibold">
                        {u.code}
                        {u.media?.[0]?.fileUrl && (
                          <img src={mediaUrl(u.media[0].fileUrl)} alt="" className="w-20 h-14 object-cover rounded mt-1" />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Trạng thái</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">
                        <Badge className={STATUS_CONFIG[u.status]?.color}>{STATUS_CONFIG[u.status]?.label}</Badge>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Diện tích NLA</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-medium">
                        {u.areaNLA.toLocaleString()} m²
                        <span className={`ml-1 text-xs ${Number(u.areaVsAvg) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({u.areaVsAvg > 0 ? '+' : ''}{u.areaVsAvg}%)
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Giá thuê/m²</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-medium">
                        {u.baseRentPerSqm.toLocaleString()} ₫
                        <span className={`ml-1 text-xs ${Number(u.rentVsAvg) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({u.rentVsAvg > 0 ? '+' : ''}{u.rentVsAvg}%)
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Phí CAM/m²</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.camPerSqm.toLocaleString()} ₫</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Tổng/tháng</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-semibold text-gray-700">
                        {u.totalMonthlyRent?.toLocaleString()} ₫
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Ngành hàng</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.category ?? '—'}</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Tầng</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.floor?.name ?? '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-gray-500">Khách thuê</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.tenant?.brandName ?? '—'}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Analytics View ───────────────────────────────────────────────────────────

function AnalyticsView({ mallId }: { mallId?: string | null }) {
  const { data: occupancyData } = useQuery({
    queryKey: ['occupancy', mallId],
    queryFn: () => spacesApi.occupancySummary(mallId),
  });

  const occ = occupancyData?.data ?? occupancyData;
  const occTotal = occ
    ? Object.entries(STATUS_CONFIG).reduce(
        (s, [k]) => s + (occ[k === 'UNDER_FITOUT' ? 'underFitout' : k.toLowerCase()] ?? 0), 0)
    : 0;

  const { data: rentData, isLoading: loadingRent } = useQuery({
    queryKey: ['rent-analytics', mallId],
    queryFn: () => spacesApi.rentAnalytics(mallId ?? undefined),
  });

  const { data: calendarData } = useQuery({
    queryKey: ['availability-calendar', mallId],
    queryFn: () => spacesApi.availabilityCalendar({ mallId: mallId ?? undefined, months: 6 }),
  });

  const { data: expiringData } = useQuery({
    queryKey: ['expiring-leases-dashboard', mallId],
    queryFn: () => spacesApi.expiringLeases({ mallId: mallId ?? undefined, days: 180 }),
  });

  if (loadingRent) {
    return <div className="py-10 text-center text-gray-400">Đang tải analytics...</div>;
  }

  const summary = rentData?.summary;
  const byFloor = rentData?.byFloor ?? [];
  const byCategory = rentData?.byCategory ?? [];
  const vacancy = calendarData?.currentlyVacant;
  const expiringSummary = expiringData?.summary;

  return (
    <div className="space-y-6">
      {/* Occupancy status tiles */}
      {occ && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <Card className="relative border border-l-4 border-l-slate-400">
            <CardContent className="p-3">
              <span className="absolute top-2 right-2 min-w-[1.375rem] h-[1.375rem] px-1 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center">
                {occTotal}
              </span>
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center mb-2">
                <BarChart3 size={14} className="text-slate-600" />
              </div>
              <div className="text-xs font-medium text-gray-500">Tất cả</div>
            </CardContent>
          </Card>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = occ[key === 'UNDER_FITOUT' ? 'underFitout' : key.toLowerCase()] ?? 0;
            const pct = occTotal > 0 ? Math.round((count / occTotal) * 100) : 0;
            return (
              <Card key={key} className={`relative border border-l-4 ${cfg.leftBorder} border-gray-100`}>
                <CardContent className="p-3">
                  <span className={`absolute top-2 right-2 min-w-[1.375rem] h-[1.375rem] px-1 rounded-full ${cfg.iconBg} ${cfg.textColor} text-xs font-bold flex items-center justify-center`}>
                    {count}
                  </span>
                  <div className={`w-7 h-7 rounded-lg ${cfg.iconBg} ${cfg.textColor} flex items-center justify-center mb-2`}>
                    {STATUS_ICONS[key]}
                  </div>
                  <div className="text-xs font-medium text-gray-500 truncate">{cfg.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{pct}%</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Occupancy bar */}
      {occ && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-gray-500 whitespace-nowrap">Lấp đầy</span>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-700"
              style={{ width: `${occ.occupancyRate}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{occ.occupancyRate}%</span>
          <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">
            {(occ.leasedArea ?? 0).toLocaleString()} / {(occ.totalArea ?? 0).toLocaleString()} m²
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-gray-900">{summary?.totalUnits ?? 0}</div>
            <div className="text-sm text-gray-500">Tổng units</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{summary?.occupiedUnits ?? 0}</div>
            <div className="text-sm text-gray-500">Đang thuê</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-gray-700">{Number(summary?.avgRentPerSqm ?? 0).toLocaleString()}</div>
            <div className="text-sm text-gray-500">Giá thuê TB (₫/m²)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-purple-600">{Number(summary?.totalMonthlyRevenue ?? 0).toLocaleString()}</div>
            <div className="text-sm text-gray-500">Doanh thu/tháng (₫)</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Rent by Floor */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Layers size={16} className="text-gray-400" />
              Giá thuê theo tầng
            </h3>
            <div className="space-y-3">
              {byFloor.slice(0, 8).map((f: any) => (
                <div key={f.floorId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{f.floorName}</span>
                    <span className="text-xs text-gray-400">({f.unitCount} units)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{Number(f.avgRent).toLocaleString()} ₫/m²</span>
                    <span className="text-xs text-green-600">{f.occupancyRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Rent by Category */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-gray-400" />
              Giá thuê theo ngành hàng
            </h3>
            <div className="space-y-3">
              {byCategory.slice(0, 8).map((c: any) => (
                <div key={c.category} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{c.category}</span>
                    <span className="text-xs text-gray-400">({c.unitCount} units)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{Number(c.avgRent).toLocaleString()} ₫/m²</span>
                    <span className="text-xs text-green-600">{c.occupancyRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Availability Forecast */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-gray-400" />
              Dự báo khả dụng (6 tháng)
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 bg-red-50 rounded">
                <span className="text-sm">Đang trống</span>
                <div className="text-right">
                  <span className="font-bold text-red-600">{vacancy?.count ?? 0} units</span>
                  <span className="text-xs text-gray-500 ml-2">{(vacancy?.totalArea ?? 0).toLocaleString()} m²</span>
                </div>
              </div>
              {(calendarData?.upcomingAvailability ?? []).slice(0, 5).map((m: any) => (
                <div key={m.month} className="flex items-center justify-between">
                  <span className="text-sm">{m.month}</span>
                  <div className="text-right">
                    <span className="font-medium">{m.count} units</span>
                    <span className="text-xs text-gray-400 ml-2">{m.totalArea.toLocaleString()} m²</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Lease Expiry Summary */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Clock size={16} className="text-gray-400" />
              Lease sắp hết hạn
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 bg-red-50 rounded">
                <span className="text-sm text-red-700">Trong 30 ngày</span>
                <span className="font-bold text-red-600">{expiringSummary?.critical ?? 0} units</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-orange-50 rounded">
                <span className="text-sm text-orange-700">30-60 ngày</span>
                <span className="font-bold text-orange-600">{expiringSummary?.warning ?? 0} units</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-amber-50 rounded">
                <span className="text-sm text-amber-700">60-180 ngày</span>
                <span className="font-bold text-amber-600">{expiringSummary?.upcoming ?? 0} units</span>
              </div>
              <div className="pt-2 border-t text-sm text-gray-500">
                <div className="flex justify-between">
                  <span>Tổng diện tích rủi ro:</span>
                  <span className="font-medium">{(expiringSummary?.totalAreaAtRisk ?? 0).toLocaleString()} m²</span>
                </div>
                <div className="flex justify-between">
                  <span>Doanh thu rủi ro/tháng:</span>
                  <span className="font-medium">{(expiringSummary?.totalRevenueAtRisk ?? 0).toLocaleString()} ₫</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'floor' | 'map' | 'analytics';

export default function SpacesPage() {
  const { selectedMallId } = useMallStore();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'LEASING_MANAGER' || user?.role === 'MALL_DIRECTOR';

  // View & filters
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
  const view = (searchParams.get('view') as ViewMode) ?? 'grid';
  const setView = (v: ViewMode) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('view', v);
    return next;
  }, { replace: true });
  const [mapEditorMode, setMapEditorMode] = useState(false);
  const [mapEditorFloorId, setMapEditorFloorId] = useState<string | null>(null);
  
  // Advanced filter panel visibility (local UI state)
  const [showFilters, setShowFilters] = useState(false);

  // Merge dialog (GAP #2)
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  
  // Selection & modals
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingUnit, setDeletingUnit] = useState<any>(null);

  // Floor management
  const [floorDialogOpen, setFloorDialogOpen] = useState(false);
  const [editingFloor, setEditingFloor] = useState<any>(null);
  const [deletingFloor, setDeletingFloor] = useState<any>(null);
  
  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionOpen, setBulkActionOpen] = useState<'status' | 'category' | 'rent' | null>(null);
  
  // Compare
  const [compareOpen, setCompareOpen] = useState(false);

  // Reset floor filter when mall changes
  const isFirstMallRender = useRef(true);
  useEffect(() => {
    if (isFirstMallRender.current) { isFirstMallRender.current = false; return; }
    setFloorFilter('');
  }, [selectedMallId]);

  // Clear selection when exiting selection mode
  useEffect(() => { if (!selectionMode) setSelectedIds(new Set()); }, [selectionMode]);

  const { data: floorsData } = useQuery({
    queryKey: ['floors', selectedMallId],
    queryFn: () => spacesApi.listFloors(selectedMallId ?? undefined),
    enabled: !!selectedMallId,
  });
  const floors: any[] = (floorsData?.data ?? floorsData ?? []).sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  const { data: categoryOptions } = useQuery({ queryKey: ['category-options'], queryFn: categoriesApi.getOptions, staleTime: 300_000 });
  const categoryNames: string[] = useMemo(() => {
    const fromApi = (categoryOptions as any[])?.map((c: any) => c.name).filter(Boolean) ?? [];
    return fromApi.length > 0 ? fromApi : CATEGORIES;
  }, [categoryOptions]);

  const { data, isLoading } = useQuery({
    queryKey: ['units', { search, status: statusFilter, mallId: selectedMallId, floorId: floorFilter, minArea, maxArea, minRent, maxRent, category: categoryFilter, spaceType: spaceTypeFilter, tier: tierFilter, leaseTermType: leaseTermFilter }],
    queryFn: () => spacesApi.listUnits({
      search: search || undefined,
      status: statusFilter || undefined,
      mallId: selectedMallId || undefined,
      floorId: floorFilter || undefined,
      minArea: minArea || undefined,
      maxArea: maxArea || undefined,
      minRent: minRent || undefined,
      maxRent: maxRent || undefined,
      category: categoryFilter || undefined,
      spaceType: spaceTypeFilter || undefined,
      tier: tierFilter || undefined,
      leaseTermType: leaseTermFilter || undefined,
      page: 1,
      limit: 300,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => spacesApi.deleteUnit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'Đã xóa mặt bằng' });
      setDeletingUnit(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi xóa', variant: 'destructive' }),
  });

  const deleteFloorMutation = useMutation({
    mutationFn: (id: string) => spacesApi.deleteFloor(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['floors'] });
      toast({ title: 'Đã xóa tầng' });
      setDeletingFloor(null);
      if (floorFilter === id) setFloorFilter('');
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi xóa', variant: 'destructive' }),
  });

  const bulkMutation = useMutation({
    mutationFn: (params: { unitIds: string[]; updates: any }) => spacesApi.bulkUpdateUnits(params),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: `Đã cập nhật ${result.updated} mặt bằng` });
      setSelectedIds(new Set());
      setSelectionMode(false);
      setBulkActionOpen(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi cập nhật', variant: 'destructive' }),
  });

  const units: Unit[] = data?.data ?? [];

  const unitIds = units.map((u) => u.id);
  const { data: slotSummaries = {} } = useQuery<Record<string, UnitSlotSummary>>({
    queryKey: ['slot-summaries', unitIds.join(',')],
    queryFn: () => slotsApi.getSummaries(unitIds),
    enabled: unitIds.length > 0,
  });
  
  // Bulk selection helpers
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };
  
  const selectAll = () => {
    setSelectedIds(new Set(units.map(u => u.id)));
  };
  
  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mall Spaces</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý mặt bằng và tình trạng cho thuê</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
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
          </div>
          {selectedMallId && (
            <Button onClick={() => setCreateOpen(true)} className="gap-2" title="Thêm mặt bằng">
              <Plus size={15} /> <span className="hidden sm:inline">Thêm mặt bằng</span>
            </Button>
          )}
        </div>
      </div>

      {/* Floor tabs */}
      {(floors.length > 0 || (isAdmin && selectedMallId)) && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
          <Layers size={14} className="text-gray-400 shrink-0" />
          <button
            onClick={() => setFloorFilter('')}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium border transition-colors whitespace-nowrap
              ${!floorFilter ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            Tất cả tầng
          </button>
          {floors.map((f: any) => (
            <div key={f.id} className="group relative shrink-0">
              <button
                onClick={() => setFloorFilter(floorFilter === f.id ? '' : f.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors whitespace-nowrap
                  ${floorFilter === f.id
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}
                  ${isAdmin ? 'pr-8' : ''}`}
              >
                {f.name}
                {f._count?.units > 0 && (
                  <span className={`ml-1.5 ${floorFilter === f.id ? 'text-blue-200' : 'text-gray-400'}`}>
                    {f._count.units}
                  </span>
                )}
              </button>
              {isAdmin && (
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingFloor(f); setFloorDialogOpen(true); }}
                    className={`p-0.5 rounded hover:bg-black/10 ${floorFilter === f.id ? 'text-white' : 'text-gray-400'}`}
                    title="Sửa tầng"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletingFloor(f); }}
                    className={`p-0.5 rounded hover:bg-black/10 ${floorFilter === f.id ? 'text-white' : 'text-gray-400'}`}
                    title="Xóa tầng"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {isAdmin && selectedMallId && (
            <button
              onClick={() => { setEditingFloor(null); setFloorDialogOpen(true); }}
              className="shrink-0 text-xs px-2.5 py-1.5 rounded-full font-medium border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 hover:border-gray-400 flex items-center gap-1 whitespace-nowrap"
            >
              <Plus size={12} /> Thêm tầng
            </button>
          )}
        </div>
      )}

      {/* Alerts */}
      {view !== 'analytics' && <SpacesAlerts mallId={selectedMallId} />}

      {/* Analytics View */}
      {view === 'analytics' && <AnalyticsView mallId={selectedMallId} />}

      {/* Filters (grid view) */}
      {view === 'grid' && (
        <div className="space-y-3 mb-4">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative w-full sm:flex-1 sm:max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Tìm mã, tên mặt bằng..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Tất cả trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tất cả</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={selectionMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectionMode(!selectionMode)}
              className="gap-1.5"
            >
              <CheckSquare size={14} />
              <span className="hidden sm:inline">{selectionMode ? 'Thoát' : 'Chọn nhiều'}</span>
            </Button>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1.5"
            >
              <SlidersHorizontal size={14} />
              Bộ lọc nâng cao
              {hasAdvancedFilters && <span className="w-2 h-2 bg-gray-500 rounded-full" />}
            </Button>
            {(statusFilter || floorFilter || search || hasAdvancedFilters) && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X size={14} className="mr-1" /> Xóa bộ lọc
              </Button>
            )}
          </div>

          {/* Advanced Filters Panel */}
          {showFilters && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Diện tích min (m²)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minArea}
                    onChange={(e) => setMinArea(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Diện tích max (m²)</label>
                  <Input
                    type="number"
                    placeholder="1000"
                    value={maxArea}
                    onChange={(e) => setMaxArea(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Giá thuê min (₫/m²)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minRent}
                    onChange={(e) => setMinRent(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Giá thuê max (₫/m²)</label>
                  <Input
                    type="number"
                    placeholder="1000000"
                    value={maxRent}
                    onChange={(e) => setMaxRent(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Ngành hàng</label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tất cả ngành hàng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Tất cả</SelectItem>
                      {categoryNames.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* GAP #4 */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Loại sảnh</label>
                  <Select value={spaceTypeFilter} onValueChange={setSpaceTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tất cả loại" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Tất cả</SelectItem>
                      {SPACE_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* GAP #6 */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Tier</label>
                  <Select value={tierFilter} onValueChange={setTierFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tất cả tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Tất cả</SelectItem>
                      {TIER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* GAP #3 */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Hình thức thuê</label>
                  <Select value={leaseTermFilter} onValueChange={setLeaseTermFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tất cả" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Tất cả</SelectItem>
                      {LEASE_TERM_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Selection Bar */}
      {selectionMode && selectedIds.size > 0 && view === 'grid' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 mb-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">
              Đã chọn {selectedIds.size} mặt bằng
            </span>
            <Button variant="ghost" size="sm" onClick={selectAll} className="text-gray-700">
              Chọn tất cả ({units.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="text-gray-700">
              Bỏ chọn
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size >= 2 && selectedIds.size <= 5 && (
              <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)} className="gap-1.5">
                <Columns size={14} /> So sánh
              </Button>
            )}
            {/* GAP #2 — Gộp sảnh: chỉ hiện khi ≥2 unit được chọn */}
            {selectedIds.size >= 2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMergeDialogOpen(true)}
                className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
              >
                <GitMerge size={14} /> Gộp sảnh
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setBulkActionOpen('status')} className="gap-1.5">
              <RefreshCw size={14} /> Đổi trạng thái
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkActionOpen('category')} className="gap-1.5">
              <Filter size={14} /> Đổi ngành hàng
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkActionOpen('rent')} className="gap-1.5">
              <DollarSign size={14} /> Đổi giá thuê
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Action Dialogs */}
      <BulkStatusDialog
        open={bulkActionOpen === 'status'}
        count={selectedIds.size}
        onClose={() => setBulkActionOpen(null)}
        onConfirm={(status) => bulkMutation.mutate({ unitIds: Array.from(selectedIds), updates: { status } })}
        loading={bulkMutation.isPending}
      />
      <BulkCategoryDialog
        open={bulkActionOpen === 'category'}
        count={selectedIds.size}
        onClose={() => setBulkActionOpen(null)}
        onConfirm={(category) => bulkMutation.mutate({ unitIds: Array.from(selectedIds), updates: { category } })}
        loading={bulkMutation.isPending}
      />
      <BulkRentDialog
        open={bulkActionOpen === 'rent'}
        count={selectedIds.size}
        onClose={() => setBulkActionOpen(null)}
        onConfirm={(rent, cam) => bulkMutation.mutate({ unitIds: Array.from(selectedIds), updates: { baseRentPerSqm: rent, camPerSqm: cam } })}
        loading={bulkMutation.isPending}
      />

      {/* Compare Modal */}
      <CompareModal
        unitIds={Array.from(selectedIds)}
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
      />

      {/* Merge Units Dialog (GAP #2) */}
      <MergeUnitsDialog
        open={mergeDialogOpen}
        units={units.filter((u) => selectedIds.has(u.id))}
        mallId={selectedMallId ?? ''}
        onClose={() => setMergeDialogOpen(false)}
      />

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 15 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-20" /></CardContent></Card>
          ))}
        </div>
      ) : view === 'floor' ? (
        <FloorPlan
          units={units}
          onUnitClick={setSelectedUnit}
          selectedUnitId={selectedUnit?.id}
          slotSummaries={slotSummaries}
          allFloors={floors}
          isAdmin={isAdmin}
          onCreateFloor={() => { setEditingFloor(null); setFloorDialogOpen(true); }}
          onEditFloor={(f: any) => { setEditingFloor(f); setFloorDialogOpen(true); }}
          onDeleteFloor={(f: any) => setDeletingFloor(f)}
        />
      ) : view === 'map' ? (
        <div className="space-y-3">
          {/* Map mode toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Map size={16} className="text-blue-600" /> Bản đồ số mặt bằng
            </div>
            {isAdmin && (
              <div className="flex rounded-lg border overflow-hidden text-xs ml-auto">
                <button
                  onClick={() => { setMapEditorMode(false); setMapEditorFloorId(null); }}
                  className={`px-3 py-1.5 transition-colors ${!mapEditorMode ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Xem bản đồ
                </button>
                <button
                  onClick={() => setMapEditorMode(true)}
                  className={`px-3 py-1.5 transition-colors ${mapEditorMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Chỉnh sửa sơ đồ
                </button>
              </div>
            )}
          </div>

          {mapEditorMode && isAdmin ? (
            /* Editor: pick a floor first */
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">Chọn tầng để chỉnh sửa:</span>
                {floors.map((f: any) => (
                  <button
                    key={f.id}
                    onClick={() => setMapEditorFloorId(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      mapEditorFloorId === f.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {f.level} — {f.name}
                    {f.floorPlanUrl ? (
                      <span className="ml-1 text-green-400">✓</span>
                    ) : (
                      <span className="ml-1 text-gray-300">+</span>
                    )}
                  </button>
                ))}
                {selectedMallId && (
                  <button
                    onClick={() => { setEditingFloor(null); setFloorDialogOpen(true); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-blue-300 text-blue-500 hover:bg-blue-50 transition-all flex items-center gap-1"
                  >
                    <Plus size={11} /> Thêm tầng
                  </button>
                )}
              </div>
              {mapEditorFloorId ? (
                <MallMapEditor floorId={mapEditorFloorId} />
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-sm border-2 border-dashed rounded-xl gap-3">
                  {!selectedMallId ? (
                    <span className="text-center px-6">Vui lòng chọn một <strong className="text-gray-600">mall cụ thể</strong> ở header trước (không phải "Tất cả Mall")</span>
                  ) : floors.length === 0 ? (
                    <>
                      <span>Chưa có tầng nào trong mall này</span>
                      <button
                        onClick={() => { setEditingFloor(null); setFloorDialogOpen(true); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        <Plus size={14} /> Thêm tầng đầu tiên
                      </button>
                    </>
                  ) : (
                    <span>Chọn một tầng ở trên để bắt đầu chỉnh sửa sơ đồ</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Viewer: show interactive map */
            floors.length > 0 ? (
              <MallMapViewer
                floors={floors}
                onUnitClick={(u) => setSelectedUnit(u)}
                onBookUnit={(u) => setSelectedUnit(u)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400 text-sm border-2 border-dashed rounded-xl">
                <Map size={36} className="opacity-30" />
                <p>Chưa có tầng nào trong mall này</p>
              </div>
            )
          )}
        </div>
      ) : (
        <>
          <div className="text-sm text-gray-400 mb-3">{data?.total ?? units.length} mặt bằng</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {units.map((unit) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                onClick={() => setSelectedUnit(unit)}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(unit.id)}
                onToggleSelect={() => toggleSelect(unit.id)}
                slotSummary={slotSummaries[unit.id]}
              />
            ))}
          </div>
          {units.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Building2 size={48} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium">Không tìm thấy mặt bằng</p>
              {selectedMallId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={14} /> Thêm mặt bằng đầu tiên
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* Unit detail sheet */}
      <UnitDetailSheet
        unit={selectedUnit}
        onClose={() => setSelectedUnit(null)}
        onEdit={(u) => setEditingUnit(u)}
        onDelete={(u) => setDeletingUnit(u)}
      />

      {/* Create unit dialog */}
      <CreateEditUnitDialog
        open={createOpen}
        mallId={selectedMallId ?? ''}
        defaultFloorId={floorFilter}
        onClose={() => setCreateOpen(false)}
      />

      {/* Edit unit dialog */}
      <CreateEditUnitDialog
        open={!!editingUnit}
        unit={editingUnit}
        mallId={selectedMallId ?? editingUnit?.mallId ?? ''}
        onClose={() => setEditingUnit(null)}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deletingUnit}
        title={`Xóa mặt bằng ${deletingUnit?.code}?`}
        description={`Thao tác này sẽ ẩn mặt bằng "${deletingUnit?.code}" khỏi hệ thống. Dữ liệu lịch sử sẽ được giữ lại.`}
        onConfirm={() => deleteMutation.mutate(deletingUnit.id)}
        onCancel={() => setDeletingUnit(null)}
        loading={deleteMutation.isPending}
      />

      {/* Create/Edit floor dialog */}
      <CreateEditFloorDialog
        open={floorDialogOpen}
        floor={editingFloor}
        mallId={selectedMallId ?? ''}
        onClose={() => { setFloorDialogOpen(false); setEditingFloor(null); }}
      />

      {/* Delete floor confirm */}
      <ConfirmDialog
        open={!!deletingFloor}
        title={`Xóa tầng ${deletingFloor?.name}?`}
        description={`Thao tác này sẽ ẩn tầng "${deletingFloor?.name}" khỏi hệ thống. Các mặt bằng thuộc tầng này sẽ không bị xóa.`}
        onConfirm={() => deleteFloorMutation.mutate(deletingFloor.id)}
        onCancel={() => setDeletingFloor(null)}
        loading={deleteFloorMutation.isPending}
      />
    </div>
  );
}
