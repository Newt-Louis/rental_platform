import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { slotsApi, spacesApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Pencil, Trash2, Plus, MousePointer, ZoomIn, AlertTriangle, Grid3x3, BookmarkPlus, Lock, Check, X } from 'lucide-react';
import type { UnitSlot, SlotBooking } from '@/types';
import { SlotSummaryBadge } from '@/components/SlotSummaryBadge';

// ── Slot colors by status ───────────────────────────────────────────────────

type SlotColorInfo = { fill: string; stroke: string; label: string; status: 'vacant' | 'pending' | 'confirmed' };

// Mặt bằng đã gắn với khách thuê chính thức — không cho tạo booking ô nhỏ mới (khớp với chặn ở backend)
const UNBOOKABLE_STATUSES: Record<string, string> = {
  OCCUPIED: 'Đang thuê',
  CONTRACTED: 'Hợp đồng',
  UNDER_FITOUT: 'Đang thi công',
};

function getSlotColor(slot: UnitSlot, bookings: SlotBooking[]): SlotColorInfo {
  const active = bookings.filter(
    (b) => b.slotId === slot.id && ['PENDING', 'CONFIRMED'].includes(b.status),
  );
  if (active.length === 0) return { fill: '#22c55e', stroke: '#16a34a', label: 'Trống', status: 'vacant' };
  if (active.some((b) => b.status === 'CONFIRMED'))
    return { fill: '#ef4444', stroke: '#dc2626', label: 'Đã book', status: 'confirmed' };
  return { fill: '#f59e0b', stroke: '#d97706', label: 'Chờ XN', status: 'pending' };
}

// ── Area Summary Bar ─────────────────────────────────────────────────────────

function AreaSummaryBar({
  unitArea, slots, bookings,
}: {
  unitArea: number;
  slots: UnitSlot[];
  bookings: SlotBooking[];
}) {
  const totalSlotArea = slots.reduce((s, sl) => s + sl.area, 0);

  const confirmedArea = slots
    .filter((sl) => bookings.some((b) => b.slotId === sl.id && b.status === 'CONFIRMED'))
    .reduce((s, sl) => s + sl.area, 0);

  const pendingArea = slots
    .filter((sl) =>
      bookings.some((b) => b.slotId === sl.id && b.status === 'PENDING') &&
      !bookings.some((b) => b.slotId === sl.id && b.status === 'CONFIRMED'),
    )
    .reduce((s, sl) => s + sl.area, 0);

  const allocatedFreeArea = Math.max(0, totalSlotArea - confirmedArea - pendingArea);
  const unallocated = Math.max(0, unitArea - totalSlotArea);
  const overflow = totalSlotArea > unitArea;

  const pctOf = (n: number) => Math.min(100, unitArea > 0 ? (n / unitArea) * 100 : 0);

  return (
    <div className="bg-white rounded-xl border p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-500 tracking-wide">PHÂN BỔ DIỆN TÍCH</span>
        <span className="text-gray-400">NLA: <strong className="text-gray-700">{unitArea.toLocaleString('vi-VN')} m²</strong></span>
      </div>

      {/* Stacked progress bar */}
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex mb-3">
        <div
          className="h-full bg-red-400 transition-all"
          style={{ width: `${pctOf(confirmedArea)}%` }}
          title={`Đã xác nhận: ${confirmedArea} m²`}
        />
        <div
          className="h-full bg-amber-400 transition-all"
          style={{ width: `${pctOf(pendingArea)}%` }}
          title={`Chờ xác nhận: ${pendingArea} m²`}
        />
        <div
          className="h-full bg-green-400 transition-all"
          style={{ width: `${pctOf(allocatedFreeArea)}%` }}
          title={`Đã phân ô - còn trống: ${allocatedFreeArea} m²`}
        />
        {/* Unallocated stays as gray background */}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="font-bold text-gray-800">{totalSlotArea.toLocaleString('vi-VN')}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Đã phân ô (m²)</div>
        </div>
        <div>
          <div className="font-bold text-red-500">{confirmedArea.toLocaleString('vi-VN')}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Đã xác nhận</div>
        </div>
        <div>
          <div className="font-bold text-amber-500">{pendingArea.toLocaleString('vi-VN')}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Chờ xác nhận</div>
        </div>
        <div>
          <div className={`font-bold ${unallocated > 0 ? 'text-gray-500' : 'text-gray-300'}`}>
            {unallocated.toLocaleString('vi-VN')}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">Chưa phân ô</div>
        </div>
      </div>

      {overflow && (
        <div className="mt-2 flex items-center gap-1 text-red-600 bg-red-50 rounded-lg px-2 py-1">
          <AlertTriangle size={11} />
          Tổng slot ({totalSlotArea} m²) vượt quá NLA ({unitArea} m²)
        </div>
      )}
    </div>
  );
}

// ── Slot Detail Panel ─────────────────────────────────────────────────────────

