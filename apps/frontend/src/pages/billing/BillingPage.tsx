import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { openAuthenticatedFile } from '@/lib/downloadFile';
import type { Invoice, ArAgingRow } from '@/types';
import { formatMoney, CURRENCIES, type CurrencyCode } from '@/lib/currency';
import { ConfirmDialog } from '@/components/spaces/dialogs/ConfirmDialog';
import { ReasonActionDialog } from '@/components/ui/reason-action-dialog';
import { AsyncState } from '@/components/ui/async-state';
import { useMallStore } from '@/store/mall.store';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { color: string; step: number }> = {
  DRAFT:          { color: 'bg-gray-100 text-gray-700 border-gray-200',     step: 1 },
  ISSUED:         { color: 'bg-blue-100 text-blue-700 border-blue-200',     step: 3 },
  PARTIALLY_PAID: { color: 'bg-amber-100 text-amber-700 border-amber-200', step: 4 },
  PAID:           { color: 'bg-green-100 text-green-700 border-green-200',  step: 4 },
  OVERDUE:        { color: 'bg-red-100 text-red-700 border-red-200',        step: 3 },
  CANCELLED:      { color: 'bg-gray-200 text-gray-500 border-gray-300',     step: 0 },
};

const SOURCE_LABELS: Record<string, string> = {
  LEASE_CONTRACT: 'Hợp đồng thuê',
  SERVICE_CONTRACT: 'Hợp đồng dịch vụ',
  PARKING: 'Bãi đỗ xe',
  REVENUE_SHARE: 'Chia sẻ doanh thu',
  UTILITY: 'Điện nước',
  PENALTY: 'Phí phạt',
  SHORT_TERM_BOOKING: 'Thuê ngắn hạn',
};
const SOURCE_COLORS: Record<string, string> = {
  LEASE_CONTRACT: 'border-blue-200 bg-blue-50 text-blue-700',
  SERVICE_CONTRACT: 'border-teal-200 bg-teal-50 text-teal-700',
  PARKING: 'border-violet-200 bg-violet-50 text-violet-700',
  SHORT_TERM_BOOKING: 'border-orange-200 bg-orange-50 text-orange-700',
  UTILITY: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  PENALTY: 'border-red-200 bg-red-50 text-red-700',
};

const LINE_TYPE_CONFIG: Record<string, { icon: React.ElementType; unit?: string; isFixed?: boolean }> = {
  RENT:           { icon: Receipt,    isFixed: true },
  CAM:            { icon: Settings,   isFixed: true },
  DEPOSIT:        { icon: Banknote,   isFixed: true },
  ELECTRICITY:    { icon: Zap,        unit: 'kWh'  },
  WATER:          { icon: Droplets,   unit: 'm³'   },
  MANAGEMENT_FEE: { icon: Settings                },
  PARKING:        { icon: Package                 },
  CLEANING:       { icon: Settings                },
  SECURITY:       { icon: Settings                },
  MARKETING_FEE:  { icon: Package                 },
  OTHER:          { icon: Package                 },
};

const VARIABLE_LINE_TYPE_KEYS = Object.entries(LINE_TYPE_CONFIG)
  .filter(([, v]) => !v.isFixed)
  .map(([k]) => k);

