import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Edit3, Plus, RefreshCw } from 'lucide-react';
import { approvalsApi } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

type PolicyRule = {
  id: string;
  code: string;
  name: string;
  stepName: string;
  stepOrder: number;
  approverRole: string;
  conditionType: string;
  operator?: string | null;
  threshold?: number | null;
  matchValue?: string | null;
  isRequired: boolean;
  isActive: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  LEASING_MANAGER: 'Leasing Manager', MALL_DIRECTOR: 'Mall Director', CEO: 'CEO', FINANCE: 'Finance', LEGAL: 'Legal',
};
export const CONDITION_LABELS: Record<string, string> = {
  DISCOUNT_PCT: 'Tỷ lệ chiết khấu',
  RENT_FREE_DAYS: 'Thời gian miễn tiền thuê',
  INDUSTRY_TAG: 'Ngành hàng',
  HAS_AR_DEBT: 'Có công nợ quá hạn',
  PRICE_BELOW_MIN: 'Giá thuê thấp hơn giá tối thiểu',
  PRICE_DEVIATION_PCT: 'Mức giá thấp hơn giá tối thiểu',
};
const NUMERIC_CONDITIONS = new Set(['DISCOUNT_PCT', 'RENT_FREE_DAYS', 'PRICE_DEVIATION_PCT']);
const TEXT_CONDITIONS = new Set(['INDUSTRY_TAG']);
const BOOLEAN_CONDITIONS = new Set(['HAS_AR_DEBT', 'PRICE_BELOW_MIN']);
const OPERATORS = ['>', '>=', '<', '<=', '='];
const OPERATOR_LABELS: Record<string, string> = {
  '>': 'lớn hơn (>)', '>=': 'lớn hơn hoặc bằng (>=)', '<': 'nhỏ hơn (<)', '<=': 'nhỏ hơn hoặc bằng (<=)', '=': 'bằng (=)',
};
const EMPTY_FORM = {
  code: '', name: '', stepName: '', stepOrder: 10, approverRole: 'LEASING_MANAGER',
  conditionType: 'DISCOUNT_PCT', operator: '>', threshold: 5, matchValue: '', isRequired: false,
};

export function ruleCondition(rule: PolicyRule) {
  if (rule.isRequired) return 'Áp dụng cho mọi hồ sơ';
  const condition = CONDITION_LABELS[rule.conditionType] ?? rule.conditionType;
  if (NUMERIC_CONDITIONS.has(rule.conditionType)) {
    const unit = rule.conditionType === 'RENT_FREE_DAYS' ? ' ngày' : '%';
    return rule.operator === 'BETWEEN'
      ? `${condition}: từ ${rule.threshold ?? '—'}${unit} đến ${rule.matchValue ?? '—'}${unit}`
      : `${condition} ${OPERATOR_LABELS[rule.operator ?? '='] ?? rule.operator ?? '='} ${rule.threshold ?? '—'}${unit}`;
  }
  if (TEXT_CONDITIONS.has(rule.conditionType)) return `${condition}: ${rule.matchValue || '—'}`;
  if (BOOLEAN_CONDITIONS.has(rule.conditionType)) return condition;
  return condition;
}

