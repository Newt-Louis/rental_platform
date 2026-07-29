import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { spacesApi, categoriesApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CATEGORIES } from '@/pages/spaces/spaces.constants';
import { UnitFormFields } from './UnitFormFields';
import {
  UNIT_FORM_DEFAULT_VALUES,
  seedUnitFormValues,
  buildUnitFormPayload,
  getUnitMutationError,
  validateUnitFormValues,
} from './unitFormHelpers';

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
  const canModify = !isEdit || unit?.status === 'VACANT';

  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty } } = useForm({
    defaultValues: {
      ...UNIT_FORM_DEFAULT_VALUES,
      floorId: defaultFloorId ?? '',
    },
  });

  const selectedFloorId = watch('floorId');

  useEffect(() => {
    if (open) {
      setSubmitError(null);
      reset(unit ? {
        ...seedUnitFormValues(unit, defaultFloorId),
      } : {
        ...UNIT_FORM_DEFAULT_VALUES,
        floorId: defaultFloorId ?? '',
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
      const payload = buildUnitFormPayload(data, mallId, isEdit);
      return isEdit ? spacesApi.updateUnit(unit.id, payload) : spacesApi.createUnit(payload);
    },
    onSuccess: () => {
      setSubmitError(null);
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      qc.invalidateQueries({ queryKey: ['floor-map'] });
      qc.invalidateQueries({ queryKey: ['floors'] });
      qc.invalidateQueries({ queryKey: ['unit-detail'] });
      toast({ title: isEdit ? 'Đã cập nhật mặt bằng' : 'Đã tạo mặt bằng mới' });
      onClose();
    },
    onError: (error: any) => {
      const message = getUnitMutationError(error, isEdit ? 'update' : 'create');
      setSubmitError(message);
      toast({
        title: isEdit ? 'Không thể cập nhật mặt bằng' : 'Không thể tạo mặt bằng',
        description: message,
        variant: 'destructive',
      });
    },
  });

  const submitForm = (data: any) => {
    if (!canModify) {
      const message = `Chỉ có thể điều chỉnh thông tin khi mặt bằng đang trống (VACANT). Trạng thái hiện tại: ${unit?.status}.`;
      setSubmitError(message);
      toast({ title: 'Không thể chỉnh sửa mặt bằng', description: message, variant: 'destructive' });
      return;
    }
    const message = validateUnitFormValues(data, mallId);
    if (message) {
      setSubmitError(message);
      toast({ title: 'Thông tin chưa hợp lệ', description: message, variant: 'destructive' });
      return;
    }
    setSubmitError(null);
    mutation.mutate(data);
  };

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
          <form onSubmit={handleSubmit(submitForm)} className="space-y-4 pb-2">

            {submitError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <p className="font-medium">Không thể lưu mặt bằng</p>
                <p className="mt-1">{submitError}</p>
              </div>
            )}

            {!canModify && (
              <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Mặt bằng đang ở trạng thái <strong>{unit?.status}</strong>. Chỉ mặt bằng đang trống (VACANT) mới được điều chỉnh thông tin.
              </div>
            )}

            <fieldset disabled={!canModify} className={!canModify ? 'opacity-60' : undefined}>
              <UnitFormFields
                register={register}
                watch={watch}
                setValue={setValue}
                errors={errors}
                floors={floors}
                zones={zones}
                categoryNames={categoryNames}
              />
            </fieldset>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Hủy</Button>
              <Button type="submit" disabled={mutation.isPending || !canModify}>
                {mutation.isPending ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo mặt bằng'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
