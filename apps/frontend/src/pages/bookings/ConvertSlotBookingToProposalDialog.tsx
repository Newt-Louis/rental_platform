import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { slotsApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatSlotMoney } from '@/lib/slot-currency';
import { fmtDatetime } from './bookings-constants';

const BUSINESS_MODEL_OPTIONS: readonly (readonly [string, string])[] = [
  ['SHOP', 'Gian hàng (SHOP)'],
  ['KIOSK', 'Kiosk'],
  ['POP_UP', 'Pop-up'],
  ['EVENT', 'Sự kiện (EVENT)'],
  ['CHAIN', 'Chuỗi (CHAIN)'],
];

/**
 * Booking ngắn hạn (SlotBooking) → Proposal. Không dùng ProposalConversionForm
 * (thiết kế cho thuê dài hạn: rentPerSqm/tháng, escalation, cọc theo tháng...)
 * vì các trường đó không có ý nghĩa với một booking ngắn hạn — thời gian, diện
 * tích, giá và tiền tệ đều lấy thẳng từ booking ở backend
 * (SlotsService.convertToProposal). Form này chỉ hỏi phần không thể suy ra.
 */
export function ConvertSlotBookingToProposalDialog({ booking, open, onClose }: {
  booking: any | null; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const businessModelId = useId();
  const [businessModel, setBusinessModel] = useState<string>('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () => slotsApi.convertToProposal(booking!.id, {
      businessModel: businessModel || undefined,
      notes: notes.trim() || undefined,
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['slot-bookings'] });
      toast({ title: 'Đã lập Đề xuất từ booking ngắn hạn' });
      onClose();
      navigate(data?.proposal?.id ? `/proposals?id=${data.proposal.id}` : '/proposals');
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi lập Đề xuất', variant: 'destructive' }),
  });

  if (!booking) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lập Đề xuất từ Booking {booking.bookingRef}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Vị trí</span><span className="font-medium">{booking.slot?.unit?.code} · {booking.slot?.code}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Thời gian thuê</span><span className="font-medium">{fmtDatetime(booking.startDatetime)} → {fmtDatetime(booking.endDatetime)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Thành tiền</span><span className="font-medium">{formatSlotMoney(booking.totalAmount, booking.currencyCode)}</span></div>
          </div>
          <p className="text-xs text-gray-500">
            Đề xuất sẽ được tạo với thời gian và giá trị kế thừa từ booking này, sau đó đi qua quy trình phê duyệt và hợp đồng như một Đề xuất thông thường.
          </p>

          <div>
            <label htmlFor={businessModelId} className="mb-1 block text-xs font-medium text-gray-700">Mô hình Kinh doanh</label>
            <Select value={businessModel} onValueChange={setBusinessModel}>
              <SelectTrigger id={businessModelId} className="h-9">
                <SelectValue placeholder="Chọn mô hình kinh doanh (tuỳ chọn)..." />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_MODEL_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Ghi chú</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={booking.notes || 'Ghi chú cho Đề xuất...'} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Đang tạo...' : 'Lập Đề xuất'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
