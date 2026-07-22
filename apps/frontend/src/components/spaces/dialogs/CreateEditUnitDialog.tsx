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

  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty } } = useForm({
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
        spaceType: unit.spaceType ?? '',
        leaseTermType: unit.leaseTermType ?? '',
        tier: unit.tier ?? '',
        isFlexibleArea: unit.isFlexibleArea ?? false,
        minFlexArea: unit.minFlexArea?.toString() ?? '',
        maxFlexArea: unit.maxFlexArea?.toString() ?? '',
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

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowUnsavedConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowUnsavedConfirm(false);
    reset();
    onClose();
  }, [reset, onClose]);

  const mutation = useMutation({
    mutationFn: (data: any) => {
      const payload = {
        ...data,
        mallId,
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
    <>
      <Dialog open={showUnsavedConfirm} onOpenChange={(v) => !v && setShowUnsavedConfirm(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bỏ thay đổi chưa lưu?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">Dữ liệu bạn đã nhập sẽ bị mất nếu rời đi.</p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setShowUnsavedConfirm(false)}>
              Tiếp tục chỉnh sửa
            </Button>
            <Button type="button" onClick={handleDiscardAndClose} className="bg-red-600 hover:bg-red-700 text-white">
              Bỏ thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
