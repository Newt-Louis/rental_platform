import React, { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { spacesApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CreateEditFloorDialog({
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
