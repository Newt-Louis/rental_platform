import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['crm', 'common']);
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
    leaseTermType: lead?.leaseTermType ?? 'LONG',
    expectedArea: lead?.expectedArea?.toString() ?? '',
    expectedRent: lead?.expectedRent?.toString() ?? '',
    notes: lead?.notes ?? '',
    assignedToId: lead?.assignedToId ?? '',
    company: lead?.customer?.companyName ?? lead?.company ?? '',
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
        leaseTermType: lead.leaseTermType ?? 'LONG',
        expectedArea: lead.expectedArea?.toString() ?? '',
        expectedRent: lead.expectedRent?.toString() ?? '',
        notes: lead.notes ?? '',
        assignedToId: lead.assignedToId ?? '',
        company: lead.customer?.companyName ?? lead.company ?? '',
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
        leaseTermType: form.leaseTermType,
        expectedArea: form.expectedArea && form.expectedArea.trim() ? +form.expectedArea : undefined,
        expectedRent: form.expectedRent && form.expectedRent.trim() ? +form.expectedRent : undefined,
        notes: form.notes.trim() || undefined,
        assignedToId: form.assignedToId || undefined,
      };
      await crmApi.updateLead(lead.id, payload);
      const customerId = lead.customerId ?? lead.customer?.id;
      // Sau khi đã có Customer (post-conversion), "Tên công ty" hiển thị trong sheet đọc từ
      // customer.companyName chứ không phải lead.company — phải đồng bộ cả 2 khi sửa, nếu không
      // sửa xong người dùng thấy "Lưu thành công" nhưng dữ liệu hiển thị không đổi.
      if (customerId && (form.company || form.contactTitle || form.website || form.budgetMin || form.budgetMax || form.rating)) {
        await customersApi.updateCustomer(customerId, {
          companyName: form.company.trim() || undefined,
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
      toast({ title: t('updatedCustomerInfo') });
      onSuccess?.();
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join(' | ') : msg;
      toast({ title: text ?? t('checkInfo'), variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    setTouched({ brandName: true, contactName: true, phone: true, email: true });
    if (hasErrors) {
      toast({ title: t('checkInfo'), variant: 'destructive' });
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
          <DialogTitle>{t('editLead')}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-1">
          <button
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${activeTab === 'lead' ? 'bg-white shadow text-gray-700' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('lead')}
          >
            {t('leadOpportunityTab')}
          </button>
          <button
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${activeTab === 'profile' ? 'bg-white shadow text-gray-700' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('profile')}
          >
            {t('customerProfileTab')}
          </button>
        </div>

        <div className="space-y-3 text-sm">
          {activeTab === 'lead' && (<>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('fields.brand')} *</label>
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
                <label className="text-xs text-gray-500 mb-1 block">{t('fields.contactPerson')} *</label>
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
                <label className="text-xs text-gray-500 mb-1 block">{t('fields.phone')}</label>
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
                <label className="text-xs text-gray-500 mb-1 block">{t('fields.email')}</label>
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
                <label className="text-xs text-gray-500 mb-1 block">{t('fields.industry')}</label>
                <select className="w-full border rounded-md h-9 px-2 text-sm border-gray-300 bg-white"
                  value={form.category ?? ''} onChange={(e) => set('category', e.target.value)}>
                  <option value="">-- {t('fields.industry')} --</option>
                  {Object.entries(CATEGORY_OPTS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('lead.fields.source')}</label>
                <select className="w-full border rounded-md h-9 px-2 text-sm border-gray-300 bg-white"
                  value={form.source ?? ''} onChange={(e) => set('source', e.target.value)}>
                  <option value="">-- {t('lead.fields.source')} --</option>
                  {LEAD_SOURCE_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{t(`sources.${o.value}`, o.label)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('lead.fields.priority')}</label>
                <select className="w-full border rounded-md h-9 px-2 text-sm border-gray-300 bg-white"
                  value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                  <option value="">-- {t('lead.fields.priority')} --</option>
                  {LEAD_PRIORITY_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('lead.fields.assignee')}</label>
                <select className="w-full border rounded-md h-9 px-2 text-sm border-gray-300 bg-white"
                  value={form.assignedToId} onChange={(e) => set('assignedToId', e.target.value)}>
                  <option value="">-- {t('fields.assignee')} --</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.fullName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('fields.area')}</label>
                <Input type="number" value={form.expectedArea} onChange={(e) => set('expectedArea', e.target.value)} placeholder="100" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Loại hình cho thuê</label>
                <select className="w-full border rounded-md h-9 px-2 text-sm border-gray-300 bg-white" value={form.leaseTermType} onChange={(e) => set('leaseTermType', e.target.value)}>
                  <option value="LONG">Cho thuê dài hạn</option>
                  <option value="SHORT">Cho thuê ngắn hạn</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('lead.fields.expectedRent')}</label>
                <Input type="number" value={form.expectedRent} onChange={(e) => set('expectedRent', e.target.value)} placeholder="680000" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('lead.fields.notes')}</label>
              <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Ghi chú nội bộ..." />
            </div>
          </>)}

          {activeTab === 'profile' && (<>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('fields.companyName')}</label>
                <Input value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Công ty TNHH..." />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('fields.title')}</label>
                <Input value={form.contactTitle} onChange={(e) => set('contactTitle', e.target.value)} placeholder="Giám đốc KD" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">{t('fields.website')}</label>
                <Input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('fields.budgetMin')}</label>
                <Input type="number" step="0.1" value={form.budgetMin} onChange={(e) => set('budgetMin', e.target.value)} placeholder="0.5" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('fields.budgetMax')}</label>
                <Input type="number" step="0.1" value={form.budgetMax} onChange={(e) => set('budgetMax', e.target.value)} placeholder="2.0" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('fields.potential')}</label>
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
                {t('notLinkedProfile')}
              </p>
            )}
          </>)}

          <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose}>{t('common:actions.cancel')}</Button>
            <Button type="button" disabled={mutation.isPending} onClick={handleSubmit}>
              {mutation.isPending ? t('saving') : t('update')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
