import { formatSlotMoney } from '@/lib/slot-currency';
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { slotsApi } from '@/api';
import { useAuthStore } from '@/store/auth.store';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Building2, User, Calendar, DollarSign, CheckCircle2, X, Pencil, ArrowRight, FileText, Send, Lock, Unlock, AlertTriangle } from 'lucide-react';
import { SLOT_TYPE_CONFIG, SLOT_STATUS_CONFIG, SLOT_PRICING_BASIS_OPTIONS, fmtDatetime, fmtMoney, toDatetimeLocal } from './bookings-constants';
import { ConvertSlotBookingToProposalDialog } from './ConvertSlotBookingToProposalDialog';

type SlotEditForm = {
  installationStartDatetime: string;
  installationEndDatetime: string;
  startDatetime: string;
  endDatetime: string;
  dismantlingStartDatetime: string;
  dismantlingEndDatetime: string;
  discountPct: string;
  notes: string;
};

export function SlotBookingDetailSheet({ booking, onClose, scrollTo, initialEditing }: {
  booking: any | null; onClose: () => void; scrollTo?: string; initialEditing?: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const role = useAuthStore((st) => st.user?.role);
  // Một cấp duyệt: người có thẩm quyền (Leasing Manager / Mall Director / Admin)
  const canApprove = !!role && ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR'].includes(role);
  const [lastBooking, setLastBooking] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [ef, setEf] = useState<SlotEditForm>({
    installationStartDatetime: '', installationEndDatetime: '',
    startDatetime: '', endDatetime: '',
    dismantlingStartDatetime: '', dismantlingEndDatetime: '',
    discountPct: '0', notes: '',
  });

  useEffect(() => {
    if (booking) {
      setLastBooking(booking);
      setIsEditing(!!initialEditing);
      const rentalStartMs = new Date(booking.startDatetime).getTime();
      const rentalEndMs = new Date(booking.endDatetime).getTime();
      setEf({
        installationStartDatetime: toDatetimeLocal(booking.installationStartDatetime ?? new Date(rentalStartMs - 3_600_000).toISOString()),
        installationEndDatetime: toDatetimeLocal(booking.installationEndDatetime ?? booking.startDatetime),
        startDatetime: toDatetimeLocal(booking.startDatetime),
        endDatetime: toDatetimeLocal(booking.endDatetime),
        dismantlingStartDatetime: toDatetimeLocal(booking.dismantlingStartDatetime ?? booking.endDatetime),
        dismantlingEndDatetime: toDatetimeLocal(booking.dismantlingEndDatetime ?? new Date(rentalEndMs + 3_600_000).toISOString()),
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
      installationStartDatetime: new Date(ef.installationStartDatetime).toISOString(),
      installationEndDatetime: new Date(ef.installationEndDatetime).toISOString(),
      startDatetime: ef.startDatetime ? new Date(ef.startDatetime).toISOString() : undefined,
      endDatetime: ef.endDatetime ? new Date(ef.endDatetime).toISOString() : undefined,
      dismantlingStartDatetime: new Date(ef.dismantlingStartDatetime).toISOString(),
      dismantlingEndDatetime: new Date(ef.dismantlingEndDatetime).toISOString(),
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

  // Gửi duyệt / duyệt / từ chối / khóa / mở lại -- cùng một khuôn: gọi API, làm mới danh sách, báo kết quả.
  const makeFlow = (label: string, call: () => Promise<any>, closeAfter = true) => useMutation({
    mutationFn: call,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['slot-bookings'] });
      const n = res?.conflictedBookingIds?.length;
      toast({
        title: label,
        description: n ? `${n} booking trùng lịch cần được xác nhận khóa hoặc bỏ qua` : undefined,
      });
      if (closeAfter) onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Thao tác thất bại', variant: 'destructive' }),
  });
  const submitMutation = makeFlow('Đã gửi duyệt', () => slotsApi.submitBooking(d?.id));
  const approveMutation = makeFlow('Đã duyệt booking', () => slotsApi.approveBooking(d?.id));
  const rejectMutation = makeFlow('Đã từ chối booking', () => slotsApi.rejectBooking(d?.id, 'Từ chối từ trang Booking'));
  const lockMutation = makeFlow('Đã khóa booking do xung đột', () => slotsApi.confirmLock(d?.id));
  const dismissMutation = makeFlow('Đã bỏ qua cảnh báo xung đột', () => slotsApi.dismissConflict(d?.id));
  const reopenMutation = makeFlow('Đã mở lại booking', () => slotsApi.reopenBooking(d?.id));

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
  const canEdit = d && ['PENDING', 'SUBMITTED', 'CONFIRMED', 'APPROVED'].includes(d.status);
  const lines: any[] = d?.lines ?? [];
  const basisLabel = SLOT_PRICING_BASIS_OPTIONS.find((o) => o.value === d?.pricingTimeBasis)?.label;

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

            {([
              ['Lắp đặt', 'installationStartDatetime', 'installationEndDatetime'],
              ['Thời gian thuê', 'startDatetime', 'endDatetime'],
              ['Tháo dỡ', 'dismantlingStartDatetime', 'dismantlingEndDatetime'],
            ] as const).map(([label, startKey, endKey]) => (
              <div key={label} className="rounded-lg border border-gray-100 p-3">
                <div className="mb-2 text-xs font-semibold text-gray-600">{label}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input type="datetime-local" value={ef[startKey]} onChange={setEfField(startKey)} />
                  <Input type="datetime-local" value={ef[endKey]} onChange={setEfField(endKey)} />
                </div>
              </div>
            ))}
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
              {lines.length > 0 ? lines.map((l: any) => (
                <SheetRow key={l.id} label={l.slot?.code ?? 'Slot'}
                  value={`${l.areaRented} / ${l.slot?.area ?? '?'} m²${l.areaRented < (l.slot?.area ?? Infinity) ? ' (thuê một phần)' : ''}`}
                  icon={Building2} />
              )) : (
                <>
                  <SheetRow label="Slot"       value={`${d.slot?.code ?? '—'} — ${d.slot?.name ?? ''}`} icon={Building2} />
                  <SheetRow label="Diện tích"  value={d.slot?.area ? `${d.slot.area} m²` : '—'} icon={Building2} />
                </>
              )}
            </SheetSection>

            <SheetSection label="THỜI GIAN BOOKING" className="bg-violet-50" id="sbs-timeline">
              <SheetRow label="Bắt đầu lắp đặt" value={d.installationStartDatetime ? fmtDatetime(d.installationStartDatetime) : '—'} icon={Calendar} />
              <SheetRow label="Hoàn tất lắp đặt" value={d.installationEndDatetime ? fmtDatetime(d.installationEndDatetime) : '—'} icon={Calendar} />
              <SheetRow label="Bắt đầu thuê" value={fmtDatetime(d.startDatetime)} icon={Calendar} />
              <SheetRow label="Kết thúc thuê" value={fmtDatetime(d.endDatetime)} icon={Calendar} />
              <SheetRow label="Bắt đầu tháo dỡ" value={d.dismantlingStartDatetime ? fmtDatetime(d.dismantlingStartDatetime) : '—'} icon={Calendar} />
              <SheetRow label="Hoàn tất tháo dỡ" value={d.dismantlingEndDatetime ? fmtDatetime(d.dismantlingEndDatetime) : '—'} icon={Calendar} />
              {basisLabel && <SheetRow label="Tính tiền theo" value={basisLabel} icon={DollarSign} />}
            </SheetSection>

            <SheetSection label="GIÁ TIỀN" className="bg-gray-50" id="sbs-price">
              <SheetRow label="Giá gốc"     value={formatSlotMoney(d.baseAmount, d.currencyCode)}   icon={DollarSign} />
              {d.discountPct > 0 && (
                <SheetRow label="Chiết khấu" value={`${d.discountPct}%`} icon={DollarSign} />
              )}
              <SheetRow label="Thành tiền"  value={formatSlotMoney(d.totalAmount, d.currencyCode)}  icon={DollarSign} />
            </SheetSection>

            {d.notes && (
              <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-100 rounded-xl p-3">{d.notes}</div>
            )}

            {d.proposal && (
              <button
                className="flex items-center justify-between w-full p-3 bg-green-50 border border-green-100 rounded-xl hover:bg-green-100 transition-colors"
                onClick={() => { onClose(); navigate(`/proposals?id=${d.proposal.id}`); }}
              >
                <div className="flex items-center gap-2 text-sm">
                  <FileText size={14} className="text-green-600" />
                  <span className="font-medium">{d.proposal.proposalNumber}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-green-100 text-green-700 border-0 text-xs">{d.proposal.status}</Badge>
                  <ArrowRight size={12} className="text-green-500" />
                </div>
              </button>
            )}

            {d.conflictWithBookingId && ['PENDING', 'SUBMITTED'].includes(d.status) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <AlertTriangle size={14} /> Trùng lịch với booking đã được duyệt
                </div>
                <p className="text-xs text-amber-700">Slot/thời gian này đã thuộc về booking khác. Cần người có thẩm quyền xác nhận khóa hoặc bỏ qua.</p>
                {canApprove && (
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 gap-1 bg-gray-700 hover:bg-gray-800 text-white"
                      onClick={() => lockMutation.mutate()} disabled={lockMutation.isPending}>
                      <Lock size={13} /> Xác nhận khóa
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1"
                      onClick={() => dismissMutation.mutate()} disabled={dismissMutation.isPending}>
                      Bỏ qua
                    </Button>
                  </div>
                )}
              </div>
            )}

            {d.status === 'LOCKED' && (
              <div className="rounded-xl border border-gray-300 bg-gray-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Lock size={14} /> Booking đã bị khóa
                </div>
                {d.lockReason && <p className="text-xs text-gray-600">{d.lockReason}</p>}
                {canApprove && (
                  <Button size="sm" variant="outline" className="w-full gap-1"
                    onClick={() => reopenMutation.mutate()} disabled={reopenMutation.isPending}>
                    <Unlock size={13} /> Mở lại (nếu booking chiếm chỗ đã được giải phóng)
                  </Button>
                )}
              </div>
            )}

            {canEdit && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                {d.status === 'PENDING' && (
                  <Button className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                    <Send size={14} /> Gửi duyệt
                  </Button>
                )}
                {d.status === 'SUBMITTED' && canApprove && (
                  <div className="flex gap-2">
                    <Button className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                      onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                      <CheckCircle2 size={14} /> Duyệt
                    </Button>
                    <Button variant="outline" className="flex-1 gap-2 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
                      <X size={14} /> Từ chối
                    </Button>
                  </div>
                )}
                {d.status === 'SUBMITTED' && !canApprove && (
                  <p className="text-xs text-gray-500 text-center">Đang chờ người có thẩm quyền duyệt.</p>
                )}
                {['CONFIRMED', 'APPROVED'].includes(d.status) && !d.proposal && (
                  <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setConvertOpen(true)}>
                    <ArrowRight size={15} /> Lập Đề xuất (Proposal)
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
      {d && <ConvertSlotBookingToProposalDialog booking={d} open={convertOpen} onClose={() => setConvertOpen(false)} />}
    </Sheet>
  );
}
