import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { contractsApi, billingApi, ticketsApi, tenantsApi, spacesApi, fitoutApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  ShoppingBag, File, Receipt, Ticket, Plus, Send, Building2,
  Calendar, DollarSign, MessageSquare, CheckCircle2, Hammer,
  ArrowRight, User, AlertCircle,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const TICKET_TYPES = [
  { value: 'ELECTRICAL',    label: 'Điện' },
  { value: 'WATER',         label: 'Nước' },
  { value: 'HVAC',          label: 'Điều hòa / thông gió' },
  { value: 'CLEANING',      label: 'Vệ sinh' },
  { value: 'SECURITY',      label: 'An ninh' },
  { value: 'PARKING',       label: 'Bãi đỗ xe' },
  { value: 'INTERNET',      label: 'Internet / mạng' },
  { value: 'DELIVERY',      label: 'Giao hàng / logistics' },
  { value: 'MARKETING_EVENT', label: 'Marketing / sự kiện' },
  { value: 'OTHER',         label: 'Khác' },
];

const PRIORITIES = [
  { value: 'LOW',    label: 'Thấp',       color: 'bg-gray-100 text-gray-600' },
  { value: 'MEDIUM', label: 'Trung bình', color: 'bg-blue-100 text-gray-700' },
  { value: 'HIGH',   label: 'Cao',        color: 'bg-orange-100 text-orange-700' },
  { value: 'URGENT', label: 'Khẩn cấp',  color: 'bg-red-100 text-red-700' },
];

const TICKET_STATUS: Record<string, { label: string; color: string }> = {
  NEW:            { label: 'Mới',           color: 'bg-gray-100 text-gray-700' },
  ASSIGNED:       { label: 'Đã giao',       color: 'bg-blue-100 text-gray-700' },
  IN_PROGRESS:    { label: 'Đang xử lý',   color: 'bg-yellow-100 text-yellow-700' },
  WAITING_TENANT: { label: 'Chờ KH',       color: 'bg-purple-100 text-purple-700' },
  RESOLVED:       { label: 'Đã giải quyết', color: 'bg-green-100 text-green-700' },
  CLOSED:         { label: 'Đóng',         color: 'bg-gray-200 text-gray-600' },
};

const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT:   { label: 'Draft',    color: 'bg-gray-100 text-gray-600' },
  ISSUED:  { label: 'Đã phát', color: 'bg-blue-100 text-gray-700' },
  PAID:    { label: 'Đã TT',   color: 'bg-green-100 text-green-700' },
  OVERDUE: { label: 'Quá hạn', color: 'bg-red-100 text-red-700' },
  PARTIAL: { label: 'TT 1 phần', color: 'bg-yellow-100 text-yellow-700' },
};

const FITOUT_STATUS_STEPS = [
  { key: 'CONTRACT_SIGNED',     label: 'Ký HĐ',       step: 1 },
  { key: 'SUBMIT_DESIGN',       label: 'Nộp TK',       step: 2 },
  { key: 'DESIGN_REVIEW',       label: 'Duyệt TK',     step: 3 },
  { key: 'FIRE_SAFETY_REVIEW',  label: 'PCCC',          step: 4 },
  { key: 'CONSTRUCTION_PERMIT', label: 'Giấy phép',     step: 5 },
  { key: 'FITOUT_IN_PROGRESS',  label: 'Thi công',      step: 6 },
  { key: 'INSPECTION',          label: 'Kiểm tra',      step: 7 },
  { key: 'APPROVED_TO_OPEN',    label: 'Chấp thuận',    step: 8 },
  { key: 'OPENED',              label: 'Khai trương',   step: 9 },
];

