import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Selecto from 'react-selecto';
import { useDragSelect, DRAG_SELECT_CLASS } from '@/hooks/useDragSelect';
import { BulkSelectionBar } from '@/components/BulkSelectionBar';
import { approvalsApi, bookingApi, proposalsApi, spacesApi } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { AsyncState } from '@/components/ui/async-state';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import {
  CheckCircle, XCircle, CheckSquare, Square, DollarSign, AlertTriangle,
  Building2, Loader2, History, ChevronLeft, ChevronRight, Eye, Download,
  FileText, User, CalendarDays, Clock3, MessageSquare, ShieldCheck, Search, SlidersHorizontal, Sparkles, X,
} from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { useMallStore } from '@/store/mall.store';

function fmt(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', notation: 'compact' }).format(n);
}
function fmtPrice(n: number | null | undefined) {
  if (!n) return '—';
  return new Intl.NumberFormat('vi-VN').format(n);
}

function fmtDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function isRecent(value: string) { return Date.now() - new Date(value).getTime() < 24 * 60 * 60 * 1000; }
function approvalAge(value: string) {
  const hours = Math.floor(Math.max(0, Date.now() - new Date(value).getTime()) / 3_600_000);
  if (hours < 1) return 'Vừa tạo';
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days} ngày trước` : new Date(value).toLocaleDateString('vi-VN');
}

function ApprovalPipeline({ steps, workflowStatus }: { steps: any[]; workflowStatus?: string }) {
  const approvedCount = steps.filter((step) => step.status === 'APPROVED').length;
  const rejectedIndex = steps.findIndex((step) => step.status === 'REJECTED');
  const pendingIndex = steps.findIndex((step) => step.status !== 'APPROVED' && step.status !== 'REJECTED');
  const currentIndex = rejectedIndex >= 0 ? rejectedIndex : pendingIndex;
  const progress = steps.length ? Math.round((approvedCount / steps.length) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck size={17} className="text-blue-600" /> Tiến trình phê duyệt
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {workflowStatus === 'APPROVED'
                ? 'Tất cả các bước đã hoàn thành'
                : workflowStatus === 'REJECTED'
                  ? `Dừng tại bước ${rejectedIndex + 1}`
                  : currentIndex >= 0 ? `Đang chờ xử lý bước ${currentIndex + 1} trên ${steps.length}` : 'Chưa có bước duyệt'}
            </p>
          </div>
          <div className="min-w-[150px] text-right">
            <span className="text-sm font-bold text-slate-900">{progress}%</span>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto px-4 py-5">
        <div className="flex min-w-max items-stretch">
          {steps.map((step, index) => {
            const approved = step.status === 'APPROVED';
            const rejected = step.status === 'REJECTED';
            const active = index === currentIndex && !rejected;
            const waiting = !approved && !rejected && !active;
            return (
              <div key={step.id} className="flex items-center">
                <div className={`w-44 rounded-xl border p-3 transition-colors ${
                  approved ? 'border-emerald-200 bg-emerald-50' :
                  rejected ? 'border-red-300 bg-red-50' :
                  active ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100' :
                  'border-slate-200 bg-slate-50'
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      approved ? 'bg-emerald-600 text-white' : rejected ? 'bg-red-600 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {approved ? <CheckCircle size={17} /> : rejected ? <XCircle size={17} /> : index + 1}
                    </span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                      approved ? 'text-emerald-700' : rejected ? 'text-red-700' : active ? 'text-blue-700' : 'text-slate-400'
                    }`}>
                      {approved ? 'Đã duyệt' : rejected ? 'Từ chối' : active ? 'Đang xử lý' : 'Chưa đến lượt'}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-10 text-sm font-semibold text-slate-900">{step.stepName}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{step.approverRole}</p>
                  <div className="mt-3 border-t border-current/10 pt-2 text-[11px] text-slate-500">
                    {step.approver?.fullName ? (
                      <><p className="truncate font-medium text-slate-700">{step.approver.fullName}</p><p className="mt-0.5">{fmtDateTime(step.decidedAt)}</p></>
                    ) : active ? <p className="font-medium text-blue-700">Đang chờ người duyệt</p>
                      : waiting ? <p>Chờ hoàn tất bước trước</p> : null}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`mx-2 h-0.5 w-8 ${approved ? 'bg-emerald-400' : 'bg-slate-200'}`}>
                    <span className={`block h-2 w-2 -translate-y-[3px] translate-x-7 rotate-45 border-r-2 border-t-2 ${approved ? 'border-emerald-400' : 'border-slate-300'}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {steps.length > 3 && <p className="border-t border-slate-100 px-4 py-2 text-center text-[11px] text-slate-400">Kéo ngang để xem toàn bộ quy trình</p>}
    </section>
  );
}

