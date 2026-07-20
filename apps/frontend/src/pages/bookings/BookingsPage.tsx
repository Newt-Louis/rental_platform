import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Selecto from 'react-selecto';
import { useDragSelect, DRAG_SELECT_CLASS } from '@/hooks/useDragSelect';
import { BulkSelectionBar } from '@/components/BulkSelectionBar';
import { bookingApi, slotsApi, authApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/ui/page-header';
import { AsyncState } from '@/components/ui/async-state';
import {
  BookmarkCheck, Clock, BookmarkX, CalendarDays,
  Search, AlertTriangle, CheckSquare, Square, Trash2,
  RotateCcw, Plus, Pencil, Ban, Loader2,
} from 'lucide-react';
import type { UnitBooking } from '@/types';
import { UNIT_STATUS_CONFIG, SLOT_STATUS_CONFIG, SLOT_TYPE_CONFIG, daysLeft, fmtDate, fmtDatetime, fmtMoney } from './bookings-constants';
import { BookingDetailSheet } from './BookingDetailSheet';
import { SlotBookingDetailSheet } from './SlotBookingDetailSheet';
import { CreateBookingDialog } from './CreateBookingDialog';
import { CreateSlotBookingDialog } from './CreateSlotBookingDialog';

export default function BookingsPage() {
  const { selectedMallId } = useMallStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<'unit' | 'slot'>('unit');

  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => authApi.me(),
  });
  const isAdmin = currentUser?.role === 'ADMIN';

  // ── Bulk selection ──
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [confirmCancelIds, setConfirmCancelIds] = useState<string[] | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmReinstateId, setConfirmReinstateId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteSlotId, setConfirmDeleteSlotId] = useState<string | null>(null);
  const { gridRef, selectoRef, selectoProps, dialogOpen } = useDragSelect({
    onSelect: (ids) => setSelectedUnitIds(new Set(ids)),
    onClear: () => setSelectedUnitIds(new Set()),
    idAttribute: 'data-booking-id',
    selectFromInside: true,
  });

  const reinstateListMutation = useMutation({
    mutationFn: (id: string) => bookingApi.reinstate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking-stats'] });
      setConfirmReinstateId(null);
      toast({ title: 'Đã khôi phục booking' });
    },
    onError: (e: any) => {
      setConfirmReinstateId(null);
      toast({ title: e?.response?.data?.message ?? 'Lỗi khôi phục booking', variant: 'destructive' });
    },
  });

  const softDeleteMutation = useMutation({
    mutationFn: (id: string) => bookingApi.softDelete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking-stats'] });
      setConfirmDeleteId(null);
      toast({ title: 'Đã xóa booking' });
    },
    onError: (e: any) => {
      setConfirmDeleteId(null);
      toast({ title: e?.response?.data?.message ?? 'Lỗi xóa booking', variant: 'destructive' });
    },
  });

  const deleteSlotMutation = useMutation({
    mutationFn: (id: string) => slotsApi.deleteSlotBooking(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slot-bookings'] });
      setConfirmDeleteSlotId(null);
      toast({ title: 'Đã xóa slot booking' });
    },
    onError: (e: any) => {
      setConfirmDeleteSlotId(null);
      toast({ title: e?.response?.data?.message ?? 'Lỗi xóa slot booking', variant: 'destructive' });
    },
  });

  const bulkCancelMutation = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.allSettled(ids.map((id) => bookingApi.cancel(id, cancelReason.trim()))).then((results) => {
        const ok = results.filter((r) => r.status === 'fulfilled').length;
        const fail = results.length - ok;
        return { ok, fail };
      }),
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking-stats'] });
      setSelectedUnitIds(new Set());
      setConfirmCancelIds(null);
      setCancelReason('');
      if (fail > 0) {
        toast({ title: `Đã hủy ${ok} booking, ${fail} booking không thể hủy (sai trạng thái)`, variant: 'destructive' });
      } else {
        toast({ title: `Đã hủy ${ok} booking` });
      }
    },
    onError: () => toast({ title: 'Lỗi hủy booking', variant: 'destructive' }),
  });

  // ── UnitBooking state ──
  const UNIT_EMPTY = { search: '', status: '', expiringSoon: false, dateFrom: '', dateTo: '' };
  const [unitDraft, setUnitDraft] = useState(UNIT_EMPTY);
  const [unitApplied, setUnitApplied] = useState(UNIT_EMPTY);
  const [selectedBooking, setSelectedBooking] = useState<UnitBooking | null>(null);
  const [editDirectly, setEditDirectly] = useState(false);
  const [bookingSection, setBookingSection] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [createUnitOpen, setCreateUnitOpen] = useState(false);

  const setUnitField = <K extends keyof typeof UNIT_EMPTY>(k: K, v: typeof UNIT_EMPTY[K]) =>
    setUnitDraft((f) => ({ ...f, [k]: v }));
  const unitHasApplied = !!(unitApplied.search || unitApplied.status || unitApplied.expiringSoon || unitApplied.dateFrom || unitApplied.dateTo);
  const unitIsDirty = JSON.stringify(unitDraft) !== JSON.stringify(unitApplied);
  function applyUnit() { setUnitApplied({ ...unitDraft }); setPage(1); }
  function clearUnit() { setUnitDraft(UNIT_EMPTY); setUnitApplied(UNIT_EMPTY); setPage(1); }
  function filterUnit(status = '', expiringSoon = false) {
    const next = { ...UNIT_EMPTY, status, expiringSoon };
    setUnitDraft(next);
    setUnitApplied(next);
    setPage(1);
  }

  // ── SlotBooking state ──
  const SLOT_EMPTY = { search: '', status: '', type: '' };
  const [slotDraft, setSlotDraft] = useState(SLOT_EMPTY);
  const [slotApplied, setSlotApplied] = useState(SLOT_EMPTY);
  const [selectedSlotBooking, setSelectedSlotBooking] = useState<any | null>(null);
  const [slotSection, setSlotSection] = useState<string | undefined>();
  const [editSlotDirectly, setEditSlotDirectly] = useState(false);
  const [createSlotOpen, setCreateSlotOpen] = useState(false);

  const setSlotField = <K extends keyof typeof SLOT_EMPTY>(k: K, v: typeof SLOT_EMPTY[K]) =>
    setSlotDraft((f) => ({ ...f, [k]: v }));
  const slotHasApplied = !!(slotApplied.search || slotApplied.status || slotApplied.type);
  const slotIsDirty = JSON.stringify(slotDraft) !== JSON.stringify(slotApplied);
  function applySlot() { setSlotApplied({ ...slotDraft }); }
  function clearSlot() { setSlotDraft(SLOT_EMPTY); setSlotApplied(SLOT_EMPTY); }
  function filterSlot(status = '') {
    const next = { ...SLOT_EMPTY, status };
    setSlotDraft(next);
    setSlotApplied(next);
  }

  useEffect(() => setSelectedUnitIds(new Set()), [unitApplied, page]);

  // ── UnitBooking data ──
  const { data: stats, isError: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['booking-stats', selectedMallId],
    queryFn: () => bookingApi.stats(selectedMallId ?? undefined),
    refetchInterval: 60_000,
  });

  const { data, isLoading: unitLoading, isError: unitError, refetch: refetchUnit } = useQuery({
    queryKey: ['bookings', selectedMallId, unitApplied, page],
    queryFn: () => bookingApi.list({
      mallId: selectedMallId ?? undefined,
      status: unitApplied.status || undefined,
      expiringSoon: unitApplied.expiringSoon || undefined,
      search: unitApplied.search || undefined,
      createdFrom: unitApplied.dateFrom || undefined,
      createdTo: unitApplied.dateTo || undefined,
      page, limit: 15,
    }),
    refetchInterval: 60_000,
  });

  // ── SlotBooking data ──
  const { data: slotData, isLoading: slotLoading, isError: slotError, refetch: refetchSlot } = useQuery({
    queryKey: ['slot-bookings', selectedMallId, slotApplied.status, slotApplied.type],
    queryFn: () => slotsApi.listAllBookings({
      mallId: selectedMallId ?? undefined,
      status: slotApplied.status || undefined,
      type: slotApplied.type || undefined,
    }),
    refetchInterval: 60_000,
  });

  const unitBookings: UnitBooking[] = data?.data ?? [];
  const unitTotal: number = data?.total ?? 0;
  const unitTotalPages: number = data?.totalPages ?? 1;

  const rawSlotBookings: any[] = Array.isArray(slotData) ? slotData : (slotData?.data ?? []);
  const allSlotBookings = selectedMallId
    ? rawSlotBookings.filter((b) => b.slot?.unit?.mallId === selectedMallId)
    : rawSlotBookings;
  const slotStats = {
    pending: allSlotBookings.filter((b) => b.status === 'PENDING').length,
    confirmed: allSlotBookings.filter((b) => b.status === 'CONFIRMED').length,
    completed: allSlotBookings.filter((b) => b.status === 'COMPLETED').length,
    revenue: allSlotBookings.filter((b) => b.status === 'COMPLETED').reduce((sum, b) => sum + (b.totalAmount ?? 0), 0),
  };

  const slotBookings = slotApplied.search
    ? allSlotBookings.filter((b) => {
        const q = slotApplied.search.toLowerCase();
        return (
          b.bookingRef?.toLowerCase().includes(q) ||
          b.slot?.unit?.code?.toLowerCase().includes(q) ||
          b.slot?.code?.toLowerCase().includes(q) ||
          b.customer?.companyName?.toLowerCase().includes(q) ||
          b.lead?.brandName?.toLowerCase().includes(q)
        );
      })
    : allSlotBookings;

  return (
    <div>
      {/* Bulk Selection Bar */}
      <BulkSelectionBar
        selectedCount={selectedUnitIds.size}
        totalCount={unitBookings.length}
        onSelectAll={() => setSelectedUnitIds(new Set(unitBookings.map((b) => b.id)))}
        onClear={() => setSelectedUnitIds(new Set())}
      >
        <Button
          size="sm" variant="ghost"
          className="text-red-400 gap-1.5 shrink-0"
          disabled={bulkCancelMutation.isPending}
          onClick={() => {
            const cancellable = unitBookings
              .filter((b) => ['ACTIVE', 'PENDING'].includes(b.status) && selectedUnitIds.has(b.id))
              .map((b) => b.id);
            if (cancellable.length === 0) {
              toast({ title: 'Không có booking nào có thể hủy', description: 'Chỉ booking đang giữ hoặc chờ duyệt mới được hủy.', variant: 'destructive' });
              return;
            }
            setConfirmCancelIds(cancellable);
          }}
        >
          <Trash2 size={14} /> Hủy booking
        </Button>
      </BulkSelectionBar>

      <PageHeader
        className="mb-5"
        eyebrow="Không gian làm việc"
        title="Quản lý đặt chỗ"
        description="Theo dõi giữ chỗ mặt bằng dài hạn và lịch đặt không gian ngắn hạn."
        actions={
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'unit' | 'slot')}>
            <SelectTrigger className="h-9 w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unit"><span className="flex items-center gap-2"><BookmarkCheck size={13} className="text-amber-600" /> Giữ mặt bằng dài hạn</span></SelectItem>
              <SelectItem value="slot"><span className="flex items-center gap-2"><CalendarDays size={13} className="text-violet-600" /> Đặt không gian ngắn hạn</span></SelectItem>
            </SelectContent>
          </Select>
        }
      />
      {/* ══════════ UNIT BOOKING ══════════ */}
      {typeFilter === 'unit' && (
        <>
          {statsError && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <span>Không thể tải thống kê booking.</span>
              <Button variant="outline" size="sm" onClick={() => refetchStats()}>Thử lại</Button>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4" aria-label="Thống kê booking mặt bằng">
            {[
              { label: 'Tất cả', value: stats?.total ?? 0, status: '', urgent: false },
              { label: 'Đang giữ', value: stats?.active ?? 0, status: 'ACTIVE', urgent: false },
              { label: 'Chờ duyệt', value: stats?.pending ?? 0, status: 'PENDING', urgent: false },
              { label: 'Sắp hết hạn', value: stats?.expiringSoon ?? 0, status: '', urgent: true, expiring: true },
              { label: 'Đã lập đề xuất', value: stats?.converted ?? 0, status: 'CONVERTED', urgent: false },
            ].map((item) => (
              <button key={item.label} type="button" onClick={() => filterUnit(item.status, !!item.expiring)}
                className={`rounded-xl border bg-white p-3 text-left transition-colors hover:border-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${item.urgent && item.value > 0 ? 'border-red-200' : 'border-gray-200'}`}>
                <div className="text-xs text-gray-500">{item.label}</div>
                <div className={`mt-1 text-xl font-bold ${item.urgent && item.value > 0 ? 'text-red-600' : 'text-gray-900'}`}>{item.value}</div>
              </button>
            ))}
          </div>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Tìm unit, lead, khách hàng..." className="pl-9 h-9"
                value={unitDraft.search}
                onChange={(e) => setUnitField('search', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyUnit()}
              />
            </div>
            <Select value={unitDraft.status || 'ALL'} onValueChange={(v) => setUnitField('status', v === 'ALL' ? '' : v)}>
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
                unitDraft.expiringSoon ? 'border-red-300 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
              onClick={() => setUnitField('expiringSoon', !unitDraft.expiringSoon)}
            >
              <Clock size={13} /> Sắp hết hạn (7 ngày)
            </button>
            <DateRangePicker
              from={unitDraft.dateFrom}
              to={unitDraft.dateTo}
              onFromChange={(v) => setUnitField('dateFrom', v)}
              onToChange={(v) => setUnitField('dateTo', v)}
              placeholder="Khoảng ngày tạo"
            />
            <Button className="h-9 gap-1.5" onClick={applyUnit} disabled={!unitIsDirty && unitHasApplied}>
              <Search size={14} /> Tìm kiếm
            </Button>
            {(unitHasApplied || unitIsDirty) && (
              <Button variant="outline" size="sm" className="h-9 gap-1 text-gray-500" onClick={clearUnit}>
                <span>✕</span> Xóa
              </Button>
            )}
            <Button className="gap-2 bg-amber-600 hover:bg-amber-700 text-white h-9 ml-auto"
              onClick={() => setCreateUnitOpen(true)}>
              <Plus size={14} /> Tạo booking lô
            </Button>
          </div>

          {/* Table */}
          {!selectedBooking && !dialogOpen && <Selecto ref={selectoRef} container={gridRef.current} {...selectoProps} />}
          <div ref={gridRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden select-none">
            {unitError ? (
              <AsyncState isLoading={false} isError onRetry={refetchUnit} errorTitle="Không thể tải danh sách giữ chỗ"><div /></AsyncState>
            ) : unitLoading ? (
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
                    <th className="px-3 py-3 w-8">
                      <div
                        className="cursor-pointer"
                        onClick={() => {
                          if (selectedUnitIds.size === unitBookings.length) {
                            setSelectedUnitIds(new Set());
                          } else {
                            setSelectedUnitIds(new Set(unitBookings.map((b) => b.id)));
                          }
                        }}
                      >
                        {selectedUnitIds.size === unitBookings.length && unitBookings.length > 0
                          ? <CheckSquare size={15} className="text-blue-600" />
                          : <Square size={15} className="text-gray-300" />}
                      </div>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Booking #</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Unit</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Khách hàng</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs tracking-wider">Ưu tiên</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Hết hạn</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Trạng thái</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Ngày tạo</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Cập nhật</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Sale</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {unitBookings.map((b) => {
                    const cfg = UNIT_STATUS_CONFIG[b.status];
                    const dl = daysLeft(b.expiresAt);
                    const clientName = b.lead?.brandName ?? b.customer?.companyName ?? '—';
                    const openBooking = (section?: string) => { setBookingSection(section); setSelectedBooking(b); };
                    return (
                      <tr key={b.id}
                        className={`${DRAG_SELECT_CLASS} hover:bg-amber-50/30 transition-colors ${selectedUnitIds.has(b.id) ? 'bg-blue-50' : ''}`}
                        data-booking-id={b.id}>
                        <td className="px-3 py-3 w-8" data-checkbox>
                          <div
                            data-checkbox
                            className="cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); setSelectedUnitIds((prev) => { const next = new Set(prev); next.has(b.id) ? next.delete(b.id) : next.add(b.id); return next; }); }}
                          >
                            {selectedUnitIds.has(b.id)
                              ? <CheckSquare size={15} className="text-blue-600" />
                              : <Square size={15} className="text-gray-300 hover:text-gray-500" />}
                          </div>
                        </td>
                        <td data-section="" className="px-4 py-3 font-mono text-xs text-gray-600 cursor-pointer" onClick={() => openBooking(undefined)}>{b.bookingNumber}</td>
                        <td data-section="bs-unit" className="px-4 py-3">
                          <span className="font-medium">{b.unit?.code ?? '—'}</span>
                          {(b.unit as any)?.floor?.name && (
                            <span className="text-xs text-gray-400 ml-1.5">{(b.unit as any).floor.name}</span>
                          )}
                        </td>
                        <td data-section="bs-customer" className="px-4 py-3">
                          <div className="font-medium">{clientName}</div>
                          {b.lead?.contactName && <div className="text-xs text-gray-400">{b.lead.contactName}</div>}
                        </td>
                        <td data-section="" className="px-3 py-3 text-center">
                          <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold ${
                            b.priority === 1 ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-600'
                          }`}>{b.priority}</span>
                        </td>
                        <td data-section="bs-timeline" className="px-4 py-3">
                          {b.status === 'ACTIVE' && dl !== null ? (
                            <span className={`text-xs font-medium ${dl <= 7 ? 'text-red-500' : dl <= 14 ? 'text-amber-500' : 'text-gray-500'}`}>
                              {dl > 0 ? `${dl} ngày` : 'Hôm nay'}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">{fmtDate(b.expiresAt)}</span>
                          )}
                        </td>
                        <td data-section="" className="px-4 py-3">
                          <Badge className={`border text-xs ${cfg?.color}`}>{cfg?.label}</Badge>
                        </td>
                        <td data-section="bs-timeline" className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                        <td data-section="bs-timeline" className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(b.updatedAt)}</td>
                        <td data-section="bs-assignee" className="px-4 py-3 text-xs text-gray-500">{b.assignedTo?.fullName ?? '—'}</td>
                        <td data-section="" className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {['ACTIVE', 'PENDING'].includes(b.status) && (
                              <>
                                <button
                                  className="p-1 rounded text-amber-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                  title="Chỉnh sửa booking"
                                  onClick={(e) => { e.stopPropagation(); setSelectedBooking(b); setEditDirectly(true); }}
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Hủy booking"
                                  onClick={(e) => { e.stopPropagation(); setConfirmCancelIds([b.id]); }}
                                >
                                  <Ban size={13} />
                                </button>
                              </>
                            )}
                            {b.status === 'CANCELLED' && (
                              <button
                                className="p-1 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Khôi phục booking"
                                onClick={(e) => { e.stopPropagation(); setConfirmReinstateId(b.id); }}
                              >
                                <RotateCcw size={13} />
                              </button>
                            )}
                            {(isAdmin || ['CANCELLED', 'EXPIRED'].includes(b.status)) && (
                              <button
                                className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title={isAdmin ? 'Xóa booking (Admin)' : 'Xóa booking'}
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(b.id); }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" aria-label="Thống kê booking ngắn hạn">
            {[
              { label: 'Chờ xác nhận', value: slotStats.pending, status: 'PENDING' },
              { label: 'Đã xác nhận', value: slotStats.confirmed, status: 'CONFIRMED' },
              { label: 'Hoàn thành', value: slotStats.completed, status: 'COMPLETED' },
              { label: 'Doanh thu', value: fmtMoney(slotStats.revenue), status: '' },
            ].map((item) => (
              <button key={item.label} type="button" onClick={() => filterSlot(item.status)}
                className="rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
                <div className="text-xs text-gray-500">{item.label}</div>
                <div className="mt-1 text-xl font-bold text-gray-900">{item.value}</div>
              </button>
            ))}
          </div>
          {/* Filters + Create */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Tìm ref, unit, slot, khách hàng..." className="pl-9 h-9"
                value={slotDraft.search}
                onChange={(e) => setSlotField('search', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySlot()}
              />
            </div>
            <Select value={slotDraft.status || 'ALL'} onValueChange={(v) => setSlotField('status', v === 'ALL' ? '' : v)}>
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
            <Select value={slotDraft.type || 'ALL'} onValueChange={(v) => setSlotField('type', v === 'ALL' ? '' : v)}>
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
            <Button className="h-9 gap-1.5" onClick={applySlot} disabled={!slotIsDirty && slotHasApplied}>
              <Search size={14} /> Tìm kiếm
            </Button>
            {(slotHasApplied || slotIsDirty) && (
              <Button variant="outline" size="sm" className="h-9 gap-1 text-gray-500" onClick={clearSlot}>
                <span>✕</span> Xóa
              </Button>
            )}
            <Button
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white h-9 ml-auto"
              onClick={() => setCreateSlotOpen(true)}
            >
              <Plus size={14} /> Tạo booking slot
            </Button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            {slotError ? (
              <AsyncState isLoading={false} isError onRetry={refetchSlot} errorTitle="Không thể tải danh sách đặt không gian"><div /></AsyncState>
            ) : slotLoading ? (
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
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Ngày tạo</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Cập nhật</th>
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
                      <tr key={b.id} className="hover:bg-violet-50/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-violet-600 cursor-pointer hover:text-violet-800 hover:underline"
                          onClick={() => { setSlotSection(undefined); setSelectedSlotBooking(b); }}>
                          {b.bookingRef}
                        </td>
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
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(b.updatedAt)}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {['PENDING', 'CONFIRMED'].includes(b.status) && (
                              <button
                                className="p-1 rounded text-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                                title="Chỉnh sửa booking slot"
                                onClick={() => { setSelectedSlotBooking(b); setEditSlotDirectly(true); }}
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                            {b.status === 'CANCELLED' && (
                              <button
                                className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Xóa slot booking"
                                onClick={() => setConfirmDeleteSlotId(b.id)}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
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
      <BookingDetailSheet
        booking={selectedBooking}
        scrollTo={bookingSection}
        initialEditing={editDirectly}
        onClose={() => { setSelectedBooking(null); setBookingSection(undefined); setEditDirectly(false); }}
      />
      <SlotBookingDetailSheet
        booking={selectedSlotBooking}
        scrollTo={slotSection}
        initialEditing={editSlotDirectly}
        onClose={() => { setSelectedSlotBooking(null); setSlotSection(undefined); setEditSlotDirectly(false); }}
      />
      <CreateSlotBookingDialog open={createSlotOpen} onClose={() => setCreateSlotOpen(false)} mallId={selectedMallId} />
      <CreateBookingDialog open={createUnitOpen} onClose={() => setCreateUnitOpen(false)} mallId={selectedMallId} />

      {/* Reinstate Confirmation */}
      <Dialog open={!!confirmReinstateId} onOpenChange={(o) => { if (!o) setConfirmReinstateId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <RotateCcw size={18} /> Xác nhận khôi phục booking
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Booking sẽ được đưa vào cuối hàng đợi của mặt bằng và được gia hạn thêm từ hôm nay.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="booking-cancel-reason" className="text-sm font-medium text-gray-700">Lý do hủy <span className="text-red-500">*</span></label>
            <Textarea id="booking-cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Nhập lý do để lưu vào lịch sử booking..." rows={3} />
            {cancelReason.trim().length > 0 && cancelReason.trim().length < 5 && <p className="text-xs text-red-500">Lý do cần ít nhất 5 ký tự.</p>}
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmReinstateId(null)} disabled={reinstateListMutation.isPending}>Hủy</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={reinstateListMutation.isPending}
              onClick={() => confirmReinstateId && reinstateListMutation.mutate(confirmReinstateId)}>
              {reinstateListMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Khôi phục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Soft Delete Confirmation */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={18} /> Xác nhận xóa booking
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Booking sẽ bị xóa khỏi danh sách và không thể khôi phục. Bạn có chắc chắn muốn tiếp tục?
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)} disabled={softDeleteMutation.isPending}>Hủy</Button>
            <Button variant="destructive" size="sm" disabled={softDeleteMutation.isPending}
              onClick={() => confirmDeleteId && softDeleteMutation.mutate(confirmDeleteId)}>
              {softDeleteMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slot Booking Delete Confirmation */}
      <Dialog open={!!confirmDeleteSlotId} onOpenChange={(o) => { if (!o) setConfirmDeleteSlotId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={18} /> Xác nhận xóa slot booking
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Slot booking đã hủy sẽ bị xóa vĩnh viễn. Bạn có chắc chắn muốn tiếp tục?
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteSlotId(null)} disabled={deleteSlotMutation.isPending}>Hủy</Button>
            <Button variant="destructive" size="sm" disabled={deleteSlotMutation.isPending}
              onClick={() => confirmDeleteSlotId && deleteSlotMutation.mutate(confirmDeleteSlotId)}>
              {deleteSlotMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Cancel Confirmation */}
      <Dialog open={!!confirmCancelIds} onOpenChange={(o) => { if (!o) setConfirmCancelIds(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={18} /> Xác nhận hủy booking
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Bạn có chắc muốn hủy <span className="font-semibold">{confirmCancelIds?.length ?? 0} booking</span> đã chọn?
            {selectedUnitIds.size > 0 && selectedUnitIds.size !== (confirmCancelIds?.length ?? 0) && (
              <span className="block mt-1 text-amber-600 text-xs">
                ({selectedUnitIds.size - (confirmCancelIds?.length ?? 0)} booking ở trạng thái không thể hủy sẽ được bỏ qua)
              </span>
            )}
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => { setConfirmCancelIds(null); setCancelReason(''); }} disabled={bulkCancelMutation.isPending}>
              Không
            </Button>
            <Button
              variant="destructive" size="sm"
              disabled={bulkCancelMutation.isPending || cancelReason.trim().length < 5}
              onClick={() => confirmCancelIds && bulkCancelMutation.mutate(confirmCancelIds)}
            >
              {bulkCancelMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Xác nhận hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
