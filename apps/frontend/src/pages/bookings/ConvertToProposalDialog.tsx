import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingApi } from '@/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { ArrowRight } from 'lucide-react';
import type { UnitBooking } from '@/types';
import { buildProposalPrefill } from './proposal-prefill';
import { CURRENCIES, type CurrencyCode } from '@/lib/currency';

export function ConvertToProposalDialog({ booking, open, onClose }: {
  booking: UnitBooking | null; open: boolean; onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    ...buildProposalPrefill(null),
    // GAP #91–94, #41
    utilityFee: '0', operatingHours: '', afterHoursFee: '0',
    paymentTermDays: '30', depositLease: '0', depositFitout: '0', fitoutFee: '0',
  });

  useEffect(() => {
    if (!open || !booking) return;
    setForm({
      ...buildProposalPrefill(booking),
      utilityFee: '0', operatingHours: '', afterHoursFee: '0',
      paymentTermDays: '30', depositLease: '0', depositFitout: '0', fitoutFee: '0',
    });
  }, [booking, open]);

  const mutation = useMutation({
    mutationFn: () => bookingApi.convertToProposal(booking!.id, {
      area: Number(form.area), term: Number(form.term), startDate: form.startDate,
      rentPerSqm: Number(form.rentPerSqm),
      camPerSqm: form.camPerSqm ? Number(form.camPerSqm) : undefined,
      deposit: Number(form.deposit), rentFree: Number(form.rentFree),
      escalationPercent: Number(form.escalationPercent),
      rentCurrency: form.rentCurrency,
      notes: form.notes || undefined,
      // GAP #91–94, #41
      utilityFee: Number(form.utilityFee) || undefined,
      operatingHours: form.operatingHours || undefined,
      afterHoursFee: Number(form.afterHoursFee) || undefined,
      paymentTermDays: Number(form.paymentTermDays) || undefined,
      depositLease: Number(form.depositLease) > 0 ? Number(form.depositLease) : undefined,
      depositFitout: Number(form.depositFitout) || undefined,
      fitoutFee: Number(form.fitoutFee) || undefined,
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      toast({ title: `Đã tạo Proposal ${data?.proposal?.proposalNumber ?? ''}` });
      onClose();
      navigate(data?.proposal?.id ? `/proposals?id=${data.proposal.id}` : '/proposals');
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));
  const currency = (form.rentCurrency ?? 'VND') as CurrencyCode;
  const currencySymbol = CURRENCIES[currency]?.symbol ?? '₫';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight size={18} className="text-green-600" />
            Lập Đề xuất từ Booking {booking?.bookingNumber}
          </DialogTitle>
          {booking?.unit && (
            <p className="text-sm text-muted-foreground">
              Unit: {booking.unit.code} · {booking.lead?.brandName ?? booking.customer?.companyName}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
            Đã kế thừa diện tích, thời hạn, giá thuê, CAM và ghi chú từ Booking. Bạn có thể điều chỉnh trước khi tạo Proposal.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Diện tích (m²) *</label>
              <Input value={form.area} onChange={set('area')} type="number" placeholder="120" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Thời hạn (tháng) *</label>
              <Input value={form.term} onChange={set('term')} type="number" placeholder="36" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Ngày bắt đầu dự kiến *</label>
            <Input value={form.startDate} onChange={set('startDate')} type="date" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Đơn vị tiền tệ</label>
              <Select value={currency} onValueChange={(v) => setForm((p) => ({ ...p, rentCurrency: v as CurrencyCode }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VND">VND</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="MMK">MMK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Giá thuê ({currencySymbol}/m²) *</label>
              <Input value={form.rentPerSqm} onChange={set('rentPerSqm')} type="number" placeholder="680000" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Phí CAM ({currencySymbol}/m²)</label>
              <Input value={form.camPerSqm} onChange={set('camPerSqm')} type="number" placeholder="85000" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Đặt cọc (tháng)</label>
              <Input value={form.deposit} onChange={set('deposit')} type="number" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Rent-free (ngày)</label>
              <Input value={form.rentFree} onChange={set('rentFree')} type="number" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Escalation (%/năm)</label>
              <Input value={form.escalationPercent} onChange={set('escalationPercent')} type="number" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú</label>
            <Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Đề xuất lần đầu..." />
          </div>
          {form.area && form.rentPerSqm && (
            <div className="rounded-lg bg-green-50 border border-green-100 p-3 text-sm">
              <span className="text-gray-500">Ước tính/tháng: </span>
              <span className="font-bold text-green-700">
                {new Intl.NumberFormat('vi-VN').format(Number(form.area) * Number(form.rentPerSqm))} {currencySymbol}
              </span>
            </div>
          )}

          {/* GAP #91–94, #41 — phí & khoản cọc */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Phí & Điều khoản (tuỳ chọn)</p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Giờ hoạt động</label>
                <Input value={form.operatingHours} onChange={set('operatingHours')} placeholder="10:00–22:00 hàng ngày" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Phí tiện ích/tháng ({currencySymbol})</label>
                  <Input type="number" value={form.utilityFee} onChange={set('utilityFee')} placeholder="0" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Phí ngoài giờ/giờ ({currencySymbol})</label>
                  <Input type="number" value={form.afterHoursFee} onChange={set('afterHoursFee')} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Thanh toán (ngày)</label>
                  <Input type="number" value={form.paymentTermDays} onChange={set('paymentTermDays')} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Cọc thuê ({currencySymbol}) — 0=tự tính</label>
                  <Input type="number" value={form.depositLease} onChange={set('depositLease')} placeholder="0" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Cọc thi công ({currencySymbol})</label>
                  <Input type="number" value={form.depositFitout} onChange={set('depositFitout')} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Phí thi công ({currencySymbol})</label>
                <Input type="number" value={form.fitoutFee} onChange={set('fitoutFee')} placeholder="0" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button
            disabled={!form.area || !form.term || !form.startDate || !form.rentPerSqm || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            <ArrowRight size={15} />
            {mutation.isPending ? 'Đang tạo...' : 'Tạo Proposal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
