import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { spacesApi, categoriesApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  STATUS_CONFIG, SPACE_TYPE_OPTIONS, TIER_OPTIONS, LEASE_TERM_OPTIONS, CATEGORIES,
} from '@/pages/spaces/spaces.constants';

export function CreateEditUnitDialog({
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
