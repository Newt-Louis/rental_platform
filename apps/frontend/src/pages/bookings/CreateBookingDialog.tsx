import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingApi, spacesApi, crmApi, usersApi } from '@/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Building2, User, X, BookmarkPlus } from 'lucide-react';

export function CreateBookingDialog({ open, onClose, mallId }: {
  open: boolean; onClose: () => void; mallId?: string | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    unitSearch: '', unitId: '', unitLabel: '',
    leadSearch: '', leadId: '',
    requestedArea: '', requestedTerm: '', expectedRent: '',
    proposedRentPerSqm: '', proposedCamPerSqm: '',
    holdDays: '30', notes: '', assignedToId: '',
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
    enabled: open && !form.leadId,
  });
  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersApi.listUsers({ limit: 100 }),
    enabled: open,
    staleTime: 60000,
  });
  const leads: any[] = Array.isArray(leadData) ? leadData : (leadData?.data ?? []);
  const users: any[] = Array.isArray(usersData) ? usersData : (usersData?.data ?? []);

  const mutation = useMutation({
    mutationFn: () => bookingApi.create({
      unitId: form.unitId,
      leadId: form.leadId || undefined,
      requestedArea: form.requestedArea ? Number(form.requestedArea) : undefined,
      requestedTerm: form.requestedTerm ? Number(form.requestedTerm) : undefined,
      expectedRent: form.expectedRent ? Number(form.expectedRent) : undefined,
      proposedRentPerSqm: form.proposedRentPerSqm ? Number(form.proposedRentPerSqm) : undefined,
      proposedCamPerSqm: form.proposedCamPerSqm ? Number(form.proposedCamPerSqm) : undefined,
      holdDays: Number(form.holdDays) || 30,
      notes: form.notes || undefined,
      assignedToId: form.assignedToId || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking-stats'] });
      toast({ title: 'Đã tạo booking lô thuê' });
      onClose();
      setForm({ unitSearch: '', unitId: '', unitLabel: '', leadSearch: '', leadId: '', requestedArea: '', requestedTerm: '', expectedRent: '', proposedRentPerSqm: '', proposedCamPerSqm: '', holdDays: '30', notes: '', assignedToId: '' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi tạo booking', variant: 'destructive' }),
  });

  const canSubmit = !!form.unitId && !!form.leadId && !mutation.isPending;

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
            <label className="text-sm font-medium text-gray-700 mb-1 block">Lead / Khách hàng *</label>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Giá thuê đề xuất (₫/m²)</label>
              <Input type="number" value={form.proposedRentPerSqm} onChange={setField('proposedRentPerSqm')} placeholder="650000" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">CAM đề xuất (₫/m²)</label>
              <Input type="number" value={form.proposedCamPerSqm} onChange={setField('proposedCamPerSqm')} placeholder="50000" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú</label>
            <Textarea value={form.notes} onChange={setField('notes')} rows={2} placeholder="Ghi chú nội bộ..." />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Phụ trách (Sale)</label>
            <select className="w-full border rounded-md h-9 px-2 text-sm border-gray-300 bg-white"
              value={form.assignedToId} onChange={(e) => setForm((f) => ({ ...f, assignedToId: e.target.value }))}>
              <option value="">-- Chưa phân công --</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </div>
        </div>

        {!form.unitId && <p className="text-xs text-red-600">Chọn mặt bằng để tiếp tục</p>}
        {form.unitId && !form.leadId && <p className="text-xs text-red-600">Chọn Lead/Khách hàng để tiếp tục</p>}

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
