import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crmApi, customersApi, usersApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  CATEGORY_OPTS,
  LEAD_SOURCE_OPTS,
  LEAD_PRIORITY_OPTS,
  normalizePhone,
  validateLeadForm,
} from './lead-constants';

interface LeadEditDialogProps {
  lead: any;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  queryKeys?: {
    bookingDetail?: string;
    bookingsList?: string;
    leadsPicker?: string;
    pipeline?: string;
    leadDetail?: string;
  };
}

export function LeadEditDialog({ lead, open, onClose, onSuccess, queryKeys }: LeadEditDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'lead' | 'profile'>('lead');

  const [form, setForm] = useState({
    brandName: lead?.brandName ?? '',
    contactName: lead?.contactName ?? '',
    phone: lead?.phone ?? '',
    email: lead?.email ?? '',
    category: lead?.category ?? '',
    source: lead?.source ?? '',
    priority: lead?.priority ?? '',
    expectedArea: lead?.expectedArea?.toString() ?? '',
    expectedRent: lead?.expectedRent?.toString() ?? '',
    notes: lead?.notes ?? '',
    assignedToId: lead?.assignedToId ?? '',
    company: lead?.company ?? '',
    contactTitle: lead?.customer?.contactTitle ?? '',
    website: lead?.customer?.website ?? '',
    budgetMin: lead?.customer?.budgetMin?.toString() ?? '',
    budgetMax: lead?.customer?.budgetMax?.toString() ?? '',
    rating: lead?.customer?.rating?.toString() ?? '',
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const { data: usersData } = useQuery({
    queryKey: ['users-picker'],
    queryFn: () => usersApi.listUsers({ limit: 100 }),
    enabled: open,
    staleTime: 60_000,
  });
  const users: any[] = usersData?.data ?? usersData ?? [];

  useEffect(() => {
    if (open && lead) {
      const newForm = {
        brandName: lead.brandName ?? '',
        contactName: lead.contactName ?? '',
        phone: normalizePhone(lead.phone),
        email: lead.email ?? '',
        category: lead.category ?? '',
        source: lead.source ?? '',
        priority: lead.priority ?? '',
        expectedArea: lead.expectedArea?.toString() ?? '',
        expectedRent: lead.expectedRent?.toString() ?? '',
        notes: lead.notes ?? '',
        assignedToId: lead.assignedToId ?? '',
        company: lead.company ?? '',
        contactTitle: lead.customer?.contactTitle ?? '',
        website: lead.customer?.website ?? '',
        budgetMin: lead.customer?.budgetMin?.toString() ?? '',
        budgetMax: lead.customer?.budgetMax?.toString() ?? '',
        rating: lead.customer?.rating?.toString() ?? '',
      };
      setForm(newForm);
      setTouched({});
      setActiveTab('lead');
    }
  }, [open, lead?.id]);

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
  };
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const errors = validateLeadForm(form);
  const hasErrors = Object.keys(errors).length > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        brandName: form.brandName.trim() || undefined,
        company: form.company.trim(),
        contactName: form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        category: form.category || undefined,
        source: form.source || undefined,
        priority: form.priority || undefined,
        expectedArea: form.expectedArea && form.expectedArea.trim() ? +form.expectedArea : undefined,
        expectedRent: form.expectedRent && form.expectedRent.trim() ? +form.expectedRent : undefined,
        notes: form.notes.trim() || undefined,
        assignedToId: form.assignedToId || undefined,
      };
      await crmApi.updateLead(lead.id, payload);
      const customerId = lead.customerId ?? lead.customer?.id;
      if (customerId && (form.contactTitle || form.website || form.budgetMin || form.budgetMax || form.rating)) {
        await customersApi.updateCustomer(customerId, {
          contactTitle: form.contactTitle || undefined,
          website: form.website || undefined,
          budgetMin: form.budgetMin ? +form.budgetMin : undefined,
          budgetMax: form.budgetMax ? +form.budgetMax : undefined,
          rating: form.rating ? +form.rating : undefined,
        });
      }
    },
    onSuccess: async () => {
      const tasks = [];
      if (queryKeys?.bookingDetail) {
        tasks.push(qc.refetchQueries({ queryKey: [queryKeys.bookingDetail] }));
      }
      if (queryKeys?.bookingsList) {
        tasks.push(qc.invalidateQueries({ queryKey: [queryKeys.bookingsList] }));
      }
      if (queryKeys?.leadsPicker) {
        tasks.push(qc.invalidateQueries({ queryKey: [queryKeys.leadsPicker] }));
      }
      if (queryKeys?.pipeline) {
        tasks.push(qc.invalidateQueries({ queryKey: [queryKeys.pipeline] }));
      }
      if (queryKeys?.leadDetail) {
        tasks.push(qc.invalidateQueries({ queryKey: [queryKeys.leadDetail] }));
      }
      await Promise.all(tasks);
      toast({ title: 'Đã cập nhật thông tin khách hàng' });
      onSuccess?.();
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join(' | ') : (msg ?? 'Lỗi cập nhật khách hàng');
      toast({ title: text, variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    setTouched({ brandName: true, contactName: true, phone: true, email: true });
    if (hasErrors) {
      toast({ title: 'Vui lòng kiểm tra lại thông tin', variant: 'destructive' });
      return;
    }
    mutation.mutate();
  };

  const fieldClass = (k: keyof typeof errors) =>
    touched[k] && errors[k] ? 'border-red-400 focus:ring-red-400' : '';
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa khách hàng</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-1">
          <button
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${activeTab === 'lead' ? 'bg-white shadow text-gray-700' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('lead')}
          >
            Lead / Cơ hội
          </button>
          <button
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${activeTab === 'profile' ? 'bg-white shadow text-gray-700' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('profile')}
          >
            Hồ sơ Khách hàng
          </button>
        </div>

        <div className="space-y-3 text-sm">
          {activeTab === 'lead' && (<>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Thương hiệu *</label>
                <Input
                  value={form.brandName}
                  onChange={(e) => set('brandName', e.target.value)}
                  onBlur={() => touch('brandName')}
                  placeholder="VD: Highlands Coffee"
                  className={fieldClass('brandName')}
                />
                {touched.brandName && errors.brandName && (
                  <p className="text-xs text-red-500 mt-1">{errors.brandName}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Người liên hệ *</label>
                <Input
                  value={form.contactName}
                  onChange={(e) => set('contactName', e.target.value)}
                  onBlur={() => touch('contactName')}
                  placeholder="Họ và tên"
                  className={fieldClass('contactName')}
                />
                {touched.contactName && errors.contactName && (
                  <p className="text-xs text-red-500 mt-1">{errors.contactName}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Điện thoại</label>
                <Input
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  onBlur={() => touch('phone')}
                  placeholder="0912345678"
                  className={fieldClass('phone')}
                />
                {touched.phone && errors.phone && (
                  <p className="text-xs text-red-500 mt-1">{errors.phone}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email</label>
                <Input
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  onBlur={() => touch('email')}
                  placeholder="contact@domain.com"
                  className={fieldClass('email')}
                />
                {touched.email && errors.email && (
                  <p className="text-xs text-red-500 mt-1">{errors.email}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Ngành hàng</label>
                <select className="w-full border rounded-md h-9 px-2 text-sm border-gray-300 bg-white"
                  value={form.category ?? ''} onChange={(e) => set('category', e.target.value)}>
                  <option value="">-- Chọn ngành --</option>
                  {Object.entries(CATEGORY_OPTS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nguồn</label>
                <select className="w-full border rounded-md h-9 px-2 text-sm border-gray-300 bg-white"
                  value={form.source ?? ''} onChange={(e) => set('source', e.target.value)}>
                  <option value="">-- Nguồn --</option>
                  {LEAD_SOURCE_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Mức độ tiềm năng</label>
                <select className="w-full border rounded-md h-9 px-2 text-sm border-gray-300 bg-white"
                  value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                  <option value="">-- Priority --</option>
                  {LEAD_PRIORITY_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Phụ trách</label>
                <select className="w-full border rounded-md h-9 px-2 text-sm border-gray-300 bg-white"
                  value={form.assignedToId} onChange={(e) => set('assignedToId', e.target.value)}>
                  <option value="">-- Chưa phân công --</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.fullName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Diện tích (m²)</label>
                <Input type="number" value={form.expectedArea} onChange={(e) => set('expectedArea', e.target.value)} placeholder="100" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Giá kỳ vọng (₫/m²)</label>
                <Input type="number" value={form.expectedRent} onChange={(e) => set('expectedRent', e.target.value)} placeholder="680000" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ghi chú</label>
              <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Ghi chú nội bộ..." />
            </div>
          </>)}

          {activeTab === 'profile' && (<>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tên công ty</label>
                <Input value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Công ty TNHH..." />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Chức danh liên hệ</label>
                <Input value={form.contactTitle} onChange={(e) => set('contactTitle', e.target.value)} placeholder="Giám đốc KD" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Website</label>
                <Input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Ngân sách tối thiểu (tr/m²)</label>
                <Input type="number" step="0.1" value={form.budgetMin} onChange={(e) => set('budgetMin', e.target.value)} placeholder="0.5" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Ngân sách tối đa (tr/m²)</label>
                <Input type="number" step="0.1" value={form.budgetMax} onChange={(e) => set('budgetMax', e.target.value)} placeholder="2.0" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tiềm năng (1–5★)</label>
                <select className="w-full border rounded-md h-9 px-2 text-sm border-gray-300 bg-white"
                  value={form.rating} onChange={(e) => set('rating', e.target.value)}>
                  <option value="">-- Chưa đánh giá --</option>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v}>{'★'.repeat(v)} ({v}/5)</option>
                  ))}
                </select>
              </div>
            </div>
            {!lead?.customerId && !lead?.customer?.id && (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
                Chưa có hồ sơ khách hàng liên kết. Trường công ty sẽ được lưu vào lead.
              </p>
            )}
          </>)}

          <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="button" disabled={mutation.isPending} onClick={handleSubmit}>
              {mutation.isPending ? 'Đang lưu...' : 'Cập nhật'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
