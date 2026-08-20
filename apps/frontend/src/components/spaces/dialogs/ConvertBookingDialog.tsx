import React, { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { bookingApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildProposalPrefill } from '@/pages/bookings/proposal-prefill';

export function ConvertBookingDialog({
  booking, onClose,
}: {
  booking: any | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm({
    defaultValues: buildProposalPrefill(null),
  });

  useEffect(() => {
    if (booking) reset(buildProposalPrefill(booking));
  }, [booking, reset]);

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
  const currency = watch('rentCurrency');

  return (
    <Dialog open={!!booking} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lập Tờ Trình Đề xuất từ Booking #{booking?.bookingNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 pb-2 text-sm">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
            Đã kế thừa mặt bằng, khách hàng, diện tích, thời hạn, giá thuê, CAM và ghi chú từ Booking. Bạn có thể điều chỉnh trước khi lập đề xuất.
          </div>

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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Đơn vị tiền tệ</label>
              <Select value={currency} onValueChange={(v) => setValue('rentCurrency', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VND">VND</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="MMK">MMK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Giá thuê/m² ({currency}) *</label>
              <Input {...register('rentPerSqm', { required: true })} type="number" step="0.01" placeholder="0" className={errors.rentPerSqm ? 'border-red-400' : ''} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">CAM/m²</label>
              <Input {...register('camPerSqm')} type="number" step="0.01" placeholder="0" />
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
            const total = a * (r + cam + s + b);
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