// currencyCode defaults to VND -- every existing call site keeps formatting exactly as
// before; only the invoice-detail panel (which knows the invoice's actual currency) passes
// it explicitly (docs/program/MULTI_CURRENCY_ARCHITECTURE.md).
function fmtMoney(n?: number | null, currencyCode: CurrencyCode = 'VND') {
  if (!n) return '—';
  return formatMoney(Math.round(n), currencyCode);
}
function fmtCompact(n: number) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
// Compact notation with the record's actual currency symbol, instead of a hardcoded ₫
// (fmtCompact's callers used to append " ₫" unconditionally regardless of the invoice's
// real currencyCode -- see docs/program/MULTI_CURRENCY_ARCHITECTURE.md).
function fmtCompactCur(n: number, currencyCode: CurrencyCode = 'VND') {
  const symbol = CURRENCIES[currencyCode]?.symbol ?? '₫';
  return `${fmtCompact(n)} ${symbol}`;
}
function fmtDate(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Workflow Steps Bar ────────────────────────────────────────────────────────

function WorkflowBar({ active }: { active?: number }) {
  const { t } = useTranslation('billing');
  const steps = [
    { n: 1, label: t('workflow.step1Label'), desc: t('workflow.step1Desc'), color: 'gray' },
    { n: 2, label: t('workflow.step2Label'), desc: t('workflow.step2Desc'), color: 'blue' },
    { n: 3, label: t('workflow.step3Label'), desc: t('workflow.step3Desc'), color: 'violet' },
    { n: 4, label: t('workflow.step4Label'), desc: t('workflow.step4Desc'), color: 'green' },
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
  const { t } = useTranslation(['billing', 'common']);
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
      toast({ title: t('billing:toast.paymentRecorded') });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote size={16} className="text-green-600" /> {t('billing:invoice.actions.recordPayment')}
          </DialogTitle>
          {invoice && (
            <p className="text-sm text-gray-500">
              {invoice.invoiceNumber} · {invoice.counterpartyName || invoice.tenant?.brandName || invoice.billingParty?.name} · {t('billing:detail.remaining')}: {fmtMoney(remaining, invoice.currencyCode)}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-sm font-medium mb-1 block">{t('billing:detail.paymentAmount')} {invoice?.currencyCode && invoice.currencyCode !== 'VND' ? `(${invoice.currencyCode})` : ''}</label>
            <Input type="number" value={form.amount}
              onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))}
              placeholder={remaining.toString()} />
            <button className="text-xs text-blue-600 mt-1"
              onClick={() => setForm(p => ({ ...p, amount: remaining.toString() }))}>
              {t('billing:detail.fullAmountFill', { amount: fmtMoney(remaining, invoice?.currencyCode) })}
            </button>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">{t('billing:detail.paymentMethod')}</label>
            <Select value={form.method} onValueChange={(v) => setForm(p => ({ ...p, method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK_TRANSFER">{t('billing:paymentMethod.BANK_TRANSFER')}</SelectItem>
                <SelectItem value="CASH">{t('billing:paymentMethod.CASH')}</SelectItem>
                <SelectItem value="CHEQUE">{t('billing:paymentMethod.CHEQUE')}</SelectItem>
                <SelectItem value="ONLINE">{t('billing:paymentMethod.ONLINE')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">{t('billing:detail.paymentReference')}</label>
            <Input value={form.reference}
              onChange={(e) => setForm(p => ({ ...p, reference: e.target.value }))}
              placeholder="TT2026001234..." />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">{t('billing:detail.paymentDate')}</label>
            <Input type="date" value={form.paidAt}
              onChange={(e) => setForm(p => ({ ...p, paidAt: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">{t('billing:detail.paymentNotes')}</label>
            <Input value={form.notes}
              onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder={t('billing:detail.paymentNotesPlaceholder')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button disabled={!form.amount || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="bg-green-600 hover:bg-green-700 text-white gap-2">
            <CheckCircle2 size={14} />
            {mutation.isPending ? t('billing:detail.saving') : t('billing:detail.confirmPayment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Invoice Detail Sheet ──────────────────────────────────────────────────────

function InvoiceDetailSheet({ invoiceId, onClose }: { invoiceId: string | null; onClose: () => void }) {
  const { t } = useTranslation(['billing', 'common']);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const isStaff = user?.role !== 'TENANT';
  const [paymentOpen, setPaymentOpen] = useState(false);
  const canSyncSap = ['ADMIN', 'FINANCE'].includes(user?.role ?? '');
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({ type: 'CREDIT_NOTE', amount: '', reason: '', reference: '' });
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
      description: addForm.description || t(`billing:invoice.lineType.${addForm.type}`) || addForm.type,
      qty: Number(addForm.qty),
      unitPrice: Number(addForm.unitPrice),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setRemoveLineId(null);
      setAddForm(p => ({ ...p, description: '', qty: '', unitPrice: '', showForm: false }));
      toast({ title: t('billing:toast.lineAdded') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, data }: { lineId: string; data: any }) =>
      billingApi.updateInvoiceLine(invoiceId!, lineId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setEditLineId(null);
      toast({ title: t('billing:toast.lineUpdated') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const removeLineMutation = useMutation({
    mutationFn: (lineId: string) => billingApi.removeInvoiceLine(invoiceId!, lineId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: t('billing:toast.lineRemoved') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const issueMutation = useMutation({
    mutationFn: () => billingApi.issueInvoice(invoiceId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: t('billing:toast.invoiceIssued') });
      setConfirmIssue(false);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => billingApi.voidInvoice(invoiceId!, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: t('billing:toast.invoiceVoided') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const reverseMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) => billingApi.reversePayment(paymentId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: t('billing:toast.paymentReversed') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });
  const { data: invoiceDocuments = [] } = useQuery({
    queryKey: ['invoice-documents', invoiceId],
    queryFn: () => billingApi.listInvoiceDocuments(invoiceId!),
    enabled: !!invoiceId,
  });
  const uploadDocumentMutation = useMutation({
    mutationFn: (file: File) => billingApi.uploadInvoiceDocument(invoiceId!, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-documents', invoiceId] });
      toast({ title: 'Đã tải tài liệu hóa đơn lên' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể tải tài liệu', variant: 'destructive' }),
  });

  const adjustmentMutation = useMutation({
    mutationFn: () => billingApi.createAdjustment(invoiceId!, { ...adjustmentForm, amount: Number(adjustmentForm.amount) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setAdjustmentOpen(false);
      setAdjustmentForm({ type: 'CREDIT_NOTE', amount: '', reason: '', reference: '' });
      toast({ title: 'Đã ghi nhận bút toán điều chỉnh' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể tạo bút toán', variant: 'destructive' }),
  });
  const eInvoiceMutation = useMutation({
    mutationFn: () => billingApi.requestElectronicInvoice(invoiceId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-summary', invoiceId] });
      toast({ title: 'Đã đưa hóa đơn vào hàng đợi hóa đơn điện tử' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể gửi hóa đơn điện tử', variant: 'destructive' }),
  });

  const sapMutation = useMutation({
    mutationFn: () => billingApi.syncInvoiceToSap(invoiceId!),
    onSuccess: () => toast({ title: 'Đã đồng bộ hoặc đưa hóa đơn vào hàng đợi SAP' }),
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể đồng bộ SAP', variant: 'destructive' }),
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
  const canPay = isStaff && ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'].includes(inv?.status ?? '');
  const statusCfg = STATUS_MAP[inv?.status ?? ''] ?? STATUS_MAP.DRAFT;
  const lines = inv?.lines ?? [];
  const fixedLines = lines.filter((l: any) => ['RENT', 'CAM', 'DEPOSIT'].includes(l.type?.toUpperCase()));
  const variableLines = lines.filter((l: any) => !['RENT', 'CAM', 'DEPOSIT'].includes(l.type?.toUpperCase()));
  const payments = inv?.payments ?? [];
  const activePayments = payments.filter((p: any) => !p.reversedAt);
  const totalPaid = inv?.totalPaid ?? activePayments.reduce((s: number, p: any) => s + p.amount, 0);
  const balance = inv?.balance ?? ((inv?.totalAmount ?? 0) - totalPaid);
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
                <Badge className={`${statusCfg.color} border text-xs`}>{t(`billing:invoice.status.${inv?.status ?? 'DRAFT'}`)}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {inv?.tenant?.brandName || inv?.billingParty?.name} · {t('billing:list.period')} {inv?.period} · {t('billing:list.dueDate')} {fmtDate(inv?.dueDate)}
              </p>
              {inv?.contractId && (
                <button
                  className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-1"
                  onClick={() => { onClose(); navigate(`/contracts?id=${inv.contractId}`); }}
                >
                  {t('billing:detail.viewContract', { number: inv.contract?.contractNumber ?? '' })} <ArrowRight size={10} />
                </button>
              )}
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
              { n: 1, label: t('billing:workflow.stepCreate'), done: true },
              { n: 2, label: t('billing:workflow.stepAddCosts'), done: variableLines.length > 0 },
              { n: 3, label: t('billing:workflow.stepSend'), done: inv.status !== 'DRAFT' },
              { n: 4, label: t('billing:workflow.stepCollect'), done: inv.status === 'PAID' },
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
              <div className="text-xs font-bold tracking-wider text-gray-400 mb-2 uppercase">{t('billing:detail.fixedCosts')}</div>
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                {fixedLines.length === 0 ? (
                  <div className="py-4 text-center text-sm text-gray-400">{t('billing:detail.noFixedLines')}</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs text-gray-500">{t('billing:detail.content')}</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">{t('billing:detail.qty')}</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">{t('billing:detail.unitPrice')}</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">{t('billing:detail.amount')}</th>
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
                                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 rounded">{t('billing:detail.fixedBadge')}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{line.qty}</td>
                            <td className="px-3 py-2.5 text-right text-gray-600 text-xs">{fmtMoney(line.unitPrice, inv?.currencyCode)}</td>
                            <td className="px-3 py-2.5 text-right font-medium">{fmtMoney(line.amount, inv?.currencyCode)}</td>
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
                <div className="text-xs font-bold tracking-wider text-gray-400 uppercase">{t('billing:detail.variableCosts')}</div>
                {isStaff && isDraft && (
                  <button
                    onClick={() => setAddForm(p => ({ ...p, showForm: !p.showForm }))}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                    <Plus size={12} /> {t('billing:detail.addCost')}
                  </button>
                )}
              </div>

              {/* Add cost form */}
              {isStaff && isDraft && addForm.showForm && (
                <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-3 mb-3 space-y-2">
                  <div className="text-xs font-semibold text-blue-700 mb-2">➕ {t('billing:detail.addCostLine')}</div>
                  <Select value={addForm.type}
                    onValueChange={(v) => setAddForm(p => ({ ...p, type: v, description: t(`billing:invoice.lineType.${v}`) }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VARIABLE_LINE_TYPE_KEYS.map((key) => (
                        <SelectItem key={key} value={key} className="text-xs">{t(`billing:invoice.lineType.${key}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={t('billing:detail.descriptionPlaceholder')}
                    className="h-8 text-xs"
                    value={addForm.description}
                    onChange={(e) => setAddForm(p => ({ ...p, description: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">
                        {t('billing:detail.qtyLabel')} {LINE_TYPE_CONFIG[addForm.type]?.unit ? `(${LINE_TYPE_CONFIG[addForm.type].unit})` : ''}
                      </label>
                      <Input type="number" className="h-8 text-xs" value={addForm.qty}
                        placeholder={LINE_TYPE_CONFIG[addForm.type]?.unit === 'kWh' ? '12500' : '1'}
                        onChange={(e) => setAddForm(p => ({ ...p, qty: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">{t('billing:detail.unitPriceLabel')}</label>
                      <Input type="number" className="h-8 text-xs" value={addForm.unitPrice}
                        placeholder={LINE_TYPE_CONFIG[addForm.type]?.unit === 'kWh' ? '3200' : '0'}
                        onChange={(e) => setAddForm(p => ({ ...p, unitPrice: e.target.value }))} />
                    </div>
                  </div>
                  {addForm.qty && addForm.unitPrice && (
                    <div className="text-xs text-blue-700 font-medium bg-blue-100 px-2 py-1 rounded">
                      {t('billing:detail.subtotalPreview', { amount: fmtMoney(Number(addForm.qty) * Number(addForm.unitPrice)) })}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs flex-1 gap-1"
                      disabled={!addForm.qty || !addForm.unitPrice || addLineMutation.isPending}
                      onClick={() => addLineMutation.mutate()}>
                      <Plus size={11} /> {addLineMutation.isPending ? t('common:actions.loading') : t('common:actions.add')}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => setAddForm(p => ({ ...p, showForm: false }))}>{t('common:actions.cancel')}</Button>
                  </div>
                </div>
              )}

              <div className="border border-gray-100 rounded-lg overflow-hidden">
                {variableLines.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-400">
                    <Zap size={24} className="mx-auto mb-2 opacity-30" />
                    {isDraft
                      ? t('billing:detail.noVariableLinesDraft')
                      : t('billing:detail.noVariableLinesIssued')
                    }
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs text-gray-500">{t('billing:detail.content')}</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">{t('billing:detail.qty')}</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">{t('billing:detail.unitPrice')}</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">{t('billing:detail.amount')}</th>
                        {isStaff && isDraft && <th className="px-2 py-2" />}
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
                                <span className="text-gray-600 text-xs">{fmtMoney(line.unitPrice, inv?.currencyCode)}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-sm">
                              {isEditing
                                ? fmtMoney(Number(editForm.qty) * Number(editForm.unitPrice), inv?.currencyCode)
                                : fmtMoney(line.amount, inv?.currencyCode)
                              }
                            </td>
                            {isStaff && isDraft && (
                              <td className="px-2 py-2">
                                {isEditing ? (
                                  <div className="flex gap-1">
                                    <button className="text-xs text-blue-600 font-medium"
                                      onClick={() => updateLineMutation.mutate({
                                        lineId: line.id,
                                        data: { description: editForm.description, qty: Number(editForm.qty), unitPrice: Number(editForm.unitPrice) }
                                      })}>{t('common:actions.save')}</button>
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
              title={t('billing:confirmRemoveLine.title')}
              description={t('billing:confirmRemoveLine.description')}
              onCancel={() => setRemoveLineId(null)}
              onConfirm={() => removeLineId && removeLineMutation.mutate(removeLineId)}
              loading={removeLineMutation.isPending}
              confirmLabel={t('billing:confirmRemoveLine.confirm')}
              loadingLabel={t('billing:confirmRemoveLine.loading')}
            />

            {/* ── TOTALS ── */}
            <div className="border border-gray-200 rounded-lg bg-gray-50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('billing:detail.subtotal')}</span>
                <span>{fmtMoney(inv?.subtotal, inv?.currencyCode)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('billing:detail.vat', { rate: inv?.vatRate ?? 10 })}</span>
                <span>{fmtMoney(inv?.vatAmount, inv?.currencyCode)}</span>
              </div>
              {!!inv?.adjustmentAmount && <div className={`flex justify-between text-sm ${inv.adjustmentAmount < 0 ? 'text-emerald-700' : 'text-orange-700'}`}><span>Điều chỉnh công nợ</span><span>{inv.adjustmentAmount > 0 ? '+' : ''}{fmtMoney(inv.adjustmentAmount, inv?.currencyCode)}</span></div>}
              {!!inv?.refundedAmount && <div className="flex justify-between text-sm text-violet-700"><span>Đã hoàn tiền</span><span>{fmtMoney(inv.refundedAmount, inv?.currencyCode)}</span></div>}
              <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
                <span>{t('billing:detail.totalSection')}</span>
                <span className="text-gray-900">{fmtMoney(inv?.adjustedTotal ?? inv?.totalAmount, inv?.currencyCode)}</span>
              </div>
              {payments.length > 0 && (
                <>
                  <div className="flex justify-between text-sm text-green-600 border-t border-gray-200 pt-2">
                    <span>{t('billing:detail.paid')}</span>
                    <span className="font-medium">- {fmtMoney(totalPaid, inv?.currencyCode)}</span>
                  </div>
                  <div className={`flex justify-between text-sm font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    <span>{t('billing:detail.remaining')}</span>
                    <span>{fmtMoney(balance, inv?.currencyCode)}</span>
                  </div>
                </>
              )}
            </div>

            {!!inv?.adjustments?.length && <div><div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">Bút toán điều chỉnh</div><div className="space-y-2">{inv.adjustments.map((item: any) => <div key={item.id} className={`rounded-lg border px-3 py-2.5 ${item.status === 'CANCELLED' ? 'bg-gray-50 opacity-60' : 'bg-violet-50 border-violet-100'}`}><div className="flex justify-between gap-3"><div><div className="text-sm font-medium text-violet-900">{{ CREDIT_NOTE: 'Credit note', DEBIT_NOTE: 'Debit note', WRITE_OFF: 'Xóa nợ', REFUND: 'Hoàn tiền' }[item.type as string] || item.type}</div><div className="text-xs text-gray-500">{item.reason}{item.reference ? ` · ${item.reference}` : ''}</div></div><div className="text-right"><div className="font-semibold">{fmtMoney(item.amount, inv?.currencyCode)}</div><div className="text-[11px] text-gray-400">{fmtDate(item.createdAt)}</div></div></div></div>)}</div></div>}

            <div><div className="mb-2 flex items-center justify-between"><div className="text-xs font-bold uppercase tracking-wider text-gray-400">Tài liệu hóa đơn</div>{isStaff && <label className="cursor-pointer text-xs font-medium text-blue-600 hover:underline"><input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx" disabled={uploadDocumentMutation.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadDocumentMutation.mutate(file); event.target.value = ''; }} />{uploadDocumentMutation.isPending ? 'Đang tải...' : '+ Tải tài liệu'}</label>}</div>{invoiceDocuments.length ? <div className="space-y-2">{invoiceDocuments.map((document: any) => <button key={document.id} type="button" onClick={() => openAuthenticatedFile(`/files/documents/${document.id}`)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"><div className="flex min-w-0 items-center gap-2"><FileText size={14} className="shrink-0 text-blue-500" /><div className="min-w-0"><div className="truncate text-sm font-medium">{document.fileName}</div><div className="text-[11px] text-slate-400">{document.documentType} · phiên bản {document.version}</div></div></div><Download size={13} className="text-slate-400" /></button>)}</div> : <div className="rounded-lg border border-dashed p-4 text-center text-xs text-slate-400">Chưa có tài liệu đính kèm</div>}</div>

            {/* ── PAYMENT HISTORY ── */}
            {payments.length > 0 && (
              <div>
                <div className="text-xs font-bold tracking-wider text-gray-400 mb-2 uppercase">{t('billing:detail.paymentHistory')}</div>
                <div className="space-y-2">
                  {payments.map((p: any) => (
                    <div key={p.id} className={`flex items-center justify-between border rounded-lg px-3 py-2.5 ${
                      p.reversedAt ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-green-50 border-green-100'
                    }`}>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={14} className={p.reversedAt ? 'text-gray-400' : 'text-green-600'} />
                        <div>
                          <div className={`text-sm font-medium ${p.reversedAt ? 'text-gray-500 line-through' : 'text-green-800'}`}>{fmtMoney(p.amount, p.currencyCode ?? inv?.currencyCode)}</div>
                          <div className={`text-xs ${p.reversedAt ? 'text-gray-400' : 'text-green-600'}`}>{p.method} · {fmtDate(p.paidAt)}</div>
                          {p.reversedAt && <div className="text-xs text-red-500 mt-0.5">{t('billing:detail.reversed', { reason: p.reversalReason })}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.reference && <span className="text-xs text-gray-400 font-mono">{p.reference}</span>}
                        {isStaff && !p.reversedAt && (
                          <Button
                            size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                            title={t('billing:detail.reversePayment')}
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
        {isStaff && isDraft && (
          <>
            <p className="text-xs text-amber-600 flex items-center gap-1.5 mb-3">
              <AlertTriangle size={12} /> {t('billing:detail.checkBeforeSend')}
            </p>
            <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setConfirmIssue(true)}
              disabled={issueMutation.isPending}>
              <Send size={15} />
              {issueMutation.isPending ? t('billing:detail.issuing') : t('billing:detail.issueAndSend')}
            </Button>
          </>
        )}
        {canPay && (
          <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setPaymentOpen(true)}>
            <Banknote size={15} /> {t('billing:invoice.actions.recordPayment')}
          </Button>
        )}
        {isStaff && !isDraft && !isCancelled && <Button variant="outline" className="w-full gap-2 border-violet-200 text-violet-700 hover:bg-violet-50" onClick={() => setAdjustmentOpen(true)}><Edit2 size={14} />Tạo bút toán điều chỉnh</Button>}
        {isStaff && !isDraft && !isCancelled && inv?.electronicInvoiceStatus !== 'ISSUED' && <Button variant="outline" className="w-full gap-2 border-blue-200 text-blue-700 hover:bg-blue-50" disabled={eInvoiceMutation.isPending || inv?.electronicInvoiceStatus === 'PENDING'} onClick={() => eInvoiceMutation.mutate()}><Send size={14} />{inv?.electronicInvoiceStatus === 'PENDING' ? 'Đang chờ HĐ điện tử' : inv?.electronicInvoiceStatus === 'FAILED' ? 'Gửi lại HĐ điện tử' : 'Gửi HĐ điện tử'}</Button>}
        {inv?.electronicInvoiceStatus === 'ISSUED' && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-medium text-emerald-700"><ShieldCheck size={14} className="mr-1 inline" />HĐ điện tử {inv.legalInvoiceNumber || inv.electronicInvoiceRef}</div>}
        {canSyncSap && !isDraft && !isCancelled && <Button variant="outline" className="w-full gap-2" disabled={sapMutation.isPending} onClick={() => sapMutation.mutate()}><Activity size={14} />{sapMutation.isPending ? 'Đang đồng bộ SAP...' : 'Đồng bộ SAP'}</Button>}
        {inv?.status === 'PAID' && (
          <div className="flex items-center justify-center gap-2 py-2 text-green-600 font-medium">
            <CheckCircle2 size={16} /> {t('billing:detail.invoicePaidFull')}
          </div>
        )}
        {isCancelled && inv?.voidReason && (
          <div className="text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-2">
            {t('billing:detail.cancelledReason', { reason: inv.voidReason })}
          </div>
        )}
        {isStaff && canVoid && (
          <Button variant="outline" className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50"
            onClick={handleVoid}
            disabled={voidMutation.isPending}>
            <Ban size={14} /> {t('billing:invoice.actions.cancel')}
          </Button>
        )}
      </div>

      <RecordPaymentDialog
        invoice={inv ? { ...inv, totalPaid } : null}
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
      />
      <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Bút toán điều chỉnh hóa đơn</DialogTitle></DialogHeader><div className="space-y-3">
          <div><label className="mb-1 block text-sm font-medium">Loại bút toán</label><Select value={adjustmentForm.type} onValueChange={(type) => setAdjustmentForm((current) => ({ ...current, type }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CREDIT_NOTE">Credit note — giảm phải thu</SelectItem><SelectItem value="DEBIT_NOTE">Debit note — tăng phải thu</SelectItem><SelectItem value="WRITE_OFF">Xóa nợ</SelectItem><SelectItem value="REFUND">Hoàn tiền đã thu</SelectItem></SelectContent></Select></div>
          <div><label className="mb-1 block text-sm font-medium">Số tiền</label><Input type="number" min="1" value={adjustmentForm.amount} onChange={(event) => setAdjustmentForm((current) => ({ ...current, amount: event.target.value }))} /></div>
          <div><label className="mb-1 block text-sm font-medium">Lý do bắt buộc</label><Input value={adjustmentForm.reason} onChange={(event) => setAdjustmentForm((current) => ({ ...current, reason: event.target.value }))} /></div>
          <div><label className="mb-1 block text-sm font-medium">Số tham chiếu/chứng từ</label><Input value={adjustmentForm.reference} onChange={(event) => setAdjustmentForm((current) => ({ ...current, reference: event.target.value }))} /></div>
        </div><DialogFooter><Button variant="outline" onClick={() => setAdjustmentOpen(false)}>Hủy</Button><Button disabled={!adjustmentForm.amount || !adjustmentForm.reason.trim() || adjustmentMutation.isPending} onClick={() => adjustmentMutation.mutate()}>{adjustmentMutation.isPending ? 'Đang lưu...' : 'Ghi nhận bút toán'}</Button></DialogFooter></DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmIssue}
        title={t('billing:confirmIssue.title')}
        description={t('billing:confirmIssue.description')}
        onCancel={() => setConfirmIssue(false)}
        onConfirm={() => issueMutation.mutate()}
        loading={issueMutation.isPending}
        confirmLabel={t('billing:confirmIssue.confirm')}
        loadingLabel={t('billing:confirmIssue.loading')}
      />
      <ReasonActionDialog
        open={!!reasonAction}
        onOpenChange={(open) => !open && setReasonAction(null)}
        title={reasonAction?.type === 'void' ? t('billing:voidDialog.title') : t('billing:reverseDialog.title')}
        description={t('billing:voidDialog.description')}
        confirmLabel={t('billing:voidDialog.confirm')}
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
  const { t } = useTranslation(['billing', 'common']);
  const { selectedMallId } = useMallStore();
  const { user } = useAuthStore();
  const isStaff = user?.role !== 'TENANT';
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [bucket, setBucket] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('invoiceId'));
  const [pendingDetail, setPendingDetail] = useState<any | null>(null);
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());
  const [confirmBulkPending, setConfirmBulkPending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (selectedMallId) params.set('mallId', selectedMallId);
      const response = await api.get(`/billing/invoices/export?${params.toString()}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoices_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t('billing:toast.exportError'), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoices', { selectedMallId, search, status, bucket, sourceType, page }],
    queryFn: () => billingApi.listInvoices({ mallId: selectedMallId || undefined, search: search || undefined, status: status || undefined, bucket: bucket || undefined, sourceType: sourceType || undefined, page, limit: 25 }),
  });

  const { data: pendingData, isLoading: isPendingLoading } = useQuery({
    queryKey: ['pending-receivables', { selectedMallId, search, sourceType }],
    queryFn: () => billingApi.listPendingReceivables({
      mallId: selectedMallId || undefined,
      search: search || undefined,
      sourceType: sourceType || undefined,
    }),
    enabled: isStaff,
  });

  const qc = useQueryClient();
  const createPendingInvoice = useMutation({
    mutationFn: (row: any) => billingApi.createInvoiceFromPending(row.sourceType, row.id),
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ['pending-receivables'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Đã tạo hóa đơn nháp', description: invoice.invoiceNumber });
      setBucket('DRAFT');
      setSelectedId(invoice.id);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể tạo hóa đơn', variant: 'destructive' }),
  });

  const pendingRows: any[] = pendingData?.data ?? [];
  const pendingSummary = pendingData?.summary ?? {};
  const duePendingRows = pendingRows.filter((row) => row.isDueForInvoice);
  const allDueSelected = duePendingRows.length > 0 && duePendingRows.every((row) => selectedPending.has(`${row.sourceType}:${row.id}`));

  const createDueInvoices = useMutation({
    mutationFn: () => billingApi.createDueInvoicesFromPending({
      mallId: selectedMallId || undefined,
      search: search || undefined,
      sourceType: sourceType || undefined,
      items: selectedPending.size
        ? pendingRows.filter((row) => selectedPending.has(`${row.sourceType}:${row.id}`)).map((row) => ({ id: row.id, sourceType: row.sourceType }))
        : undefined,
    }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['pending-receivables'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setSelectedPending(new Set());
      setConfirmBulkPending(false);
      toast({
        title: `Đã tạo ${result.created} hóa đơn nháp`,
        description: result.failed ? `${result.failed} khoản chưa xử lý được` : undefined,
        variant: result.failed ? 'destructive' : 'default',
      });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể tạo hóa đơn hàng loạt', variant: 'destructive' }),
  });

  const invoices: Invoice[] = data?.data ?? [];
  const summary = data?.summary ?? {};
  // CR-102: summary.* is VND-only (see billing.service.ts findAllInvoices) -- never blend
  // it with other currencies. summary.byCurrency carries every currency's own totals so
  // non-VND amounts are visible, not silently dropped from the page.
  const nonVndCurrencies = Object.keys(summary.byCurrency || {}).filter((c) => c !== 'VND' && (summary.byCurrency[c]?.totalOutstanding || 0) > 0);
  const sourceBreakdown = Array.from(new Set([
    ...Object.keys(summary.bySource || {}),
    ...Object.keys(pendingSummary.bySource || {}),
  ])).map((source) => ({
    source,
    count: (summary.bySource?.[source]?.count || 0) + (pendingSummary.bySource?.[source]?.count || 0),
    amount: (summary.bySource?.[source]?.amount || 0) + (pendingSummary.bySource?.[source]?.amount || 0),
  }));
  const totalPages = data?.totalPages ?? 1;

  // Active step based on filter
  const activeStep = !status ? undefined
    : status === 'DRAFT' ? 2
    : status === 'ISSUED' ? 3
    : status === 'PAID' ? 4
    : undefined;

  return (
    <div>
      <WorkflowBar active={activeStep} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ['', 'Tổng phải thu dự kiến (VND)', (summary.totalOutstanding || 0) + (pendingSummary.amount || 0), (summary.draft?.count || 0) + (summary.current?.count || 0) + (summary.partial?.count || 0) + (summary.overdue?.count || 0) + (pendingSummary.count || 0), 'border-slate-200 bg-white text-slate-900'],
          ['UNBILLED', 'Chờ xuất hóa đơn (VND)', pendingSummary.amount || 0, pendingSummary.count || 0, 'border-violet-200 bg-violet-50 text-violet-800'],
          ['DRAFT', 'Hóa đơn nháp (VND)', summary.draft?.amount || 0, summary.draft?.count || 0, 'border-amber-200 bg-amber-50 text-amber-800'],
          ['CURRENT', 'Chờ thu trong hạn (VND)', summary.current?.amount || 0, summary.current?.count || 0, 'border-blue-200 bg-blue-50 text-blue-800'],
          ['PARTIAL', 'Đã thu một phần (VND)', summary.partial?.amount || 0, summary.partial?.count || 0, 'border-orange-200 bg-orange-50 text-orange-800'],
          ['OVERDUE', 'Quá hạn (VND)', summary.overdue?.amount || 0, summary.overdue?.count || 0, 'border-red-200 bg-red-50 text-red-800'],
        ].map(([key, label, amount, count, color]) => (
          <button key={String(key)} onClick={() => { setBucket(String(key)); setStatus(''); setPage(1); }}
            className={`rounded-xl border p-3 text-left transition-shadow hover:shadow-sm ${color} ${bucket === key ? 'ring-2 ring-slate-700' : ''}`}>
            <div className="text-xs font-medium">{label}</div>
            <div className="mt-1 text-lg font-bold">{fmtCompact(Number(amount))} ₫</div>
            <div className="mt-1 text-xs opacity-70">{count} khoản</div>
          </button>
        ))}
      </div>
      {nonVndCurrencies.length > 0 && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Ngoài VND ở trên, còn có công nợ bằng {nonVndCurrencies.map((c) => (
            <span key={c} className="font-medium">
              {formatMoney(summary.byCurrency[c].totalOutstanding, c as CurrencyCode)}
            </span>
          )).reduce((prev, curr) => (prev.length ? [...prev, ', ', curr] : [curr]), [] as any[])}
          {' '}(không gộp chung vào tổng VND để tránh cộng nhầm đơn vị tiền tệ).
        </div>
      )}

      {(bucket === 'UNBILLED' || (!bucket && pendingRows.length > 0)) && (
        <div className="mb-5 overflow-hidden rounded-xl border border-violet-200 bg-white">
          <div className="flex items-center justify-between border-b border-violet-100 bg-violet-50 px-4 py-3">
            <div>
              <div className="flex items-center gap-2 font-semibold text-violet-900"><Clock size={15} /> Khoản phải thu chờ xuất hóa đơn</div>
              <p className="mt-0.5 text-xs text-violet-700">Phát sinh từ lịch thu hợp đồng, chưa được ghi nhận thành hóa đơn.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="border border-violet-200 bg-white text-violet-700">{pendingSummary.dueCount || 0} khoản đến hạn xuất</Badge>
              <Button size="sm" className="gap-1.5" disabled={!duePendingRows.length || createDueInvoices.isPending} onClick={() => setConfirmBulkPending(true)}>
                <FileText size={13} /> {selectedPending.size ? `Tạo ${selectedPending.size} hóa đơn` : 'Tạo tất cả đến hạn'}
              </Button>
            </div>
          </div>
          {isPendingLoading ? (
            <div className="space-y-2 p-4"><Skeleton className="h-11" /><Skeleton className="h-11" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1220px] w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500"><tr>
                  <th className="w-10 px-3 py-2.5 text-center"><input type="checkbox" aria-label="Chọn tất cả khoản đến hạn" checked={allDueSelected} disabled={!duePendingRows.length} onChange={(event) => setSelectedPending(event.target.checked ? new Set(duePendingRows.map((row) => `${row.sourceType}:${row.id}`)) : new Set())} /></th>
                  <th className="px-4 py-2.5 text-left font-medium">Đối tượng phải thu</th>
                  <th className="px-4 py-2.5 text-left font-medium">Nguồn / Hợp đồng</th>
                  <th className="px-4 py-2.5 text-left font-medium">Kỳ thu / Nội dung</th>
                  <th className="px-4 py-2.5 text-right font-medium">Giá trị hóa đơn</th>
                  <th className="px-4 py-2.5 text-right font-medium">Đã ghi nhận</th>
                  <th className="px-4 py-2.5 text-right font-medium">Còn dự kiến thu</th>
                  <th className="px-4 py-2.5 text-left font-medium">Ngày dự kiến xuất</th>
                  <th className="px-4 py-2.5 text-left font-medium">Tình trạng</th>
                  <th className="px-4 py-2.5 text-right font-medium">Thao tác</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingRows.map((row) => (
                    <tr key={`${row.sourceType}-${row.id}`} onClick={() => setPendingDetail(row)} className={`cursor-pointer hover:bg-violet-50 ${row.isDueForInvoice ? 'bg-red-50/40' : ''}`}>
                      <td className="px-3 py-3 text-center"><input type="checkbox" aria-label={`Chọn ${row.contractNumber}`} disabled={!row.isDueForInvoice} checked={selectedPending.has(`${row.sourceType}:${row.id}`)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedPending((current) => { const next = new Set(current); const key = `${row.sourceType}:${row.id}`; event.target.checked ? next.add(key) : next.delete(key); return next; })} /></td>
                      <td className="px-4 py-3"><div className="font-medium text-gray-800">{row.counterpartyName}</div><div className="text-xs text-gray-400">{row.taxCode || row.unitCode || '—'}</div></td>
                      <td className="px-4 py-3"><Badge className={`border text-[11px] ${SOURCE_COLORS[row.sourceType] || 'border-slate-200 bg-slate-50 text-slate-700'}`}>{SOURCE_LABELS[row.sourceType] || row.sourceType}</Badge><div className="mt-1 font-mono text-[11px] text-slate-500">{row.contractNumber}</div>{row.contractType && <div className="text-[11px] text-slate-400">{row.contractType === 'PRINCIPLE_ACTUAL' ? 'Nguyên tắc · theo thực tế' : 'Định mức + phí vượt'}</div>}</td>
                      <td className="px-4 py-3"><div className="text-gray-700">{row.milestone}</div><div className="text-xs text-gray-400">{row.period || 'Theo mốc hợp đồng'}</div></td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtCompactCur(row.totalAmount, row.currencyCode)}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700">{row.paidAmount ? fmtCompactCur(row.paidAmount, row.currencyCode) : '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtCompactCur(row.amountToCollect ?? row.totalAmount, row.currencyCode)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(row.invoicePlannedDate)}<div className="text-[11px] text-gray-400">Hạn thu {fmtDate(row.dueDate)}</div></td>
                      <td className="px-4 py-3">{row.isDueForInvoice
                        ? <Badge className="border border-red-200 bg-red-100 text-red-700">{row.daysInvoiceOverdue ? `Treo ${row.daysInvoiceOverdue} ngày` : 'Đến hạn xuất'}</Badge>
                        : <Badge className="border border-violet-200 bg-violet-100 text-violet-700">Dự kiến sau {Math.max(1, row.daysUntilInvoice)} ngày</Badge>}
                      </td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant={row.isDueForInvoice ? 'default' : 'outline'} className="gap-1.5" disabled={createPendingInvoice.isPending} onClick={(event) => { event.stopPropagation(); createPendingInvoice.mutate(row); }}><FileText size={13} /> Tạo hóa đơn nháp</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pendingRows.length === 0 && <div className="py-8 text-center text-sm text-gray-400">Không có khoản phải thu nào đang chờ xuất hóa đơn.</div>}
            </div>
          )}
        </div>
      )}

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-slate-800">Phân loại theo nguồn thu</h3><p className="text-xs text-slate-500">Chọn một nguồn để kiểm tra đúng nhóm hợp đồng và khoản thu.</p></div><button onClick={() => { setSourceType(''); setPage(1); }} className={`rounded-full border px-3 py-1.5 text-xs ${!sourceType ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>Tất cả nguồn</button></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {sourceBreakdown.map(({ source, count, amount }) => (
            <button key={source} onClick={() => { setSourceType(source); setPage(1); }} className={`rounded-xl border p-3 text-left transition-all ${SOURCE_COLORS[source] || 'border-slate-200 bg-slate-50 text-slate-700'} ${sourceType === source ? 'ring-2 ring-slate-800 shadow-sm' : 'hover:shadow-sm'}`}>
              <div className="text-xs font-semibold">{SOURCE_LABELS[source] || source}</div>
              <div className="mt-1 text-base font-bold">{fmtCompact(amount)} ₫</div>
              <div className="mt-1 text-[11px] opacity-75">{count} khoản cần kiểm tra</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder={t('billing:list.searchPlaceholder')}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9 h-9" />
        </div>
        <div className="flex gap-0.5 rounded-lg border overflow-hidden h-9">
          {['', 'DRAFT', 'ISSUED', 'OVERDUE', 'PARTIALLY_PAID', 'PAID'].map((s) => (
            <button key={s} onClick={() => { setStatus(s); setBucket(''); setPage(1); }}
              className={`px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                status === s ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              {s === '' ? t('billing:filters.allStatuses') : t(`billing:invoice.status.${s}`)}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 h-9 shrink-0" onClick={handleExportExcel} disabled={exporting}>
          <Download size={13} /> {exporting ? t('billing:list.exporting') : 'Excel'}
        </Button>
      </div>

      {bucket !== 'UNBILLED' && (isError ? (
        <AsyncState isLoading={false} isError onRetry={refetch}
          errorTitle="Không thể tải danh sách hóa đơn"><div /></AsyncState>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-[1280px] w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('billing:list.invoiceNo')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('billing:list.tenant')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Nguồn / Hợp đồng</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Kỳ thu</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('billing:list.totalAmount')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Đã thu</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Còn phải thu</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('billing:list.dueDate')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('billing:list.status')}</th>
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
                    <td className="px-4 py-3 font-medium text-gray-800">{inv.counterpartyName || inv.tenant?.brandName || inv.billingParty?.name}</td>
                    <td className="px-4 py-3">
                      <Badge className={`border text-[11px] ${SOURCE_COLORS[inv.sourceType || ''] || 'border-slate-200 bg-slate-50 text-slate-700'}`}>{SOURCE_LABELS[inv.sourceType || ''] || inv.type}</Badge>
                      <div className="mt-1 text-[11px] font-medium text-slate-500">{inv.sourceContractNumber || inv.contract?.contractNumber || inv.serviceContractPayment?.contract?.contractNumber || 'Không có số hợp đồng'}</div>
                      {inv.sourceType === 'PARKING' && <div className={`mt-1 text-[11px] ${inv.sourceStatus === 'PAID' ? 'text-emerald-700' : inv.sourceStatus === 'PARTIAL' ? 'text-amber-700' : 'text-slate-400'}`}>Parking: {inv.sourceStatus === 'PAID' ? 'đã thanh toán' : inv.sourceStatus === 'PARTIAL' ? 'đã thu một phần' : 'chưa thu'}{inv.sourceContractType ? ` · ${inv.sourceContractType === 'PRINCIPLE_ACTUAL' ? 'theo thực tế' : 'định mức'}` : ''}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs"><div>{inv.serviceContractPayment?.milestone || inv.period}</div><div className="text-[11px] text-slate-400">{inv.type}</div></td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {fmtCompactCur(inv.totalAmount, inv.currencyCode)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700">{inv.totalPaid ? fmtCompactCur(inv.totalPaid, inv.currencyCode) : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtCompactCur(inv.balance ?? inv.totalAmount, inv.currencyCode)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {fmtDate(inv.dueDate)}
                      {(inv.daysOverdue || overdue) ? <div className="mt-0.5 font-medium text-red-600">Quá {inv.daysOverdue || 0} ngày</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${st?.color} border text-xs`}>{t(`billing:invoice.status.${inv.status}`)}</Badge>
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
            <div className="text-center py-12 text-gray-400 space-y-3">
              <Receipt size={36} className="mx-auto mb-2 opacity-30" />
              {(search || status || bucket || sourceType) ? (
                <>
                  <p className="text-sm font-medium text-gray-600">{t('billing:list.noInvoicesFiltered')}</p>
                  <p className="text-sm">{t('billing:list.noInvoicesFilteredHint')}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSearch(''); setStatus(''); setBucket(''); setSourceType(''); }}
                  >
                    {t('billing:list.clearFilters')}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-600">{t('billing:list.noInvoices')}</p>
                  <p className="text-sm">{t('billing:list.noInvoicesHint')}</p>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      {bucket !== 'UNBILLED' && totalPages > 1 && <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>Trang {page}/{totalPages} · {data?.total || 0} hóa đơn</span>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Trang trước</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Trang sau</Button></div>
      </div>}

      {/* Detail sheet overlay */}
      {selectedId && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedId(null)} />
          <InvoiceDetailSheet invoiceId={selectedId} onClose={() => setSelectedId(null)} />
        </>
      )}

      <Dialog open={!!pendingDetail} onOpenChange={(open) => !open && setPendingDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Chi tiết khoản chờ xuất hóa đơn</DialogTitle></DialogHeader>
          {pendingDetail && <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-violet-50 p-4"><div className="font-semibold text-violet-900">{pendingDetail.counterpartyName}</div><div className="mt-1 text-xs text-violet-700">{SOURCE_LABELS[pendingDetail.sourceType] || pendingDetail.sourceType} · {pendingDetail.contractNumber}</div></div>
            <div className="grid grid-cols-2 gap-3">
              <div><div className="text-xs text-slate-400">Nội dung / kỳ thu</div><div className="font-medium">{pendingDetail.milestone || pendingDetail.period || 'Theo hợp đồng'}</div></div>
              <div><div className="text-xs text-slate-400">Số tiền dự kiến</div><div className="font-bold">{fmtMoney(pendingDetail.totalAmount, pendingDetail.currencyCode)}</div></div>
              <div><div className="text-xs text-slate-400">Đã ghi nhận tại nguồn</div><div className="font-medium text-emerald-700">{fmtMoney(pendingDetail.paidAmount, pendingDetail.currencyCode)}</div></div>
              <div><div className="text-xs text-slate-400">Còn dự kiến thu</div><div className="font-bold">{fmtMoney(pendingDetail.amountToCollect ?? pendingDetail.totalAmount, pendingDetail.currencyCode)}</div></div>
              <div><div className="text-xs text-slate-400">Ngày dự kiến xuất</div><div>{fmtDate(pendingDetail.invoicePlannedDate)}</div></div>
              <div><div className="text-xs text-slate-400">Hạn thanh toán</div><div>{fmtDate(pendingDetail.dueDate)}</div></div>
            </div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setPendingDetail(null)}>Đóng</Button>{isStaff && pendingDetail && <Button disabled={createPendingInvoice.isPending} onClick={() => { createPendingInvoice.mutate(pendingDetail); setPendingDetail(null); }}><FileText size={13} className="mr-1" />Tạo hóa đơn nháp</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmBulkPending}
        title="Tạo hóa đơn nháp hàng loạt"
        description={`Hệ thống sẽ tạo ${selectedPending.size || duePendingRows.length} hóa đơn nháp từ các khoản đã đến hạn. Kế toán vẫn cần kiểm tra và phát hành từng hóa đơn.`}
        confirmLabel="Tạo hóa đơn nháp"
        loadingLabel="Đang tạo..."
        onConfirm={() => createDueInvoices.mutate()}
        onCancel={() => setConfirmBulkPending(false)}
        loading={createDueInvoices.isPending}
      />
    </div>
  );
}

// ── AR Aging Tab ──────────────────────────────────────────────────────────────

function ArAgingTab() {
  const { t } = useTranslation('billing');
  const { selectedMallId } = useMallStore();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['ar-aging', selectedMallId], queryFn: () => billingApi.arAging(selectedMallId || undefined) });
  const rows: ArAgingRow[] = data?.data ?? data ?? [];
  // The summary cards and grand total below are single VND-denominated numbers -- mixing in
  // USD/MMK rows would silently sum across currencies into a meaningless figure, so they're
  // scoped to VND rows (same convention as the main dashboard's revenue KPIs). Non-VND rows
  // still appear individually in the table below, labeled with their own currency.
  const vndRows = rows.filter((r) => (r.currencyCode ?? 'VND') === 'VND');
  const total = vndRows.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <div className="grid grid-cols-5 gap-3 mb-4">
        {['current', 'days30', 'days60', 'days90', 'days90plus'].map((key, i) => {
          const labelKeys = ['arAging.current', 'arAging.days30', 'arAging.days60', 'arAging.days90', 'arAging.over90'] as const;
          const colors = ['text-green-600', 'text-yellow-600', 'text-orange-600', 'text-red-500', 'text-red-700'];
          const sum = vndRows.reduce((s, r) => s + (r as any)[key], 0);
          return (
            <Card key={key}>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-gray-500">{t(labelKeys[i])}</p>
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
                <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs">{t('arAging.tenant')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">{t('arAging.current')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">{t('arAging.days30')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">{t('arAging.days60')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">{t('arAging.days90')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs">&gt;90 {t('arAging.days90').split('-').pop()?.trim()}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs font-bold">{t('arAging.total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => {
                const cur = r.currencyCode ?? 'VND';
                const fmt = (n: number) => formatMoney(n, cur);
                return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <div>{r.counterpartyName || r.tenant?.brandName || r.billingParty?.name} {cur !== 'VND' && <span className="text-xs font-normal text-slate-400">({cur})</span>}</div>
                    {r.billingParty?.taxCode && <div className="text-xs font-normal text-slate-400">MST: {r.billingParty.taxCode}</div>}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">{r.current > 0 ? fmt(r.current) : '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-yellow-600">{r.days30 > 0 ? fmt(r.days30) : '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-orange-600">{r.days60 > 0 ? fmt(r.days60) : '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-red-500">{r.days90 > 0 ? fmt(r.days90) : '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-red-700 font-medium">{r.days90plus > 0 ? fmt(r.days90plus) : '—'}</td>
                  <td className="px-4 py-3 text-right font-bold">{fmt(r.total)}</td>
                </tr>
                );
              })}
              <tr className="bg-gray-50 font-bold border-t">
                <td className="px-4 py-3">{t('arAging.grandTotal')} <span className="text-xs font-normal text-slate-400">(VND)</span></td>
                <td colSpan={5} />
                <td className="px-4 py-3 text-right text-red-700">{formatMoney(total, 'VND')}</td>
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
  const { t } = useTranslation('billing');
  const { selectedMallId } = useMallStore();
  const { user } = useAuthStore();
  const isStaff = user?.role !== 'TENANT';
  const { data: executiveKpi } = useQuery({ queryKey: ['collection-kpi', selectedMallId], queryFn: () => billingApi.getCollectionKpi(6, selectedMallId || undefined), enabled: isStaff });
  const kpi = executiveKpi?.data ?? executiveKpi ?? {};
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-900 p-6 text-white shadow-[0_25px_65px_-35px_rgba(6,78,59,0.8)]">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border border-emerald-200/10 bg-emerald-200/5" />
        <div className="relative grid gap-6 xl:grid-cols-[1.4fr_1fr] xl:items-end">
          <div><div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200"><Sparkles size={13} /> Revenue operations</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('header.title')}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{t('header.subtitle')}</p></div>
          <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07]">
            <div className="border-r border-white/10 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('header.collectionRate')}</div><div className="mt-2 text-2xl font-semibold text-emerald-300">{kpi.collectionRate ?? 0}%</div></div>
            <div className="border-r border-white/10 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('header.dso')}</div><div className="mt-2 text-2xl font-semibold">{kpi.dso ?? 0}<span className="ml-1 text-xs text-slate-400">{t('header.dsoUnit')}</span></div></div>
            <div className="p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('header.arOutstanding')}</div><div className="mt-2 text-lg font-semibold text-amber-300">{fmtCompact(kpi.outstandingAr ?? 0)}</div></div>
          </div>
        </div>
      </section>
      <div className="flex items-center gap-2"><ShieldCheck size={17} className="text-emerald-700" /><div><h2 className="text-lg font-semibold text-slate-950">{t('header.operationsCenter')}</h2><p className="text-xs text-slate-500">{t('header.selectStep')}</p></div></div>
      <Tabs defaultValue="invoices">
        <TabsList className="mb-4 h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="invoices" className="gap-1.5 whitespace-nowrap rounded-lg"><Receipt size={13} /> {t('tabs.invoices')}</TabsTrigger>
          {isStaff && <TabsTrigger value="ar-aging" className="gap-1.5 whitespace-nowrap rounded-lg"><Activity size={13} /> {t('tabs.arAging')}</TabsTrigger>}
          {isStaff && <TabsTrigger value="schedule" className="gap-1.5 whitespace-nowrap rounded-lg"><Clock size={13} /> {t('tabs.schedule')}</TabsTrigger>}
          {isStaff && <TabsTrigger value="dunning" className="gap-1.5 whitespace-nowrap rounded-lg"><AlertTriangle size={13} /> {t('tabs.dunning')}</TabsTrigger>}
          {isStaff && <TabsTrigger value="kpi" className="gap-1.5 whitespace-nowrap rounded-lg"><TrendingUp size={13} /> {t('tabs.kpi')}</TabsTrigger>}
        </TabsList>
        <TabsContent value="invoices"><InvoicesTab /></TabsContent>
        {isStaff && <TabsContent value="ar-aging"><ArAgingTab /></TabsContent>}
        {isStaff && <TabsContent value="schedule"><ScheduleTab /></TabsContent>}
        {isStaff && <TabsContent value="dunning"><DunningTab /></TabsContent>}
        {isStaff && <TabsContent value="kpi"><CollectionKpiTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
