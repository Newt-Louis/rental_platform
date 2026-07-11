import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { bookingApi, slotsApi, spacesApi, crmApi, customersApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  BookmarkCheck, Clock, BookmarkX, ArrowRight, Building2, User, Calendar,
  ChevronRight, Search, AlertTriangle, DollarSign, RefreshCw,
  BookmarkPlus, X, FileText, Activity, CalendarDays, Timer, CalendarRange,
  CheckCircle2, Ban, Hourglass, Plus, ChevronDown, Loader2,
} from 'lucide-react';
import type { UnitBooking } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ACTIVE:    { label: 'Đang giữ',   color: 'bg-amber-100 text-amber-700 border-amber-200' },
  PENDING:   { label: 'Chờ duyệt',  color: 'bg-blue-100 text-blue-700 border-blue-200' },
  EXPIRED:   { label: 'Hết hạn',    color: 'bg-gray-100 text-gray-500 border-gray-200' },
  CANCELLED: { label: 'Đã hủy',     color: 'bg-red-100 text-red-600 border-red-200' },
  CONVERTED: { label: 'Đã lập đề xuất', color: 'bg-green-100 text-green-700 border-green-200' },
};

const SLOT_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING:   { label: 'Chờ xác nhận', color: 'bg-blue-100 text-blue-700 border-blue-200',     icon: Hourglass },
  CONFIRMED: { label: 'Đã xác nhận',  color: 'bg-violet-100 text-violet-700 border-violet-200', icon: CheckCircle2 },
  CANCELLED: { label: 'Đã hủy',       color: 'bg-red-100 text-red-600 border-red-200',          icon: Ban },
  COMPLETED: { label: 'Hoàn thành',   color: 'bg-green-100 text-green-700 border-green-200',    icon: CheckCircle2 },
};

const SLOT_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  DAILY:   { label: 'Theo ngày', icon: CalendarDays,  color: 'bg-sky-100 text-sky-700' },
  HOURLY:  { label: 'Theo giờ', icon: Timer,          color: 'bg-orange-100 text-orange-700' },
  MONTHLY: { label: 'Theo tháng', icon: CalendarRange, color: 'bg-teal-100 text-teal-700' },
};

const ACTIVITY_LABELS: Record<string, string> = {
  CREATED: 'Tạo booking', ACTIVATED: 'Kích hoạt', PRIORITY_CHANGED: 'Đổi ưu tiên',
  EXTENDED: 'Gia hạn', NOTE_ADDED: 'Ghi chú', CONVERTED: 'Chuyển đề xuất',
  CANCELLED: 'Hủy booking', EXPIRED: 'Hết hạn tự động',
};