export function ApprovalPolicyTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [validationError, setValidationError] = useState('');

  const query = useQuery({ queryKey: ['approval-policy-rules'], queryFn: approvalsApi.listPolicyRules });
  const rules = useMemo<PolicyRule[]>(() => {
    const raw = query.data as any;
    const list = raw?.data ?? raw ?? [];
    return Array.isArray(list) ? [...list].sort((a, b) => a.stepOrder - b.stepOrder) : [];
  }, [query.data]);
  const conditionPreview = ruleCondition({ ...form, id: editingId ?? '', isActive: true });

  const saveMutation = useMutation({
    mutationFn: () => {
      const isNumeric = NUMERIC_CONDITIONS.has(form.conditionType) && !form.isRequired;
      const isText = TEXT_CONDITIONS.has(form.conditionType) && !form.isRequired;
      const isBetween = isNumeric && form.operator === 'BETWEEN';
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(), name: form.name.trim(), stepName: form.stepName.trim(),
        stepOrder: Number(form.stepOrder),
        threshold: isNumeric ? Number(form.threshold) : null,
        operator: isNumeric ? form.operator : null,
        matchValue: isBetween ? String(form.matchValue).trim() : isText ? form.matchValue.trim() : null,
      };
      return editingId ? approvalsApi.updatePolicyRule(editingId, payload) : approvalsApi.createPolicyRule(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-policy-rules'] });
      toast({ title: editingId ? 'Đã cập nhật quy tắc' : 'Đã tạo quy tắc' });
      setOpen(false);
    },
    onError: (error: any) => toast({ title: error?.response?.data?.message ?? 'Không thể lưu quy tắc', variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => approvalsApi.updatePolicyRule(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-policy-rules'] }),
    onError: (error: any) => toast({ title: error?.response?.data?.message ?? 'Không thể đổi trạng thái', variant: 'destructive' }),
  });

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setValidationError(''); setOpen(true); };
  const openEdit = (rule: PolicyRule) => {
    setEditingId(rule.id);
    setForm({
      code: rule.code, name: rule.name, stepName: rule.stepName, stepOrder: rule.stepOrder,
      approverRole: rule.approverRole, conditionType: rule.conditionType, operator: rule.operator ?? '>',
      threshold: rule.threshold ?? 0, matchValue: rule.matchValue ?? '', isRequired: rule.isRequired,
    });
    setValidationError(''); setOpen(true);
  };
  const submit = () => {
    if (!form.code.trim() || !form.name.trim() || !form.stepName.trim()) return setValidationError('Vui lòng nhập mã, tên quy tắc và tên bước duyệt.');
    if (form.stepOrder < 1) return setValidationError('Thứ tự bước phải lớn hơn hoặc bằng 1.');
    if (!form.isRequired && NUMERIC_CONDITIONS.has(form.conditionType) && (!Number.isFinite(Number(form.threshold)) || Number(form.threshold) < 0)) return setValidationError('Ngưỡng phải là số không âm.');
    if (!form.isRequired && form.conditionType === 'PRICE_DEVIATION_PCT' && form.operator === 'BETWEEN'
      && (!Number.isFinite(Number(form.matchValue)) || Number(form.matchValue) <= Number(form.threshold))) {
      return setValidationError('Giá trị kết thúc phải là số lớn hơn giá trị bắt đầu.');
    }
    if (!form.isRequired && TEXT_CONDITIONS.has(form.conditionType) && !form.matchValue.trim()) return setValidationError('Vui lòng nhập giá trị điều kiện.');
    if (rules.some((rule) => rule.code.toUpperCase() === form.code.trim().toUpperCase() && rule.id !== editingId)) return setValidationError('Mã quy tắc đã tồn tại.');
    setValidationError(''); saveMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold text-slate-900">Quy trình phê duyệt</h2><p className="text-sm text-slate-500">Nguồn cấu hình duy nhất được sử dụng khi gửi proposal để phê duyệt.</p></div>
        <Button size="sm" className="gap-1" onClick={openCreate}><Plus size={14} /> Thêm quy tắc</Button>
      </div>

      {query.isLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12" />)}</div> : query.isError ? (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span className="flex items-center gap-2"><AlertCircle size={16} /> Không thể tải cấu hình phê duyệt.</span><Button size="sm" variant="outline" onClick={() => query.refetch()}>Thử lại</Button></div>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800"><strong>Chưa có quy tắc hoạt động.</strong><p className="mt-1">Proposal sẽ không thể gửi duyệt cho đến khi Admin cấu hình ít nhất một quy tắc.</p></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[800px] text-sm"><thead className="border-b bg-slate-50"><tr><th className="px-4 py-3 text-left">Quy tắc</th><th className="px-4 py-3 text-left">Bước duyệt</th><th className="px-4 py-3 text-left">Người duyệt</th><th className="px-4 py-3 text-left">Điều kiện</th><th className="px-4 py-3 text-left">Trạng thái</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y">{rules.map((rule) => <tr key={rule.id} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="font-medium text-slate-900">{rule.name}</div><div className="font-mono text-xs text-slate-500">{rule.code}</div></td><td className="px-4 py-3"><span className="mr-2 rounded-full bg-slate-100 px-2 py-1 text-xs">{rule.stepOrder}</span>{rule.stepName}</td><td className="px-4 py-3">{ROLE_LABELS[rule.approverRole] ?? rule.approverRole}</td><td className="px-4 py-3 text-slate-600">{ruleCondition(rule)}</td><td className="px-4 py-3"><Badge className={rule.isActive ? 'border-0 bg-emerald-100 text-emerald-700' : 'border-0 bg-slate-100 text-slate-600'}>{rule.isActive ? 'Đang áp dụng' : 'Đã tắt'}</Badge></td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => openEdit(rule)}><Edit3 size={13} /> Sửa</Button><Button size="sm" variant="outline" className="h-8" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}>{rule.isActive ? 'Tắt' : 'Bật'}</Button></div></td></tr>)}</tbody></table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{editingId ? 'Chỉnh sửa quy tắc' : 'Thêm quy tắc phê duyệt'}</DialogTitle></DialogHeader><div className="grid gap-4">
        {validationError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{validationError}</div>}
        <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="policy-code">Mã quy tắc</Label><Input id="policy-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="DISCOUNT_MANAGER" /></div><div><Label htmlFor="policy-name">Tên quy tắc</Label><Input id="policy-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="step-name">Tên bước duyệt</Label><Input id="step-name" value={form.stepName} onChange={(e) => setForm({ ...form, stepName: e.target.value })} /></div><div><Label htmlFor="step-order">Thứ tự bước</Label><Input id="step-order" type="number" min={1} value={form.stepOrder} onChange={(e) => setForm({ ...form, stepOrder: Number(e.target.value) })} /></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="approver-role">Vai trò phê duyệt</Label><select id="approver-role" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={form.approverRole} onChange={(e) => setForm({ ...form, approverRole: e.target.value })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><Label htmlFor="application-scope">Phạm vi áp dụng</Label><select id="application-scope" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={form.isRequired ? 'ALWAYS' : 'CONDITIONAL'} onChange={(e) => setForm({ ...form, isRequired: e.target.value === 'ALWAYS' })}><option value="CONDITIONAL">Khi thỏa điều kiện</option><option value="ALWAYS">Mọi hồ sơ (không điều kiện)</option></select></div></div>
        {!form.isRequired && <div><Label htmlFor="condition-type">Loại điều kiện</Label><select id="condition-type" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={form.conditionType} onChange={(e) => setForm({ ...form, conditionType: e.target.value, operator: '>', threshold: 0, matchValue: '' })}>{Object.entries(CONDITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
        {!form.isRequired && NUMERIC_CONDITIONS.has(form.conditionType) && <div className={`grid gap-3 ${form.operator === 'BETWEEN' ? 'sm:grid-cols-3' : 'grid-cols-[220px_1fr]'}`}><div><Label htmlFor="operator">Phép so sánh</Label><select id="operator" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value, matchValue: e.target.value === 'BETWEEN' ? form.matchValue : '' })}>{[...OPERATORS, ...(form.conditionType === 'PRICE_DEVIATION_PCT' ? ['BETWEEN'] : [])].map((operator) => <option key={operator} value={operator}>{operator === 'BETWEEN' ? 'Trong khoảng' : OPERATOR_LABELS[operator]}</option>)}</select></div><div><Label htmlFor="threshold">{form.operator === 'BETWEEN' ? `Từ (${form.conditionType === 'RENT_FREE_DAYS' ? 'ngày' : '%'})` : `Ngưỡng (${form.conditionType === 'RENT_FREE_DAYS' ? 'ngày' : '%'})`}</Label><Input id="threshold" type="number" min={0} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} /></div>{form.operator === 'BETWEEN' && <div><Label htmlFor="range-maximum">Đến (%)</Label><Input id="range-maximum" type="number" min={0} value={form.matchValue} onChange={(e) => setForm({ ...form, matchValue: e.target.value })} /></div>}</div>}
        {!form.isRequired && TEXT_CONDITIONS.has(form.conditionType) && <div><Label htmlFor="match-value">Giá trị điều kiện</Label><Input id="match-value" value={form.matchValue} onChange={(e) => setForm({ ...form, matchValue: e.target.value })} /></div>}
        {!form.isRequired && BOOLEAN_CONDITIONS.has(form.conditionType) && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">Điều kiện này tự động áp dụng khi hồ sơ thỏa trạng thái “{CONDITION_LABELS[form.conditionType]}”, không cần nhập thêm giá trị.</div>}
        <div className="rounded-lg border bg-muted/40 p-3 text-sm"><div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Hiển thị trên danh sách</div><div className="font-medium text-foreground">{conditionPreview}</div></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button onClick={submit} disabled={saveMutation.isPending}>{saveMutation.isPending && <RefreshCw className="mr-2 animate-spin" size={14} />} Lưu quy tắc</Button></div>
      </div></DialogContent></Dialog>
    </div>
  );
}