function ApprovalDetailSheet({ workflowId, onClose }: { workflowId: string | null; onClose: () => void }) {
  const { t } = useTranslation(['deals', 'common']);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: workflow, isLoading, isError, refetch } = useQuery({
    queryKey: ['approval-workflow', workflowId],
    queryFn: () => approvalsApi.getWorkflow(workflowId!),
    enabled: !!workflowId,
  });
  const w: any = workflow;
  const p: any = w?.proposal;
  const steps: any[] = w?.steps ?? [];
  const completed = w?.status === 'APPROVED';

  const getPdf = async (mode: 'open' | 'download') => {
    if (!p?.id) return;
    try {
      const blob = await proposalsApi.exportPdf(p.id);
      const url = URL.createObjectURL(blob);
      if (mode === 'open') {
        window.open(url, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = `proposal-${p.proposalNumber}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      toast({ title: t('approvals.workflow.errorPdf'), variant: 'destructive' });
    }
  };

  return (
    <Sheet open={!!workflowId} onClose={onClose} title={p?.proposalNumber ?? t('approvals.workflow.title')} subtitle={p?.tenant?.brandName ?? p?.lead?.brandName} className="w-[720px] max-w-[96vw]">
      {isLoading ? <div className="space-y-3 p-6">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      : isError ? <div className="p-6"><AsyncState isLoading={false} isError onRetry={refetch} errorTitle={t('approvals.workflow.errorLoad')}><div /></AsyncState></div>
      : w && p ? (
        <div className="space-y-5 p-6">
          <div className={`rounded-2xl border p-4 ${completed ? 'border-emerald-200 bg-emerald-50' : w.status === 'REJECTED' ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wider opacity-60">{t('approvals.workflow.status')}</p><p className="mt-1 text-lg font-bold">{completed ? t('approvals.workflow.completed') : w.status === 'REJECTED' ? t('approvals.workflow.rejected') : t('approvals.workflow.inProgress')}</p><p className="mt-1 text-xs opacity-70">{t('approvals.workflow.timestamps', { created: fmtDateTime(w.createdAt), updated: fmtDateTime(w.updatedAt) })}</p></div>
              <Badge className="border-0 bg-white/80 text-slate-700">{t('approvals.workflow.steps', { done: steps.filter((s) => s.status === 'APPROVED').length, total: steps.length })}</Badge>
            </div>
            {p.id && (
              <button
                className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                onClick={() => { onClose(); navigate(`/proposals?id=${p.id}`); }}
              >
                <FileText size={12} /> {t('approvals.workflow.viewProposal')} <ChevronRight size={12} />
              </button>
            )}
          </div>

          <ApprovalPipeline steps={steps} workflowStatus={w.status} />

          <SheetSection label={t('approvals.workflow.section.proposalInfo')} className="bg-slate-50">
            <div className="grid grid-cols-2 gap-x-4">
              <SheetRow label={t('approvals.workflow.fields.tenantBrand')} value={p.tenant?.brandName ?? p.lead?.brandName} icon={User} />
              <SheetRow label={t('approvals.workflow.fields.company')} value={p.tenant?.companyName ?? p.lead?.company} icon={Building2} />
              <SheetRow label={t('approvals.workflow.fields.unit')} value={`${p.unit?.code ?? '—'}${p.unit?.floor?.name ? ` · ${p.unit.floor.name}` : ''}`} icon={Building2} />
              <SheetRow label={t('approvals.workflow.fields.area')} value={p.area ? `${Number(p.area).toLocaleString('vi-VN')} m²` : null} icon={Building2} />
              <SheetRow label={t('approvals.workflow.fields.term')} value={p.term ? `${p.term} tháng` : null} icon={CalendarDays} />
              <SheetRow label={t('approvals.workflow.fields.dateRange')} value={`${p.startDate ? new Date(p.startDate).toLocaleDateString('vi-VN') : '—'} – ${p.endDate ? new Date(p.endDate).toLocaleDateString('vi-VN') : '—'}`} icon={CalendarDays} />
            </div>
          </SheetSection>

          <SheetSection label={t('approvals.workflow.section.financial')} className="bg-slate-50">
            <div className="grid grid-cols-2 gap-x-4">
              <SheetRow label={t('approvals.workflow.fields.rentPerSqm')} value={p.rentPerSqm ? `${fmtPrice(p.rentPerSqm)} ${p.rentCurrency ?? 'VND'}` : null} icon={DollarSign} />
              <SheetRow label={t('approvals.workflow.fields.monthlyRent')} value={p.monthlyRent ? fmt(p.monthlyRent) : null} icon={DollarSign} />
              <SheetRow label={t('approvals.workflow.fields.camFee')} value={p.monthlyCAM ? fmt(p.monthlyCAM) : null} icon={DollarSign} />
              <SheetRow label={t('approvals.workflow.fields.discount')} value={`${p.discount ?? 0}%`} icon={DollarSign} />
              <SheetRow label={t('approvals.workflow.fields.rentFree')} value={`${p.rentFree ?? 0} ngày/tháng`} icon={CalendarDays} />
              <SheetRow label={t('approvals.workflow.fields.contractValue')} value={p.totalContractValue ? fmt(p.totalContractValue) : null} icon={DollarSign} />
            </div>
            {(p.specialConditions || p.notes) && <div className="mt-3 rounded-lg border bg-white p-3 text-sm"><span className="font-semibold">{t('approvals.workflow.fields.conditionsNotes')}: </span>{p.specialConditions ?? p.notes}</div>}
          </SheetSection>

          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500"><ShieldCheck size={15} /> {t('approvals.workflow.section.log')}</div>
            <div className="space-y-0">
              {steps.map((step, index) => <div key={step.id} className="relative flex gap-3 pb-5 last:pb-0">{index < steps.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-slate-200" />}<span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${step.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : step.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-400'}`}>{step.status === 'APPROVED' ? <CheckCircle size={16} /> : step.status === 'REJECTED' ? <XCircle size={16} /> : <Clock3 size={15} />}</span><div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{t('approvals.workflow.step.stepLabel', { order: step.stepOrder, name: step.stepName })}</p><p className="mt-0.5 text-xs text-slate-500">{t('approvals.workflow.step.role', { role: step.approverRole })}</p></div><Badge className={`border-0 ${step.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : step.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{step.status === 'APPROVED' ? t('approvals.workflow.step.approved') : step.status === 'REJECTED' ? t('approvals.workflow.step.rejected') : t('approvals.workflow.step.pending')}</Badge></div>{step.approver && <div className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-2"><span><User size={12} className="mr-1 inline" />{step.approver.fullName} · {step.approver.department ?? step.approver.role}</span><span><Clock3 size={12} className="mr-1 inline" />{fmtDateTime(step.decidedAt)}</span>{step.approver.email && <span className="sm:col-span-2">{step.approver.email}</span>}</div>}{step.comment && <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-700"><MessageSquare size={12} className="mr-1 inline" />{step.comment}</div>}</div></div>)}
            </div>
          </section>

          {completed ? <div className="sticky bottom-0 flex gap-2 border-t bg-white pt-4"><Button className="flex-1 gap-2" onClick={() => getPdf('open')}><Eye size={15} /> {t('approvals.workflow.printReady')}</Button><Button variant="outline" className="flex-1 gap-2" onClick={() => getPdf('download')}><Download size={15} /> {t('approvals.workflow.savePdf')}</Button></div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><FileText size={15} className="mr-2 inline" />{t('approvals.workflow.printPending')}</div>}
        </div>
      ) : null}
    </Sheet>
  );
}

export default function ApprovalsPage() {
  const { t } = useTranslation(['deals', 'common']);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { role } = usePermission();
  const { selectedMallId } = useMallStore();
  const canApprovePrices = !!role && ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR'].includes(role);
  const [view, setView] = useState<'proposals' | 'prices' | 'history'>('proposals');
  const [proposalPage, setProposalPage] = useState(1);
  const [pricePage, setPricePage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyStatus, setHistoryStatus] = useState<'ALL' | 'APPROVED' | 'REJECTED'>('ALL');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(searchParams.get('workflowId'));
  const [search, setSearch] = useState('');
  const [floorId, setFloorId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [leaseTermType, setLeaseTermType] = useState('');

  const { data: floorsResponse } = useQuery({
    queryKey: ['approval-filter-floors', selectedMallId],
    queryFn: () => spacesApi.listFloors(selectedMallId || undefined),
  });
  const floors: any[] = floorsResponse?.data ?? floorsResponse ?? [];
  const { data: unitsResponse } = useQuery({
    queryKey: ['approval-filter-units', selectedMallId, floorId],
    queryFn: () => spacesApi.listUnits({ mallId: selectedMallId || undefined, floorId: floorId || undefined, page: 1, limit: 500 }),
  });
  const units: any[] = unitsResponse?.data ?? unitsResponse ?? [];

  useEffect(() => {
    setProposalPage(1); setHistoryPage(1); setSelectedWorkflowId(null);
    setSelectedProposalIds(new Set()); setSearch(''); setFloorId(''); setUnitId(''); setLeaseTermType('');
  }, [selectedMallId]);

  // ── Selection state ──
  const [selectedProposalIds, setSelectedProposalIds] = useState<Set<string>>(new Set());
  const [selectedPriceIds, setSelectedPriceIds] = useState<Set<string>>(new Set());

  // ── Drag select hooks ──
  const { gridRef: proposalGridRef, selectoRef: proposalSelectoRef, selectoProps: proposalSelectoProps } = useDragSelect({
    onSelect: (ids) => setSelectedProposalIds(new Set(ids)),
    onClear: () => setSelectedProposalIds(new Set()),
    idAttribute: 'data-step-id',
    selectFromInside: true,
  });
  const { gridRef: priceGridRef, selectoRef: priceSelectoRef, selectoProps: priceSelectoProps } = useDragSelect({
    onSelect: (ids) => setSelectedPriceIds(new Set(ids)),
    onClear: () => setSelectedPriceIds(new Set()),
    idAttribute: 'data-price-id',
    selectFromInside: true,
  });

  // ── Reject dialog ──
  const [rejectDialog, setRejectDialog] = useState<{ ids: string[]; type: 'proposal' | 'price'; bulk?: boolean } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // ── Queries ──
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['pending-approvals', proposalPage, selectedMallId, search, floorId, unitId, leaseTermType],
    queryFn: () => approvalsApi.pending({ page: proposalPage, limit: 15, mallId: selectedMallId || undefined, search: search || undefined, floorId: floorId || undefined, unitId: unitId || undefined, leaseTermType: leaseTermType || undefined }),
    refetchInterval: 30_000,
  });
  const { data: historyData, isLoading: loadingHistory, isError: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ['approvals-history', historyPage, historyStatus, selectedMallId, search, floorId, unitId, leaseTermType],
    queryFn: () => approvalsApi.history({
      page: historyPage,
      limit: 25,
      status: historyStatus === 'ALL' ? undefined : historyStatus,
      mallId: selectedMallId || undefined,
      search: search || undefined,
      floorId: floorId || undefined,
      unitId: unitId || undefined,
      leaseTermType: leaseTermType || undefined,
    }),
  });

  const { data: priceApprovalsData, isLoading: loadingPriceApprovals, isError: priceError, refetch: refetchPrices } = useQuery({
    queryKey: ['pending-price-approvals', pricePage, selectedMallId, leaseTermType],
    queryFn: () => bookingApi.getPendingPriceApproval({ page: pricePage, limit: 25, mallId: selectedMallId || undefined, leaseTermType: leaseTermType || undefined }),
    refetchInterval: 30_000,
    enabled: canApprovePrices,
  });

  const steps: any[] = data?.data ?? [];
  const proposalTotalPages: number = data?.totalPages ?? 1;
  const proposalTotal: number = data?.total ?? 0;
  const priceApprovals: any[] = priceApprovalsData?.data ?? [];
  const priceTotalPages: number = priceApprovalsData?.totalPages ?? 1;
  const priceTotal: number = priceApprovalsData?.total ?? 0;
  const historySteps: any[] = historyData?.data ?? [];
  const historyTotalPages: number = historyData?.totalPages ?? 1;
  const historyTotal: number = historyData?.total ?? 0;

  // ── Mutations — single ──
  const approveMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => approvalsApi.approve(id, comment),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pending-approvals'] }); qc.invalidateQueries({ queryKey: ['approvals-pending-nav'] }); qc.invalidateQueries({ queryKey: ['approvals-pending-count'] }); qc.invalidateQueries({ queryKey: ['approvals-history'] }); qc.invalidateQueries({ queryKey: ['proposals'] }); toast({ title: t('approvals.approveSuccess') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => approvalsApi.reject(id, comment),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pending-approvals'] }); qc.invalidateQueries({ queryKey: ['approvals-pending-nav'] }); qc.invalidateQueries({ queryKey: ['approvals-pending-count'] }); qc.invalidateQueries({ queryKey: ['approvals-history'] }); qc.invalidateQueries({ queryKey: ['proposals'] }); toast({ title: t('approvals.rejectSuccess'), variant: 'destructive' }); closeRejectDialog(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });
  const approvePriceMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => bookingApi.approvePrice(id, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pending-price-approvals'] }); qc.invalidateQueries({ queryKey: ['bookings'] }); toast({ title: t('approvals.approvePriceSuccess') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });
  const rejectPriceMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => bookingApi.rejectPrice(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pending-price-approvals'] }); qc.invalidateQueries({ queryKey: ['bookings'] }); toast({ title: t('approvals.rejectPriceSuccess'), variant: 'destructive' }); closeRejectDialog(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  // ── Bulk mutations ──
  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Approve sequentially to satisfy the "earlier step must be approved first" constraint.
      let ok = 0, fail = 0;
      for (const id of ids) {
        try { await approvalsApi.approve(id); ok++; }
        catch { fail++; }
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] });
      qc.invalidateQueries({ queryKey: ['approvals-pending-nav'] });
      qc.invalidateQueries({ queryKey: ['approvals-pending-count'] });
      setSelectedProposalIds(new Set());
      if (fail > 0) toast({ title: t('approvals.bulk.approvePartial', { ok, fail }), variant: 'destructive' });
      else toast({ title: t('approvals.bulk.approveSuccess', { ok }) });
    },
    onError: () => toast({ title: t('approvals.bulk.errorApprove'), variant: 'destructive' }),
  });
  const bulkRejectMutation = useMutation({
    mutationFn: async ({ ids, comment }: { ids: string[]; comment: string }) => {
      let ok = 0, fail = 0;
      for (const id of ids) {
        try { await approvalsApi.reject(id, comment); ok++; }
        catch { fail++; }
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] });
      qc.invalidateQueries({ queryKey: ['approvals-pending-nav'] });
      qc.invalidateQueries({ queryKey: ['approvals-pending-count'] });
      setSelectedProposalIds(new Set());
      closeRejectDialog();
      if (fail > 0) toast({ title: t('approvals.bulk.rejectPartial', { ok, fail }), variant: 'destructive' });
      else toast({ title: t('approvals.bulk.rejectSuccess', { ok }), variant: 'destructive' });
    },
    onError: () => toast({ title: t('approvals.bulk.errorReject'), variant: 'destructive' }),
  });
  const bulkApprovePriceMutation = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.allSettled(ids.map((id) => bookingApi.approvePrice(id))).then((results) => ({
        ok: results.filter((r) => r.status === 'fulfilled').length,
        fail: results.filter((r) => r.status === 'rejected').length,
      })),
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['pending-price-approvals'] });
      setSelectedPriceIds(new Set());
      if (fail > 0) toast({ title: t('approvals.bulk.approvePartial', { ok, fail }), variant: 'destructive' });
      else toast({ title: t('approvals.bulk.approvePriceSuccess', { ok }) });
    },
    onError: () => toast({ title: t('approvals.bulk.errorApprovePrice'), variant: 'destructive' }),
  });
  const bulkRejectPriceMutation = useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason: string }) =>
      Promise.allSettled(ids.map((id) => bookingApi.rejectPrice(id, reason))).then((results) => ({
        ok: results.filter((r) => r.status === 'fulfilled').length,
        fail: results.filter((r) => r.status === 'rejected').length,
      })),
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['pending-price-approvals'] });
      setSelectedPriceIds(new Set());
      closeRejectDialog();
      if (fail > 0) toast({ title: t('approvals.bulk.rejectPartial', { ok, fail }), variant: 'destructive' });
      else toast({ title: t('approvals.bulk.rejectPriceSuccess', { ok }), variant: 'destructive' });
    },
    onError: () => toast({ title: t('approvals.bulk.errorRejectPrice'), variant: 'destructive' }),
  });

  function closeRejectDialog() { setRejectDialog(null); setRejectReason(''); }

  function handleRejectConfirm() {
    if (!rejectDialog) return;
    const reason = rejectReason.trim();
    if (reason.length < 5) return;
    if (rejectDialog.type === 'price') {
      if (rejectDialog.bulk) bulkRejectPriceMutation.mutate({ ids: rejectDialog.ids, reason });
      else rejectPriceMutation.mutate({ id: rejectDialog.ids[0], reason });
    } else {
      if (rejectDialog.bulk) bulkRejectMutation.mutate({ ids: rejectDialog.ids, comment: reason });
      else rejectMutation.mutate({ id: rejectDialog.ids[0], comment: reason });
    }
  }

  const anyPending = approveMutation.isPending || rejectMutation.isPending
    || approvePriceMutation.isPending || rejectPriceMutation.isPending
    || bulkApproveMutation.isPending || bulkRejectMutation.isPending
    || bulkApprovePriceMutation.isPending || bulkRejectPriceMutation.isPending;

  return (
    <div>
      {/* ── Bulk bar — Proposals ── */}
      <BulkSelectionBar
        selectedCount={view === 'proposals' ? selectedProposalIds.size : 0}
        totalCount={steps.length}
        onSelectAll={() => setSelectedProposalIds(new Set(steps.map((s: any) => s.id)))}
        onClear={() => setSelectedProposalIds(new Set())}
      >
        <Button size="sm" variant="ghost" className="text-green-400 gap-1.5 shrink-0"
          disabled={bulkApproveMutation.isPending}
          onClick={() => bulkApproveMutation.mutate(Array.from(selectedProposalIds))}>
          {bulkApproveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          {t('approvals.actions.approveAll')}
        </Button>
        <Button size="sm" variant="ghost" className="text-red-400 gap-1.5 shrink-0"
          onClick={() => setRejectDialog({ ids: Array.from(selectedProposalIds), type: 'proposal', bulk: true })}>
          <XCircle size={14} /> {t('approvals.actions.rejectAll')}
        </Button>
      </BulkSelectionBar>

      {/* ── Bulk bar — Prices ── */}
      <BulkSelectionBar
        selectedCount={view === 'prices' ? selectedPriceIds.size : 0}
        totalCount={priceApprovals.length}
        onSelectAll={() => setSelectedPriceIds(new Set(priceApprovals.map((b: any) => b.id)))}
        onClear={() => setSelectedPriceIds(new Set())}
      >
        <Button size="sm" variant="ghost" className="text-green-400 gap-1.5 shrink-0"
          disabled={bulkApprovePriceMutation.isPending}
          onClick={() => bulkApprovePriceMutation.mutate(Array.from(selectedPriceIds))}>
          {bulkApprovePriceMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          {t('approvals.actions.approvePrice')}
        </Button>
        <Button size="sm" variant="ghost" className="text-red-400 gap-1.5 shrink-0"
          onClick={() => setRejectDialog({ ids: Array.from(selectedPriceIds), type: 'price', bulk: true })}>
          <XCircle size={14} /> {t('approvals.actions.rejectPrice')}
        </Button>
      </BulkSelectionBar>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('approvals.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('approvals.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Badge className="bg-blue-100 text-gray-700 border-0 text-sm px-3 py-1">{t('approvals.pendingCount', { count: proposalTotal })}</Badge>
          {canApprovePrices && <Badge className="bg-amber-100 text-amber-700 border-0 text-sm px-3 py-1">{t('approvals.pendingPriceCount', { count: priceTotal })}</Badge>}
        </div>
      </div>

      {/* ── Status cards ── */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          onClick={() => { setView('proposals'); setProposalPage(1); setSelectedPriceIds(new Set()); }}
          className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${view === 'proposals' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-blue-200 bg-white'}`}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-blue-700"><CheckSquare size={15} />{t('approvals.views.proposals')}</div><div className="mt-1 text-2xl font-bold text-slate-900">{proposalTotal}</div>
        </button>
        {canApprovePrices && <button
          onClick={() => { setView('prices'); setSelectedProposalIds(new Set()); setPricePage(1); }}
          className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${view === 'prices' ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-100' : 'border-amber-200 bg-white'}`}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700"><DollarSign size={15} />{t('approvals.views.prices')}</div><div className="mt-1 text-2xl font-bold text-slate-900">{priceTotal}</div>
        </button>}
        <button
          onClick={() => { setView('history'); setSelectedProposalIds(new Set()); setSelectedPriceIds(new Set()); setHistoryPage(1); }}
          className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${view === 'history' ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : 'border-emerald-200 bg-white'}`}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700"><History size={15} />{t('approvals.views.history')}</div><div className="mt-1 text-2xl font-bold text-slate-900">{historyTotal}</div>
        </button>
      </div>

      <div className="mb-5 flex w-fit gap-1 rounded-xl border bg-slate-50 p-1">
        {[['', 'Tất cả loại thuê'], ['LONG', 'Cho thuê dài hạn'], ['SHORT', 'Cho thuê ngắn hạn']].map(([key, label]) => <button key={key || 'ALL'} onClick={() => { setLeaseTermType(key); setProposalPage(1); setPricePage(1); setHistoryPage(1); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${leaseTermType === key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>{label}</button>)}
      </div>

      {view !== 'prices' && (
        <Card className="mb-4 border-gray-200 shadow-sm"><CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><SlidersHorizontal size={16} className="text-blue-600" /> Tìm kiếm và bộ lọc</div>
            <span className="text-xs text-gray-500">{view === 'history' ? historyTotal : proposalTotal} hồ sơ</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[240px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><Input className="h-9 pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setProposalPage(1); setHistoryPage(1); }} placeholder="Số đề xuất, khách thuê, mã mặt bằng..." /></div>
            <Select value={floorId || 'ALL'} onValueChange={(value) => { setFloorId(value === 'ALL' ? '' : value); setUnitId(''); }}><SelectTrigger className="h-9 w-44"><SelectValue placeholder="Tầng" /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả tầng</SelectItem>{floors.map((floor) => <SelectItem key={floor.id} value={floor.id}>{floor.name}</SelectItem>)}</SelectContent></Select>
            <Select value={unitId || 'ALL'} onValueChange={(value) => setUnitId(value === 'ALL' ? '' : value)}><SelectTrigger className="h-9 w-52"><SelectValue placeholder="Mặt bằng" /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả mặt bằng</SelectItem>{units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.code}{unit.name ? ` — ${unit.name}` : ''}</SelectItem>)}</SelectContent></Select>
            {(search || floorId || unitId) && <Button variant="outline" size="sm" className="h-9 gap-1 text-gray-500" onClick={() => { setSearch(''); setFloorId(''); setUnitId(''); }}><X size={13} /> Đặt lại</Button>}
          </div>
        </CardContent></Card>
      )}

      {/* ══════════ PROPOSALS TABLE ══════════ */}
      {view === 'proposals' && (
        <>
          {isError ? (
            <AsyncState isLoading={false} isError onRetry={refetch}>
              <div />
            </AsyncState>
          ) : isLoading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : steps.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <CheckSquare size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">{t('approvals.empty')}</p>
              <p className="text-sm mt-1">{t('approvals.emptyDesc')}</p>
            </div>
          ) : (
            <>
              {!rejectDialog && <Selecto ref={proposalSelectoRef} container={proposalGridRef.current} {...proposalSelectoProps} />}
              <div ref={proposalGridRef} className="bg-white rounded-xl border border-gray-200 overflow-x-auto select-none">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-blue-50/40">
                      <th className="px-3 py-3 w-8">
                        <div className="cursor-pointer" onClick={() => {
                          if (selectedProposalIds.size === steps.length) setSelectedProposalIds(new Set());
                          else setSelectedProposalIds(new Set(steps.map((s: any) => s.id)));
                        }}>
                          {selectedProposalIds.size === steps.length && steps.length > 0
                            ? <CheckSquare size={15} className="text-blue-600" />
                            : <Square size={15} className="text-gray-300" />}
                        </div>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.proposal')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Thời gian tạo</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.approvalStep')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.role')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.tenant')}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.monthlyRent')}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.discount')}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.contractValue')}</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {steps.map((step: any) => {
                      const proposal = step.workflow?.proposal;
                      const isSelected = selectedProposalIds.has(step.id);
                      const createdAt = step.workflow?.createdAt ?? step.createdAt;
                      const isNew = isRecent(createdAt);
                      return (
                        <tr key={step.id}
                          className={`${DRAG_SELECT_CLASS} cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : isNew ? 'bg-sky-50/40' : 'hover:bg-gray-50/60'}`}
                          data-step-id={step.id}
                          onClick={() => setSelectedWorkflowId(step.workflowId)}
                        >
                          <td className="px-3 py-3 w-8" data-checkbox>
                            <div className="cursor-pointer" onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProposalIds((prev) => {
                                const next = new Set(prev);
                                next.has(step.id) ? next.delete(step.id) : next.add(step.id);
                                return next;
                              });
                            }}>
                              {isSelected
                                ? <CheckSquare size={15} className="text-blue-600" />
                                : <Square size={15} className="text-gray-300 hover:text-gray-500" />}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs font-semibold text-gray-700">
                              {proposal?.proposalNumber ?? '—'}
                            </span>
                            {isNew && <Badge className="ml-2 gap-1 border-0 bg-blue-600 px-1.5 py-0 text-[10px] text-white"><Sparkles size={10} /> Mới</Badge>}
                            {proposal?.unit?.leaseTermType && <div><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${proposal.unit.leaseTermType === 'SHORT' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{proposal.unit.leaseTermType === 'SHORT' ? 'Ngắn hạn' : 'Dài hạn'}</span></div>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap"><div className={`flex items-center gap-1 text-xs ${isNew ? 'font-medium text-blue-700' : 'text-gray-600'}`}><Clock3 size={13} />{approvalAge(createdAt)}</div><div className="mt-0.5 text-[11px] text-gray-400">{fmtDateTime(createdAt)}</div></td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800 text-sm">{step.stepName}</div>
                            <Badge className="bg-gray-100 text-gray-500 border-0 text-xs mt-0.5">{t('approvals.table.step', { order: step.stepOrder })}</Badge>
                            {step.policyReason && (
                              <div className="mt-1 flex items-start gap-1 text-[11px] text-gray-400" title={t('approvals.table.policyReasonTitle')}>
                                <ShieldCheck size={11} className="mt-0.5 shrink-0" />
                                <span className="line-clamp-2">{step.policyReason}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">{step.approverRole}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{proposal?.tenant?.brandName ?? <span className="text-gray-400">—</span>}</div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {proposal?.monthlyRent ? (
                              <span className="text-gray-700">{fmt(proposal.monthlyRent)}</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {proposal?.discount > 0 ? (
                              <span className="text-red-600 font-medium">{proposal.discount}%</span>
                            ) : (
                              <span className="text-gray-400">0%</span>
                            )}
                            {proposal?.rentFree > 0 && (
                              <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-amber-600">
                                <CalendarDays size={10} />
                                {t('approvals.table.rentFreeDays', { count: proposal.rentFree })}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {proposal?.totalContractValue ? (
                              <span className="font-bold text-green-600">{fmt(proposal.totalContractValue)}</span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                                title={t('approvals.actions.detail')}
                                onClick={(e) => { e.stopPropagation(); setSelectedWorkflowId(step.workflowId); }}
                              >
                                <Eye size={13} /> {t('approvals.actions.detail')}
                              </button>
                              <button
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-40"
                                title={t('approvals.actions.reject')}
                                disabled={anyPending}
                                onClick={(e) => { e.stopPropagation(); setRejectDialog({ ids: [step.id], type: 'proposal' }); }}
                              >
                                <XCircle size={13} /> {t('approvals.actions.reject')}
                              </button>
                              <button
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 hover:border-green-300 transition-colors disabled:opacity-40"
                                title={t('approvals.actions.approve')}
                                disabled={anyPending}
                                onClick={(e) => { e.stopPropagation(); approveMutation.mutate({ id: step.id }); }}
                              >
                                {approveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                {t('approvals.actions.approve')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!isLoading && proposalTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>{t('approvals.dealsPending', { count: proposalTotal })}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={proposalPage === 1}
                  onClick={() => { setProposalPage(p => p - 1); setSelectedProposalIds(new Set()); }}>
                  <ChevronLeft size={14} />
                </Button>
                <span className="px-2 py-1 text-xs">{t('proposals.page', { current: proposalPage, total: proposalTotalPages })}</span>
                <Button variant="outline" size="sm" disabled={proposalPage >= proposalTotalPages}
                  onClick={() => { setProposalPage(p => p + 1); setSelectedProposalIds(new Set()); }}>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════ PRICES TABLE ══════════ */}
      {view === 'prices' && (
        <>
          {priceError ? (
            <AsyncState isLoading={false} isError onRetry={refetchPrices}
              errorTitle="Không thể tải danh sách giá chờ duyệt">
              <div />
            </AsyncState>
          ) : loadingPriceApprovals ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : priceApprovals.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <DollarSign size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">{t('approvals.emptyPrices')}</p>
              <p className="text-sm mt-1">{t('approvals.emptyPricesDesc')}</p>
            </div>
          ) : (
            <>
              {!rejectDialog && <Selecto ref={priceSelectoRef} container={priceGridRef.current} {...priceSelectoProps} />}
              <div ref={priceGridRef} className="bg-white rounded-xl border border-gray-200 overflow-x-auto select-none" key={pricePage}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-amber-50/40">
                      <th className="px-3 py-3 w-8">
                        <div className="cursor-pointer" onClick={() => {
                          if (selectedPriceIds.size === priceApprovals.length) setSelectedPriceIds(new Set());
                          else setSelectedPriceIds(new Set(priceApprovals.map((b: any) => b.id)));
                        }}>
                          {selectedPriceIds.size === priceApprovals.length && priceApprovals.length > 0
                            ? <CheckSquare size={15} className="text-blue-600" />
                            : <Square size={15} className="text-gray-300" />}
                        </div>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.bookingNo')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.unit')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.customer')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.category')}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.floorPrice')}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.proposed')}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.ceiling')}</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.deviation')}</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {priceApprovals.map((booking: any) => {
                      const unit = booking.unit;
                      const cp = booking.categoryPricing;
                      const dev: number = booking.priceDeviationPercent ?? 0;
                      const devColor = dev > 10 ? 'text-red-600' : dev > 5 ? 'text-orange-500' : 'text-yellow-600';
                      const devBg = dev > 10 ? 'bg-red-50' : dev > 5 ? 'bg-orange-50' : 'bg-yellow-50';
                      const isSelected = selectedPriceIds.has(booking.id);
                      return (
                        <tr key={booking.id}
                          className={`${DRAG_SELECT_CLASS} transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50/60'}`}
                          data-price-id={booking.id}
                        >
                          <td className="px-3 py-3 w-8" data-checkbox>
                            <div className="cursor-pointer" onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPriceIds((prev) => {
                                const next = new Set(prev);
                                next.has(booking.id) ? next.delete(booking.id) : next.add(booking.id);
                                return next;
                              });
                            }}>
                              {isSelected
                                ? <CheckSquare size={15} className="text-blue-600" />
                                : <Square size={15} className="text-gray-300 hover:text-gray-500" />}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{booking.bookingNumber}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Building2 size={13} className="text-gray-400 shrink-0" />
                              <span className="font-medium">{unit?.code}</span>
                              {unit?.floor?.name && <span className="text-xs text-gray-400">{unit.floor.name}</span>}
                            </div>
                            {unit?.mall?.name && <div className="text-xs text-gray-400 mt-0.5 pl-5">{unit.mall.name}</div>}
                            {unit?.leaseTermType && <span className={`ml-5 mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${unit.leaseTermType === 'SHORT' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{unit.leaseTermType === 'SHORT' ? 'Ngắn hạn' : 'Dài hạn'}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{booking.lead?.brandName ?? booking.customer?.companyName ?? '—'}</div>
                            {booking.lead?.contactName && <div className="text-xs text-gray-400">{booking.lead.contactName}</div>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {unit?.category ?? unit?.categoryRef?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                            {fmtPrice(cp?.minRentPerSqm)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <span className={`font-bold ${devColor}`}>{fmtPrice(booking.proposedRentPerSqm)}</span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-green-700">
                            {fmtPrice(cp?.maxRentPerSqm)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${devBg} ${devColor}`}>
                              <AlertTriangle size={11} />
                              -{dev.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-40"
                                title={t('approvals.actions.rejectPrice')}
                                disabled={anyPending}
                                onClick={(e) => { e.stopPropagation(); setRejectDialog({ ids: [booking.id], type: 'price' }); }}
                              >
                                <XCircle size={13} /> {t('approvals.actions.reject')}
                              </button>
                              <button
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 hover:border-green-300 transition-colors disabled:opacity-40"
                                title={t('approvals.actions.approvePrice')}
                                disabled={anyPending}
                                onClick={(e) => { e.stopPropagation(); approvePriceMutation.mutate({ id: booking.id }); }}
                              >
                                {approvePriceMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                {t('approvals.actions.approve')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!loadingPriceApprovals && priceTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>{t('approvals.pricesPending', { count: priceTotal })}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={pricePage === 1} onClick={() => { setPricePage(p => p - 1); setSelectedPriceIds(new Set()); }}>{t('proposals.prev')}</Button>
                <span className="px-2 py-1">{t('proposals.page', { current: pricePage, total: priceTotalPages })}</span>
                <Button variant="outline" size="sm" disabled={pricePage >= priceTotalPages} onClick={() => { setPricePage(p => p + 1); setSelectedPriceIds(new Set()); }}>{t('proposals.next')}</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════ HISTORY TAB ══════════ */}
      {view === 'history' && (
        <>
          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-4">
            {(['ALL', 'APPROVED', 'REJECTED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setHistoryStatus(s); setHistoryPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  historyStatus === s
                    ? s === 'APPROVED' ? 'bg-green-50 border-green-300 text-green-700'
                      : s === 'REJECTED' ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {s === 'ALL' ? t('approvals.history.all') : s === 'APPROVED' ? t('approvals.workflow.step.approved') : t('approvals.workflow.step.rejected')}
              </button>
            ))}
            {!loadingHistory && (
              <span className="text-xs text-gray-400 ml-auto">{t('approvals.history.records', { count: historyTotal })}</span>
            )}
          </div>

          {historyError ? (
            <AsyncState isLoading={false} isError onRetry={refetchHistory}
              errorTitle="Không thể tải lịch sử phê duyệt">
              <div />
            </AsyncState>
          ) : loadingHistory ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : historySteps.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <History size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">{t('approvals.history.empty')}</p>
              <p className="text-sm mt-1">{t('approvals.history.emptyDesc')}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.history.table.proposal')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.history.table.tenant')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.history.table.step')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.history.table.approver')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.history.table.time')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.history.table.comment')}</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.history.table.result')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historySteps.map((step: any) => {
                    const proposal = step.workflow?.proposal;
                    return (
                      <tr key={step.id} className="cursor-pointer hover:bg-gray-50/60 transition-colors" onClick={() => setSelectedWorkflowId(step.workflowId)}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-600">
                            {proposal?.proposalNumber ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm">{proposal?.tenant?.brandName ?? '—'}</div>
                          {proposal?.unit && (
                            <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <Building2 size={11} />
                              {proposal.unit.code}
                              {proposal.unit.floor?.name && ` · ${proposal.unit.floor.name}`}
                            </div>
                          )}
                          {proposal?.unit?.leaseTermType && <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${proposal.unit.leaseTermType === 'SHORT' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{proposal.unit.leaseTermType === 'SHORT' ? 'Ngắn hạn' : 'Dài hạn'}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-800">{step.stepName}</div>
                          <span className="text-xs text-gray-400">{t('approvals.table.step', { order: step.stepOrder })}</span>
                        </td>
                        <td className="px-4 py-3">
                          {step.approver ? (
                            <div>
                              <div className="text-sm font-medium">{step.approver.fullName}</div>
                              <div className="text-xs text-gray-400">{step.approver.role}</div>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {step.decidedAt
                            ? new Date(step.decidedAt).toLocaleString('vi-VN', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          {step.comment ? (
                            <span className={`text-xs px-2 py-1 rounded ${
                              step.status === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {step.comment}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {step.status === 'APPROVED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <CheckCircle size={12} /> {t('approvals.workflow.step.approved')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              <XCircle size={12} /> {t('approvals.workflow.step.rejected')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loadingHistory && historyTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>{t('approvals.history.records', { count: historyTotal })}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={historyPage === 1}
                  onClick={() => setHistoryPage(p => p - 1)}>
                  <ChevronLeft size={14} />
                </Button>
                <span className="px-2 py-1 text-xs">{t('proposals.page', { current: historyPage, total: historyTotalPages })}</span>
                <Button variant="outline" size="sm" disabled={historyPage >= historyTotalPages}
                  onClick={() => setHistoryPage(p => p + 1)}>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Reject Dialog ── */}
      <ApprovalDetailSheet workflowId={selectedWorkflowId} onClose={() => setSelectedWorkflowId(null)} />

      <Dialog open={!!rejectDialog} onOpenChange={() => closeRejectDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle size={18} className="text-red-500" />
              {t('approvals.rejectDialog.title', { type: rejectDialog?.type === 'price' ? t('approvals.rejectDialog.typePrice') : t('approvals.rejectDialog.typeProposal') })}
              {rejectDialog?.bulk && rejectDialog.ids.length > 1 && (
                <Badge className="bg-red-100 text-red-700 border-0 text-xs ml-1">{t('approvals.rejectDialog.items', { count: rejectDialog.ids.length })}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-gray-600 mb-3">{t('approvals.rejectDialog.prompt')}</p>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('approvals.rejectDialog.placeholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleRejectConfirm()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRejectDialog}>{t('common:actions.cancel')}</Button>
            <Button variant="destructive" onClick={handleRejectConfirm}
              disabled={rejectReason.trim().length < 5 || rejectMutation.isPending || rejectPriceMutation.isPending || bulkRejectMutation.isPending || bulkRejectPriceMutation.isPending}>
              {t('approvals.rejectDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
