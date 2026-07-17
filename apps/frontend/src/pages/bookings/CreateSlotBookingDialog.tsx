import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { slotsApi, crmApi, customersApi, spacesApi } from '@/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Plus, ChevronDown, Loader2 } from 'lucide-react';
import { SLOT_TYPE_CONFIG, fmtMoney } from './bookings-constants';

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

export function CreateSlotBookingDialog({ open, onClose, mallId }: {
  open: boolean; onClose: () => void; mallId?: string | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<CreateSlotForm>(EMPTY_FORM);
  const [pricePreview, setPricePreview] = useState<{ baseAmount: number; discountPct: number; totalAmount: number } | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  useEffect(() => {
    if (open) { setForm(EMPTY_FORM); setPricePreview(null); }
  }, [open]);

  const setField = (k: keyof CreateSlotForm) => (val: string) =>
    setForm((p) => ({ ...p, [k]: val, ...(k === 'unitId' ? { slotId: '' } : {}), ...(k === 'clientType' ? { clientId: '' } : {}) }));

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

  useEffect(() => {
    setPricePreview(null);
    if (canCalc) calcPrice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.slotId, form.type, form.startDatetime, form.endDatetime]);

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