function fmt(n: number) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
function fmtMoney(n?: number | null) {
  if (!n) return '—';
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDatetime(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function daysLeft(expiresAt?: string) {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}

// ─── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, icon: Icon, color = 'blue', badge }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string; badge?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600',
    yellow: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600',
    purple: 'bg-violet-50 text-violet-600', teal: 'bg-teal-50 text-teal-600',
  };
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-lg ${colorMap[color]}`}><Icon size={18} /></div>
        </div>
        {badge && <Badge variant="secondary" className="mt-2 text-xs">{badge}</Badge>}
      </CardContent>
    </Card>
  );
}

// ─── ConvertToProposalDialog ───────────────────────────────────────────────────

function ConvertToProposalDialog({ booking, open, onClose }: {
  booking: UnitBooking | null; open: boolean; onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    area: '', term: '36', startDate: '', rentPerSqm: '',
    camPerSqm: '', deposit: '3', rentFree: '0', escalationPercent: '0', notes: '',
    // GAP #91–94, #41
    utilityFee: '0', operatingHours: '', afterHoursFee: '0',
    paymentTermDays: '30', depositLease: '0', depositFitout: '0', fitoutFee: '0',
  });

  const wasOpen = useRef(false);
  if (open && !wasOpen.current && booking) {
    wasOpen.current = true;
    setForm((prev) => ({
      ...prev,
      area: booking.requestedArea?.toString() ?? '',
      term: booking.requestedTerm?.toString() ?? '36',
      rentPerSqm: booking.expectedRent?.toString() ?? '',
    }));
  }
  if (!open) wasOpen.current = false;

  const mutation = useMutation({
    mutationFn: () => bookingApi.convertToProposal(booking!.id, {
      area: Number(form.area), term: Number(form.term), startDate: form.startDate,
      rentPerSqm: Number(form.rentPerSqm),
      camPerSqm: form.camPerSqm ? Number(form.camPerSqm) : undefined,
      deposit: Number(form.deposit), rentFree: Number(form.rentFree),
      escalationPercent: Number(form.escalationPercent),
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
      navigate('/proposals');
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight size={18} className="text-green-600" />
            Lập Đề xuất từ Booking {booking?.bookingNumber}
          </DialogTitle>
          {booking?.unit && (
            <p className="text-sm text-gray-500">
              Unit: {booking.unit.code} · {booking.lead?.brandName ?? booking.customer?.companyName}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-4 pt-1">
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Giá thuê (₫/m²) *</label>
              <Input value={form.rentPerSqm} onChange={set('rentPerSqm')} type="number" placeholder="680000" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Phí CAM (₫/m²)</label>
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
                {new Intl.NumberFormat('vi-VN').format(Number(form.area) * Number(form.rentPerSqm))} ₫
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
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Phí tiện ích/tháng (₫)</label>
                  <Input type="number" value={form.utilityFee} onChange={set('utilityFee')} placeholder="0" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Phí ngoài giờ/giờ (₫)</label>
                  <Input type="number" value={form.afterHoursFee} onChange={set('afterHoursFee')} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Thanh toán (ngày)</label>
                  <Input type="number" value={form.paymentTermDays} onChange={set('paymentTermDays')} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Cọc thuê (₫) — 0=tự tính</label>
                  <Input type="number" value={form.depositLease} onChange={set('depositLease')} placeholder="0" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Cọc thi công (₫)</label>
                  <Input type="number" value={form.depositFitout} onChange={set('depositFitout')} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Phí thi công (₫)</label>
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

// ─── CreateUnitBookingDialog ──────────────────────────────────────────────────

function CreateUnitBookingDialog({ open, onClose, mallId }: {
  open: boolean; onClose: () => void; mallId?: string | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    unitSearch: '', unitId: '', unitLabel: '',
    leadSearch: '', leadId: '',
    requestedArea: '', requestedTerm: '', expectedRent: '', holdDays: '30', notes: '',
  });
  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const { data: unitData } = useQuery({
    queryKey: ['units-vacant', mallId, form.unitSearch],
    queryFn: () => spacesApi.listUnits({ mallId: mallId ?? undefined, status: 'VACANT', search: form.unitSearch || undefined, limit: 20 }),
    enabled: open,
  });
  const vacantUnits: any[] = Array.isArray(unitData) ? unitData : (unitData?.data ?? []);

  const { data: leadData } = useQuery({
    queryKey: ['leads-search', form.leadSearch],
    queryFn: () => crmApi.listLeads({ search: form.leadSearch || undefined, limit: 20 }),
    enabled: open && form.leadSearch.length > 1,
  });
  const leads: any[] = Array.isArray(leadData) ? leadData : (leadData?.data ?? []);

  const mutation = useMutation({
    mutationFn: () => bookingApi.create({
      unitId: form.unitId,
      leadId: form.leadId || undefined,
      requestedArea: form.requestedArea ? Number(form.requestedArea) : undefined,
      requestedTerm: form.requestedTerm ? Number(form.requestedTerm) : undefined,
      expectedRent: form.expectedRent ? Number(form.expectedRent) : undefined,
      holdDays: Number(form.holdDays) || 30,
      notes: form.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking-stats'] });
      toast({ title: 'Đã tạo booking lô thuê' });
      onClose();
      setForm({ unitSearch: '', unitId: '', unitLabel: '', leadSearch: '', leadId: '', requestedArea: '', requestedTerm: '', expectedRent: '', holdDays: '30', notes: '' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi tạo booking', variant: 'destructive' }),
  });

  const canSubmit = !!form.unitId && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus size={18} className="text-amber-600" /> Tạo Booking Giữ Lô
          </DialogTitle>
          <p className="text-sm text-gray-500">Đặt giữ mặt bằng dài hạn cho khách hàng. Nếu lô đang có booking active, booking mới sẽ được xếp vào hàng chờ.</p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Unit picker */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Mặt bằng (Unit) *</label>
            {form.unitId ? (
              <div className="flex items-center gap-2 p-2 border rounded-lg bg-amber-50 border-amber-200">
                <Building2 size={14} className="text-amber-600" />
                <span className="text-sm font-medium flex-1">{form.unitLabel}</span>
                <button onClick={() => setForm((f) => ({ ...f, unitId: '', unitLabel: '' }))}
                  className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
              </div>
            ) : (
              <div>
                <Input value={form.unitSearch} onChange={setField('unitSearch')}
                  placeholder="Tìm mã lô (A1-01, B2-05...)" className="mb-1" />
                {vacantUnits.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-40 overflow-y-auto text-sm">
                    {vacantUnits.map((u: any) => (
                      <button key={u.id} className="w-full text-left px-3 py-2 hover:bg-amber-50 flex items-center gap-3"
                        onClick={() => setForm((f) => ({ ...f, unitId: u.id, unitLabel: `${u.code}${u.name ? ' — ' + u.name : ''} (${u.areaGFA?.toLocaleString('vi-VN')}m²)`, unitSearch: '' }))}>
                        <Building2 size={13} className="text-amber-500 shrink-0" />
                        <span className="font-medium">{u.code}</span>
                        <span className="text-gray-400">{u.name}</span>
                        <span className="ml-auto text-xs text-gray-400">{u.floor?.name} · {u.areaGFA?.toLocaleString('vi-VN')}m²</span>
                      </button>
                    ))}
                  </div>
                )}
                {form.unitSearch && vacantUnits.length === 0 && (
                  <p className="text-xs text-gray-400 px-1 mt-1">Không tìm thấy lô VACANT phù hợp</p>
                )}
              </div>
            )}
          </div>

          {/* Lead picker */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Lead / Khách hàng</label>
            {form.leadId ? (
              <div className="flex items-center gap-2 p-2 border rounded-lg bg-blue-50 border-blue-200">
                <User size={14} className="text-blue-600" />
                <span className="text-sm flex-1">{form.leadSearch}</span>
                <button onClick={() => setForm((f) => ({ ...f, leadId: '', leadSearch: '' }))}
                  className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
              </div>
            ) : (
              <div>
                <Input value={form.leadSearch} onChange={setField('leadSearch')}
                  placeholder="Nhập tên thương hiệu để tìm lead..." className="mb-1" />
                {leads.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-36 overflow-y-auto text-sm">
                    {leads.map((l: any) => (
                      <button key={l.id} className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-3"
                        onClick={() => setForm((f) => ({ ...f, leadId: l.id, leadSearch: `${l.brandName} — ${l.contactName}` }))}>
                        <User size={12} className="text-blue-400 shrink-0" />
                        <span className="font-medium">{l.brandName}</span>
                        <span className="text-gray-400 text-xs">{l.contactName}</span>
                        <span className="ml-auto text-xs text-gray-400">{l.status}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Diện tích (m²)</label>
              <Input type="number" value={form.requestedArea} onChange={setField('requestedArea')} placeholder="120" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Thời hạn (tháng)</label>
              <Input type="number" value={form.requestedTerm} onChange={setField('requestedTerm')} placeholder="36" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Giữ (ngày)</label>
              <Input type="number" value={form.holdDays} onChange={setField('holdDays')} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Giá kỳ vọng (₫/m²)</label>
            <Input type="number" value={form.expectedRent} onChange={setField('expectedRent')} placeholder="680000" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú</label>
            <Textarea value={form.notes} onChange={setField('notes')} rows={2} placeholder="Ghi chú nội bộ..." />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button disabled={!canSubmit} onClick={() => mutation.mutate()}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
            <BookmarkPlus size={14} />
            {mutation.isPending ? 'Đang tạo...' : 'Tạo Booking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ExtendDialog ─────────────────────────────────────────────────────────────

function ExtendDialog({ bookingId, open, onClose }: { bookingId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [days, setDays] = useState('15');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => bookingApi.extend(bookingId, Number(days), reason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      toast({ title: `Đã gia hạn thêm ${days} ngày` });
      onClose();
    },
    onError: () => toast({ title: 'Lỗi gia hạn', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Gia hạn booking</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-sm font-medium mb-1 block">Số ngày gia hạn thêm</label>
            <Input value={days} onChange={(e) => setDays(e.target.value)} type="number" min={1} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Lý do (tuỳ chọn)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Khách chờ phê duyệt nội bộ..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Đang gia hạn...' : 'Gia hạn'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── UnitBooking Detail Sheet ──────────────────────────────────────────────────

function BookingDetailSheet({ booking, onClose }: { booking: UnitBooking | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [convertOpen, setConvertOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ['booking-detail', booking?.id],
    queryFn: () => bookingApi.get(booking!.id),
    enabled: !!booking?.id,
  });

  const cancelMutation = useMutation({
    mutationFn: () => bookingApi.cancel(booking!.id, 'Hủy từ trang Booking'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking-stats'] });
      toast({ title: 'Đã hủy booking' });
      onClose();
    },
    onError: () => toast({ title: 'Lỗi hủy booking', variant: 'destructive' }),
  });

  const d: UnitBooking = detail?.data ?? detail ?? booking;
  if (!d) return null;

  const cfg = UNIT_STATUS_CONFIG[d.status];
  const dl = daysLeft(d.expiresAt);
  const clientName = d.lead?.brandName ?? d.customer?.companyName ?? '—';
  const contactName = d.lead?.contactName ?? d.customer?.brandName ?? '';
  const activities: any[] = (detail?.data ?? detail)?.activities ?? (detail as any)?.activities ?? [];

  return (
    <Sheet open={!!booking} onClose={onClose} title={d.bookingNumber} subtitle={`${d.unit?.code ?? ''} · ${clientName}`}>
      <div className="px-6 pb-8 space-y-4 pt-4">
        {/* Type badge */}
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
        </div>

        <SheetSection label="KHÁCH HÀNG" className="bg-gray-50">
          <SheetRow label="Tên"     value={clientName}   icon={User} />
          {contactName && <SheetRow label="Liên hệ" value={contactName} icon={User} />}
          <SheetRow label="Nguồn"   value={d.leadId ? 'Lead (CRM)' : 'Customer profile'} icon={User} />
        </SheetSection>

        <SheetSection label="MẶT BẰNG" className="bg-gray-50">
          <SheetRow label="Mã"         value={d.unit?.code ?? '—'} icon={Building2} />
          <SheetRow label="Diện tích"  value={d.unit?.areaNLA ? `${d.unit.areaNLA.toLocaleString()} m² NLA` : '—'} icon={Building2} />
          <SheetRow label="Tầng"       value={(d.unit as any)?.floor?.name ?? '—'} icon={Building2} />
          {d.unit?.baseRentPerSqm ? (
            <SheetRow label="Giá cơ bản" value={`${new Intl.NumberFormat('vi-VN').format(d.unit.baseRentPerSqm)} ₫/m²`} icon={DollarSign} />
          ) : null}
        </SheetSection>

        <SheetSection label="YÊU CẦU KHÁCH" className="bg-amber-50">
          <SheetRow label="DT mong muốn" value={d.requestedArea ? `${d.requestedArea.toLocaleString()} m²` : '—'} icon={Building2} />
          <SheetRow label="Thời hạn"     value={d.requestedTerm ? `${d.requestedTerm} tháng` : '—'} icon={Calendar} />
          <SheetRow label="Giá kỳ vọng"  value={d.expectedRent ? `${new Intl.NumberFormat('vi-VN').format(d.expectedRent)} ₫/m²` : '—'} icon={DollarSign} />
        </SheetSection>

        <SheetSection label="THỜI GIAN" className="bg-gray-50">
          <SheetRow label="Tạo lúc"   value={fmtDate(d.createdAt)}   icon={Calendar} />
          <SheetRow label="Kích hoạt" value={fmtDate(d.activatedAt)} icon={Calendar} />
          <SheetRow label="Hết hạn"   value={fmtDate(d.expiresAt)}   icon={Calendar} />
          {d.convertedAt && <SheetRow label="Convert" value={fmtDate(d.convertedAt)} icon={Calendar} />}
        </SheetSection>

        {d.assignedTo && (
          <SheetSection label="PHỤ TRÁCH" className="bg-gray-50">
            <SheetRow label="Sale" value={d.assignedTo.fullName} icon={User} />
          </SheetSection>
        )}
        {d.notes && (
          <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-100 rounded-xl p-3">{d.notes}</div>
        )}

        {d.proposal && (
          <div className="flex items-center justify-between p-3 bg-green-50 border border-green-100 rounded-xl">
            <div className="flex items-center gap-2 text-sm">
              <FileText size={14} className="text-green-600" />
              <span className="font-medium">{d.proposal.proposalNumber}</span>
            </div>
            <Badge className="bg-green-100 text-green-700 border-0 text-xs">{d.proposal.status}</Badge>
          </div>
        )}

        {['ACTIVE', 'PENDING'].includes(d.status) && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            {d.status === 'ACTIVE' && !d.proposal && (
              <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setConvertOpen(true)}>
                <ArrowRight size={15} /> Lập Đề xuất (Proposal)
              </Button>
            )}
            <div className="flex gap-2">
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
                    <span className="font-medium">{ACTIVITY_LABELS[a.type] ?? a.type}</span>
                    {' — '}<span className="text-gray-500">{a.note}</span>
                    <div className="text-gray-400">{new Date(a.createdAt).toLocaleString('vi-VN')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConvertToProposalDialog booking={d} open={convertOpen} onClose={() => setConvertOpen(false)} />
      <ExtendDialog bookingId={d.id} open={extendOpen} onClose={() => setExtendOpen(false)} />
    </Sheet>
  );
}

// ─── SlotBooking Detail Sheet ──────────────────────────────────────────────────

function SlotBookingDetailSheet({ booking, onClose }: { booking: any | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const confirmMutation = useMutation({
    mutationFn: () => slotsApi.confirmBooking(booking.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slot-bookings'] });
      toast({ title: 'Đã xác nhận booking slot' });
      onClose();
    },
    onError: () => toast({ title: 'Lỗi xác nhận', variant: 'destructive' }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => slotsApi.cancelBooking(booking.id, 'Hủy từ trang Booking'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slot-bookings'] });
      toast({ title: 'Đã hủy booking slot' });
      onClose();
    },
    onError: () => toast({ title: 'Lỗi hủy', variant: 'destructive' }),
  });

  if (!booking) return null;

  const typeCfg = SLOT_TYPE_CONFIG[booking.type] ?? SLOT_TYPE_CONFIG.DAILY;
  const statusCfg = SLOT_STATUS_CONFIG[booking.status];
  const clientName = booking.customer?.companyName ?? booking.lead?.brandName ?? '—';

  return (
    <Sheet open={!!booking} onClose={onClose}
      title={booking.bookingRef}
      subtitle={`${booking.slot?.unit?.code ?? ''} · ${booking.slot?.code ?? ''} · ${clientName}`}
    >
      <div className="px-6 pb-8 space-y-4 pt-4">
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

        <SheetSection label="KHÁCH HÀNG" className="bg-gray-50">
          <SheetRow label="Tên"   value={clientName} icon={User} />
          <SheetRow label="Nguồn" value={booking.customerId ? 'Customer profile' : 'Lead (CRM)'} icon={User} />
        </SheetSection>

        <SheetSection label="VỊ TRÍ SLOT" className="bg-violet-50">
          <SheetRow label="Lô (Unit)"  value={booking.slot?.unit?.code ?? '—'} icon={Building2} />
          <SheetRow label="Slot"       value={`${booking.slot?.code ?? '—'} — ${booking.slot?.name ?? ''}`} icon={Building2} />
          <SheetRow label="Diện tích"  value={booking.slot?.area ? `${booking.slot.area} m²` : '—'} icon={Building2} />
        </SheetSection>

        <SheetSection label="THỜI GIAN ĐẶT" className="bg-violet-50">
          <SheetRow label="Bắt đầu"  value={fmtDatetime(booking.startDatetime)} icon={Calendar} />
          <SheetRow label="Kết thúc" value={fmtDatetime(booking.endDatetime)}   icon={Calendar} />
        </SheetSection>

        <SheetSection label="GIÁ TIỀN" className="bg-gray-50">
          <SheetRow label="Giá gốc"     value={fmtMoney(booking.baseAmount)}   icon={DollarSign} />
          {booking.discountPct > 0 && (
            <SheetRow label="Chiết khấu" value={`${booking.discountPct}%`} icon={DollarSign} />
          )}
          <SheetRow label="Thành tiền"  value={fmtMoney(booking.totalAmount)}  icon={DollarSign} />
        </SheetSection>

        {booking.notes && (
          <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-100 rounded-xl p-3">{booking.notes}</div>
        )}

        {['PENDING'].includes(booking.status) && (
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <Button className="flex-1 gap-2 bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
              <CheckCircle2 size={14} /> Xác nhận
            </Button>
            <Button variant="outline" className="flex-1 gap-2 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              <X size={14} /> Hủy
            </Button>
          </div>
        )}
        {booking.status === 'CONFIRMED' && (
          <Button variant="outline" className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
            <X size={14} /> Hủy booking
          </Button>
        )}
      </div>
    </Sheet>
  );
}

// ─── Create Slot Booking Dialog ───────────────────────────────────────────────

type CreateSlotForm = {
  unitId: string;
  slotId: string;
  clientType: 'lead' | 'customer';
  clientId: string;
  type: string;
  startDatetime: string;
  endDatetime: string;
  discountPct: string;
  notes: string;
};

const EMPTY_FORM: CreateSlotForm = {
  unitId: '', slotId: '', clientType: 'lead', clientId: '',
  type: 'DAILY', startDatetime: '', endDatetime: '', discountPct: '0', notes: '',
};

function CreateSlotBookingDialog({ open, onClose, mallId }: {
  open: boolean; onClose: () => void; mallId?: string | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<CreateSlotForm>(EMPTY_FORM);
  const [pricePreview, setPricePreview] = useState<{ baseAmount: number; discountPct: number; totalAmount: number } | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) { setForm(EMPTY_FORM); setPricePreview(null); }
  }, [open]);

  // Reset slot when unit changes
  const setField = (k: keyof CreateSlotForm) => (val: string) =>
    setForm((p) => ({ ...p, [k]: val, ...(k === 'unitId' ? { slotId: '' } : {}), ...(k === 'clientType' ? { clientId: '' } : {}) }));

  // ── Data queries ──
  const { data: unitsData } = useQuery({
    queryKey: ['units-for-slot', mallId],
    queryFn: () => spacesApi.listUnits({ mallId: mallId ?? undefined, limit: 200 }),
    enabled: open,
  });
  const units: any[] = unitsData?.data ?? unitsData ?? [];

  const { data: slotsData } = useQuery({
    queryKey: ['slots-for-unit', form.unitId],
    queryFn: () => slotsApi.listSlots(form.unitId),
    enabled: open && !!form.unitId,
  });
  const slots: any[] = Array.isArray(slotsData) ? slotsData : (slotsData?.data ?? []);

  const { data: leadsData } = useQuery({
    queryKey: ['leads-for-booking'],
    queryFn: () => crmApi.listLeads({ limit: 100 }),
    enabled: open && form.clientType === 'lead',
  });
  const leads: any[] = leadsData?.data ?? leadsData ?? [];

  const { data: customersData } = useQuery({
    queryKey: ['customers-for-booking'],
    queryFn: () => customersApi.listCustomers({ limit: 100 }),
    enabled: open && form.clientType === 'customer',
  });
  const customers: any[] = customersData?.data ?? customersData ?? [];

  // ── Price calculation ──
  const canCalc = !!(form.slotId && form.type && form.startDatetime && form.endDatetime);

  async function calcPrice() {
    if (!canCalc) return;
    setCalcLoading(true);
    try {
      const res = await slotsApi.calculatePrice(form.slotId, form.type, form.startDatetime, form.endDatetime);
      setPricePreview(res);
    } catch {
      toast({ title: 'Không tính được giá. Kiểm tra lại thời gian.', variant: 'destructive' });
    } finally { setCalcLoading(false); }
  }

  // Auto-calc when required fields change
  useEffect(() => {
    setPricePreview(null);
    if (canCalc) calcPrice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.slotId, form.type, form.startDatetime, form.endDatetime]);

  // ── Submit ──
  const mutation = useMutation({
    mutationFn: () => slotsApi.createBooking(form.slotId, {
      leadId: form.clientType === 'lead' ? form.clientId || undefined : undefined,
      customerId: form.clientType === 'customer' ? form.clientId || undefined : undefined,
      type: form.type,
      startDatetime: form.startDatetime,
      endDatetime: form.endDatetime,
      discountPct: Number(form.discountPct) || undefined,
      notes: form.notes || undefined,
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['slot-bookings'] });
      toast({ title: `Đã tạo booking ${data?.bookingRef ?? ''}`, description: 'Trạng thái: Chờ xác nhận' });
      onClose();
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? 'Lỗi tạo booking',
      variant: 'destructive',
    }),
  });

  const canSubmit = form.slotId && form.startDatetime && form.endDatetime && !mutation.isPending;

  const selectedSlot = slots.find((s) => s.id === form.slotId);
  const fmtM = (n?: number) => n != null ? new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫' : '—';

  // Price hints from slot
  const priceHints = selectedSlot ? [
    form.type === 'DAILY' && selectedSlot.pricePerDaySqm && `${fmtM(selectedSlot.pricePerDaySqm)}/m²/ngày`,
    form.type === 'HOURLY' && selectedSlot.pricePerHour && `${fmtM(selectedSlot.pricePerHour)}/giờ`,
    form.type === 'MONTHLY' && selectedSlot.pricePerSqmMonth && `${fmtM(selectedSlot.pricePerSqmMonth)}/m²/tháng`,
  ].filter(Boolean) : [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-violet-700">
            <Plus size={18} />
            Tạo Booking Slot Mới
          </DialogTitle>
          <p className="text-sm text-gray-500">Đặt slot/kiosk ngắn hạn theo ngày, giờ hoặc tháng</p>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* ── STEP 1: Lô + Slot ── */}
          <div className="space-y-3">
            <div className="text-xs font-bold tracking-wider text-violet-500 uppercase flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">1</span>
              Chọn vị trí
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Lô thuê (Unit) *</label>
              <div className="relative">
                <select
                  value={form.unitId}
                  onChange={(e) => setField('unitId')(e.target.value)}
                  className="w-full h-9 pl-3 pr-8 text-sm border border-gray-200 rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-violet-300"
                >
                  <option value="">— Chọn lô thuê —</option>
                  {units.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.code} {u.name !== u.code ? `— ${u.name}` : ''} {u.areaNLA ? `(${u.areaNLA} m²)` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Slot *</label>
              <div className="relative">
                <select
                  value={form.slotId}
                  onChange={(e) => setField('slotId')(e.target.value)}
                  disabled={!form.unitId || slots.length === 0}
                  className="w-full h-9 pl-3 pr-8 text-sm border border-gray-200 rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">— Chọn slot —</option>
                  {slots.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name} ({s.area} m²)
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              {form.unitId && slots.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Lô này chưa có slot nào. Vào trang Mặt bằng → Quản lý Slot để thêm.
                </p>
              )}
            </div>
          </div>

          {/* ── STEP 2: Khách hàng ── */}
          <div className="space-y-3">
            <div className="text-xs font-bold tracking-wider text-violet-500 uppercase flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">2</span>
              Khách hàng
            </div>

            <div className="flex gap-2">
              {(['lead', 'customer'] as const).map((t) => (
                <button key={t}
                  onClick={() => setField('clientType')(t)}
                  className={`flex-1 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                    form.clientType === t
                      ? 'border-violet-400 bg-violet-50 text-violet-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {t === 'lead' ? 'Lead (CRM)' : 'Customer profile'}
                </button>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                {form.clientType === 'lead' ? 'Chọn Lead' : 'Chọn Khách hàng'}
                <span className="text-gray-400 font-normal ml-1">(tuỳ chọn)</span>
              </label>
              <div className="relative">
                <select
                  value={form.clientId}
                  onChange={(e) => setField('clientId')(e.target.value)}
                  className="w-full h-9 pl-3 pr-8 text-sm border border-gray-200 rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-violet-300"
                >
                  <option value="">— Không chọn / Ẩn danh —</option>
                  {form.clientType === 'lead'
                    ? leads.map((l: any) => (
                        <option key={l.id} value={l.id}>
                          {l.brandName ?? l.companyName} {l.contactName ? `(${l.contactName})` : ''}
                        </option>
                      ))
                    : customers.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.companyName ?? c.brandName}
                        </option>
                      ))
                  }
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* ── STEP 3: Loại + Thời gian ── */}
          <div className="space-y-3">
            <div className="text-xs font-bold tracking-wider text-violet-500 uppercase flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">3</span>
              Thời gian đặt
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Loại đặt *</label>
              <div className="flex gap-2">
                {Object.entries(SLOT_TYPE_CONFIG).map(([k, v]) => {
                  const Icon = v.icon;
                  return (
                    <button key={k}
                      onClick={() => { setField('type')(k); setPricePreview(null); }}
                      className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                        form.type === k
                          ? `${v.color} border-current`
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <Icon size={15} /> {v.label}
                    </button>
                  );
                })}
              </div>
              {priceHints.length > 0 && (
                <p className="text-xs text-gray-400 mt-1.5">
                  Giá tham khảo: {priceHints.join(' · ')}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  {form.type === 'HOURLY' ? 'Giờ bắt đầu *' : 'Ngày bắt đầu *'}
                </label>
                <Input
                  type={form.type === 'HOURLY' ? 'datetime-local' : 'date'}
                  value={form.startDatetime}
                  onChange={(e) => setField('startDatetime')(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  {form.type === 'HOURLY' ? 'Giờ kết thúc *' : 'Ngày kết thúc *'}
                </label>
                <Input
                  type={form.type === 'HOURLY' ? 'datetime-local' : 'date'}
                  value={form.endDatetime}
                  onChange={(e) => setField('endDatetime')(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          {/* ── STEP 4: Giá & chi tiết ── */}
          <div className="space-y-3">
            <div className="text-xs font-bold tracking-wider text-violet-500 uppercase flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">4</span>
              Giá & ghi chú
            </div>

            {/* Price preview box */}
            {calcLoading && (
              <div className="flex items-center gap-2 py-3 px-4 bg-gray-50 rounded-lg border text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" /> Đang tính giá...
              </div>
            )}
            {!calcLoading && pricePreview && (
              <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Giá gốc</span>
                  <span>{fmtMoney(pricePreview.baseAmount)}</span>
                </div>
                {pricePreview.discountPct > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Chiết khấu tự động</span>
                    <span className="text-green-600">-{pricePreview.discountPct}%</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t border-violet-100 pt-1.5">
                  <span>Thành tiền dự kiến</span>
                  <span className="text-violet-700">{fmtMoney(pricePreview.totalAmount)}</span>
                </div>
              </div>
            )}
            {!calcLoading && !pricePreview && canCalc && (
              <div className="text-center py-2">
                <Button variant="outline" size="sm" onClick={calcPrice} className="text-violet-600 border-violet-200">
                  Tính giá
                </Button>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Chiết khấu bổ sung (%) <span className="text-gray-400 font-normal">— ghi đè giá tự động</span>
              </label>
              <Input
                type="number" min={0} max={100}
                value={form.discountPct}
                onChange={(e) => setField('discountPct')(e.target.value)}
                className="h-9 text-sm w-28"
                placeholder="0"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú</label>
              <Textarea
                value={form.notes}
                onChange={(e) => setField('notes')(e.target.value)}
                rows={2}
                placeholder="Pop-up cuối tuần, sự kiện ra mắt sản phẩm..."
              />
            </div>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {mutation.isPending ? 'Đang tạo...' : 'Tạo booking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const { selectedMallId } = useMallStore();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<'unit' | 'slot'>('unit');

  // ── UnitBooking state ──
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<UnitBooking | null>(null);
  const [page, setPage] = useState(1);

  const [createUnitOpen, setCreateUnitOpen] = useState(false);

  // ── SlotBooking state ──
  const [slotSearch, setSlotSearch] = useState('');
  const [slotStatusFilter, setSlotStatusFilter] = useState('');
  const [slotTypeFilter, setSlotTypeFilter] = useState('');
  const [selectedSlotBooking, setSelectedSlotBooking] = useState<any | null>(null);
  const [createSlotOpen, setCreateSlotOpen] = useState(false);

  // ── UnitBooking data ──
  const { data: stats } = useQuery({
    queryKey: ['booking-stats', selectedMallId],
    queryFn: () => bookingApi.stats(selectedMallId ?? undefined),
    refetchInterval: 60_000,
  });

  const { data, isLoading: unitLoading, refetch: refetchUnit } = useQuery({
    queryKey: ['bookings', selectedMallId, statusFilter, expiringSoon, search, page],
    queryFn: () => bookingApi.list({
      mallId: selectedMallId ?? undefined,
      status: statusFilter || undefined,
      expiringSoon: expiringSoon || undefined,
      search: search || undefined,
      page, limit: 25,
    }),
    refetchInterval: 60_000,
  });

  // ── SlotBooking data ──
  const { data: slotData, isLoading: slotLoading, refetch: refetchSlot } = useQuery({
    queryKey: ['slot-bookings', selectedMallId, slotStatusFilter, slotTypeFilter],
    queryFn: () => slotsApi.listAllBookings({
      mallId: selectedMallId ?? undefined,
      status: slotStatusFilter || undefined,
      type: slotTypeFilter || undefined,
    }),
    refetchInterval: 60_000,
  });

  const unitBookings: UnitBooking[] = data?.data ?? [];
  const unitTotal: number = data?.total ?? 0;
  const unitTotalPages: number = data?.totalPages ?? 1;
  const s = stats?.data ?? stats;

  const rawSlotBookings: any[] = Array.isArray(slotData) ? slotData : (slotData?.data ?? []);

  // Client-side filter by mallId (backend doesn't filter by mallId) and search
  const allSlotBookings = selectedMallId
    ? rawSlotBookings.filter((b) => b.slot?.unit?.mallId === selectedMallId)
    : rawSlotBookings;

  const slotBookings = slotSearch
    ? allSlotBookings.filter((b) => {
        const q = slotSearch.toLowerCase();
        return (
          b.bookingRef?.toLowerCase().includes(q) ||
          b.slot?.unit?.code?.toLowerCase().includes(q) ||
          b.slot?.code?.toLowerCase().includes(q) ||
          b.customer?.companyName?.toLowerCase().includes(q) ||
          b.lead?.brandName?.toLowerCase().includes(q)
        );
      })
    : allSlotBookings;

  const slotStats = {
    pending:   allSlotBookings.filter((b) => b.status === 'PENDING').length,
    confirmed: allSlotBookings.filter((b) => b.status === 'CONFIRMED').length,
    completed: allSlotBookings.filter((b) => b.status === 'COMPLETED').length,
    revenue:   allSlotBookings
      .filter((b) => ['CONFIRMED', 'COMPLETED'].includes(b.status))
      .reduce((sum, b) => sum + (b.totalAmount ?? 0), 0),
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Booking</h1>
          <p className="text-sm text-gray-500 mt-1">Theo dõi đặt chỗ lô thuê và slot sự kiện ngắn hạn</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2"
          onClick={() => typeFilter === 'unit' ? refetchUnit() : refetchSlot()}>
          <RefreshCw size={14} /> Làm mới
        </Button>
      </div>

      {/* ══════════ UNIT BOOKING ══════════ */}
      {typeFilter === 'unit' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="Đang active" value={s?.active ?? 0} icon={BookmarkCheck} color="yellow" sub="Đang giữ slot" />
            <StatCard title="Chờ trong queue" value={s?.pending ?? 0} icon={BookmarkPlus} color="blue" sub="Hàng đợi ưu tiên" />
            <StatCard title="Sắp hết hạn" value={s?.expiringSoon ?? 0} icon={AlertTriangle} color="red"
              badge={s?.expiringSoon > 0 ? 'Cần xử lý' : undefined} />
            <StatCard title="Đã convert" value={s?.converted ?? 0} icon={ArrowRight} color="green" sub="Thành Proposal" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'unit' | 'slot')}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unit"><span className="flex items-center gap-2"><BookmarkCheck size={13} className="text-amber-600" /> Giữ lô dài hạn</span></SelectItem>
                <SelectItem value="slot"><span className="flex items-center gap-2"><CalendarDays size={13} className="text-violet-600" /> Đặt slot ngắn hạn</span></SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Tìm unit, lead, khách hàng..." className="pl-9 h-9"
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1); }}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả</SelectItem>
                {Object.entries(UNIT_STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                expiringSoon ? 'border-red-300 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
              onClick={() => { setExpiringSoon(!expiringSoon); setPage(1); }}
            >
              <Clock size={13} /> Sắp hết hạn (7 ngày)
            </button>
            <Button className="gap-2 bg-amber-600 hover:bg-amber-700 text-white h-9 ml-auto"
              onClick={() => setCreateUnitOpen(true)}>
              <Plus size={14} /> Tạo booking lô
            </Button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {unitLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : unitBookings.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <BookmarkX size={40} className="mx-auto mb-3 opacity-40" />
                <p className="font-medium">Không có booking nào</p>
                <p className="text-sm mt-1">Tạo booking từ trang Mặt bằng hoặc CRM</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-amber-50/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Booking #</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Unit</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Khách hàng</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs tracking-wider">Ưu tiên</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Hết hạn</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Trạng thái</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Sale</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {unitBookings.map((b) => {
                    const cfg = UNIT_STATUS_CONFIG[b.status];
                    const dl = daysLeft(b.expiresAt);
                    const clientName = b.lead?.brandName ?? b.customer?.companyName ?? '—';
                    return (
                      <tr key={b.id} className="hover:bg-amber-50/30 cursor-pointer transition-colors"
                        onClick={() => setSelectedBooking(b)}>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.bookingNumber}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{b.unit?.code ?? '—'}</span>
                          {(b.unit as any)?.floor?.name && (
                            <span className="text-xs text-gray-400 ml-1.5">{(b.unit as any).floor.name}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{clientName}</div>
                          {b.lead?.contactName && <div className="text-xs text-gray-400">{b.lead.contactName}</div>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold ${
                            b.priority === 1 ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-600'
                          }`}>{b.priority}</span>
                        </td>
                        <td className="px-4 py-3">
                          {b.status === 'ACTIVE' && dl !== null ? (
                            <span className={`text-xs font-medium ${dl <= 7 ? 'text-red-500' : dl <= 14 ? 'text-amber-500' : 'text-gray-500'}`}>
                              {dl > 0 ? `${dl} ngày` : 'Hôm nay'}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">{fmtDate(b.expiresAt)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`border text-xs ${cfg?.color}`}>{cfg?.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{b.assignedTo?.fullName ?? '—'}</td>
                        <td className="px-3 py-3"><ChevronRight size={15} className="text-gray-300" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {unitTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>Tổng {unitTotal} bookings</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Trước</Button>
                  <span className="px-2 py-1">Trang {page} / {unitTotalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= unitTotalPages} onClick={() => setPage(p => p + 1)}>Sau</Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════ SLOT BOOKING ══════════ */}
      {typeFilter === 'slot' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="Chờ xác nhận" value={slotStats.pending} icon={Hourglass} color="blue" sub="Cần xử lý" />
            <StatCard title="Đã xác nhận"  value={slotStats.confirmed} icon={CheckCircle2} color="purple" sub="Đang hiệu lực" />
            <StatCard title="Hoàn thành"   value={slotStats.completed} icon={CalendarRange} color="green" sub="Đã kết thúc" />
            <StatCard title="Doanh thu slot" value={fmt(slotStats.revenue)} icon={DollarSign} color="teal"
              sub="Confirmed + Completed" badge={slotStats.revenue > 0 ? '₫' : undefined} />
          </div>

          {/* Filters + Create */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'unit' | 'slot')}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unit"><span className="flex items-center gap-2"><BookmarkCheck size={13} className="text-amber-600" /> Giữ lô dài hạn</span></SelectItem>
                <SelectItem value="slot"><span className="flex items-center gap-2"><CalendarDays size={13} className="text-violet-600" /> Đặt slot ngắn hạn</span></SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Tìm ref, unit, slot, khách hàng..." className="pl-9 h-9"
                value={slotSearch} onChange={(e) => setSlotSearch(e.target.value)} />
            </div>
            <Select value={slotStatusFilter} onValueChange={(v) => setSlotStatusFilter(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
                {Object.entries(SLOT_STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={slotTypeFilter} onValueChange={(v) => setSlotTypeFilter(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="Loại slot" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả loại</SelectItem>
                {Object.entries(SLOT_TYPE_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white h-9 ml-auto"
              onClick={() => setCreateSlotOpen(true)}
            >
              <Plus size={14} /> Tạo booking slot
            </Button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {slotLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : slotBookings.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <CalendarDays size={40} className="mx-auto mb-3 opacity-40" />
                <p className="font-medium">Không có đặt slot nào</p>
                <p className="text-sm mt-1">Tạo đặt slot từ trang Mặt bằng → chọn lô → Quản lý Slot</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-violet-50/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Ref #</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Loại</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Unit / Slot</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Khách hàng</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Thời gian</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Thành tiền</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Trạng thái</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {slotBookings.map((b: any) => {
                    const typeCfg = SLOT_TYPE_CONFIG[b.type] ?? SLOT_TYPE_CONFIG.DAILY;
                    const statusCfg = SLOT_STATUS_CONFIG[b.status];
                    const clientName = b.customer?.companyName ?? b.lead?.brandName ?? '—';
                    const TypeIcon = typeCfg.icon;
                    return (
                      <tr key={b.id} className="hover:bg-violet-50/30 cursor-pointer transition-colors"
                        onClick={() => setSelectedSlotBooking(b)}>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.bookingRef}</td>
                        <td className="px-4 py-3">
                          <Badge className={`${typeCfg.color} border-0 text-xs flex items-center gap-1 w-fit`}>
                            <TypeIcon size={11} /> {typeCfg.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{b.slot?.unit?.code ?? '—'}</div>
                          <div className="text-xs text-gray-400">{b.slot?.code} · {b.slot?.name}</div>
                        </td>
                        <td className="px-4 py-3 font-medium">{clientName}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          <div>{fmtDatetime(b.startDatetime)}</div>
                          <div className="text-gray-400">→ {fmtDatetime(b.endDatetime)}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800">
                          {fmtMoney(b.totalAmount)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`border text-xs ${statusCfg?.color}`}>{statusCfg?.label}</Badge>
                        </td>
                        <td className="px-3 py-3"><ChevronRight size={15} className="text-gray-300" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Detail sheets */}
      <BookingDetailSheet booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
      <SlotBookingDetailSheet booking={selectedSlotBooking} onClose={() => setSelectedSlotBooking(null)} />
      <CreateSlotBookingDialog open={createSlotOpen} onClose={() => setCreateSlotOpen(false)} mallId={selectedMallId} />
      <CreateUnitBookingDialog open={createUnitOpen} onClose={() => setCreateUnitOpen(false)} mallId={selectedMallId} />
    </div>
  );
}
