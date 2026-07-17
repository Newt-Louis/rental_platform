import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { slotsApi } from '@/api';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Building2, User, Calendar, DollarSign, CheckCircle2, X, Pencil } from 'lucide-react';
import { SLOT_TYPE_CONFIG, SLOT_STATUS_CONFIG, fmtDatetime, fmtMoney, toDatetimeLocal } from './bookings-constants';

type SlotEditForm = { startDatetime: string; endDatetime: string; discountPct: string; notes: string };

export function SlotBookingDetailSheet({ booking, onClose, scrollTo, initialEditing }: {
  booking: any | null; onClose: () => void; scrollTo?: string; initialEditing?: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [lastBooking, setLastBooking] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [ef, setEf] = useState<SlotEditForm>({ startDatetime: '', endDatetime: '', discountPct: '0', notes: '' });

  useEffect(() => {
    if (booking) {
      setLastBooking(booking);
      setIsEditing(!!initialEditing);
      setEf({
        startDatetime: toDatetimeLocal(booking.startDatetime),
        endDatetime: toDatetimeLocal(booking.endDatetime),
        discountPct: String(booking.discountPct ?? 0),
        notes: booking.notes ?? '',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id]);

  useEffect(() => {
    if (!booking || !scrollTo) return;
    const t = setTimeout(() => {
      document.getElementById(scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
    return () => clearTimeout(t);
  }, [booking?.id, scrollTo]);

  const d = booking ?? lastBooking;

  const setEfField = (k: keyof SlotEditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setEf((f) => ({ ...f, [k]: e.target.value }));

  const updateMutation = useMutation({
    mutationFn: () => slotsApi.updateSlotBooking(d?.id, {
      startDatetime: ef.startDatetime ? new Date(ef.startDatetime).toISOString() : undefined,
      endDatetime: ef.endDatetime ? new Date(ef.endDatetime).toISOString() : undefined,
      discountPct: ef.discountPct !== '' ? Number(ef.discountPct) : undefined,
      notes: ef.notes,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slot-bookings'] });
      toast({ title: 'Đã cập nhật booking slot' });
      setIsEditing(false);
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi cập nhật', variant: 'destructive' }),
  });

  const confirmMutation = useMutation({
    mutationFn: () => slotsApi.confirmBooking(d?.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slot-bookings'] });
      toast({ title: 'Đã xác nhận booking slot' });
      onClose();
    },
    onError: () => toast({ title: 'Lỗi xác nhận', variant: 'destructive' }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => slotsApi.cancelBooking(d?.id, 'Hủy từ trang Booking'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slot-bookings'] });
      toast({ title: 'Đã hủy booking slot' });
      onClose();
    },
    onError: () => toast({ title: 'Lỗi hủy', variant: 'destructive' }),
  });

  const typeCfg = d ? (SLOT_TYPE_CONFIG[d.type] ?? SLOT_TYPE_CONFIG.DAILY) : SLOT_TYPE_CONFIG.DAILY;
  const statusCfg = d ? SLOT_STATUS_CONFIG[d.status] : undefined;
  const clientName = d?.customer?.companyName ?? d?.lead?.brandName ?? '—';
  const canEdit = d && ['PENDING', 'CONFIRMED'].includes(d.status);

  return (
    <Sheet open={!!booking} onClose={onClose}
      title={d?.bookingRef ?? ''}
      subtitle={`${d?.slot?.unit?.code ?? ''} · ${d?.slot?.code ?? ''} · ${clientName}`}
    >
      {d && <div className="px-6 pb-8 space-y-4 pt-4">
        {/* Type + status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-0.5 text-xs font-semibold">
            🗓 Đặt slot ngắn hạn
          </Badge>
          <Badge className={`${typeCfg.color} border-0 px-2.5 py-0.5 text-xs font-medium flex items-center gap-1`}>
            <typeCfg.icon size={11} /> {typeCfg.label}
          </Badge>
          <Badge className={`${statusCfg?.color} border text-xs`}>{statusCfg?.label}</Badge>
        </div>

        {isEditing ? (
          /* ── EDIT MODE ────────────────────────────────────────────────── */
          <div className="space-y-4">
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
              <p className="text-xs font-semibold tracking-wider text-violet-500 mb-3">VỊ TRÍ SLOT</p>
              <p className="text-sm font-medium text-gray-700">
                {d.slot?.unit?.code} · {d.slot?.code} — {d.slot?.name}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{d.slot?.area} m² · {typeCfg.label}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Bắt đầu</label>
              <Input type="datetime-local" value={ef.startDatetime} onChange={setEfField('startDatetime')} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Kết thúc</label>
              <Input type="datetime-local" value={ef.endDatetime} onChange={setEfField('endDatetime')} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Chiết khấu (%)</label>
              <Input type="number" min={0} max={100} value={ef.discountPct} onChange={setEfField('discountPct')} className="w-28" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú</label>
              <Textarea value={ef.notes} onChange={setEfField('notes')} rows={2} placeholder="Ghi chú..." />
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <Button className="flex-1 gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                <Pencil size={13} /> {updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
              <Button variant="outline" className="flex-1 gap-2" onClick={() => setIsEditing(false)}>
                <X size={13} /> Hủy chỉnh sửa
              </Button>
            </div>
          </div>
        ) : (
          /* ── VIEW MODE ────────────────────────────────────────────────── */
          <>
            <SheetSection label="KHÁCH HÀNG" className="bg-gray-50" id="sbs-customer">
              <SheetRow label="Tên"   value={clientName} icon={User} />
              <SheetRow label="Nguồn" value={d.customerId ? 'Customer profile' : 'Lead (CRM)'} icon={User} />
            </SheetSection>

            <SheetSection label="VỊ TRÍ SLOT" className="bg-violet-50" id="sbs-location">
              <SheetRow label="Lô (Unit)"  value={d.slot?.unit?.code ?? '—'} icon={Building2} />
              <SheetRow label="Slot"       value={`${d.slot?.code ?? '—'} — ${d.slot?.name ?? ''}`} icon={Building2} />
              <SheetRow label="Diện tích"  value={d.slot?.area ? `${d.slot.area} m²` : '—'} icon={Building2} />
            </SheetSection>

            <SheetSection label="THỜI GIAN ĐẶT" className="bg-violet-50" id="sbs-timeline">
              <SheetRow label="Bắt đầu"  value={fmtDatetime(d.startDatetime)} icon={Calendar} />
              <SheetRow label="Kết thúc" value={fmtDatetime(d.endDatetime)}   icon={Calendar} />
            </SheetSection>

            <SheetSection label="GIÁ TIỀN" className="bg-gray-50" id="sbs-price">
              <SheetRow label="Giá gốc"     value={fmtMoney(d.baseAmount)}   icon={DollarSign} />
              {d.discountPct > 0 && (
                <SheetRow label="Chiết khấu" value={`${d.discountPct}%`} icon={DollarSign} />
              )}
              <SheetRow label="Thành tiền"  value={fmtMoney(d.totalAmount)}  icon={DollarSign} />
            </SheetSection>

            {d.notes && (
              <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-100 rounded-xl p-3">{d.notes}</div>
            )}

            {canEdit && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                {d.status === 'PENDING' && (
                  <Button className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
                    <CheckCircle2 size={14} /> Xác nhận
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2" onClick={() => setIsEditing(true)}>
                    <Pencil size={14} /> Chỉnh sửa
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                    <X size={14} /> Hủy booking
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>}
    </Sheet>
  );
}
