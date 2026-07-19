import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingApi } from '@/api';
import { useAuthStore } from '@/store/auth.store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScheduleTab, DunningTab, CollectionKpiTab } from './BillingExtraTabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  Search, Download, Receipt, ChevronRight, Plus, Trash2, Send,
  CheckCircle2, Banknote, FileText, Zap, Droplets, Settings, Package,
  AlertTriangle, Clock, X, Edit2, ChevronDown, ArrowRight, Ban, Undo2,
  Sparkles, Activity, ShieldCheck, TrendingUp,
} from 'lucide-react';
import api from '@/lib/axios';
import type { Invoice, ArAgingRow } from '@/types';
import { ConfirmDialog } from '@/components/spaces/dialogs/ConfirmDialog';
import { ReasonActionDialog } from '@/components/ui/reason-action-dialog';
import { AsyncState } from '@/components/ui/async-state';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string; step: number }> = {
  DRAFT:          { label: 'Bản nháp',        color: 'bg-gray-100 text-gray-700 border-gray-200',     step: 1 },
  ISSUED:         { label: 'Đã gửi khách',    color: 'bg-blue-100 text-blue-700 border-blue-200',     step: 3 },
  PARTIALLY_PAID: { label: 'Thanh toán 1 phần', color: 'bg-amber-100 text-amber-700 border-amber-200', step: 4 },
  PAID:           { label: 'Đã thanh toán',   color: 'bg-green-100 text-green-700 border-green-200',  step: 4 },
  OVERDUE:        { label: 'Quá hạn',         color: 'bg-red-100 text-red-700 border-red-200',        step: 3 },
  CANCELLED:      { label: 'Hủy',             color: 'bg-gray-200 text-gray-500 border-gray-300',     step: 0 },
};

const LINE_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; unit?: string; isFixed?: boolean }> = {
  RENT:           { label: 'Tiền thuê mặt bằng', icon: Receipt,    isFixed: true },
  CAM:            { label: 'Phí quản lý (CAM)',   icon: Settings,   isFixed: true },
  DEPOSIT:        { label: 'Đặt cọc',             icon: Banknote,   isFixed: true },
  ELECTRICITY:    { label: 'Tiền điện',           icon: Zap,        unit: 'kWh'  },
  WATER:          { label: 'Tiền nước',           icon: Droplets,   unit: 'm³'   },
  MANAGEMENT_FEE: { label: 'Phí quản lý bổ sung', icon: Settings                },
  PARKING:        { label: 'Phí đỗ xe',           icon: Package                 },
  CLEANING:       { label: 'Phí vệ sinh',         icon: Settings                },
  SECURITY:       { label: 'Phí bảo vệ',         icon: Settings                },
  MARKETING_FEE:  { label: 'Phí marketing',       icon: Package                 },
  OTHER:          { label: 'Chi phí khác',        icon: Package                 },
};

const VARIABLE_LINE_TYPES = Object.entries(LINE_TYPE_CONFIG)
  .filter(([, v]) => !v.isFixed)
  .map(([k, v]) => ({ value: k, label: v.label }));

