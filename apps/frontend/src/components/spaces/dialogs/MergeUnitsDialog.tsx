import React, { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { spacesApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, GitMerge } from 'lucide-react';
import type { Unit } from '@/types';

export function MergeUnitsDialog({
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