const FITOUT_COLOR: Record<string, string> = {
  CONTRACT_SIGNED: 'bg-gray-100 text-gray-700', SUBMIT_DESIGN: 'bg-blue-100 text-gray-700',
  DESIGN_REVIEW: 'bg-gray-100 text-gray-700', FIRE_SAFETY_REVIEW: 'bg-red-100 text-red-700',
  CONSTRUCTION_PERMIT: 'bg-yellow-100 text-yellow-700', FITOUT_IN_PROGRESS: 'bg-orange-100 text-orange-700',
  INSPECTION: 'bg-purple-100 text-purple-700', APPROVED_TO_OPEN: 'bg-teal-100 text-teal-700',
  OPENED: 'bg-green-100 text-green-700',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(n) + ' ₫';
}

function fmtFull(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getFitoutProgress(status: string) {
  const s = FITOUT_STATUS_STEPS.find((x) => x.key === status);
  return s ? ((s.step - 1) / (FITOUT_STATUS_STEPS.length - 1)) * 100 : 0;
}

// ─── Create Ticket Dialog ────────────────────────────────────────────────────

function CreateTicketDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: { tenantId: '', unitId: '', type: '', priority: 'MEDIUM', subject: '', description: '' },
  });
  const selectedTenantId = watch('tenantId');

  const { data: tenantsData } = useQuery({
    queryKey: ['tenants-all'],
    queryFn: () => tenantsApi.listTenants({ limit: 200 }),
    enabled: open,
  });
  const { data: unitsData } = useQuery({
    queryKey: ['units-occupied'],
    queryFn: () => spacesApi.listUnits({ status: 'OCCUPIED', limit: 500 }),
    enabled: open,
  });

  const tenants: any[] = tenantsData?.data ?? [];
  const allUnits: any[] = unitsData?.data ?? [];

  const mutation = useMutation({
    mutationFn: (data: any) => ticketsApi.createTicket(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-tickets'] });
      toast({ title: 'Yêu cầu đã được tạo' });
      reset();
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi tạo yêu cầu', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo yêu cầu mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          {/* Tenant */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Khách thuê *</label>
            <Select onValueChange={(v) => { setValue('tenantId', v); setValue('unitId', ''); }}>
              <SelectTrigger className={errors.tenantId ? 'border-red-400' : ''}>
                <SelectValue placeholder="Chọn khách thuê..." />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.brandName} — {t.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register('tenantId', { required: true })} />
          </div>

          {/* Unit */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Mặt bằng *</label>
            <Select
              onValueChange={(v) => setValue('unitId', v)}
              disabled={!selectedTenantId}
            >
              <SelectTrigger className={errors.unitId ? 'border-red-400' : ''}>
                <SelectValue placeholder={selectedTenantId ? 'Chọn mặt bằng...' : 'Chọn khách thuê trước'} />
              </SelectTrigger>
              <SelectContent>
                {allUnits.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.code} — {u.floor?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register('unitId', { required: true })} />
          </div>

          {/* Type + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Loại yêu cầu *</label>
              <Select onValueChange={(v) => setValue('type', v)}>
                <SelectTrigger className={errors.type ? 'border-red-400' : ''}>
                  <SelectValue placeholder="Loại..." />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" {...register('type', { required: true })} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Mức độ ưu tiên</label>
              <Select defaultValue="MEDIUM" onValueChange={(v) => setValue('priority', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Tiêu đề *</label>
            <Input
              {...register('subject', { required: true })}
              placeholder="Mô tả ngắn gọn vấn đề..."
              className={errors.subject ? 'border-red-400' : ''}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Chi tiết</label>
            <Textarea
              {...register('description')}
              placeholder="Mô tả chi tiết vấn đề, vị trí, thời gian xảy ra..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              <Send size={14} /> Gửi yêu cầu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ticket Detail Sheet ─────────────────────────────────────────────────────

function TicketDetailSheet({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [comment, setComment] = useState('');

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['portal-ticket-detail', ticketId],
    queryFn: () => ticketsApi.getTicket(ticketId!),
    enabled: !!ticketId,
  });

  const t: any = ticket?.data ?? ticket;
  const comments: any[] = t?.comments ?? [];
  const statusInfo = t ? TICKET_STATUS[t.status] : null;
  const priorityInfo = t ? PRIORITIES.find((p) => p.value === t.priority) : null;

  const commentMutation = useMutation({
    mutationFn: (text: string) => ticketsApi.addComment(ticketId!, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-ticket-detail', ticketId] });
      qc.invalidateQueries({ queryKey: ['portal-tickets'] });
      setComment('');
      toast({ title: 'Đã thêm bình luận' });
    },
    onError: () => toast({ title: 'Lỗi thêm bình luận', variant: 'destructive' }),
  });

  return (
    <Sheet
      open={!!ticketId}
      onClose={onClose}
      title={t?.subject ?? 'Đang tải...'}
      subtitle={t?.ticketNumber}
    >
      {isLoading ? (
        <div className="px-6 pt-4 space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : t && (
        <div className="px-6 pb-8 space-y-4 pt-4">
          {/* Status + priority */}
          <div className="flex items-center gap-2">
            {statusInfo && (
              <Badge className={`${statusInfo.color} border-0`}>{statusInfo.label}</Badge>
            )}
            {priorityInfo && (
              <Badge className={`${priorityInfo.color} border-0`}>{priorityInfo.label}</Badge>
            )}
          </div>

          <SheetSection label="CHI TIẾT">
            <SheetRow label="Khách thuê"  value={t.tenant?.brandName}      icon={Building2} />
            <SheetRow label="Mặt bằng"   value={t.unit?.code}             icon={Building2} />
            <SheetRow label="Loại"        value={TICKET_TYPES.find((x) => x.value === t.type)?.label ?? t.type} icon={Ticket} />
            <SheetRow label="Phụ trách"  value={t.assignedTo?.fullName}   icon={User} />
            <SheetRow label="Ngày tạo"   value={fmtDate(t.createdAt)}     icon={Calendar} />
            {t.resolvedAt && (
              <SheetRow label="Ngày giải quyết" value={fmtDate(t.resolvedAt)} icon={CheckCircle2} />
            )}
          </SheetSection>

          {t.description && (
            <div>
              <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2">MÔ TẢ</div>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">{t.description}</p>
            </div>
          )}

          {/* Comments */}
          <div>
            <div className="text-xs font-semibold tracking-wider text-gray-400 mb-3">
              BÌNH LUẬN ({comments.length})
            </div>
            {comments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-lg">
                Chưa có bình luận
              </p>
            ) : (
              <div className="space-y-2 mb-3">
                {comments.map((c: any) => (
                  <div key={c.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        {c.author?.fullName ?? 'Unknown'}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDate(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{c.text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment */}
            <div className="flex gap-2 mt-3">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Thêm bình luận..."
                rows={2}
                className="text-sm resize-none"
              />
              <Button
                size="sm"
                className="self-end shrink-0"
                onClick={() => comment.trim() && commentMutation.mutate(comment.trim())}
                disabled={!comment.trim() || commentMutation.isPending}
              >
                <Send size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ─── Invoice Payment Dialog ───────────────────────────────────────────────────

function RecordPaymentDialog({ invoice, onClose }: { invoice: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, reset, setValue: setPayVal } = useForm({
    defaultValues: { amount: invoice?.totalAmount ?? '', paymentDate: new Date().toISOString().slice(0, 10), method: 'BANK_TRANSFER', reference: '' },
  });

  const mutation = useMutation({
    mutationFn: (data: any) => billingApi.recordPayment(invoice.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-invoices'] });
      toast({ title: 'Đã ghi nhận thanh toán' });
      reset();
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  if (!invoice) return null;

  return (
    <Dialog open={!!invoice} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ghi nhận thanh toán</DialogTitle>
        </DialogHeader>
        <div className="mb-3 p-3 bg-gray-50 rounded-lg text-sm">
          <p className="font-medium text-blue-800">{invoice.invoiceNumber}</p>
          <p className="text-gray-700 mt-0.5">Tổng: {fmtFull(invoice.totalAmount)}</p>
        </div>
        <form onSubmit={handleSubmit((d) => mutation.mutate({ ...d, amount: Number(d.amount) }))} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Số tiền (₫)</label>
            <Input {...register('amount', { required: true })} type="number" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Ngày thanh toán</label>
            <Input {...register('paymentDate', { required: true })} type="date" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Phương thức</label>
            <Select defaultValue="BANK_TRANSFER" onValueChange={(v) => setPayVal('method', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK_TRANSFER">Chuyển khoản</SelectItem>
                <SelectItem value="CASH">Tiền mặt</SelectItem>
                <SelectItem value="CHECK">Séc</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Mã tham chiếu</label>
            <Input {...register('reference')} placeholder="Số bút toán, mã giao dịch..." />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              <CheckCircle2 size={14} /> Xác nhận
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TenantPortalPage() {
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<any>(null);
  const [invoiceFilter, setInvoiceFilter] = useState('');
  const [ticketSearch, setTicketSearch] = useState('');

  const { data: contractsData, isLoading: cLoading } = useQuery({
    queryKey: ['portal-contracts'],
    queryFn: () => contractsApi.listContracts({ status: 'ACTIVE', limit: 50 }),
  });

  const { data: invoicesData, isLoading: iLoading } = useQuery({
    queryKey: ['portal-invoices', invoiceFilter],
    queryFn: () => billingApi.listInvoices({ status: invoiceFilter || undefined, limit: 100 }),
  });

  const { data: ticketsData, isLoading: tLoading } = useQuery({
    queryKey: ['portal-tickets', ticketSearch],
    queryFn: () => ticketsApi.listTickets({ search: ticketSearch || undefined, limit: 100 }),
  });

  const { data: fitoutsData } = useQuery({
    queryKey: ['portal-fitouts'],
    queryFn: () => fitoutApi.listFitouts({ limit: 50 }),
  });

  const contracts: any[] = contractsData?.data ?? [];
  const invoices: any[] = invoicesData?.data ?? [];
  const tickets: any[] = ticketsData?.data ?? [];
  const fitouts: any[] = fitoutsData?.data ?? [];

  const overdueInvoices = invoices.filter((i) => i.status === 'OVERDUE');
  const pendingInvoicesTotal = invoices
    .filter((i) => i.status === 'ISSUED' || i.status === 'OVERDUE')
    .reduce((sum, i) => sum + (i.totalAmount ?? 0), 0);
  const openTickets = tickets.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.status));
  const activeFitouts = fitouts.filter((f) => f.status !== 'OPENED');

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-teal-600 p-2.5 rounded-xl">
          <ShoppingBag size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant Portal</h1>
          <p className="text-sm text-gray-500">Quản lý hợp đồng, hóa đơn và yêu cầu vận hành</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="border-0 bg-gray-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <File size={16} className="text-gray-500" />
              <span className="text-xs font-medium text-gray-700">HĐ đang hiệu lực</span>
            </div>
            <p className="text-2xl font-bold text-blue-800">{contracts.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-orange-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Receipt size={16} className="text-orange-500" />
              <span className="text-xs font-medium text-orange-700">Tổng chờ thanh toán</span>
            </div>
            <p className="text-xl font-bold text-orange-800">{fmt(pendingInvoicesTotal)}</p>
          </CardContent>
        </Card>
        <Card className={`border-0 ${overdueInvoices.length > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} className={overdueInvoices.length > 0 ? 'text-red-500' : 'text-gray-400'} />
              <span className={`text-xs font-medium ${overdueInvoices.length > 0 ? 'text-red-700' : 'text-gray-600'}`}>
                Hóa đơn quá hạn
              </span>
            </div>
            <p className={`text-2xl font-bold ${overdueInvoices.length > 0 ? 'text-red-800' : 'text-gray-700'}`}>
              {overdueInvoices.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-purple-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Ticket size={16} className="text-purple-500" />
              <span className="text-xs font-medium text-purple-700">Yêu cầu đang xử lý</span>
            </div>
            <p className="text-2xl font-bold text-purple-800">{openTickets.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="contracts">
        <TabsList className="mb-4">
          <TabsTrigger value="contracts" className="gap-1.5">
            <File size={13} /> Hợp đồng
            {contracts.length > 0 && (
              <span className="ml-1 text-xs bg-blue-100 text-gray-700 px-1.5 py-0.5 rounded-full">{contracts.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5">
            <Receipt size={13} /> Hóa đơn
            {overdueInvoices.length > 0 && (
              <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{overdueInvoices.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="tickets" className="gap-1.5">
            <MessageSquare size={13} /> Yêu cầu
            {openTickets.length > 0 && (
              <span className="ml-1 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">{openTickets.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="fitout" className="gap-1.5">
            <Hammer size={13} /> Fitout
            {activeFitouts.length > 0 && (
              <span className="ml-1 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">{activeFitouts.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Contracts tab ─────────────────────────────────── */}
        <TabsContent value="contracts">
          {cLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : contracts.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <File size={40} className="mx-auto mb-2 opacity-20" />
              <p>Không có hợp đồng đang hiệu lực</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contracts.map((c: any) => (
                <Card key={c.id} className="border hover:border-gray-200 transition-colors">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-mono text-sm font-medium">{c.contractNumber}</p>
                          <Badge className="bg-green-100 text-green-700 border-0 text-xs">ACTIVE</Badge>
                        </div>
                        <p className="text-sm text-gray-600 font-medium">{c.tenant?.brandName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{c.unit?.code} — {c.unit?.floor?.name}</p>
                        <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
                          </span>
                          <span className="flex items-center gap-1 text-gray-900 font-medium">
                            <DollarSign size={11} />
                            {fmt(c.rent)}/tháng
                          </span>
                        </div>
                      </div>
                      {c.files?.length > 0 && (
                        <div className="text-xs text-gray-400 shrink-0">
                          {c.files.length} file
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Invoices tab ──────────────────────────────────── */}
        <TabsContent value="invoices">
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2">
              {['', 'ISSUED', 'OVERDUE', 'PAID'].map((s) => (
                <button
                  key={s}
                  onClick={() => setInvoiceFilter(s)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors
                    ${invoiceFilter === s
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {s === '' ? 'Tất cả' : INVOICE_STATUS[s]?.label ?? s}
                </button>
              ))}
            </div>
          </div>

          {iLoading ? (
            <Skeleton className="h-48" />
          ) : invoices.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Receipt size={40} className="mx-auto mb-2 opacity-20" />
              <p>Không có hóa đơn</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Số HD</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Khách thuê</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Kỳ</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Tổng tiền</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Hạn TT</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv: any) => {
                    const st = INVOICE_STATUS[inv.status];
                    const isOverdue = inv.status === 'OVERDUE';
                    return (
                      <tr key={inv.id} className={`hover:bg-gray-50 ${isOverdue ? 'bg-red-50/30' : ''}`}>
                        <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 hidden md:table-cell">{inv.tenant?.brandName}</td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{inv.period}</td>
                        <td className="px-4 py-3 text-right font-medium">{fmt(inv.totalAmount)}</td>
                        <td className={`px-4 py-3 text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                          {fmtDate(inv.dueDate)}
                        </td>
                        <td className="px-4 py-3">
                          {st && (
                            <Badge className={`${st.color} border-0 text-xs`}>{st.label}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {(inv.status === 'ISSUED' || inv.status === 'OVERDUE') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => setPayingInvoice(inv)}
                            >
                              <DollarSign size={11} /> Thanh toán
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Tickets tab ───────────────────────────────────── */}
        <TabsContent value="tickets">
          <div className="flex items-center justify-between mb-3">
            <div className="relative flex-1 max-w-xs">
              <Input
                placeholder="Tìm yêu cầu..."
                value={ticketSearch}
                onChange={(e) => setTicketSearch(e.target.value)}
                className="text-sm pl-3"
              />
            </div>
            <Button
              size="sm"
              className="gap-1.5 ml-3"
              onClick={() => setCreateTicketOpen(true)}
            >
              <Plus size={14} /> Tạo yêu cầu
            </Button>
          </div>

          {tLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <MessageSquare size={40} className="mx-auto mb-2 opacity-20" />
              <p className="mb-3">Chưa có yêu cầu nào</p>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setCreateTicketOpen(true)}>
                <Plus size={14} /> Tạo yêu cầu đầu tiên
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((t: any) => {
                const st = TICKET_STATUS[t.status];
                const pr = PRIORITIES.find((p) => p.value === t.priority);
                const typeLabel = TICKET_TYPES.find((x) => x.value === t.type)?.label ?? t.type;
                const isDone = ['RESOLVED', 'CLOSED'].includes(t.status);
                return (
                  <Card
                    key={t.id}
                    className={`cursor-pointer hover:border-gray-200 transition-colors ${isDone ? 'opacity-60' : ''}`}
                    onClick={() => setSelectedTicketId(t.id)}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{t.subject}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                            <span>{t.ticketNumber}</span>
                            <span>·</span>
                            <span>{typeLabel}</span>
                            <span>·</span>
                            <span>{t.tenant?.brandName}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {pr && <Badge className={`${pr.color} border-0 text-xs`}>{pr.label}</Badge>}
                          {st && <Badge className={`${st.color} border-0 text-xs`}>{st.label}</Badge>}
                          <ArrowRight size={14} className="text-gray-300" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Fitout tab ────────────────────────────────────── */}
        <TabsContent value="fitout">
          {fitouts.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Hammer size={40} className="mx-auto mb-2 opacity-20" />
              <p>Không có dự án fitout nào</p>
            </div>
          ) : (
            <div className="space-y-4">
              {fitouts.map((f: any) => {
                const step = FITOUT_STATUS_STEPS.find((s) => s.key === f.status);
                const progress = getFitoutProgress(f.status);
                const curStepNum = step?.step ?? 0;

                return (
                  <Card key={f.id} className="border">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{f.tenant?.brandName}</CardTitle>
                          <p className="text-sm text-gray-500 mt-0.5">{f.unit?.code} — {f.unit?.floor?.name}</p>
                        </div>
                        <Badge className={`${FITOUT_COLOR[f.status] ?? 'bg-gray-100 text-gray-700'} border-0 text-xs`}>
                          {step?.label ?? f.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {/* Progress */}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                          <span>Tiến độ: Bước {curStepNum}/{FITOUT_STATUS_STEPS.length}</span>
                          <span className="font-medium">{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gray-500 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Step timeline */}
                      <div className="flex items-center gap-0.5 overflow-x-auto pb-1 mb-3">
                        {FITOUT_STATUS_STEPS.map((s) => {
                          const isDone = s.step < curStepNum;
                          const isActive = s.key === f.status;
                          return (
                            <span
                              key={s.key}
                              className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap
                                ${isDone ? 'bg-green-100 text-green-700' : isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}
                            >
                              {s.label}
                            </span>
                          );
                        })}
                      </div>

                      {/* Dates */}
                      <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                        {f.handoverDate && (
                          <div>
                            <p className="text-gray-400">Bàn giao</p>
                            <p className="font-medium">{fmtDate(f.handoverDate)}</p>
                          </div>
                        )}
                        {f.startDate && (
                          <div>
                            <p className="text-gray-400">Bắt đầu TC</p>
                            <p className="font-medium">{fmtDate(f.startDate)}</p>
                          </div>
                        )}
                        {f.expectedOpenDate && (
                          <div>
                            <p className="text-gray-400">Dự kiến mở</p>
                            <p className="font-medium text-orange-600">{fmtDate(f.expectedOpenDate)}</p>
                          </div>
                        )}
                      </div>

                      {f.operationManager && (
                        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                          <User size={11} /> OP: {f.operationManager.fullName}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs / Sheets */}
      <CreateTicketDialog open={createTicketOpen} onClose={() => setCreateTicketOpen(false)} />
      <TicketDetailSheet ticketId={selectedTicketId} onClose={() => setSelectedTicketId(null)} />
      <RecordPaymentDialog invoice={payingInvoice} onClose={() => setPayingInvoice(null)} />
    </div>
  );
}