function fmtMoney(n?: number | null) {
  if (!n) return '—';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';
}
function fmtCompact(n: number) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
function fmtDate(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Workflow Steps Bar ────────────────────────────────────────────────────────

function WorkflowBar({ active }: { active?: number }) {
  const steps = [
    { n: 1, label: 'Hệ thống tạo\nbản draft', desc: 'Theo chu kỳ hợp đồng', color: 'gray' },
    { n: 2, label: 'Vận hành bổ sung\nchi phí biến đổi', desc: 'Điện, nước, dịch vụ', color: 'blue' },
    { n: 3, label: 'Gửi cho\nkhách hàng', desc: 'Issue → ISSUED', color: 'violet' },
    { n: 4, label: 'Kế toán ghi nhận\nthanh toán', desc: 'Thu tiền → PAID', color: 'green' },
  ];
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-200 text-gray-600', blue: 'bg-blue-600 text-white',
    violet: 'bg-violet-600 text-white', green: 'bg-emerald-600 text-white',
  };
  return (
    <div className="flex items-stretch gap-0 mb-6 rounded-xl overflow-hidden border border-gray-100">
      {steps.map((s, i) => {
        const isActive = s.n === active;
        return (
          <div key={s.n} className={`flex-1 flex items-center gap-3 px-4 py-3 ${
            isActive ? 'bg-blue-50 border-b-2 border-blue-500' : 'bg-white'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              isActive ? colorMap[s.color] : 'bg-gray-100 text-gray-400'
            }`}>{s.n}</div>
            <div>
              <div className="text-xs font-semibold text-gray-800 whitespace-pre-line leading-tight">{s.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.desc}</div>
            </div>
            {i < steps.length - 1 && (
              <ArrowRight size={14} className="ml-auto text-gray-300 flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Record Payment Dialog ─────────────────────────────────────────────────────

function RecordPaymentDialog({ invoice, open, onClose }: {
  invoice: any; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ amount: '', method: 'BANK_TRANSFER', reference: '', paidAt: '', notes: '' });
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const remaining = invoice ? (invoice.totalAmount - (invoice.totalPaid ?? 0)) : 0;

  const mutation = useMutation({
    mutationFn: () => billingApi.recordPayment(invoice.id, {
      amount: Number(form.amount),
      method: form.method,
      reference: form.reference || undefined,
      paidAt: form.paidAt || undefined,
      notes: form.notes || undefined,
    }, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoice.id] });
      toast({ title: 'Đã ghi nhận thanh toán' });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote size={16} className="text-green-600" /> Ghi nhận thanh toán
          </DialogTitle>
          {invoice && (
            <p className="text-sm text-gray-500">
              {invoice.invoiceNumber} · {invoice.tenant?.brandName} · Còn lại: {fmtMoney(remaining)}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-sm font-medium mb-1 block">Số tiền thanh toán *</label>
            <Input type="number" value={form.amount}
              onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))}
              placeholder={remaining.toString()} />
            <button className="text-xs text-blue-600 mt-1"
              onClick={() => setForm(p => ({ ...p, amount: remaining.toString() }))}>
              Điền đủ số tiền còn lại ({fmtMoney(remaining)})
            </button>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Phương thức</label>
            <Select value={form.method} onValueChange={(v) => setForm(p => ({ ...p, method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK_TRANSFER">Chuyển khoản ngân hàng</SelectItem>
                <SelectItem value="CASH">Tiền mặt</SelectItem>
                <SelectItem value="CHEQUE">Séc</SelectItem>
                <SelectItem value="ONLINE">Thanh toán trực tuyến</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Mã tham chiếu / Số GD</label>
            <Input value={form.reference}
              onChange={(e) => setForm(p => ({ ...p, reference: e.target.value }))}
              placeholder="TT2026001234..." />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Ngày thanh toán</label>
            <Input type="date" value={form.paidAt}
              onChange={(e) => setForm(p => ({ ...p, paidAt: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Ghi chú</label>
            <Input value={form.notes}
              onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Thanh toán đợt 1..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button disabled={!form.amount || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="bg-green-600 hover:bg-green-700 text-white gap-2">
            <CheckCircle2 size={14} />
            {mutation.isPending ? 'Đang lưu...' : 'Xác nhận thanh toán'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Invoice Detail Sheet ──────────────────────────────────────────────────────

function InvoiceDetailSheet({ invoiceId, onClose }: { invoiceId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const isStaff = user?.role !== 'TENANT';
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [editLineId, setEditLineId] = useState<string | null>(null);
  const [removeLineId, setRemoveLineId] = useState<string | null>(null);
  const [reasonAction, setReasonAction] = useState<{ type: 'void' | 'reverse'; paymentId?: string } | null>(null);
  const [editForm, setEditForm] = useState({ description: '', qty: '', unitPrice: '' });

  // Add cost form state
  const [addForm, setAddForm] = useState({
    type: 'ELECTRICITY', description: '', qty: '', unitPrice: '', showForm: false,
  });

  const { data: inv, isLoading } = useQuery({
    queryKey: ['invoice-summary', invoiceId],
    queryFn: () => billingApi.getInvoiceSummary(invoiceId!),
    enabled: !!invoiceId,
    refetchOnWindowFocus: false,
  });

  const addLineMutation = useMutation({
    mutationFn: () => billingApi.addInvoiceLine(invoiceId!, {
      type: addForm.type,
      description: addForm.description || LINE_TYPE_CONFIG[addForm.type]?.label || addForm.type,
      qty: Number(addForm.qty),
      unitPrice: Number(addForm.unitPrice),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setRemoveLineId(null);
      setAddForm(p => ({ ...p, description: '', qty: '', unitPrice: '', showForm: false }));
      toast({ title: 'Đã thêm chi phí' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, data }: { lineId: string; data: any }) =>
      billingApi.updateInvoiceLine(invoiceId!, lineId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setEditLineId(null);
      toast({ title: 'Đã cập nhật' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const removeLineMutation = useMutation({
    mutationFn: (lineId: string) => billingApi.removeInvoiceLine(invoiceId!, lineId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Đã xóa dòng chi phí' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const issueMutation = useMutation({
    mutationFn: () => billingApi.issueInvoice(invoiceId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Đã phát hành hóa đơn — Thông báo gửi khách hàng' });
      setConfirmIssue(false);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => billingApi.voidInvoice(invoiceId!, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Đã hủy hóa đơn' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi hủy hóa đơn', variant: 'destructive' }),
  });

  const reverseMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) => billingApi.reversePayment(paymentId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Đã đảo bút toán thanh toán' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi đảo bút toán', variant: 'destructive' }),
  });

  const handleVoid = () => {
    setReasonAction({ type: 'void' });
  };

  const handleReversePayment = (paymentId: string) => {
    setReasonAction({ type: 'reverse', paymentId });
  };

  if (!invoiceId) return null;

  const isDraft = inv?.status === 'DRAFT';
  const isCancelled = inv?.status === 'CANCELLED';
  const canPay = ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'].includes(inv?.status ?? '');
  const statusCfg = STATUS_MAP[inv?.status ?? ''] ?? STATUS_MAP.DRAFT;
  const lines = inv?.lines ?? [];
  const fixedLines = lines.filter((l: any) => ['RENT', 'CAM', 'DEPOSIT'].includes(l.type?.toUpperCase()));
  const variableLines = lines.filter((l: any) => !['RENT', 'CAM', 'DEPOSIT'].includes(l.type?.toUpperCase()));
  const payments = inv?.payments ?? [];
  const activePayments = payments.filter((p: any) => !p.reversedAt);
  const totalPaid = activePayments.reduce((s: number, p: any) => s + p.amount, 0);
  const balance = (inv?.totalAmount ?? 0) - totalPaid;
  const canVoid = !isCancelled && activePayments.length === 0;

  const startEdit = (line: any) => {
    setEditLineId(line.id);
    setEditForm({ description: line.description, qty: line.qty.toString(), unitPrice: line.unitPrice.toString() });
  };

  return (
    <div className={`fixed inset-y-0 right-0 z-50 flex flex-col bg-white border-l border-gray-200 shadow-2xl transition-transform duration-300 ${invoiceId ? 'translate-x-0' : 'translate-x-full'}`}
      style={{ width: '520px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div>
          {isLoading ? <Skeleton className="h-6 w-40" /> : (
            <>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-gray-800">{inv?.invoiceNumber}</span>
                <Badge className={`${statusCfg.color} border text-xs`}>{statusCfg.label}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {inv?.tenant?.brandName} · Kỳ {inv?.period} · Hạn {fmtDate(inv?.dueDate)}
              </p>
            </>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg">
          <X size={18} className="text-gray-500" />
        </button>
      </div>

      {/* Workflow step indicator */}
      {inv && (
        <div className="px-5 pt-3 pb-2 border-b border-gray-100">
          <div className="flex items-center gap-1 text-xs">
            {[
              { n: 1, label: 'Tạo draft', done: true },
              { n: 2, label: 'Thêm chi phí', done: variableLines.length > 0 },
              { n: 3, label: 'Gửi khách', done: inv.status !== 'DRAFT' },
              { n: 4, label: 'Thu tiền', done: inv.status === 'PAID' },
            ].map((step, i) => (
              <div key={step.n} className="flex items-center gap-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  step.done ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
                }`}>{step.done ? '✓' : step.n}</div>
                <span className={step.done ? 'text-blue-600 font-medium' : 'text-gray-400'}>{step.label}</span>
                {i < 3 && <ArrowRight size={10} className="text-gray-300 mx-1" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-24" /><Skeleton className="h-40" />
          </div>
        ) : (
          <div className="p-5 space-y-5">

            {/* ── FIXED LINES (rent, CAM) ── */}
            <div>
              <div className="text-xs font-bold tracking-wider text-gray-400 mb-2 uppercase">Chi phí cố định</div>
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                {fixedLines.length === 0 ? (
                  <div className="py-4 text-center text-sm text-gray-400">Chưa có dòng chi phí cố định</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs text-gray-500">Nội dung</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">SL</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">Đơn giá</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {fixedLines.map((line: any) => {
                        const cfg = LINE_TYPE_CONFIG[line.type?.toUpperCase()] ?? LINE_TYPE_CONFIG.OTHER;
                        const Icon = cfg.icon;
                        return (
                          <tr key={line.id} className="bg-gray-50/30">
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <Icon size={13} className="text-gray-400 flex-shrink-0" />
                                <span className="text-gray-700">{line.description}</span>
                                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 rounded">cố định</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{line.qty}</td>
                            <td className="px-3 py-2.5 text-right text-gray-600 text-xs">{fmtMoney(line.unitPrice)}</td>
                            <td className="px-3 py-2.5 text-right font-medium">{fmtMoney(line.amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* ── VARIABLE LINES (utilities) ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold tracking-wider text-gray-400 uppercase">Chi phí biến đổi</div>
                {isDraft && (
                  <button
                    onClick={() => setAddForm(p => ({ ...p, showForm: !p.showForm }))}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                    <Plus size={12} /> Thêm chi phí
                  </button>
                )}
              </div>

              {/* Add cost form */}
              {isDraft && addForm.showForm && (
                <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-3 mb-3 space-y-2">
                  <div className="text-xs font-semibold text-blue-700 mb-2">➕ Thêm dòng chi phí</div>
                  <Select value={addForm.type}
                    onValueChange={(v) => setAddForm(p => ({ ...p, type: v, description: LINE_TYPE_CONFIG[v]?.label ?? '' }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VARIABLE_LINE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Mô tả (vd: Điện tháng 6/2026)"
                    className="h-8 text-xs"
                    value={addForm.description}
                    onChange={(e) => setAddForm(p => ({ ...p, description: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">
                        Số lượng {LINE_TYPE_CONFIG[addForm.type]?.unit ? `(${LINE_TYPE_CONFIG[addForm.type].unit})` : ''}
                      </label>
                      <Input type="number" className="h-8 text-xs" value={addForm.qty}
                        placeholder={LINE_TYPE_CONFIG[addForm.type]?.unit === 'kWh' ? '12500' : '1'}
                        onChange={(e) => setAddForm(p => ({ ...p, qty: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">Đơn giá (₫)</label>
                      <Input type="number" className="h-8 text-xs" value={addForm.unitPrice}
                        placeholder={LINE_TYPE_CONFIG[addForm.type]?.unit === 'kWh' ? '3200' : '0'}
                        onChange={(e) => setAddForm(p => ({ ...p, unitPrice: e.target.value }))} />
                    </div>
                  </div>
                  {addForm.qty && addForm.unitPrice && (
                    <div className="text-xs text-blue-700 font-medium bg-blue-100 px-2 py-1 rounded">
                      Thành tiền: {fmtMoney(Number(addForm.qty) * Number(addForm.unitPrice))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs flex-1 gap-1"
                      disabled={!addForm.qty || !addForm.unitPrice || addLineMutation.isPending}
                      onClick={() => addLineMutation.mutate()}>
                      <Plus size={11} /> {addLineMutation.isPending ? 'Đang thêm...' : 'Thêm'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => setAddForm(p => ({ ...p, showForm: false }))}>Hủy</Button>
                  </div>
                </div>
              )}

              <div className="border border-gray-100 rounded-lg overflow-hidden">
                {variableLines.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-400">
                    <Zap size={24} className="mx-auto mb-2 opacity-30" />
                    {isDraft
                      ? 'Chưa có chi phí biến đổi — Bấm "Thêm chi phí" để nhập điện/nước/dịch vụ'
                      : 'Không có chi phí biến đổi trong kỳ này'
                    }
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs text-gray-500">Nội dung</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">SL</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">Đơn giá</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">Thành tiền</th>
                        {isDraft && <th className="px-2 py-2" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {variableLines.map((line: any) => {
                        const cfg = LINE_TYPE_CONFIG[line.type?.toUpperCase()] ?? LINE_TYPE_CONFIG.OTHER;
                        const Icon = cfg.icon;
                        const isEditing = editLineId === line.id;
                        return (
                          <tr key={line.id} className="hover:bg-gray-50/50">
                            <td className="px-3 py-2.5">
                              {isEditing ? (
                                <Input className="h-7 text-xs" value={editForm.description}
                                  onChange={(e) => setEditForm(p => ({ ...p, description: e.target.value }))} />
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Icon size={13} className="text-blue-500 flex-shrink-0" />
                                  <span>{line.description}</span>
                                  {cfg.unit && <span className="text-xs text-gray-400">/{cfg.unit}</span>}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {isEditing ? (
                                <Input type="number" className="h-7 text-xs w-20 ml-auto" value={editForm.qty}
                                  onChange={(e) => setEditForm(p => ({ ...p, qty: e.target.value }))} />
                              ) : (
                                <span className="text-gray-600 text-xs">{line.qty.toLocaleString('vi-VN')}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {isEditing ? (
                                <Input type="number" className="h-7 text-xs w-28 ml-auto" value={editForm.unitPrice}
                                  onChange={(e) => setEditForm(p => ({ ...p, unitPrice: e.target.value }))} />
                              ) : (
                                <span className="text-gray-600 text-xs">{fmtMoney(line.unitPrice)}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-sm">
                              {isEditing
                                ? fmtMoney(Number(editForm.qty) * Number(editForm.unitPrice))
                                : fmtMoney(line.amount)
                              }
                            </td>
                            {isDraft && (
                              <td className="px-2 py-2">
                                {isEditing ? (
                                  <div className="flex gap-1">
                                    <button className="text-xs text-blue-600 font-medium"
                                      onClick={() => updateLineMutation.mutate({
                                        lineId: line.id,
                                        data: { description: editForm.description, qty: Number(editForm.qty), unitPrice: Number(editForm.unitPrice) }
                                      })}>Lưu</button>
                                    <button className="text-xs text-gray-400" onClick={() => setEditLineId(null)}>×</button>
                                  </div>
                                ) : (
                                  <div className="flex gap-1">
                                    <button onClick={() => startEdit(line)} className="p-1 hover:bg-gray-100 rounded" aria-label={`Sửa dòng ${line.description}`}>
                                      <Edit2 size={11} className="text-gray-400" />
                                    </button>
                                    <button onClick={() => setRemoveLineId(line.id)}
                                      className="p-1 hover:bg-red-50 rounded" aria-label={`Xóa dòng ${line.description}`}>
                                      <Trash2 size={11} className="text-red-400" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <ConfirmDialog
              open={!!removeLineId}
              title="Xóa dòng chi phí?"
              description="Tổng tiền và thuế của hóa đơn sẽ được tính lại. Chỉ nên xóa khi dòng chi phí được thêm nhầm."
              onCancel={() => setRemoveLineId(null)}
              onConfirm={() => removeLineId && removeLineMutation.mutate(removeLineId)}
              loading={removeLineMutation.isPending}
              confirmLabel="Xóa dòng chi phí"
              loadingLabel="Đang xóa..."
            />

            {/* ── TOTALS ── */}
            <div className="border border-gray-200 rounded-lg bg-gray-50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span>{fmtMoney(inv?.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">VAT ({inv?.vatRate ?? 10}%)</span>
                <span>{fmtMoney(inv?.vatAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
                <span>Tổng cộng</span>
                <span className="text-gray-900">{fmtMoney(inv?.totalAmount)}</span>
              </div>
              {payments.length > 0 && (
                <>
                  <div className="flex justify-between text-sm text-green-600 border-t border-gray-200 pt-2">
                    <span>Đã thanh toán</span>
                    <span className="font-medium">- {fmtMoney(totalPaid)}</span>
                  </div>
                  <div className={`flex justify-between text-sm font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    <span>Còn lại</span>
                    <span>{fmtMoney(balance)}</span>
                  </div>
                </>
              )}
            </div>

            {/* ── PAYMENT HISTORY ── */}
            {payments.length > 0 && (
              <div>
                <div className="text-xs font-bold tracking-wider text-gray-400 mb-2 uppercase">Lịch sử thanh toán</div>
                <div className="space-y-2">
                  {payments.map((p: any) => (
                    <div key={p.id} className={`flex items-center justify-between border rounded-lg px-3 py-2.5 ${
                      p.reversedAt ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-green-50 border-green-100'
                    }`}>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={14} className={p.reversedAt ? 'text-gray-400' : 'text-green-600'} />
                        <div>
                          <div className={`text-sm font-medium ${p.reversedAt ? 'text-gray-500 line-through' : 'text-green-800'}`}>{fmtMoney(p.amount)}</div>
                          <div className={`text-xs ${p.reversedAt ? 'text-gray-400' : 'text-green-600'}`}>{p.method} · {fmtDate(p.paidAt)}</div>
                          {p.reversedAt && <div className="text-xs text-red-500 mt-0.5">Đã đảo: {p.reversalReason}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.reference && <span className="text-xs text-gray-400 font-mono">{p.reference}</span>}
                        {isStaff && !p.reversedAt && (
                          <Button
                            size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                            title="Đảo bút toán"
                            onClick={() => handleReversePayment(p.id)}
                            disabled={reverseMutation.isPending}
                          >
                            <Undo2 size={13} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 space-y-2">
        {isDraft && (
          <>
            <p className="text-xs text-amber-600 flex items-center gap-1.5 mb-3">
              <AlertTriangle size={12} /> Kiểm tra và bổ sung các chi phí biến đổi trước khi gửi khách
            </p>
            <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setConfirmIssue(true)}
              disabled={issueMutation.isPending}>
              <Send size={15} />
              {issueMutation.isPending ? 'Đang phát hành...' : 'Phát hành & Gửi khách hàng'}
            </Button>
          </>
        )}
        {canPay && (
          <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setPaymentOpen(true)}>
            <Banknote size={15} /> Ghi nhận thanh toán
          </Button>
        )}
        {inv?.status === 'PAID' && (
          <div className="flex items-center justify-center gap-2 py-2 text-green-600 font-medium">
            <CheckCircle2 size={16} /> Hóa đơn đã thanh toán đầy đủ
          </div>
        )}
        {isCancelled && inv?.voidReason && (
          <div className="text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-2">
            Đã hủy — lý do: {inv.voidReason}
          </div>
        )}
        {isStaff && canVoid && (
          <Button variant="outline" className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50"
            onClick={handleVoid}
            disabled={voidMutation.isPending}>
            <Ban size={14} /> Hủy hóa đơn
          </Button>
        )}
      </div>

      <RecordPaymentDialog
        invoice={inv ? { ...inv, totalPaid } : null}
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
      />
      <ConfirmDialog
        open={confirmIssue}
        title="Phát hành hóa đơn?"
        description="Hóa đơn sẽ được khóa nội dung và gửi thông báo cho khách thuê. Hãy kiểm tra các dòng chi phí, thuế và hạn thanh toán trước khi tiếp tục."
        onCancel={() => setConfirmIssue(false)}
        onConfirm={() => issueMutation.mutate()}
        loading={issueMutation.isPending}
        confirmLabel="Phát hành hóa đơn"
        loadingLabel="Đang phát hành..."
      />
      <ReasonActionDialog
        open={!!reasonAction}
        onOpenChange={(open) => !open && setReasonAction(null)}
        title={reasonAction?.type === 'void' ? 'Hủy hóa đơn' : 'Đảo bút toán thanh toán'}
        description="Thao tác ảnh hưởng đến công nợ và sẽ được lưu trong lịch sử kiểm toán."
        confirmLabel="Xác nhận"
        loading={voidMutation.isPending || reverseMutation.isPending}
        onConfirm={(reason) => {
          if (reasonAction?.type === 'void') voidMutation.mutate(reason, { onSuccess: () => setReasonAction(null) });
          if (reasonAction?.type === 'reverse' && reasonAction.paymentId) {
            reverseMutation.mutate({ paymentId: reasonAction.paymentId, reason }, { onSuccess: () => setReasonAction(null) });
          }
        }}
      />
    </div>
  );
}

// ── Invoices Tab ──────────────────────────────────────────────────────────────

function InvoicesTab() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const response = await api.get(`/billing/invoices/export?${params.toString()}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoices_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Lỗi xuất file', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoices', { search, status }],
    queryFn: () => billingApi.listInvoices({ search: search || undefined, status: status || undefined }),
  });

  const invoices: Invoice[] = data?.data ?? [];
  const draftCount = invoices.filter(i => i.status === 'DRAFT').length;
  const overdueCount = invoices.filter(i => i.status === 'OVERDUE').length;
  const pendingPayCount = invoices.filter(i => ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status)).length;

  // Active step based on filter
  const activeStep = !status ? undefined
    : status === 'DRAFT' ? 2
    : status === 'ISSUED' ? 3
    : status === 'PAID' ? 4
    : undefined;

  return (
    <div>
      <WorkflowBar active={activeStep} />

      {/* Quick stat chips */}
      {(draftCount > 0 || overdueCount > 0) && (
        <div className="flex gap-3 mb-4">
          {draftCount > 0 && (
            <button onClick={() => setStatus('DRAFT')}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-medium hover:bg-amber-100">
              <Clock size={12} /> {draftCount} bản nháp cần xử lý chi phí
            </button>
          )}
          {overdueCount > 0 && (
            <button onClick={() => setStatus('OVERDUE')}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 font-medium hover:bg-red-100">
              <AlertTriangle size={12} /> {overdueCount} hóa đơn quá hạn
            </button>
          )}
          {pendingPayCount > 0 && (
            <button onClick={() => setStatus('ISSUED')}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 font-medium hover:bg-blue-100">
              <Banknote size={12} /> {pendingPayCount} chờ thu tiền
            </button>
          )}
        </div>
      )}

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Tìm số hóa đơn, khách thuê..."
            value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-0.5 rounded-lg border overflow-hidden h-9">
          {['', 'DRAFT', 'ISSUED', 'OVERDUE', 'PARTIALLY_PAID', 'PAID'].map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                status === s ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              {s === '' ? 'Tất cả' : STATUS_MAP[s]?.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 h-9 shrink-0" onClick={handleExportCsv} disabled={exporting}>
          <Download size={13} /> {exporting ? 'Đang xuất...' : 'CSV'}
        </Button>
      </div>

      {isError ? (
        <AsyncState isLoading={false} isError onRetry={refetch}
          errorTitle="Không thể tải danh sách hóa đơn"><div /></AsyncState>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Số HĐ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Khách thuê</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Kỳ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Loại</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Tổng tiền</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Hạn TT</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Trạng thái</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoices.map((inv) => {
                const st = STATUS_MAP[inv.status];
                const overdue = inv.status === 'OVERDUE';
                const isSelected = selectedId === inv.id;
                return (
                  <tr key={inv.id}
                    className={`cursor-pointer transition-colors ${overdue ? 'bg-red-50/50' : ''} ${
                      isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedId(isSelected ? null : inv.id)}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{inv.tenant?.brandName}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{inv.period}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{inv.type}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {fmtCompact(inv.totalAmount)} ₫
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {fmtDate(inv.dueDate)}
                      {overdue && <span className="ml-1 text-red-500">(!)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${st?.color} border text-xs`}>{st?.label}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <ChevronRight size={15} className={`transition-transform ${isSelected ? 'rotate-90 text-blue-500' : 'text-gray-300'}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {invoices.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Receipt size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Không có hóa đơn nào</p>
            </div>
          )}
        </div>
      )}

      {/* Detail sheet overlay */}
      {selectedId && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedId(null)} />
          <InvoiceDetailSheet invoiceId={selectedId} onClose={() => setSelectedId(null)} />
        </>
      )}
    </div>
  );
}

// ── AR Aging Tab ──────────────────────────────────────────────────────────────

function ArAgingTab() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['ar-aging'], queryFn: billingApi.arAging });
  const rows: ArAgingRow[] = data?.data ?? data ?? [];
  const total = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <div className="grid grid-cols-5 gap-3 mb-4">
        {['current', 'days30', 'days60', 'days90', 'days90plus'].map((key, i) => {
          const labels = ['Hiện tại', '1-30 ngày', '31-60 ngày', '61-90 ngày', '>90 ngày'];
          const colors = ['text-green-600', 'text-yellow-600', 'text-orange-600', 'text-red-500', 'text-red-700'];
          const sum = rows.reduce((s, r) => s + (r as any)[key], 0);
          return (
            <Card key={key}>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-gray-500">{labels[i]}</p>
                <p className={`text-lg font-bold ${colors[i]}`}>{fmtCompact(sum)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {isError ? (
        <AsyncState isLoading={false} isError onRetry={refetch}
          errorTitle="Không thể tải báo cáo tuổi nợ"><div /></AsyncState>
      ) : isLoading ? <Skeleton className="h-64" /> : rows.length === 0 ? (
        <AsyncState isLoading={false} isEmpty emptyTitle="Chưa có công nợ theo tuổi nợ"
          emptyDescription="Các khoản phải thu sẽ được phân nhóm theo số ngày quá hạn."><div /></AsyncState>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs">Khách thuê</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">Hiện tại</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">1-30 ngày</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">31-60 ngày</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">61-90 ngày</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">&gt;90 ngày</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs font-bold">Tổng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.tenant?.brandName}</td>
                  <td className="px-4 py-3 text-right text-sm">{r.current > 0 ? fmtCompact(r.current) : '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-yellow-600">{r.days30 > 0 ? fmtCompact(r.days30) : '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-orange-600">{r.days60 > 0 ? fmtCompact(r.days60) : '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-red-500">{r.days90 > 0 ? fmtCompact(r.days90) : '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-red-700 font-medium">{r.days90plus > 0 ? fmtCompact(r.days90plus) : '—'}</td>
                  <td className="px-4 py-3 text-right font-bold">{fmtCompact(r.total)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold border-t">
                <td className="px-4 py-3">Tổng cộng</td>
                <td colSpan={5} />
                <td className="px-4 py-3 text-right text-red-700">{fmtCompact(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { data: executiveKpi } = useQuery({ queryKey: ['collection-kpi'], queryFn: () => billingApi.getCollectionKpi(6) });
  const kpi = executiveKpi?.data ?? executiveKpi ?? {};
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-900 p-6 text-white shadow-[0_25px_65px_-35px_rgba(6,78,59,0.8)]">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border border-emerald-200/10 bg-emerald-200/5" />
        <div className="relative grid gap-6 xl:grid-cols-[1.4fr_1fr] xl:items-end">
          <div><div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200"><Sparkles size={13} /> Revenue operations</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hóa đơn và thu tiền</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Kiểm soát trọn vòng đời doanh thu: lập lịch → phát hành → thu tiền → nhắc nợ → đối soát hiệu quả.</p></div>
          <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07]">
            <div className="border-r border-white/10 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tỷ lệ thu</div><div className="mt-2 text-2xl font-semibold text-emerald-300">{kpi.collectionRate ?? 0}%</div></div>
            <div className="border-r border-white/10 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">DSO</div><div className="mt-2 text-2xl font-semibold">{kpi.dso ?? 0}<span className="ml-1 text-xs text-slate-400">ngày</span></div></div>
            <div className="p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AR còn lại</div><div className="mt-2 text-lg font-semibold text-amber-300">{fmtCompact(kpi.outstandingAr ?? 0)}</div></div>
          </div>
        </div>
      </section>
      <div className="flex items-center gap-2"><ShieldCheck size={17} className="text-emerald-700" /><div><h2 className="text-lg font-semibold text-slate-950">Trung tâm điều hành Billing</h2><p className="text-xs text-slate-500">Chọn một bước để tiếp tục xử lý</p></div></div>
      <Tabs defaultValue="invoices">
        <TabsList className="mb-4 h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="invoices" className="gap-1.5 whitespace-nowrap rounded-lg"><Receipt size={13} /> Hóa đơn</TabsTrigger>
          <TabsTrigger value="ar-aging" className="gap-1.5 whitespace-nowrap rounded-lg"><Activity size={13} /> Tuổi nợ</TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5 whitespace-nowrap rounded-lg"><Clock size={13} /> Lịch lập hóa đơn</TabsTrigger>
          <TabsTrigger value="dunning" className="gap-1.5 whitespace-nowrap rounded-lg"><AlertTriangle size={13} /> Nhắc nợ</TabsTrigger>
          <TabsTrigger value="kpi" className="gap-1.5 whitespace-nowrap rounded-lg"><TrendingUp size={13} /> Hiệu quả thu hồi</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices"><InvoicesTab /></TabsContent>
        <TabsContent value="ar-aging"><ArAgingTab /></TabsContent>
        <TabsContent value="schedule"><ScheduleTab /></TabsContent>
        <TabsContent value="dunning"><DunningTab /></TabsContent>
        <TabsContent value="kpi"><CollectionKpiTab /></TabsContent>
      </Tabs>
    </div>
  );
}