function SlotInfoPanel({
  slot, bookings, bookable, unbookableReason, onEdit, onDelete, onBook,
}: {
  slot: UnitSlot;
  bookings: SlotBooking[];
  bookable: boolean;
  unbookableReason?: string;
  onEdit: () => void;
  onDelete: () => void;
  onBook: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const slotBookings = bookings.filter(
    (b) => b.slotId === slot.id && ['PENDING', 'CONFIRMED'].includes(b.status),
  );
  const color = getSlotColor(slot, bookings);
  const isFullyBooked = color.status === 'confirmed';

  return (
    <div className="bg-white rounded-xl border shadow-lg p-4 w-full text-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold text-gray-900">{slot.name}</div>
          <div className="text-xs text-gray-400 font-mono">{slot.code}</div>
        </div>
        <Badge
          className="text-xs"
          style={{ background: color.fill + '20', color: color.stroke, border: `1px solid ${color.stroke}40` }}
        >
          {color.label}
        </Badge>
      </div>

      {!bookable && (
        <div className="mb-3 flex items-start gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2">
          <Lock size={12} className="mt-0.5 shrink-0" />
          <span>{unbookableReason}</span>
        </div>
      )}

      <div className="space-y-1 text-xs text-gray-600 mb-3">
        <div className="flex justify-between">
          <span>Diện tích:</span>
          <span className="font-medium">{slot.area} m²</span>
        </div>
        <div className="flex justify-between">
          <span>Loại:</span>
          <span>
            {slot.slotType === 'SHORT_TERM' ? 'Ngắn hạn' : slot.slotType === 'LONG_TERM' ? 'Dài hạn' : 'Linh hoạt'}
          </span>
        </div>
        {slot.pricePerDaySqm != null && (
          <div className="flex justify-between">
            <span>Giá/ngày/m²:</span>
            <span className="font-medium text-gray-700">
              {new Intl.NumberFormat('vi-VN').format(slot.pricePerDaySqm)} ₫
            </span>
          </div>
        )}
        {slot.pricePerHour != null && (
          <div className="flex justify-between">
            <span>Giá/giờ:</span>
            <span className="font-medium text-gray-700">
              {new Intl.NumberFormat('vi-VN').format(slot.pricePerHour)} ₫
            </span>
          </div>
        )}
        {slot.pricePerSqmMonth != null && (
          <div className="flex justify-between">
            <span>Giá/tháng/m²:</span>
            <span className="font-medium text-gray-700">
              {new Intl.NumberFormat('vi-VN').format(slot.pricePerSqmMonth)} ₫
            </span>
          </div>
        )}
      </div>

      {slotBookings.length > 0 && (
        <div className="mb-3 rounded-lg p-2" style={{ background: color.fill + '15' }}>
          <div className="text-xs font-semibold mb-1" style={{ color: color.stroke }}>
            Booking hiện tại ({slotBookings.length})
          </div>
          {slotBookings.map((b) => (
            <div key={b.id} className="text-xs text-gray-600 flex items-center justify-between">
              <span className="font-mono">{b.bookingRef}</span>
              <span className="text-gray-400">
                {b.type} · {new Date(b.startDatetime).toLocaleDateString('vi-VN')}
              </span>
            </div>
          ))}
        </div>
      )}

      {confirmingDelete ? (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2">
          <span className="flex-1 text-xs text-red-700">Xoá ô "{slot.name}"?</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 gap-1 text-red-600 border-red-300 hover:bg-red-100"
            onClick={() => { onDelete(); setConfirmingDelete(false); }}
          >
            <Check size={12} /> Xoá
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setConfirmingDelete(false)}>
            <X size={12} />
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 gap-1"
            onClick={onBook}
            disabled={isFullyBooked || !bookable}
            title={isFullyBooked ? 'Slot đã được xác nhận booking' : !bookable ? unbookableReason : ''}
          >
            <Plus size={12} /> Book
          </Button>
          <Button size="sm" variant="outline" className="gap-1 px-2" onClick={onEdit}>
            <Pencil size={12} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 px-2 text-red-500 hover:bg-red-50"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Create/Edit Slot Dialog ──────────────────────────────────────────────────

function SlotFormDialog({
  open, slot, unitId, pendingZone, unitArea, existingSlotArea, onClose,
}: {
  open: boolean;
  slot?: UnitSlot | null;
  unitId: string;
  pendingZone?: { x: number; y: number; w: number; h: number } | null;
  unitArea?: number;
  existingSlotArea?: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!slot;

  const [form, setForm] = useState({
    code: '', name: '', area: '', description: '',
    slotType: 'FLEXIBLE',
    pricePerDaySqm: '', pricePerHour: '', pricePerSqmMonth: '',
    fillColor: '#3B82F6',
  });

  useEffect(() => {
    if (open) {
      setForm({
        code: slot?.code ?? '',
        name: slot?.name ?? '',
        area: slot?.area?.toString() ?? '',
        description: slot?.description ?? '',
        slotType: slot?.slotType ?? 'FLEXIBLE',
        pricePerDaySqm: slot?.pricePerDaySqm?.toString() ?? '',
        pricePerHour: slot?.pricePerHour?.toString() ?? '',
        pricePerSqmMonth: slot?.pricePerSqmMonth?.toString() ?? '',
        fillColor: slot?.fillColor ?? '#3B82F6',
      });
    }
  }, [open, slot]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      isEdit
        ? slotsApi.updateSlot(slot!.id, data)
        : slotsApi.createSlot(unitId, {
            ...data,
            posX: pendingZone?.x ?? 10,
            posY: pendingZone?.y ?? 10,
            posW: pendingZone?.w ?? 20,
            posH: pendingZone?.h ?? 20,
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-slots', unitId] });
      toast({ title: isEdit ? 'Đã cập nhật slot' : 'Đã tạo slot mới' });
      onClose();
    },
    onError: (e: any) =>
      toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      code: form.code,
      name: form.name,
      area: Number(form.area),
      description: form.description || undefined,
      slotType: form.slotType,
      pricePerDaySqm: form.pricePerDaySqm ? Number(form.pricePerDaySqm) : undefined,
      pricePerHour: form.pricePerHour ? Number(form.pricePerHour) : undefined,
      pricePerSqmMonth: form.pricePerSqmMonth ? Number(form.pricePerSqmMonth) : undefined,
      fillColor: form.fillColor,
    });
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  // Area warning logic
  const newArea = Number(form.area) || 0;
  const currentEditArea = isEdit ? (slot?.area ?? 0) : 0;
  const baseExisting = (existingSlotArea ?? 0) - currentEditArea;
  const projectedTotal = baseExisting + newArea;
  const remainingCapacity = unitArea != null ? Math.max(0, unitArea - baseExisting) : null;
  const areaWarning =
    unitArea != null && newArea > 0 && projectedTotal > unitArea;
  const areaOk = unitArea != null && newArea > 0 && !areaWarning;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Sửa slot: ${slot?.name}` : 'Tạo slot mới'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Mã slot *</label>
              <Input value={form.code} onChange={set('code')} placeholder="A01-Z1" required />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">
                Diện tích (m²) *
                {remainingCapacity != null && (
                  <span className="ml-1 font-normal text-gray-400">
                    — còn {remainingCapacity.toLocaleString('vi-VN')} m²
                  </span>
                )}
              </label>
              <Input
                value={form.area}
                onChange={set('area')}
                type="number"
                placeholder="50"
                required
                className={areaWarning ? 'border-amber-400 focus-visible:ring-amber-400' : areaOk ? 'border-green-400' : ''}
              />
              {areaWarning && (
                <div className="flex items-center gap-1 text-[11px] text-amber-600 mt-1">
                  <AlertTriangle size={10} />
                  Vượt quá NLA còn lại ({remainingCapacity} m²). Slot sẽ được tạo nhưng cần kiểm tra lại.
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Tên slot *</label>
            <Input value={form.name} onChange={set('name')} placeholder="Front Corner Zone" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Loại booking</label>
              <Select
                value={form.slotType}
                onValueChange={(v) => setForm((p) => ({ ...p, slotType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FLEXIBLE">Linh hoạt</SelectItem>
                  <SelectItem value="SHORT_TERM">Ngắn hạn</SelectItem>
                  <SelectItem value="LONG_TERM">Dài hạn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Màu sắc</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.fillColor}
                  onChange={set('fillColor')}
                  className="h-9 w-14 rounded border cursor-pointer"
                />
                <span className="text-xs text-gray-400">{form.fillColor}</span>
              </div>
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-gray-500 mb-2">BẢNG GIÁ</div>
            <div className="space-y-2">
              {(form.slotType === 'FLEXIBLE' || form.slotType === 'SHORT_TERM') && (
                <>
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Giá/ngày/m² (DAILY)</label>
                    <Input
                      value={form.pricePerDaySqm}
                      onChange={set('pricePerDaySqm')}
                      type="number"
                      placeholder="0 ₫"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Giá/giờ (HOURLY — toàn slot)</label>
                    <Input
                      value={form.pricePerHour}
                      onChange={set('pricePerHour')}
                      type="number"
                      placeholder="0 ₫"
                    />
                  </div>
                </>
              )}
              {(form.slotType === 'FLEXIBLE' || form.slotType === 'LONG_TERM') && (
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Giá/tháng/m² (MONTHLY)</label>
                  <Input
                    value={form.pricePerSqmMonth}
                    onChange={set('pricePerSqmMonth')}
                    type="number"
                    placeholder="0 ₫"
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo slot'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Area Cell Picker (for booking) ───────────────────────────────────────────

function SlotAreaPicker({
  slots,
  bookings,
  selectedId,
  onSelect,
}: {
  slots: UnitSlot[];
  bookings: SlotBooking[];
  selectedId?: string | null;
  onSelect: (slot: UnitSlot) => void;
}) {
  if (slots.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        Chưa có ô diện tích. Vẽ ô hoặc chia lưới trước khi booking.
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs font-medium text-gray-700 mb-2 block">Chọn ô diện tích *</label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
        {slots.map((slot) => {
          const color = getSlotColor(slot, bookings);
          const isBooked = color.status === 'confirmed';
          const isSelected = selectedId === slot.id;

          return (
            <button
              key={slot.id}
              type="button"
              disabled={isBooked}
              onClick={() => onSelect(slot)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                isSelected
                  ? 'border-gray-900 bg-gray-50 ring-2 ring-blue-200'
                  : isBooked
                  ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ background: color.fill, border: `1px solid ${color.stroke}` }}
                />
                <span className="text-sm font-medium truncate">{slot.name}</span>
              </div>
              <div className="text-xs text-gray-500">{slot.area} m²</div>
              <div className="text-[10px] font-medium mt-1" style={{ color: color.stroke }}>
                {color.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Grid Split Dialog ────────────────────────────────────────────────────────

function GridSplitDialog({
  open,
  unitId,
  unitArea,
  onClose,
}: {
  open: boolean;
  unitId: string;
  unitArea?: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [rows, setRows] = useState('2');
  const [cols, setCols] = useState('3');

  const mutation = useMutation({
    mutationFn: () =>
      slotsApi.createSlotGrid(unitId, {
        rows: Number(rows),
        cols: Number(cols),
        slotType: 'FLEXIBLE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-slots', unitId] });
      qc.invalidateQueries({ queryKey: ['slot-summaries'] });
      toast({ title: `Đã tạo ${Number(rows) * Number(cols)} ô diện tích` });
      onClose();
    },
    onError: (e: any) =>
      toast({ title: e?.response?.data?.message ?? 'Lỗi tạo lưới', variant: 'destructive' }),
  });

  const totalCells = Number(rows) * Number(cols);
  const areaPerCell =
    unitArea && totalCells > 0 ? Math.round((unitArea / totalCells) * 10) / 10 : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Grid3x3 size={18} /> Chia lưới ô diện tích
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-600">
            Tự động chia mặt bằng thành các ô đều nhau để sale chọn khi booking.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Số hàng</label>
              <Input value={rows} onChange={(e) => setRows(e.target.value)} type="number" min="1" max="6" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Số cột</label>
              <Input value={cols} onChange={(e) => setCols(e.target.value)} type="number" min="1" max="6" />
            </div>
          </div>
          {areaPerCell != null && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
              Tạo <strong>{totalCells} ô</strong>, mỗi ô ~<strong>{areaPerCell} m²</strong>
              {unitArea && <> / tổng {unitArea.toLocaleString('vi-VN')} m² NLA</>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !rows || !cols || totalCells < 1}
          >
            {mutation.isPending ? 'Đang tạo...' : 'Tạo lưới'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Slot Booking Dialog ──────────────────────────────────────────────────────

function SlotBookingDialog({
  open, slot: initialSlot, slots, bookings, onClose,
}: {
  open: boolean;
  slot: UnitSlot | null;
  slots: UnitSlot[];
  bookings: SlotBooking[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedSlot, setSelectedSlot] = useState<UnitSlot | null>(initialSlot);
  const [type, setType] = useState<'DAILY' | 'HOURLY' | 'MONTHLY'>('DAILY');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [startHour, setStartHour] = useState('9');
  const [endHour, setEndHour] = useState('17');
  const [months, setMonths] = useState('1');
  const [notes, setNotes] = useState('');
  const [pricePreview, setPricePreview] = useState<{
    baseAmount: number;
    discountPct: number;
    totalAmount: number;
  } | null>(null);

  const slot = selectedSlot;

  useEffect(() => {
    if (open) {
      setSelectedSlot(initialSlot);
    }
  }, [open, initialSlot]);

  const getStartEnd = () => {
    if (!startDate) return { start: '', end: '' };
    if (type === 'DAILY') {
      const end = endDate || startDate;
      return {
        start: new Date(startDate + 'T00:00:00').toISOString(),
        end: new Date(end + 'T23:59:59').toISOString(),
      };
    } else if (type === 'HOURLY') {
      return {
        start: new Date(`${startDate}T${String(startHour).padStart(2, '0')}:00:00`).toISOString(),
        end: new Date(`${startDate}T${String(endHour).padStart(2, '0')}:00:00`).toISOString(),
      };
    } else {
      const s = new Date(startDate);
      const e = new Date(s);
      e.setMonth(e.getMonth() + Number(months));
      return { start: s.toISOString(), end: e.toISOString() };
    }
  };

  useEffect(() => {
    if (!slot || !startDate) return;
    const { start, end } = getStartEnd();
    if (!start || !end || end <= start) {
      setPricePreview(null);
      return;
    }
    slotsApi
      .calculatePrice(slot.id, type, start, end)
      .then(setPricePreview)
      .catch(() => setPricePreview(null));
  }, [slot, type, startDate, endDate, startHour, endHour, months]);

  const mutation = useMutation({
    mutationFn: () => {
      const { start, end } = getStartEnd();
      return slotsApi.createBooking(slot!.id, {
        type,
        startDatetime: start,
        endDatetime: end,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-slots', slot?.unitId] });
      qc.invalidateQueries({ queryKey: ['slot-bookings-all', slot?.unitId] });
      qc.invalidateQueries({ queryKey: ['slot-summaries'] });
      toast({ title: `Đã tạo booking ${slot?.name}` });
      onClose();
    },
    onError: (e: any) =>
      toast({ title: e?.response?.data?.message ?? 'Lỗi tạo booking', variant: 'destructive' }),
  });

  const HOURS = Array.from({ length: 14 }, (_, i) => String(i + 7));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {slot ? (
              <>
                Book: {slot.name}{' '}
                <span className="text-gray-400 font-normal text-base">({slot.area} m²)</span>
              </>
            ) : (
              'Chọn ô & Book Slot'
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <SlotAreaPicker
            slots={slots}
            bookings={bookings}
            selectedId={selectedSlot?.id}
            onSelect={setSelectedSlot}
          />

          {!slot && (
            <p className="text-xs text-center text-gray-400">Chọn một ô ở trên để tiếp tục</p>
          )}

          {slot && (
          <>
          {/* Type selector */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">Loại booking</label>
            <div className="flex gap-2">
              {(
                [
                  ['DAILY', 'Theo ngày'],
                  ['HOURLY', 'Theo giờ'],
                  ['MONTHLY', 'Theo tháng'],
                ] as const
              ).map(([t, label]) => {
                const allowed =
                  slot?.slotType === 'FLEXIBLE' ||
                  (slot?.slotType === 'SHORT_TERM' && (t === 'DAILY' || t === 'HOURLY')) ||
                  (slot?.slotType === 'LONG_TERM' && t === 'MONTHLY');
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    disabled={!allowed}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      type === t
                        ? 'bg-gray-900 text-white border-gray-900'
                        : allowed
                        ? 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                        : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date inputs */}
          {type === 'DAILY' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Từ ngày *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Đến ngày *</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {type === 'HOURLY' && (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Ngày *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Từ giờ</label>
                  <Select value={startHour} onValueChange={setStartHour}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Đến giờ</label>
                  <Select value={endHour} onValueChange={setEndHour}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS.filter((h) => Number(h) > Number(startHour)).map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {type === 'MONTHLY' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Từ tháng *</label>
                <input
                  type="month"
                  value={startDate.substring(0, 7)}
                  onChange={(e) => setStartDate(e.target.value + '-01')}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Số tháng</label>
                <Input value={months} onChange={(e) => setMonths(e.target.value)} type="number" min="1" />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Ghi chú</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Yêu cầu đặc biệt..."
            />
          </div>

          {/* Price preview */}
          {pricePreview && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Giá gốc:</span>
                <span>{new Intl.NumberFormat('vi-VN').format(pricePreview.baseAmount)} ₫</span>
              </div>
              {pricePreview.discountPct > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Giảm giá:</span>
                  <span>-{pricePreview.discountPct}%</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-gray-700 border-t border-gray-200 pt-1 mt-1">
                <span>Tổng cộng:</span>
                <span>{new Intl.NumberFormat('vi-VN').format(pricePreview.totalAmount)} ₫</span>
              </div>
            </div>
          )}
          </>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !startDate || !slot}>
            {mutation.isPending ? 'Đang tạo...' : 'Xác nhận Booking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── SVG Slot Renderer ────────────────────────────────────────────────────────
// Renders a single slot rect with appropriate visual style per booking status

function SlotRect({
  slot, bookings, isSelected, onClick,
}: {
  slot: UnitSlot;
  bookings: SlotBooking[];
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const color = getSlotColor(slot, bookings);
  const activeBookings = bookings.filter(
    (b) => b.slotId === slot.id && ['PENDING', 'CONFIRMED'].includes(b.status),
  );
  const bookingCount = activeBookings.length;

  // Visual params per status
  const fillOpacity = isSelected ? 0.65 : color.status === 'confirmed' ? 0.55 : color.status === 'pending' ? 0.45 : 0.3;
  const strokeWidth = isSelected ? 2.5 : color.status !== 'vacant' ? 2 : 1.5;
  const strokeDash = color.status === 'pending' ? '5,3' : undefined;
  const strokeColor = isSelected ? '#1d4ed8' : color.stroke;

  // Text sizing — clamp font to fit small zones
  const minDim = Math.min(slot.posW, slot.posH);
  const nameFontSize = minDim < 8 ? 8 : 11;
  const subFontSize = minDim < 8 ? 7 : 9;
  const showSub = slot.posH >= 6;

  // Badge position (top-right corner of rect)
  const badgeX = slot.posX + slot.posW;
  const badgeY = slot.posY;

  return (
    <g key={slot.id}>
      {/* Main rect */}
      <rect
        x={`${slot.posX}%`}
        y={`${slot.posY}%`}
        width={`${slot.posW}%`}
        height={`${slot.posH}%`}
        fill={color.fill}
        fillOpacity={fillOpacity}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDash}
        rx={4}
        style={{ cursor: 'pointer', transition: 'all 0.15s' }}
        onClick={onClick}
      />

      {/* Diagonal hatch overlay for confirmed bookings */}
      {color.status === 'confirmed' && (
        <rect
          x={`${slot.posX}%`}
          y={`${slot.posY}%`}
          width={`${slot.posW}%`}
          height={`${slot.posH}%`}
          fill={`url(#hatch-confirmed)`}
          fillOpacity={0.25}
          rx={4}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Slot name */}
      <text
        x={`${slot.posX + slot.posW / 2}%`}
        y={`${slot.posY + slot.posH / 2 - (showSub ? 2.5 : 0)}%`}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontSize={nameFontSize}
        fontWeight="600"
        style={{ pointerEvents: 'none', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}
      >
        {slot.name}
      </text>

      {/* Area label */}
      {showSub && (
        <text
          x={`${slot.posX + slot.posW / 2}%`}
          y={`${slot.posY + slot.posH / 2 + 3}%`}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(255,255,255,0.85)"
          fontSize={subFontSize}
          style={{ pointerEvents: 'none' }}
        >
          {slot.area} m²
        </text>
      )}

      {/* Booking count badge — top-right corner */}
      {bookingCount > 0 && slot.posW >= 5 && (
        <>
          <circle
            cx={`${badgeX - 1.5}%`}
            cy={`${badgeY + 1.5}%`}
            r="1.2%"
            fill={color.fill}
            stroke="white"
            strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />
          <text
            x={`${badgeX - 1.5}%`}
            y={`${badgeY + 1.5}%`}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize={8}
            fontWeight="700"
            style={{ pointerEvents: 'none' }}
          >
            {bookingCount}
          </text>
        </>
      )}
    </g>
  );
}

// ── Main FloorPlanEditor ─────────────────────────────────────────────────────

interface DrawState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const API_ORIGIN = ((import.meta as any).env?.VITE_API_URL || '/api').replace(/\/api\/?$/, '');
function mediaUrl(url?: string | null) {
  if (!url) return '';
  return url.startsWith('http') ? url : `${API_ORIGIN}${url}`;
}

export function FloorPlanEditor({
  unitId,
  unitStatus,
  floorPlanUrl: floorPlanUrlProp,
  unitArea,
}: {
  unitId: string;
  unitStatus?: string;
  floorPlanUrl?: string;
  unitArea?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: floorPlanMedia } = useQuery({
    queryKey: ['unit-media', unitId, 'FLOOR_PLAN'],
    queryFn: () => spacesApi.listUnitMedia(unitId, 'FLOOR_PLAN'),
    enabled: !!unitId,
  });
  const floorPlanList: any[] = (floorPlanMedia as any[]) ?? [];
  const [selectedFloorPlanIdx, setSelectedFloorPlanIdx] = useState(0);
  const floorPlanUrl = mediaUrl(
    floorPlanList[selectedFloorPlanIdx]?.fileUrl ?? floorPlanUrlProp,
  );

  const bookable = !unitStatus || !UNBOOKABLE_STATUSES[unitStatus];
  const unbookableReason = unitStatus && UNBOOKABLE_STATUSES[unitStatus]
    ? `Mặt bằng đang ở trạng thái "${UNBOOKABLE_STATUSES[unitStatus]}" — đã có khách thuê chính thức nên không thể tạo booking ô nhỏ mới.`
    : undefined;

  const [mode, setMode] = useState<'select' | 'draw'>('select');
  const [drawing, setDrawing] = useState<DrawState | null>(null);
  const [pendingZone, setPendingZone] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<UnitSlot | null>(null);
  const [editSlot, setEditSlot] = useState<UnitSlot | null>(null);
  const [bookSlot, setBookSlot] = useState<UnitSlot | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showGridDialog, setShowGridDialog] = useState(false);
  const [showBookDialog, setShowBookDialog] = useState(false);

  const { data: slots = [] } = useQuery<UnitSlot[]>({
    queryKey: ['unit-slots', unitId],
    queryFn: () => slotsApi.listSlots(unitId),
  });

  const { data: allBookings = [] } = useQuery<SlotBooking[]>({
    queryKey: ['slot-bookings-all', unitId],
    queryFn: () => slotsApi.listAllBookings({ unitId }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => slotsApi.deleteSlot(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-slots', unitId] });
      setSelectedSlot(null);
      toast({ title: 'Đã xóa slot' });
    },
  });

  const totalSlotArea = (slots as UnitSlot[]).reduce((s, sl) => s + sl.area, 0);

  const slotSummary = useMemo(() => {
    const list = slots as UnitSlot[];
    const bk = allBookings as SlotBooking[];
    let confirmedSlots = 0;
    let pendingSlots = 0;
    let vacantSlots = 0;
    let bookedArea = 0;
    let pendingArea = 0;

    for (const sl of list) {
      const color = getSlotColor(sl, bk);
      if (color.status === 'confirmed') {
        confirmedSlots++;
        bookedArea += sl.area;
      } else if (color.status === 'pending') {
        pendingSlots++;
        pendingArea += sl.area;
      } else {
        vacantSlots++;
      }
    }

    return {
      unitId,
      totalSlots: list.length,
      vacantSlots,
      pendingSlots,
      confirmedSlots,
      totalSlotArea,
      bookedArea,
      pendingArea,
      vacantArea: Math.max(0, totalSlotArea - bookedArea - pendingArea),
    };
  }, [slots, allBookings, unitId, totalSlotArea]);

  const getRelPos = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (mode !== 'draw') return;
      e.preventDefault();
      const pos = getRelPos(e);
      setDrawing({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
      setSelectedSlot(null);
    },
    [mode, getRelPos],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawing || mode !== 'draw') return;
      const pos = getRelPos(e);
      setDrawing((d) => (d ? { ...d, currentX: pos.x, currentY: pos.y } : null));
    },
    [drawing, mode, getRelPos],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!drawing || mode !== 'draw') return;
      const pos = getRelPos(e);
      const x = Math.min(drawing.startX, pos.x);
      const y = Math.min(drawing.startY, pos.y);
      const w = Math.abs(pos.x - drawing.startX);
      const h = Math.abs(pos.y - drawing.startY);

      setDrawing(null);
      if (w < 2 || h < 2) return;

      setPendingZone({ x, y, w, h });
      setShowCreateForm(true);
    },
    [drawing, mode, getRelPos],
  );

  const drawRect = drawing
    ? {
        x: Math.min(drawing.startX, drawing.currentX),
        y: Math.min(drawing.startY, drawing.currentY),
        w: Math.abs(drawing.currentX - drawing.startX),
        h: Math.abs(drawing.currentY - drawing.startY),
      }
    : null;

  return (
    <div className="space-y-3">
      {/* Cảnh báo mặt bằng đã có khách thuê chính thức — vẫn cho xem/sửa layout, chỉ chặn tạo booking mới */}
      {!bookable && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
          <Lock size={13} className="mt-0.5 shrink-0" />
          <span>{unbookableReason}</span>
        </div>
      )}

      {/* Area summary bar */}
      {unitArea != null && unitArea > 0 && (
        <AreaSummaryBar
          unitArea={unitArea}
          slots={slots as UnitSlot[]}
          bookings={allBookings as SlotBooking[]}
        />
      )}

      {slotSummary.totalSlots > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <SlotSummaryBadge summary={slotSummary} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setMode('select')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              mode === 'select'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            <MousePointer size={12} /> Chọn
          </button>
          <button
            onClick={() => {
              setMode('draw');
              setSelectedSlot(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              mode === 'draw'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            <Pencil size={12} /> Vẽ ô
          </button>
          <button
            onClick={() => setShowGridDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:border-gray-300 transition-colors"
          >
            <Grid3x3 size={12} /> Chia lưới
          </button>
          <button
            onClick={() => {
              setBookSlot(null);
              setShowBookDialog(true);
            }}
            disabled={(slots as UnitSlot[]).length === 0 || !bookable}
            title={!bookable ? unbookableReason : undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:border-gray-300 disabled:opacity-40 transition-colors"
          >
            <BookmarkPlus size={12} /> Book Slot
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> Trống
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block border border-dashed border-amber-500" />{' '}
            Chờ XN
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> Đã book
          </span>
        </div>
      </div>

      {/* Floor plan selector — chỉ hiện khi có nhiều hơn 1 ảnh */}
      {floorPlanList.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 shrink-0">Nền:</span>
          {floorPlanList.map((m, i) => (
            <button
              key={m.id}
              onClick={() => setSelectedFloorPlanIdx(i)}
              className={`px-2 py-1 rounded text-xs border transition-colors ${
                selectedFloorPlanIdx === i
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {m.caption || m.fileName || `Ảnh ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Floor plan + SVG overlay */}
      <div
        ref={containerRef}
        className={`relative w-full bg-gray-100 rounded-xl overflow-hidden select-none border ${
          mode === 'draw' ? 'cursor-crosshair' : 'cursor-default'
        }`}
        style={{ aspectRatio: '16/9', minHeight: 320 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {floorPlanUrl ? (
          <img
            src={floorPlanUrl}
            alt="Floor plan"
            className="w-full h-full object-contain pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <div className="text-center">
              <ZoomIn size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa có floor plan</p>
              <p className="text-xs mt-1 text-gray-400">
                Upload ảnh floor plan trong tab Media để hiển thị nền
              </p>
            </div>
          </div>
        )}

        {/* SVG overlay */}
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: mode === 'draw' ? 'none' : 'all' }}
        >
          <defs>
            {/* Diagonal hatch pattern for confirmed bookings */}
            <pattern
              id="hatch-confirmed"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="8" stroke="white" strokeWidth="3" />
            </pattern>
          </defs>

          {/* Existing slots */}
          {(slots as UnitSlot[]).map((slot) => (
            <SlotRect
              key={slot.id}
              slot={slot}
              bookings={allBookings as SlotBooking[]}
              isSelected={selectedSlot?.id === slot.id}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedSlot(selectedSlot?.id === slot.id ? null : slot);
              }}
            />
          ))}

          {/* Drawing preview rect */}
          {drawRect && drawRect.w > 1 && drawRect.h > 1 && (
            <rect
              x={`${drawRect.x}%`}
              y={`${drawRect.y}%`}
              width={`${drawRect.w}%`}
              height={`${drawRect.h}%`}
              fill="#3b82f6"
              fillOpacity={0.2}
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="6,3"
              rx={4}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>

        {/* Draw mode hint */}
        {mode === 'draw' && !drawing && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
            Kéo thả để vẽ ô diện tích
          </div>
        )}
      </div>

      {/* Slot info panel */}
      {selectedSlot && mode === 'select' && (
        <SlotInfoPanel
          slot={selectedSlot}
          bookings={allBookings as SlotBooking[]}
          bookable={bookable}
          unbookableReason={unbookableReason}
          onEdit={() => {
            setEditSlot(selectedSlot);
            setSelectedSlot(null);
          }}
          onDelete={() => {
            if (confirm(`Xóa slot "${selectedSlot.name}"?`)) {
              deleteMutation.mutate(selectedSlot.id);
            }
          }}
          onBook={() => setBookSlot(selectedSlot)}
        />
      )}

      {/* Slot list */}
      {(slots as UnitSlot[]).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400">
              DANH SÁCH Ô ({(slots as UnitSlot[]).length})
            </span>
            {unitArea != null && unitArea > 0 && (
              <span className="text-xs text-gray-400">
                Tổng: {totalSlotArea.toLocaleString('vi-VN')} /{' '}
                {unitArea.toLocaleString('vi-VN')} m²
                {totalSlotArea > unitArea && (
                  <span className="ml-1 text-amber-500 font-medium">⚠ Vượt NLA</span>
                )}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {(slots as UnitSlot[]).map((slot) => {
              const color = getSlotColor(slot, allBookings as SlotBooking[]);
              const slotBookings = (allBookings as SlotBooking[]).filter(
                (b) => b.slotId === slot.id && ['PENDING', 'CONFIRMED'].includes(b.status),
              );
              return (
                <div
                  key={slot.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedSlot?.id === slot.id
                      ? 'bg-gray-50 border-gray-200'
                      : 'bg-white border-gray-100 hover:border-gray-200'
                  }`}
                  onClick={() =>
                    setSelectedSlot(selectedSlot?.id === slot.id ? null : slot)
                  }
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-3 h-3 rounded-sm flex-shrink-0 border"
                      style={{
                        background: color.fill,
                        borderColor: color.stroke,
                        borderStyle: color.status === 'pending' ? 'dashed' : 'solid',
                      }}
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-medium truncate">{slot.name}</span>
                      <span className="text-xs text-gray-400 ml-1.5">· {slot.area} m²</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {slotBookings.length > 0 && (
                      <Badge
                        className="text-[10px] px-1.5 py-0.5 border-0"
                        style={{
                          background: color.fill + '20',
                          color: color.stroke,
                        }}
                      >
                        {slotBookings.length} booking
                      </Badge>
                    )}
                    <span className="text-[10px] font-medium" style={{ color: color.stroke }}>
                      {color.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <SlotFormDialog
        open={showCreateForm}
        unitId={unitId}
        pendingZone={pendingZone}
        unitArea={unitArea}
        existingSlotArea={totalSlotArea}
        onClose={() => {
          setShowCreateForm(false);
          setPendingZone(null);
        }}
      />
      <SlotFormDialog
        open={!!editSlot}
        slot={editSlot}
        unitId={unitId}
        unitArea={unitArea}
        existingSlotArea={totalSlotArea}
        onClose={() => setEditSlot(null)}
      />
      <SlotBookingDialog
        open={!!bookSlot || showBookDialog}
        slot={bookSlot}
        slots={slots as UnitSlot[]}
        bookings={allBookings as SlotBooking[]}
        onClose={() => {
          setBookSlot(null);
          setShowBookDialog(false);
        }}
      />
      <GridSplitDialog
        open={showGridDialog}
        unitId={unitId}
        unitArea={unitArea}
        onClose={() => setShowGridDialog(false)}
      />
    </div>
  );
}
