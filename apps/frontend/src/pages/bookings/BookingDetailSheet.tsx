import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingApi, spacesApi, crmApi, usersApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LeadEditDialog } from '@/components/crm';
import { useToast } from '@/components/ui/use-toast';
import {
  Building2, User, Calendar, DollarSign, ArrowRight,
  X, FileText, Activity, Clock, Pencil, RotateCcw,
} from 'lucide-react';
import type { UnitBooking } from '@/types';
import { formatMoney, CURRENCIES } from '@/lib/currency';
import { UNIT_STATUS_CONFIG, daysLeft, fmtDate } from './bookings-constants';
import { ConvertToProposalDialog } from './ConvertToProposalDialog';
import { ExtendDialog } from './ExtendDialog';

/** Quy đổi tham khảo sang VND theo tỷ giá đang nhập — chỉ hiển thị, không lưu giá trị VND (xem docs/program/MULTI_CURRENCY_ARCHITECTURE.md: hệ thống không có FX engine). */
function fxHint(value: string, currencyCode: string | undefined, exchangeRate: string): string | null {
  const v = Number(value);
  const rate = Number(exchangeRate);
  if (!v || !currencyCode || currencyCode === 'VND' || !rate) return null;
  return `≈ ${(v * rate).toLocaleString('vi-VN')} ₫`;
}

const EMPTY_EF = {
  unitId: '', unitLabel: '', unitSearch: '',
  leadId: '', leadLabel: '',
  requestedArea: '', requestedTerm: '', expectedRent: '',
  budgetRentMin: '', budgetRentMax: '', exchangeRate: '',
  proposedRentPerSqm: '', proposedCamPerSqm: '',
  serviceFeeSqm: '', businessSupportFeeSqm: '',
  notes: '', assignedToId: '',
};

