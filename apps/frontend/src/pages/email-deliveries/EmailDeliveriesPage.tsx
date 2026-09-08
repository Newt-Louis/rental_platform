import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Eye, Mail, RefreshCw, RotateCcw, Search, XCircle } from 'lucide-react';
import { emailDeliveriesApi, EmailDelivery, EmailDeliveryStatus } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

const statusLabels: Record<string, string> = { PENDING: 'Đang chờ', SENDING: 'Đang gửi', SENT: 'Đã gửi', FAILED: 'Gửi thất bại', RETRYING: 'Đang thử lại' };
const statusClass: Record<string, string> = { PENDING: 'bg-slate-100 text-slate-700', SENDING: 'bg-blue-100 text-blue-700', SENT: 'bg-emerald-100 text-emerald-700', FAILED: 'bg-red-100 text-red-700', RETRYING: 'bg-amber-100 text-amber-700' };
const unwrap = (value: any) => Array.isArray(value) ? value : (value?.data ?? value?.items ?? []);
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '—';

function StatusBadge({ status }: { status: EmailDeliveryStatus }) {
  const help = status === 'SENT' ? 'MÃ¡y chá»§ thÆ° Ä‘Ã£ cháº¥p nháº­n email. Äiá»u nÃ y khÃ´ng xÃ¡c nháº­n ngÆ°á»i nháº­n Ä‘Ã£ Ä‘á»c email.' : undefined;
  return <Badge title={help} className={`border-0 text-xs ${statusClass[status] ?? 'bg-gray-100 text-gray-700'}`}>{statusLabels[status] ?? status}</Badge>;
}

