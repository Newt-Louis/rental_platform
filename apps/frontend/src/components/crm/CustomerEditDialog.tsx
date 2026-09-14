import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customersApi, usersApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { CURRENCY_CODES } from '@/lib/currency';
import { CategorySelect, categoryIdForUpdate, initialCategoryValue } from './CategorySelect';

/**
 * CR-CRM-CUSTOMER-PROFILE-EDIT — edit a customer profile.
 *
 * The customer sheet could advance a status, log an activity, link a tenant and
 * set a preferred category, but nothing else. Company name, tax code, address,
 * contact details, budget and rating were captured once at creation (or copied
 * from a Lead on conversion) and then frozen: a wrong tax code or a changed
 * phone number had no path back. This is that path.
 *
 * Only fields the server's UpdateCustomerDto accepts are sent. The identity
 * (customerCode) and the record's own bookkeeping are not editable here and are
 * stripped server-side regardless.
 */

interface CustomerEditDialogProps {
  customer: any;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const SOURCES = [
  { value: 'BROKER', label: 'Môi giới' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'REFERRAL', label: 'Giới thiệu' },
  { value: 'WALK_IN', label: 'Trực tiếp' },
  { value: 'EXISTING_TENANT', label: 'KH hiện tại' },
];

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_PHONE = /^(0|\+84)[0-9]{8,10}$/;

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function CustomerEditDialog({ customer, open, onClose, onSaved }: CustomerEditDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<'company' | 'contact' | 'leasing'>('company');

  const blank = {
    companyName: '', brandName: '', taxCode: '', industry: '', address: '', website: '',
    contactName: '', contactTitle: '', phone: '', email: '',
    source: '', preferredCategoryId: '', expectedArea: '', budgetMin: '', budgetMax: '',
    currencyCode: '', rating: '', assignedToId: '', notes: '',
  };
  const [form, setForm] = useState(blank);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open || !customer) return;
    setForm({
      companyName: customer.companyName ?? '',
      brandName: customer.brandName ?? '',
      taxCode: customer.taxCode ?? '',
      industry: customer.industry ?? '',
      address: customer.address ?? '',
      website: customer.website ?? '',
      contactName: customer.contactName ?? '',
      contactTitle: customer.contactTitle ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      source: customer.source ?? '',
      preferredCategoryId: initialCategoryValue({
        categoryId: customer.preferredCategoryId,
        category: customer.preferredCategory,
      }),
      expectedArea: customer.expectedArea?.toString() ?? '',
      budgetMin: customer.budgetMin?.toString() ?? '',
      budgetMax: customer.budgetMax?.toString() ?? '',
      currencyCode: customer.currencyCode ?? '',
      rating: customer.rating?.toString() ?? '',
      assignedToId: customer.assignedTo?.id ?? '',
      notes: customer.notes ?? '',
    });
    setTouched(false);
    setTab('company');
  }, [open, customer?.id]);

  const set = (k: keyof typeof blank) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: usersData } = useQuery({
    queryKey: ['users-picker'],
    queryFn: () => usersApi.listAssignableUsers(),
    enabled: open,
    staleTime: 60_000,
  });
  const users: any[] = usersData ?? [];

  // CUR-002-CUSTOMER — the API refuses a budget with no unit of account, so the
  // form says so instead of letting the user hit a 400.
  const budgetEntered = Boolean(form.budgetMin.trim() || form.budgetMax.trim());
  const currencyMissing = budgetEntered && !form.currencyCode;

  const errors: Record<string, string> = {};
  if (!form.companyName.trim()) errors.companyName = 'Tên công ty không được để trống';
  if (!form.contactName.trim()) errors.contactName = 'Người liên hệ không được để trống';
  if (form.email.trim() && !RE_EMAIL.test(form.email.trim())) errors.email = 'Email không đúng định dạng';
  if (form.phone.trim() && !RE_PHONE.test(form.phone.trim())) errors.phone = 'Số điện thoại không hợp lệ';
  if (
    form.budgetMin.trim() && form.budgetMax.trim()
    && Number(form.budgetMin) > Number(form.budgetMax)
  ) errors.budgetMax = 'Ngân sách tối đa phải lớn hơn tối thiểu';
  const hasErrors = Object.keys(errors).length > 0 || currencyMissing;

  const num = (v: string) => (v.trim() ? Number(v) : undefined);
  const txt = (v: string) => (v.trim() ? v.trim() : undefined);

  const mutation = useMutation({
    mutationFn: () =>
      customersApi.updateCustomer(customer.id, {
        companyName: form.companyName.trim(),
        brandName: txt(form.brandName),
        taxCode: txt(form.taxCode),
        industry: txt(form.industry),
        address: txt(form.address),
        website: txt(form.website),
        contactName: form.contactName.trim(),
        contactTitle: txt(form.contactTitle),
        phone: txt(form.phone),
        email: txt(form.email),
        source: txt(form.source),
        // Omitted while the record still carries unmapped legacy text, so an
        // unrelated edit cannot rewrite its category.
        preferredCategoryId: categoryIdForUpdate(form.preferredCategoryId),
        expectedArea: num(form.expectedArea),
        budgetMin: num(form.budgetMin),
        budgetMax: num(form.budgetMax),
        currencyCode: txt(form.currencyCode),
        rating: num(form.rating),
        assignedToId: txt(form.assignedToId),
        notes: txt(form.notes),
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['customer', customer.id] }),
        qc.invalidateQueries({ queryKey: ['customers'] }),
        qc.invalidateQueries({ queryKey: ['customers-stats'] }),
      ]);
      toast({ title: 'Đã cập nhật hồ sơ khách hàng' });
      onSaved?.();
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      toast({
        title: Array.isArray(msg) ? msg.join(' | ') : msg ?? 'Vui lòng kiểm tra lại thông tin',
        variant: 'destructive',
      });
    },
  });

  const submit = () => {
    setTouched(true);
    if (hasErrors) {
      toast({ title: 'Vui lòng kiểm tra lại thông tin', variant: 'destructive' });
      return;
    }
    mutation.mutate();
  };

  const err = (k: string) => (touched ? errors[k] : undefined);
  const selectClass = 'h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa hồ sơ khách hàng</DialogTitle>
        </DialogHeader>

        {/* Identity is shown but not editable: other records and people refer to it. */}
        <div className="mb-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Mã khách hàng <span className="font-mono font-medium text-gray-700">{customer?.customerCode}</span>
          <span className="ml-1">— không thể thay đổi</span>
        </div>

        <div className="mb-1 flex gap-1 rounded-xl bg-gray-100 p-1">
          {([
            ['company', 'Công ty'],
            ['contact', 'Liên hệ'],
            ['leasing', 'Nhu cầu thuê'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${tab === key ? 'bg-white text-gray-700 shadow' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3 text-sm">
          {tab === 'company' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Tên công ty *" error={err('companyName')}>
                  <Input value={form.companyName} onChange={(e) => set('companyName')(e.target.value)} />
                </Field>
              </div>
              <Field label="Thương hiệu">
                <Input value={form.brandName} onChange={(e) => set('brandName')(e.target.value)} />
              </Field>
              <Field label="Mã số thuế">
                <Input value={form.taxCode} onChange={(e) => set('taxCode')(e.target.value)} />
              </Field>
              <Field label="Ngành nghề kinh doanh">
                <Input value={form.industry} onChange={(e) => set('industry')(e.target.value)} placeholder="VD: Bán lẻ thời trang" />
              </Field>
              <Field label="Website">
                <Input value={form.website} onChange={(e) => set('website')(e.target.value)} placeholder="https://..." />
              </Field>
              <div className="col-span-2">
                <Field label="Địa chỉ">
                  <Input value={form.address} onChange={(e) => set('address')(e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {tab === 'contact' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Người liên hệ *" error={err('contactName')}>
                <Input value={form.contactName} onChange={(e) => set('contactName')(e.target.value)} />
              </Field>
              <Field label="Chức danh">
                <Input value={form.contactTitle} onChange={(e) => set('contactTitle')(e.target.value)} />
              </Field>
              <Field label="Điện thoại" error={err('phone')}>
                <Input value={form.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="0912345678" />
              </Field>
              <Field label="Email" error={err('email')}>
                <Input value={form.email} onChange={(e) => set('email')(e.target.value)} />
              </Field>
              <Field label="Nguồn">
                <select className={selectClass} value={form.source} onChange={(e) => set('source')(e.target.value)}>
                  <option value="">— Chưa xác định —</option>
                  {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Phụ trách">
                <select className={selectClass} value={form.assignedToId} onChange={(e) => set('assignedToId')(e.target.value)}>
                  <option value="">— Chưa phân công —</option>
                  {users.map((u: any) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </Field>
            </div>
          )}

          {tab === 'leasing' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Ngành hàng quan tâm">
                  <CategorySelect
                    value={form.preferredCategoryId}
                    onChange={set('preferredCategoryId')}
                    legacyText={customer?.preferredCategoryId ? null : customer?.preferredCategory}
                    currentCategory={customer?.preferredCategoryRef ?? null}
                    enabled={open}
                  />
                </Field>
              </div>
              <Field label="Diện tích mong muốn (m²)">
                <Input aria-label="Diện tích mong muốn" type="number" min={0} value={form.expectedArea} onChange={(e) => set('expectedArea')(e.target.value)} />
              </Field>
              <Field label="Đánh giá tiềm năng">
                <select className={selectClass} value={form.rating} onChange={(e) => set('rating')(e.target.value)}>
                  <option value="">— Chưa đánh giá —</option>
                  {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{'★'.repeat(v)} ({v}/5)</option>)}
                </select>
              </Field>
              <Field label="Ngân sách tối thiểu">
                <Input aria-label="Ngân sách tối thiểu" type="number" min={0} step="0.1" value={form.budgetMin} onChange={(e) => set('budgetMin')(e.target.value)} />
              </Field>
              <Field label="Ngân sách tối đa" error={err('budgetMax')}>
                <Input aria-label="Ngân sách tối đa" type="number" min={0} step="0.1" value={form.budgetMax} onChange={(e) => set('budgetMax')(e.target.value)} />
              </Field>
              <div className="col-span-2">
                <Field label={`Đơn vị tiền tệ${budgetEntered ? ' *' : ''}`}>
                  <select
                    aria-label="Đơn vị tiền tệ ngân sách"
                    className={`h-9 w-full rounded-md border bg-white px-2 text-sm ${currencyMissing ? 'border-red-400' : 'border-gray-300'}`}
                    value={form.currencyCode}
                    onChange={(e) => set('currencyCode')(e.target.value)}
                  >
                    <option value="">— Chưa chọn —</option>
                    {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {currencyMissing && (
                    <p className="mt-0.5 text-[11px] text-red-500">
                      Bắt buộc khi đã nhập ngân sách — hệ thống không mặc định VND.
                    </p>
                  )}
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Ghi chú">
                  <Textarea rows={3} value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="button" disabled={mutation.isPending} onClick={submit}>
              {mutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