export function BookingDetailSheet({ booking, onClose, scrollTo, initialEditing }: {
  booking: UnitBooking | null; onClose: () => void; scrollTo?: string; initialEditing?: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation(['bookings', 'crm', 'common']);
  const { selectedMallId } = useMallStore();
  const [convertOpen, setConvertOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [leadEditOpen, setLeadEditOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [ef, setEf] = useState(EMPTY_EF);
  const [leadSearch, setLeadSearch] = useState('');
  const [lastBooking, setLastBooking] = useState<UnitBooking | null>(null);

  const setEfField = (k: keyof typeof ef) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setEf((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => { if (booking) setLastBooking(booking); }, [booking]);

  useEffect(() => {
    if (!booking || !scrollTo) return;
    const t = setTimeout(() => {
      document.getElementById(scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
    return () => clearTimeout(t);
  }, [booking?.id, scrollTo]);

  useEffect(() => {
    if (!booking || !initialEditing) { if (!booking) setIsEditing(false); return; }
    const src = booking;
    const cName = src.lead?.brandName ?? src.customer?.companyName ?? '';
    setEf({
      unitId: src.unitId ?? '',
      unitLabel: src.unit ? `${src.unit.code}${src.unit.name ? ' — ' + src.unit.name : ''} (${(src.unit.areaGFA as any)?.toLocaleString('vi-VN') ?? '?'}m²)` : '',
      unitSearch: '',
      leadId: src.leadId ?? '',
      leadLabel: cName,
      requestedArea: String(src.requestedArea ?? ''),
      requestedTerm: String(src.requestedTerm ?? ''),
      expectedRent: String(src.expectedRent ?? ''),
      budgetRentMin: String((src as any).budgetRentMin ?? ''),
      budgetRentMax: String((src as any).budgetRentMax ?? ''),
      exchangeRate: String((src as any).exchangeRate ?? ''),
      proposedRentPerSqm: String((src as any).proposedRentPerSqm ?? ''),
      proposedCamPerSqm: String((src as any).proposedCamPerSqm ?? ''),
      serviceFeeSqm: String((src as any).serviceFeeSqm ?? ''),
      businessSupportFeeSqm: String((src as any).businessSupportFeeSqm ?? ''),
      notes: src.notes ?? '',
      assignedToId: (src as any).assignedToId ?? '',
    });
    setIsEditing(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id, initialEditing]);

  const activeId = booking?.id ?? lastBooking?.id;

  const { data: detail } = useQuery({
    queryKey: ['booking-detail', activeId],
    queryFn: () => bookingApi.get(activeId!),
    enabled: !!activeId,
  });

  const { data: unitData } = useQuery({
    queryKey: ['edit-vacant-units', ef.unitSearch, selectedMallId],
    queryFn: () => spacesApi.listUnits({ search: ef.unitSearch || undefined, status: 'VACANT', mallId: selectedMallId ?? undefined, limit: 20 }),
    enabled: isEditing && !ef.unitId && ef.unitSearch.length > 0,
  });
  const { data: allLeadsData } = useQuery({
    queryKey: ['all-leads-picker'],
    queryFn: () => crmApi.listLeads({ limit: 200 }),
    enabled: isEditing,
    staleTime: 60000,
  });
  const { data: usersData } = useQuery({
    queryKey: ['users-picker'],
    queryFn: () => usersApi.listUsers({ limit: 100 }),
    enabled: isEditing,
    staleTime: 60000,
  });
  const vacantUnits: any[] = Array.isArray(unitData) ? unitData : (unitData?.data ?? []);
  const allLeads: any[] = Array.isArray(allLeadsData) ? allLeadsData : (allLeadsData?.data ?? []);
  const users: any[] = Array.isArray(usersData) ? usersData : (usersData?.data ?? []);

  const cancelMutation = useMutation({
    mutationFn: () => bookingApi.cancel(activeId!, 'Hủy từ trang Booking'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking-stats'] });
      toast({ title: 'Đã hủy booking' });
      onClose();
    },
    onError: () => toast({ title: 'Lỗi hủy booking', variant: 'destructive' }),
  });

  const reinstateMutation = useMutation({
    mutationFn: () => bookingApi.reinstate(activeId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking-detail', activeId] });
      qc.invalidateQueries({ queryKey: ['booking-stats'] });
      toast({ title: 'Đã khôi phục booking' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi khôi phục booking', variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};
      if (d && ef.unitId && ef.unitId !== d.unitId) payload.unitId = ef.unitId;
      if (d && ef.leadId !== (d.leadId ?? '')) payload.leadId = ef.leadId || null;
      if (d && ef.assignedToId !== ((d as any).assignedToId ?? '')) payload.assignedToId = ef.assignedToId || null;
      if (ef.requestedArea) payload.requestedArea = Number(ef.requestedArea);
      if (ef.requestedTerm) payload.requestedTerm = Number(ef.requestedTerm);
      if (ef.expectedRent) payload.expectedRent = Number(ef.expectedRent);
      if (ef.budgetRentMin) payload.budgetRentMin = Number(ef.budgetRentMin);
      if (ef.budgetRentMax) payload.budgetRentMax = Number(ef.budgetRentMax);
      if (ef.exchangeRate) payload.exchangeRate = Number(ef.exchangeRate);
      if (ef.proposedRentPerSqm) payload.proposedRentPerSqm = Number(ef.proposedRentPerSqm);
      if (ef.proposedCamPerSqm) payload.proposedCamPerSqm = Number(ef.proposedCamPerSqm);
      if (ef.serviceFeeSqm) payload.serviceFeeSqm = Number(ef.serviceFeeSqm);
      if (ef.businessSupportFeeSqm) payload.businessSupportFeeSqm = Number(ef.businessSupportFeeSqm);
      payload.notes = ef.notes || undefined;
      return bookingApi.update(activeId!, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking-detail', activeId] });
      qc.invalidateQueries({ queryKey: ['booking-stats'] });
      toast({ title: 'Đã cập nhật booking' });
      setIsEditing(false);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi cập nhật booking', variant: 'destructive' }),
  });

  const d = (detail?.data ?? detail ?? booking ?? lastBooking) as UnitBooking | null;

  const startEditing = () => {
    if (!d) return;
    const cName = d.lead?.brandName ?? d.customer?.companyName ?? '';
    setEf({
      unitId: d.unitId ?? '',
      unitLabel: d.unit ? `${d.unit.code}${d.unit.name ? ' — ' + d.unit.name : ''} (${(d.unit.areaGFA as any)?.toLocaleString('vi-VN') ?? '?'}m²)` : '',
      unitSearch: '',
      leadId: d.leadId ?? '',
      leadLabel: cName,
      requestedArea: String(d.requestedArea ?? ''),
      requestedTerm: String(d.requestedTerm ?? ''),
      expectedRent: String(d.expectedRent ?? ''),
      budgetRentMin: String((d as any).budgetRentMin ?? ''),
      budgetRentMax: String((d as any).budgetRentMax ?? ''),
      exchangeRate: String((d as any).exchangeRate ?? ''),
      proposedRentPerSqm: String((d as any).proposedRentPerSqm ?? ''),
      proposedCamPerSqm: String((d as any).proposedCamPerSqm ?? ''),
      serviceFeeSqm: String((d as any).serviceFeeSqm ?? ''),
      businessSupportFeeSqm: String((d as any).businessSupportFeeSqm ?? ''),
      notes: d.notes ?? '',
      assignedToId: (d as any).assignedToId ?? '',
    });
    setIsEditing(true);
  };

  const cfg = d ? UNIT_STATUS_CONFIG[d.status] : undefined;
  const dl = d ? daysLeft(d.expiresAt) : null;
  const clientName = d?.lead?.brandName ?? d?.customer?.companyName ?? '—';
  const contactName = d?.lead?.contactName ?? d?.customer?.brandName ?? '';
  const activities: any[] = (detail?.data ?? detail)?.activities ?? (detail as any)?.activities ?? [];
  const canEdit = d ? ['ACTIVE', 'PENDING'].includes(d.status) : false;
  const canReinstate = d?.status === 'CANCELLED';

  return (
    <Sheet open={!!booking} onClose={onClose} title={d?.bookingNumber ?? ''} subtitle={`${d?.unit?.code ?? ''} · ${clientName}`}>
      {d && <div className="px-6 pb-8 space-y-4 pt-4">

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold">
            📌 Giữ lô thuê dài hạn
          </Badge>
          <Badge className={`${cfg?.color} border px-3 py-1 text-sm font-medium`}>{cfg?.label}</Badge>
          <Badge variant="outline" className="text-sm">Ưu tiên #{d.priority}</Badge>
          {dl !== null && d.status === 'ACTIVE' && (
            <Badge variant="outline" className={`text-sm ${dl <= 7 ? 'border-red-300 text-red-600' : ''}`}>
              {dl > 0 ? `Còn ${dl} ngày` : 'Hết hạn hôm nay'}
            </Badge>
          )}
          {isEditing && <Badge className="bg-amber-100 text-amber-700 border border-amber-300 text-xs">Đang chỉnh sửa</Badge>}
        </div>

        {isEditing ? (
          /* ── EDIT MODE ─────────────────────────────────────────────────── */
          <div className="space-y-4">

            {/* Unit picker */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-semibold tracking-wider text-blue-500 mb-2">MẶT BẰNG</p>
              {ef.unitId ? (
                <div className="flex items-center gap-2 p-2 border rounded-lg bg-amber-50 border-amber-200">
                  <Building2 size={14} className="text-amber-600" />
                  <span className="text-sm font-medium flex-1">{ef.unitLabel}</span>
                  <button onClick={() => setEf((f) => ({ ...f, unitId: '', unitLabel: '' }))}
                    className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </div>
              ) : (
                <div>
                  <Input value={ef.unitSearch} onChange={setEfField('unitSearch')}
                    placeholder="Tìm mã lô mới (để trống = giữ nguyên)..." className="mb-1 bg-white" />
                  {vacantUnits.length > 0 && (
                    <div className="border rounded-lg divide-y max-h-36 overflow-y-auto text-sm bg-white">
                      {vacantUnits.map((u: any) => (
                        <button key={u.id} className="w-full text-left px-3 py-2 hover:bg-amber-50 flex items-center gap-3"
                          onClick={() => setEf((f) => ({ ...f, unitId: u.id, unitLabel: `${u.code}${u.name ? ' — ' + u.name : ''} (${u.areaGFA?.toLocaleString('vi-VN')}m²)`, unitSearch: '' }))}>
                          <Building2 size={13} className="text-amber-500 shrink-0" />
                          <span className="font-medium">{u.code}</span>
                          <span className="text-gray-400">{u.name}</span>
                          <span className="ml-auto text-xs text-gray-400">{u.floor?.name} · {u.areaGFA?.toLocaleString('vi-VN')}m²</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {ef.unitSearch && vacantUnits.length === 0 && (
                    <p className="text-xs text-gray-400 px-1 mt-1">Không tìm thấy lô VACANT phù hợp</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1.5">Hiện tại: <span className="font-medium text-gray-600">{d.unit?.code}</span> — bỏ trống để giữ nguyên</p>
                </div>
              )}
            </div>

            {/* Lead combobox */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold tracking-wider text-gray-500 mb-2">KHÁCH HÀNG</p>
              {ef.leadId ? (
                <div className="flex items-center gap-2 p-2 border rounded-lg bg-blue-50 border-blue-200">
                  <User size={14} className="text-blue-600" />
                  <span className="text-sm font-medium flex-1">{ef.leadLabel}</span>
                  <button onClick={() => { setEf((f) => ({ ...f, leadId: '', leadLabel: '' })); setLeadSearch(''); }}
                    className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </div>
              ) : (
                <div>
                  <Input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)}
                    placeholder="Tìm tên thương hiệu hoặc liên hệ..." className="mb-1 bg-white" />
                  {(() => {
                    const filtered = allLeads.filter((l: any) => !leadSearch || l.brandName?.toLowerCase().includes(leadSearch.toLowerCase()) || l.contactName?.toLowerCase().includes(leadSearch.toLowerCase()));
                    return filtered.length > 0 ? (
                      <div className="border rounded-lg divide-y max-h-36 overflow-y-auto text-sm bg-white">
                        {filtered.map((l: any) => (
                          <button key={l.id} className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-3"
                            onClick={() => { setEf((f) => ({ ...f, leadId: l.id, leadLabel: `${l.brandName} — ${l.contactName}` })); setLeadSearch(''); }}>
                            <User size={12} className="text-blue-400 shrink-0" />
                            <span className="font-medium truncate">{l.brandName}</span>
                            <span className="text-gray-400 text-xs shrink-0">{l.contactName}</span>
                            <span className="ml-auto text-xs text-gray-400 shrink-0">
                              {t(`crm:lead.stages.${l.status}`, { defaultValue: t('common:unknownValue') })}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : leadSearch ? (
                      <p className="text-xs text-gray-400 px-1 mt-1">Không tìm thấy khách hàng phù hợp</p>
                    ) : null;
                  })()}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1.5">Hiện tại: <span className="font-medium text-gray-600">{clientName}</span></p>
            </div>

            {/* YÊU CẦU KHÁCH inputs */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold tracking-wider text-amber-600 mb-3">YÊU CẦU KHÁCH</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">DT mong muốn (m²)</label>
                  <Input type="number" value={ef.requestedArea} onChange={setEfField('requestedArea')} placeholder="120" className="bg-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Thời hạn (tháng)</label>
                  <Input type="number" value={ef.requestedTerm} onChange={setEfField('requestedTerm')} placeholder="36" className="bg-white" />
                </div>
                {d.currencyCode && d.currencyCode !== 'VND' && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Tỷ giá áp dụng (VND/{d.currencyCode})</label>
                    <Input type="number" value={ef.exchangeRate} onChange={setEfField('exchangeRate')} placeholder="24500" className="bg-white" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 mt-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Giá ngân sách — thấp nhất ({CURRENCIES[d.currencyCode ?? 'VND'].symbol}/m²)</label>
                  <Input type="number" value={ef.budgetRentMin} onChange={setEfField('budgetRentMin')} placeholder="600000" className="bg-white" />
                  {fxHint(ef.budgetRentMin, d.currencyCode, ef.exchangeRate) && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{fxHint(ef.budgetRentMin, d.currencyCode, ef.exchangeRate)}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Giá ngân sách — cao nhất ({CURRENCIES[d.currencyCode ?? 'VND'].symbol}/m²)</label>
                  <Input type="number" value={ef.budgetRentMax} onChange={setEfField('budgetRentMax')} placeholder="700000" className="bg-white" />
                  {fxHint(ef.budgetRentMax, d.currencyCode, ef.exchangeRate) && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{fxHint(ef.budgetRentMax, d.currencyCode, ef.exchangeRate)}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Giá kỳ vọng ({CURRENCIES[d.currencyCode ?? 'VND'].symbol}/m²)</label>
                  <Input type="number" value={ef.expectedRent} onChange={setEfField('expectedRent')} placeholder="680000" className="bg-white" />
                  {fxHint(ef.expectedRent, d.currencyCode, ef.exchangeRate) && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{fxHint(ef.expectedRent, d.currencyCode, ef.exchangeRate)}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Giá thuê đề xuất (chào thuê) ({CURRENCIES[d.currencyCode ?? 'VND'].symbol}/m²)</label>
                  <Input type="number" value={ef.proposedRentPerSqm} onChange={setEfField('proposedRentPerSqm')} placeholder="650000" className="bg-white" />
                  {fxHint(ef.proposedRentPerSqm, d.currencyCode, ef.exchangeRate) && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{fxHint(ef.proposedRentPerSqm, d.currencyCode, ef.exchangeRate)}</p>
                  )}
                </div>
                {/* CAM đề xuất chỉ áp dụng HĐT Văn phòng — ẩn khi mall thuộc loại TTTM (leaseCategory = MALL), thay bằng Phí Dịch vụ/Phí HTKD bên dưới. Mặc định hiện CAM nếu chưa xác định leaseCategory (dữ liệu cũ). */}
                {d.unit?.mall?.leaseCategory !== 'MALL' && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">CAM đề xuất ({CURRENCIES[d.currencyCode ?? 'VND'].symbol}/m²)</label>
                    <Input type="number" value={ef.proposedCamPerSqm} onChange={setEfField('proposedCamPerSqm')} placeholder="50000" className="bg-white" />
                    {fxHint(ef.proposedCamPerSqm, d.currencyCode, ef.exchangeRate) && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{fxHint(ef.proposedCamPerSqm, d.currencyCode, ef.exchangeRate)}</p>
                    )}
                  </div>
                )}
              </div>

              {d.unit?.mall?.leaseCategory === 'MALL' && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Phí Dịch vụ ({CURRENCIES[d.currencyCode ?? 'VND'].symbol}/m²/tháng)</label>
                    <Input type="number" value={ef.serviceFeeSqm} onChange={setEfField('serviceFeeSqm')} placeholder="0.5" className="bg-white" />
                    {fxHint(ef.serviceFeeSqm, d.currencyCode, ef.exchangeRate) && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{fxHint(ef.serviceFeeSqm, d.currencyCode, ef.exchangeRate)}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Phí hỗ trợ Kinh doanh ({CURRENCIES[d.currencyCode ?? 'VND'].symbol}/m²/tháng)</label>
                    <Input type="number" value={ef.businessSupportFeeSqm} onChange={setEfField('businessSupportFeeSqm')} placeholder="0.3" className="bg-white" />
                    {fxHint(ef.businessSupportFeeSqm, d.currencyCode, ef.exchangeRate) && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{fxHint(ef.businessSupportFeeSqm, d.currencyCode, ef.exchangeRate)}</p>
                    )}
                  </div>
                </div>
              )}

              {d.currencyCode && d.currencyCode !== 'VND' && (
                <p className="text-xs text-gray-400 mt-2">Đơn vị tiền tệ ({d.currencyCode}) được đặt khi tạo booking và không thể sửa ở đây. Tỷ giá chỉ để tham khảo, không dùng để tính Hợp đồng/Billing.</p>
              )}
            </div>

            {/* Ghi chú */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú</label>
              <Textarea value={ef.notes} onChange={setEfField('notes')} rows={3} placeholder="Ghi chú nội bộ..." />
            </div>

            {/* Phụ trách */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Phụ trách (Sale)</label>
              <select className="w-full border rounded-md h-9 px-2 text-sm border-gray-300 bg-white"
                value={ef.assignedToId} onChange={(e) => setEf((f) => ({ ...f, assignedToId: e.target.value }))}>
                <option value="">-- Chưa phân công --</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white gap-2"
                onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                <Pencil size={13} /> {updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
              <Button variant="outline" className="flex-1 gap-2" onClick={() => setIsEditing(false)}>
                <X size={13} /> Hủy chỉnh sửa
              </Button>
            </div>
          </div>
        ) : (
          /* ── VIEW MODE ─────────────────────────────────────────────────── */
          <>
            <SheetSection label="KHÁCH HÀNG" className="bg-gray-50" id="bs-customer"
              action={d.leadId && canEdit ? (
                <button
                  className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Sửa thông tin khách hàng"
                  onClick={() => setLeadEditOpen(true)}
                >
                  <Pencil size={13} />
                </button>
              ) : undefined}
            >
              <SheetRow label="Tên"     value={clientName}   icon={User} />
              {contactName && <SheetRow label="Liên hệ" value={contactName} icon={User} />}
              <SheetRow label="Nguồn"   value={d.leadId ? 'Lead (CRM)' : 'Customer profile'} icon={User} />
            </SheetSection>

            <SheetSection label="MẶT BẰNG" className="bg-gray-50" id="bs-unit">
              <SheetRow label="Mã"         value={d.unit?.code ?? '—'} icon={Building2} />
              <SheetRow label="Diện tích"  value={d.unit?.areaNLA ? `${d.unit.areaNLA.toLocaleString()} m² NLA` : '—'} icon={Building2} />
              <SheetRow label="Tầng"       value={(d.unit as any)?.floor?.name ?? '—'} icon={Building2} />
              {/* The Unit's own currency, not the booking's: this row shows the unit's
                  master-data base rent, which can be quoted in a different currency
                  than the deal being negotiated on it. */}
              {d.unit?.baseRentPerSqm ? (
                <SheetRow label="Giá cơ bản" value={`${formatMoney(d.unit.baseRentPerSqm, (d.unit as any).currencyCode ?? 'VND')}/m²`} icon={DollarSign} />
              ) : null}
            </SheetSection>

            <SheetSection label="YÊU CẦU KHÁCH" className="bg-amber-50" id="bs-request">
              <SheetRow label="DT mong muốn" value={d.requestedArea ? `${d.requestedArea.toLocaleString()} m²` : '—'} icon={Building2} />
              <SheetRow label="Thời hạn"     value={d.requestedTerm ? `${d.requestedTerm} tháng` : '—'} icon={Calendar} />
              {(d.budgetRentMin || d.budgetRentMax) ? (
                <SheetRow label="Giá ngân sách" value={`${d.budgetRentMin ? formatMoney(d.budgetRentMin, d.currencyCode ?? 'VND') : '?'} ~ ${d.budgetRentMax ? formatMoney(d.budgetRentMax, d.currencyCode ?? 'VND') : '?'}/m²`} icon={DollarSign} />
              ) : null}
              <SheetRow label="Giá kỳ vọng"  value={d.expectedRent ? `${formatMoney(d.expectedRent, d.currencyCode ?? 'VND')}/m²` : '—'} icon={DollarSign} />
              {d.proposedRentPerSqm ? (
                <SheetRow label="Giá đề xuất (chào thuê)" value={`${formatMoney(d.proposedRentPerSqm, d.currencyCode ?? 'VND')}/m²`} icon={DollarSign} />
              ) : null}
              {d.unit?.mall?.leaseCategory !== 'MALL' && d.proposedCamPerSqm ? (
                <SheetRow label="CAM đề xuất" value={`${formatMoney(d.proposedCamPerSqm, d.currencyCode ?? 'VND')}/m²`} icon={DollarSign} />
              ) : null}
              {d.unit?.mall?.leaseCategory === 'MALL' && d.serviceFeeSqm ? (
                <SheetRow label="Phí Dịch vụ" value={`${formatMoney(d.serviceFeeSqm, d.currencyCode ?? 'VND')}/m²/tháng`} icon={DollarSign} />
              ) : null}
              {d.unit?.mall?.leaseCategory === 'MALL' && d.businessSupportFeeSqm ? (
                <SheetRow label="Phí hỗ trợ Kinh doanh" value={`${formatMoney(d.businessSupportFeeSqm, d.currencyCode ?? 'VND')}/m²/tháng`} icon={DollarSign} />
              ) : null}
              {d.currencyCode && d.currencyCode !== 'VND' && (
                <SheetRow label="Đơn vị tiền tệ" value={`${d.currencyCode} (${CURRENCIES[d.currencyCode].name})`} icon={DollarSign} />
              )}
              {d.currencyCode && d.currencyCode !== 'VND' && d.exchangeRate ? (
                <SheetRow label="Tỷ giá tham khảo" value={`${d.exchangeRate.toLocaleString('vi-VN')} VND/${d.currencyCode}`} icon={DollarSign} />
              ) : null}
            </SheetSection>

            <SheetSection label="THỜI GIAN" className="bg-gray-50" id="bs-timeline">
              <SheetRow label="Tạo lúc"   value={fmtDate(d.createdAt)}   icon={Calendar} />
              <SheetRow label="Kích hoạt" value={fmtDate(d.activatedAt)} icon={Calendar} />
              <SheetRow label="Hết hạn"   value={fmtDate(d.expiresAt)}   icon={Calendar} />
              {d.convertedAt && <SheetRow label="Convert" value={fmtDate(d.convertedAt)} icon={Calendar} />}
            </SheetSection>

            {d.assignedTo && (
              <SheetSection label="PHỤ TRÁCH" className="bg-gray-50" id="bs-assignee">
                <SheetRow label="Sale" value={d.assignedTo.fullName} icon={User} />
              </SheetSection>
            )}
            {d.notes && (
              <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-100 rounded-xl p-3">{d.notes}</div>
            )}

            {d.proposal && (
              <button
                className="flex items-center justify-between w-full p-3 bg-green-50 border border-green-100 rounded-xl hover:bg-green-100 transition-colors"
                onClick={() => { onClose(); navigate(`/proposals?id=${d.proposal!.id}`); }}
              >
                <div className="flex items-center gap-2 text-sm">
                  <FileText size={14} className="text-green-600" />
                  <span className="font-medium">{d.proposal.proposalNumber}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-green-100 text-green-700 border-0 text-xs">
                    {t(`crm:proposalStatus.${d.proposal.status}`, { defaultValue: t('common:unknownValue') })}
                  </Badge>
                  <ArrowRight size={12} className="text-green-500" />
                </div>
              </button>
            )}

            {canEdit && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                {d.status === 'ACTIVE' && !d.proposal && (
                  <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setConvertOpen(true)}>
                    <ArrowRight size={15} /> Lập Đề xuất (Proposal)
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2" onClick={startEditing}>
                    <Pencil size={14} /> Chỉnh sửa
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2" onClick={() => setExtendOpen(true)}>
                    <Clock size={14} /> Gia hạn
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                    <X size={14} /> Hủy booking
                  </Button>
                </div>
              </div>
            )}

            {canReinstate && (
              <div className="pt-2 border-t border-gray-100">
                <Button variant="outline" className="w-full gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={() => reinstateMutation.mutate()} disabled={reinstateMutation.isPending}>
                  <RotateCcw size={14} /> Khôi phục booking
                </Button>
              </div>
            )}

            {activities.length > 0 && (
              <div>
                <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                  <Activity size={11} /> LỊCH SỬ ({activities.length})
                </div>
                <div className="space-y-2">
                  {activities.map((a: any) => (
                    <div key={a.id} className="flex gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">
                          {t(`bookings:activityTypes.${a.type}`, { defaultValue: t('common:unknownValue') })}
                        </span>
                        {' — '}<span className="text-gray-500">{a.note}</span>
                        <div className="text-gray-400">{new Date(a.createdAt).toLocaleString('vi-VN')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>}

      {d && <ConvertToProposalDialog booking={d} open={convertOpen} onClose={() => setConvertOpen(false)} />}
      {d && <ExtendDialog bookingId={d.id} open={extendOpen} onClose={() => setExtendOpen(false)} />}
      {d?.lead && (
        <LeadEditDialog
          lead={d.lead}
          open={leadEditOpen}
          onClose={() => setLeadEditOpen(false)}
          queryKeys={{
            bookingDetail: 'booking-detail',
            bookingsList: 'bookings',
            leadsPicker: 'all-leads-picker',
            pipeline: 'crm-pipeline',
            leadDetail: 'lead-detail',
          }}
        />
      )}
    </Sheet>
  );
}