function DeliveryDetail({ delivery, onClose }: { delivery: EmailDelivery | null; onClose: () => void }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const operationId = useRef<string>();
  const preview = useQuery({ queryKey: ['email-delivery-preview', delivery?.id], queryFn: () => emailDeliveriesApi.preview(delivery!.id), enabled: previewOpen && !!delivery });
  const action = useMutation({
    mutationFn: (kind: 'retry' | 'resend') => {
      operationId.current ??= crypto.randomUUID();
      return kind === 'retry'
        ? emailDeliveriesApi.retry(delivery!.id, operationId.current)
        : emailDeliveriesApi.resend(delivery!.id, operationId.current);
    },
    onSuccess: (_, kind) => { toast({ title: kind === 'retry' ? 'Đã tạo lần thử gửi lại' : 'Đã tạo yêu cầu gửi lại' }); qc.invalidateQueries({ queryKey: ['email-deliveries'] }); qc.invalidateQueries({ queryKey: ['email-delivery', delivery?.id] }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể thực hiện thao tác', variant: 'destructive' }),
    onSettled: () => { operationId.current = undefined; },
  });
  if (!delivery) return null;
  const canRetry = delivery.capabilities?.canRetry ?? false;
  const canResend = delivery.capabilities?.canResend ?? false;
  const resendLabel = delivery.capabilities?.resendMode === 'REGENERATE_DOMAIN_TOKEN'
    ? 'Gửi lại thư kích hoạt'
    : 'Gửi lại';
  return <>
    <Dialog open={!!delivery} onOpenChange={(v) => !v && onClose()}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail size={18} /> Chi tiết email</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div><span className="text-muted-foreground">Trạng thái</span><div className="mt-1"><StatusBadge status={delivery.status} /></div></div>
        <div><span className="text-muted-foreground">Người nhận</span><div className="font-medium break-all">{delivery.recipient ?? '—'}</div></div>
        <div className="sm:col-span-2"><span className="text-muted-foreground">Tiêu đề</span><div className="font-medium break-words">{delivery.subject ?? '—'}</div></div>
        <div><span className="text-muted-foreground">Sự kiện</span><div>{delivery.eventType ?? '—'}</div></div><div><span className="text-muted-foreground">Mall</span><div>{delivery.mall?.name ?? delivery.mallId ?? '—'}</div></div>
        <div><span className="text-muted-foreground">Bản ghi liên quan</span><div>{delivery.entityType ?? '—'} {delivery.entityId ? `#${delivery.entityId.slice(0, 8)}` : ''}</div></div><div><span className="text-muted-foreground">Số lần thử</span><div>{delivery.attemptCount ?? 0}</div></div>
        <div><span className="text-muted-foreground">Tạo lúc</span><div>{fmt(delivery.createdAt)}</div></div><div><span className="text-muted-foreground">Đã gửi lúc</span><div>{fmt(delivery.sentAt)}</div></div>
        {delivery.providerMessageId && <div className="sm:col-span-2"><span className="text-muted-foreground">Provider message ID</span><div className="font-mono text-xs break-all">{delivery.providerMessageId}</div></div>}
        {delivery.lastError && <div className="sm:col-span-2 rounded-md bg-red-50 text-red-800 p-3 text-xs break-words"><strong>Lỗi gần nhất:</strong> {delivery.lastError}</div>}
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}><Eye size={14} className="mr-1" /> Xem nội dung</Button>
        {canRetry && <Button variant="warning" size="sm" disabled={action.isPending} onClick={() => action.mutate('retry')}><RotateCcw size={14} className="mr-1" /> Thử gửi lại</Button>}
        {canResend && <Button variant="default" size="sm" disabled={action.isPending} onClick={() => window.confirm('Email này đã được gửi thành công trước đó. Bạn có chắc muốn gửi lại?') && action.mutate('resend')}><RefreshCw size={14} className="mr-1" /> {resendLabel}</Button>}
      </div>
    </DialogContent></Dialog>
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-w-4xl h-[85vh]"><DialogHeader><DialogTitle>Xem nội dung email</DialogTitle></DialogHeader>{preview.isLoading ? <Skeleton className="h-full" /> : preview.data?.html ? <iframe title="Email preview" sandbox="" srcDoc={preview.data.html} className="w-full flex-1 min-h-0 rounded border" /> : <pre className="whitespace-pre-wrap text-sm overflow-auto">{preview.data?.text ?? preview.data?.plaintext ?? 'Không có nội dung xem trước'}</pre>}</DialogContent></Dialog>
  </>;
}

export default function EmailDeliveriesPage() {
  const [filters, setFilters] = useState({ status: '', eventType: '', recipient: '', mallId: '', dateFrom: '', dateTo: '' });
  const [selected, setSelected] = useState<EmailDelivery | null>(null);
  const query = useQuery({ queryKey: ['email-deliveries', filters], queryFn: () => emailDeliveriesApi.list(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))) });
  const rows: EmailDelivery[] = unwrap(query.data);
  const set = (key: keyof typeof filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold">Email Delivery</h1><p className="text-sm text-muted-foreground mt-1">Theo dõi trạng thái chấp nhận email bởi máy chủ thư.</p></div>
    <Card><CardContent className="pt-4 flex flex-wrap gap-2">
      <Select value={filters.status} onValueChange={(v) => set('status', v)}><SelectTrigger className="w-36 h-9"><SelectValue placeholder="Trạng thái" /></SelectTrigger><SelectContent><SelectItem value="">Tất cả</SelectItem>{Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      <Input className="w-40 h-9" placeholder="Event type" value={filters.eventType} onChange={(e) => set('eventType', e.target.value)} /><Input className="w-52 h-9" placeholder="Người nhận" value={filters.recipient} onChange={(e) => set('recipient', e.target.value)} /><Input className="w-36 h-9" placeholder="Mall ID" value={filters.mallId} onChange={(e) => set('mallId', e.target.value)} /><Input type="date" className="w-36 h-9" value={filters.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} /><Input type="date" className="w-36 h-9" value={filters.dateTo} onChange={(e) => set('dateTo', e.target.value)} />
    </CardContent></Card>
    {query.isLoading ? <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> : query.isError ? <Card><CardContent className="py-12 text-center text-red-600"><XCircle className="mx-auto mb-2" />Không thể tải danh sách email</CardContent></Card> : <div className="rounded-lg border bg-card overflow-x-auto"><table className="w-full text-sm min-w-[980px]"><thead className="bg-muted/60"><tr>{['Trạng thái','Thời gian','Event','Người nhận','Tiêu đề','Liên quan','Mall','Lần thử','Lỗi','Thao tác'].map((h) => <th key={h} className="text-left px-3 py-3 font-medium text-muted-foreground">{h}</th>)}</tr></thead><tbody className="divide-y">{rows.map((r) => <tr key={r.id} className="hover:bg-muted/40"><td className="px-3 py-3"><StatusBadge status={r.status} /></td><td className="px-3 py-3 text-xs whitespace-nowrap">{fmt(r.createdAt)}</td><td className="px-3 py-3 font-mono text-xs">{r.eventType ?? '—'}</td><td className="px-3 py-3 max-w-48 truncate">{r.recipient ?? '—'}</td><td className="px-3 py-3 max-w-56 truncate">{r.subject ?? '—'}</td><td className="px-3 py-3 text-xs">{r.entityType ?? '—'} {r.entityId ? `#${r.entityId.slice(0, 6)}` : ''}</td><td className="px-3 py-3">{r.mall?.name ?? r.mallId ?? '—'}</td><td className="px-3 py-3 text-center">{r.attemptCount ?? 0}</td><td className="px-3 py-3 max-w-48 truncate text-xs text-red-600">{r.lastError ?? '—'}</td><td className="px-3 py-3"><Button size="sm" variant="outline" onClick={() => setSelected(r)}>Chi tiết</Button></td></tr>)}</tbody></table>{rows.length === 0 && <div className="py-12 text-center text-muted-foreground"><Search className="mx-auto mb-2 opacity-40" />Không có bản ghi phù hợp</div>}</div>}
    <DeliveryDetail delivery={selected} onClose={() => setSelected(null)} />
  </div>;
}
