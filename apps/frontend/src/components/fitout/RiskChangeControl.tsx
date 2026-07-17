import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fitoutChangeOrderApi,
  fitoutRiskApi,
  type FitoutChangeOrder,
  type FitoutRisk,
  type FitoutRiskStatus,
} from '@/api/fitout';
import { CircleDollarSign, Plus, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

const unwrapList = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  const data = (value as { data?: unknown } | undefined)?.data;
  return Array.isArray(data) ? data as T[] : [];
};

const money = (value?: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
    .format(Number(value) || 0);

const riskTone = (score: number) => {
  if (score >= 16) return { label: 'Nghiêm trọng', className: 'bg-red-100 text-red-700' };
  if (score >= 10) return { label: 'Cao', className: 'bg-orange-100 text-orange-700' };
  if (score >= 5) return { label: 'Trung bình', className: 'bg-amber-100 text-amber-700' };
  return { label: 'Thấp', className: 'bg-emerald-100 text-emerald-700' };
};

const errorMessage = (error: any) =>
  error?.response?.data?.message ?? 'Không thể cập nhật dữ liệu. Vui lòng thử lại.';

export function RiskRegister({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', category: 'SAFETY', probability: '3', impact: '3',
    mitigation: '', dueDate: '',
  });
  const queryKey = ['fitout-risks', projectId];
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fitoutRiskApi.list(projectId),
  });
  const risks = unwrapList<FitoutRisk>(data);
  const openRisks = risks.filter((risk) => risk.status !== 'CLOSED');
  const critical = openRisks.filter((risk) => risk.probability * risk.impact >= 16).length;

  const createMutation = useMutation({
    mutationFn: () => fitoutRiskApi.create({
      projectId,
      title: form.title.trim(),
      category: form.category,
      probability: Number(form.probability),
      impact: Number(form.impact),
      mitigation: form.mitigation.trim() || undefined,
      dueDate: form.dueDate || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setForm({ title: '', category: 'SAFETY', probability: '3', impact: '3', mitigation: '', dueDate: '' });
      setShowForm(false);
      toast({ title: 'Đã thêm rủi ro vào Risk Register' });
    },
    onError: (error) => toast({ title: errorMessage(error), variant: 'destructive' }),
  });
  const transitionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FitoutRiskStatus }) =>
      fitoutRiskApi.transition(projectId, id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (error) => toast({ title: errorMessage(error), variant: 'destructive' }),
  });

  return (
    <section aria-labelledby="risk-register-title" className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Đang mở</div><div className="text-xl font-semibold">{openRisks.length}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Nghiêm trọng</div><div className="text-xl font-semibold text-red-600">{critical}</div></CardContent></Card>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 id="risk-register-title" className="font-semibold">Risk Register</h3>
          <p className="text-xs text-muted-foreground">Đánh giá xác suất × tác động và theo dõi biện pháp giảm thiểu.</p>
        </div>
        <Button size="sm" className="gap-1 shrink-0" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
          <Plus size={14} /> Thêm
        </Button>
      </div>
      {showForm && (
        <Card><CardContent className="p-4 space-y-3">
          <div><Label htmlFor="risk-title">Tên rủi ro *</Label><Input id="risk-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><Label>Nhóm</Label><Select value={form.category} onValueChange={(category) => setForm({ ...form, category })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SAFETY">An toàn</SelectItem><SelectItem value="COST">Chi phí</SelectItem><SelectItem value="SCHEDULE">Tiến độ</SelectItem><SelectItem value="QUALITY">Chất lượng</SelectItem><SelectItem value="COMPLIANCE">Tuân thủ</SelectItem></SelectContent></Select></div>
            <div><Label>Xác suất (1–5)</Label><Select value={form.probability} onValueChange={(probability) => setForm({ ...form, probability })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4,5].map((n) => <SelectItem key={n} value={`${n}`}>{n}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Tác động (1–5)</Label><Select value={form.impact} onValueChange={(impact) => setForm({ ...form, impact })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4,5].map((n) => <SelectItem key={n} value={`${n}`}>{n}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label htmlFor="risk-due">Hạn xử lý</Label><Input id="risk-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          <div><Label htmlFor="risk-mitigation">Biện pháp giảm thiểu</Label><Textarea id="risk-mitigation" value={form.mitigation} onChange={(e) => setForm({ ...form, mitigation: e.target.value })} /></div>
          <Button className="w-full" disabled={!form.title.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>Lưu rủi ro</Button>
        </CardContent></Card>
      )}
      {isLoading && <p role="status" className="text-sm text-muted-foreground">Đang tải Risk Register…</p>}
      {isError && <p role="alert" className="text-sm text-red-600">Không tải được Risk Register.</p>}
      {!isLoading && !isError && risks.length === 0 && <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Chưa ghi nhận rủi ro cho dự án.</div>}
      <div className="space-y-2">
        {risks.map((risk) => {
          const score = risk.probability * risk.impact;
          const tone = riskTone(score);
          const ownerName = typeof risk.owner === 'string' ? risk.owner : risk.owner?.fullName;
          return <Card key={risk.id}><CardContent className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2"><div className="flex items-start gap-2 min-w-0"><ShieldAlert size={16} className="mt-0.5 text-amber-600 shrink-0" /><div><p className="text-sm font-medium">{risk.title}</p><p className="text-xs text-muted-foreground">{risk.category || 'Khác'} · {ownerName || 'Chưa phân công'}</p></div></div><Badge className={tone.className}>{tone.label} {score}</Badge></div>
            {risk.mitigation && <p className="text-xs rounded bg-muted p-2">{risk.mitigation}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{risk.dueDate ? `Hạn ${new Date(risk.dueDate).toLocaleDateString('vi-VN')}` : 'Chưa có hạn'}</span><Select value={risk.status} onValueChange={(status) => transitionMutation.mutate({ id: risk.id, status: status as FitoutRiskStatus })}><SelectTrigger className="h-8 w-36" aria-label={`Trạng thái ${risk.title}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="OPEN">Đang mở</SelectItem><SelectItem value="MITIGATING">Đang giảm thiểu</SelectItem><SelectItem value="CLOSED">Đã đóng</SelectItem></SelectContent></Select></div>
          </CardContent></Card>;
        })}
      </div>
    </section>
  );
}

export function ChangeOrderControl({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', reason: '', estimatedCost: '', scheduleImpactDays: '0' });
  const queryKey = ['fitout-change-orders', projectId];
  const { data, isLoading, isError } = useQuery({ queryKey, queryFn: () => fitoutChangeOrderApi.list(projectId) });
  const orders = unwrapList<FitoutChangeOrder>(data);
  const totals = useMemo(() => ({
    pending: orders.filter((order) => ['SUBMITTED', 'UNDER_REVIEW'].includes(order.status)).length,
    estimated: orders.reduce((sum, order) => sum + Number(order.estimatedCost || 0), 0),
    approved: orders.filter((order) => order.status === 'APPROVED').reduce((sum, order) => sum + Number(order.approvedCost ?? order.estimatedCost ?? 0), 0),
  }), [orders]);
  const createMutation = useMutation({
    mutationFn: () => fitoutChangeOrderApi.create({ projectId, title: form.title.trim(), reason: form.reason.trim() || undefined, estimatedCost: Number(form.estimatedCost), scheduleImpactDays: Number(form.scheduleImpactDays) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); setShowForm(false); setForm({ title: '', reason: '', estimatedCost: '', scheduleImpactDays: '0' }); toast({ title: 'Đã tạo Change Order' }); },
    onError: (error) => toast({ title: errorMessage(error), variant: 'destructive' }),
  });
  const transitionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
      fitoutChangeOrderApi.transition(projectId, id, status, {
        approvedCost: status === 'APPROVED'
          ? Number(orders.find((order) => order.id === id)?.estimatedCost ?? 0)
          : undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (error) => toast({ title: errorMessage(error), variant: 'destructive' }),
  });

  return <section aria-labelledby="change-order-title" className="space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Chờ xử lý</div><div className="text-xl font-semibold">{totals.pending}</div></CardContent></Card><Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Đề xuất</div><div className="text-base font-semibold">{money(totals.estimated)}</div></CardContent></Card><Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Đã duyệt</div><div className="text-base font-semibold text-emerald-700">{money(totals.approved)}</div></CardContent></Card></div>
    <div className="flex items-center justify-between gap-2"><div><h3 id="change-order-title" className="font-semibold">Change Order & Cost Control</h3><p className="text-xs text-muted-foreground">Kiểm soát thay đổi phạm vi, ngân sách và tác động tiến độ.</p></div><Button size="sm" className="gap-1 shrink-0" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}><Plus size={14} /> Thêm</Button></div>
    {showForm && <Card><CardContent className="p-4 space-y-3"><div><Label htmlFor="co-title">Nội dung thay đổi *</Label><Input id="co-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div><div><Label htmlFor="co-reason">Lý do / phạm vi</Label><Textarea id="co-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label htmlFor="co-cost">Chi phí dự kiến (VND) *</Label><Input id="co-cost" inputMode="numeric" type="number" min="0" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} /></div><div><Label htmlFor="co-days">Tác động tiến độ (ngày)</Label><Input id="co-days" type="number" min="0" value={form.scheduleImpactDays} onChange={(e) => setForm({ ...form, scheduleImpactDays: e.target.value })} /></div></div><p className="text-xs text-muted-foreground">Người đề xuất được ghi nhận tự động theo tài khoản đang đăng nhập.</p><Button className="w-full" disabled={!form.title.trim() || !form.estimatedCost || createMutation.isPending} onClick={() => createMutation.mutate()}>Lưu Change Order</Button></CardContent></Card>}
    {isLoading && <p role="status" className="text-sm text-muted-foreground">Đang tải Change Order…</p>}
    {isError && <p role="alert" className="text-sm text-red-600">Không tải được Change Order.</p>}
    {!isLoading && !isError && orders.length === 0 && <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Chưa có yêu cầu thay đổi.</div>}
    <div className="space-y-2">{orders.map((order) => {
      const requesterName = typeof order.requestedBy === 'string' ? order.requestedBy : order.requestedBy?.fullName;
      return <Card key={order.id}><CardContent className="p-3 space-y-2"><div className="flex items-start justify-between gap-2"><div className="flex gap-2 min-w-0"><CircleDollarSign size={16} className="mt-0.5 text-blue-600 shrink-0" /><div><p className="text-sm font-medium">{order.code ? `${order.code} · ` : ''}{order.title}</p><p className="text-xs text-muted-foreground">{requesterName || 'Chưa rõ người đề xuất'}</p></div></div><Badge variant="outline">{order.status}</Badge></div>{order.reason && <p className="text-xs rounded bg-muted p-2">{order.reason}</p>}<div className="grid grid-cols-2 gap-2 text-xs"><div><span className="text-muted-foreground">Chi phí</span><p className="font-medium">{money(order.approvedCost ?? order.estimatedCost)}</p></div><div><span className="text-muted-foreground">Tiến độ</span><p className="font-medium">{order.scheduleImpactDays || 0} ngày</p></div></div>{['SUBMITTED', 'UNDER_REVIEW'].includes(order.status) && <Select onValueChange={(status) => transitionMutation.mutate({ id: order.id, status: status as 'APPROVED' | 'REJECTED' })}><SelectTrigger className="h-8 w-full" aria-label={`Quyết định ${order.title}`}><SelectValue placeholder="Chọn quyết định" /></SelectTrigger><SelectContent><SelectItem value="APPROVED">Phê duyệt</SelectItem><SelectItem value="REJECTED">Từ chối</SelectItem></SelectContent></Select>}</CardContent></Card>;
    })}</div>
  </section>;
}
