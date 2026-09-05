import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { categoriesApi } from '@/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_CONFIG } from '@/pages/spaces/spaces.constants';
import { getUnitStatusLabel } from '@/pages/spaces/spacesPresentation';
import { flattenCategoryHierarchy, type CategoryOption } from '@/lib/categoryHierarchy';

export function BulkStatusDialog({ open, count, onClose, onConfirm, loading }: {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: (status: string) => void;
  loading: boolean;
}) {
  const { t } = useTranslation('spaces');
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
              {Object.entries(STATUS_CONFIG).map(([key]) => (
                <SelectItem key={key} value={key}>{getUnitStatusLabel(t, key)}</SelectItem>
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

export function BulkCategoryDialog({ open, count, onClose, onConfirm, loading }: {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: (categoryId: string) => void;
  loading: boolean;
}) {
  const [categoryId, setCategoryId] = useState('');
  const { data: categoryOptionsData } = useQuery({ queryKey: ['category-options'], queryFn: categoriesApi.getOptions, staleTime: 300_000, enabled: open });
  const categoryOptions: CategoryOption[] = useMemo(() => {
    const opts = Array.isArray(categoryOptionsData) ? categoryOptionsData : (categoryOptionsData as any)?.data ?? [];
    return opts.filter((c: any) => c?.id && c?.name);
  }, [categoryOptionsData]);
  const categoriesHierarchical = useMemo(() => flattenCategoryHierarchy(categoryOptions), [categoryOptions]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Đổi ngành hàng {count} mặt bằng</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn ngành hàng mới" />
            </SelectTrigger>
            <SelectContent>
              {categoriesHierarchical.map((c) => (
                <SelectItem key={c.id} value={c.id} className={c.depth > 0 ? 'pl-6 text-gray-600' : undefined}>
                  {c.depth > 0 && '↳ '}{c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => onConfirm(categoryId)} disabled={!categoryId || loading}>
            {loading ? 'Đang cập nhật...' : 'Xác nhận'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkRentDialog({ open, count, onClose, onConfirm, loading }: {
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
            <label className="text-sm font-medium text-gray-700 mb-1 block">Giá thuê cơ bản (VND/m²)</label>
            <Input
              type="number"
              placeholder="450000"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Phí CAM (VND/m²)</label>
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
