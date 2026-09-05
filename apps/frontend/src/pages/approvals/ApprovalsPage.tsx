import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  CheckCircle, XCircle, CheckSquare, DollarSign, AlertTriangle,
  Building2, Loader2, History, ChevronLeft, ChevronRight, Eye, Download,
  FileText, User, CalendarDays, Clock3, MessageSquare, ShieldCheck, Search, Sparkles, X,
  Paperclip,
} from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { useMallStore } from '@/store/mall.store';
import { formatMoneyWithCode, type CurrencyCode } from '@/lib/currency';
import { PageHeader } from '@/components/ui/page-header';
import { ERPAmount, ERPStatusBadge, ERPToolbar } from '@/components/erp';
import { openAuthenticatedFile } from '@/lib/downloadFile';
import {
  PROPOSAL_STATUS_TONES,
  WORKFLOW_STATUS_TONES,
  getApprovalPosition,
  getProposalParty,
} from '../proposals/proposalApprovalPresentation';
import { formatFitoutAttachmentSize, getFitoutAttachmentDownloadPath, getFitoutStageName, getFitoutSubmittalFromApproval } from './fitoutApprovalPresentation';

// The price-approval queue compares a booking's proposed rent against the
// category floor/ceiling. Those figures used to render as bare numbers with no
// currency at all, so a USD booking sat next to a VND band with nothing telling
// the approver they weren't the same unit of account. The backend only ever
// matches a pricing band in the booking's own currency, so one label per row is
// accurate for all three columns.
function fmtPrice(n: number | null | undefined, currencyCode?: CurrencyCode | null) {
  if (!n) return '—';
  return formatMoneyWithCode(n, currencyCode ?? 'VND');
}

function fmtDateTime(value?: string | null, locale = 'vi-VN') {
  if (!value) return '—';
  return new Date(value).toLocaleString(locale, {
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

function ApprovalDetailSheet({
  workflowId,
  decisionStepId,
  onClose,
}: {
  workflowId: string | null;
  decisionStepId: string | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation(['deals', 'common', 'departments']);
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveComment, setApproveComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const { data: workflow, isLoading, isError, refetch } = useQuery({
    queryKey: ['approval-workflow', workflowId],
    queryFn: () => approvalsApi.getWorkflow(workflowId!),
    enabled: !!workflowId,
  });
  const w: any = workflow;
  const p: any = w?.proposal;
  const fitout = getFitoutSubmittalFromApproval(w);
  const steps: any[] = w?.steps ?? [];
  const completed = w?.status === 'APPROVED';
  const position = getApprovalPosition(steps);
  const approvedStepCount = steps.filter((step) => step.status === 'APPROVED').length;
  const party = getProposalParty(p);
  const decisionDocumentLabel = fitout ? `${fitout.title} · ${t('approvals.fitout.revision', { revision: fitout.revisionNo })}` : p?.proposalNumber;
  const decisionPartyName = fitout?.project?.tenant?.brandName ?? party.name;
  const decisionUnitCode = fitout?.project?.unit?.code ?? p?.unit?.code;
  const decisionStep = steps.find((step) => step.id === decisionStepId && step.status === 'PENDING');

  const invalidateDecisionData = () => {
    qc.invalidateQueries({ queryKey: ['pending-approvals'] });
    qc.invalidateQueries({ queryKey: ['pending-fitout-approvals'] });
    qc.invalidateQueries({ queryKey: ['approvals-pending-nav'] });
    qc.invalidateQueries({ queryKey: ['approvals-pending-count'] });
    qc.invalidateQueries({ queryKey: ['approvals-history'] });
    qc.invalidateQueries({ queryKey: ['proposals'] });
  };

  const approveMutation = useMutation({
    mutationFn: () => approvalsApi.approve(decisionStep!.id, approveComment.trim() || undefined),
    onSuccess: () => {
      invalidateDecisionData();
      toast({ title: t('approvals.approveSuccess') });
      setApproveOpen(false);
      setApproveComment('');
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => approvalsApi.reject(decisionStep!.id, rejectReason.trim()),
    onSuccess: () => {
      invalidateDecisionData();
      toast({ title: t('approvals.rejectSuccess'), variant: 'destructive' });
      setRejectOpen(false);
      setRejectReason('');
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

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

  const downloadFitoutAttachment = async (attachment: any) => {
    try {
      await openAuthenticatedFile(getFitoutAttachmentDownloadPath(attachment.id), { download: attachment.fileName });
    } catch {
      toast({ title: t('approvals.fitout.attachmentError'), variant: 'destructive' });
    }
  };

  return (
    <>
    <Sheet open={!!workflowId} onClose={onClose} title={fitout?.title ?? p?.proposalNumber ?? t('approvals.workflow.title')} subtitle={fitout?.project?.tenant?.brandName ?? party.name} className="w-[min(760px,100vw)] sm:max-w-[96vw]">
      {isLoading ? <div className="space-y-3 p-6">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      : isError ? <div className="p-6"><AsyncState isLoading={false} isError onRetry={refetch} errorTitle={t('approvals.workflow.errorLoad')}><div /></AsyncState></div>
      : w && fitout ? (
        <div className="space-y-5 p-6">
          <div className="border-b border-slate-200 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <ERPStatusBadge tone={WORKFLOW_STATUS_TONES[w.status] ?? 'neutral'}>{String(t(`approvals.workflow.statusValues.${w.status}`, { defaultValue: w.status }))}</ERPStatusBadge>
              <ERPStatusBadge tone={fitout.status === 'REJECTED' ? 'danger' : fitout.status === 'APPROVED' || fitout.status === 'PUBLISHED' ? 'success' : 'brand'}>{t(`approvals.fitout.status.${fitout.status}`, { defaultValue: t('approvals.fitout.status.unknown') })}</ERPStatusBadge>
            </div>
            <div className="mt-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{fitout.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{fitout.formType?.name ?? '—'} · {t('approvals.fitout.revision', { revision: fitout.revisionNo })}</p>
                <p className="mt-1 text-xs text-slate-500">{fitout.project?.tenant?.brandName ?? '—'} · {fitout.project?.unit?.code ?? '—'}{fitout.project?.unit?.floor?.name ? ` · ${fitout.project.unit.floor.name}` : ''}</p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('approvals.fitout.stage')}</p>
                <p className="mt-1 text-xs font-semibold text-slate-700">{getFitoutStageName(fitout) ?? t('approvals.fitout.unknownStage')}</p>
                <p className="mt-1 text-xs text-slate-500">{t('approvals.workflow.completedSteps', { done: approvedStepCount, total: steps.length })}</p>
              </div>
            </div>
          </div>

          <SheetSection label={t('approvals.fitout.section.context')} className="rounded-none border-b border-slate-200 bg-transparent px-0">
            <div className="grid gap-x-4 sm:grid-cols-2">
              <SheetRow label={t('approvals.workflow.fields.tenantBrand')} value={fitout.project?.tenant?.brandName} icon={User} />
              <SheetRow label={t('approvals.workflow.fields.company')} value={fitout.project?.tenant?.companyName} icon={Building2} />
              <SheetRow label={t('approvals.workflow.fields.unit')} value={`${fitout.project?.unit?.code ?? '—'}${fitout.project?.unit?.floor?.name ? ` · ${fitout.project.unit.floor.name}` : ''}`} icon={Building2} />
              <SheetRow label={t('approvals.fitout.formType')} value={fitout.formType?.name} icon={FileText} />
              <SheetRow label={t('approvals.fitout.submitter')} value={fitout.submittedBy?.fullName} icon={User} />
              <SheetRow label={t('approvals.fitout.submittedAt')} value={fmtDateTime(fitout.submittedAt, i18n.language)} icon={CalendarDays} />
              <SheetRow label={t('approvals.fitout.dueDate')} value={fmtDateTime(fitout.dueDate, i18n.language)} icon={CalendarDays} />
            </div>
          </SheetSection>

          <section aria-labelledby="fitout-approval-attachments">
            <div id="fitout-approval-attachments" className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500"><Paperclip size={14} /> {t('approvals.fitout.section.attachments')}</div>
            {(fitout.attachments ?? []).length ? <div className="space-y-2">{(fitout.attachments ?? []).map((attachment) => (
              <button key={attachment.id} type="button" onClick={() => downloadFitoutAttachment(attachment)} className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-left hover:bg-slate-50">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{attachment.fileName}</p><p className="mt-0.5 text-[11px] text-slate-500">{attachment.mimeType ?? t('approvals.fitout.unknownFileType')} · {formatFitoutAttachmentSize(attachment.fileSize, i18n.language)} · {t('approvals.fitout.version', { version: attachment.version ?? 1 })}{attachment.isLatest ? ` · ${t('approvals.fitout.latest')}` : ''}</p></div>
                <Download size={14} className="shrink-0 text-blue-600" />
              </button>
            ))}</div> : <div className="rounded-md border border-dashed p-4 text-center text-xs text-slate-500">{t('approvals.fitout.noAttachments')}</div>}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500"><ShieldCheck size={15} /> {t('approvals.workflow.section.log')}</div>
            <div className="space-y-0">{steps.map((step, index) => (
              <div key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
                {index < steps.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-slate-200" />}
                <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${step.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : step.status === 'REJECTED' ? 'bg-red-100 text-red-700' : decisionStep?.id === step.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{step.status === 'APPROVED' ? <CheckCircle size={16} /> : step.status === 'REJECTED' ? <XCircle size={16} /> : <Clock3 size={15} />}</span>
                <div className="min-w-0 flex-1 border-b border-slate-100 pb-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{t('approvals.workflow.step.stepRole', { order: step.stepOrder, role: t(`approvals.roles.${step.approverRole}`, { defaultValue: step.approverRole }) })}</p><p className="mt-0.5 text-xs text-slate-500">{step.stepName}</p></div><ERPStatusBadge tone={step.status === 'APPROVED' ? 'success' : step.status === 'REJECTED' ? 'danger' : decisionStep?.id === step.id ? 'brand' : 'neutral'}>{step.status === 'APPROVED' ? t('approvals.workflow.step.approved') : step.status === 'REJECTED' ? t('approvals.workflow.step.rejected') : decisionStep?.id === step.id ? t('approvals.decision.current') : t('approvals.workflow.step.pending')}</ERPStatusBadge></div>{step.approver && <p className="mt-2 text-xs text-slate-600">{step.approver.fullName} · {fmtDateTime(step.decidedAt, i18n.language)}</p>}{step.comment && <p className="mt-2 border-l-2 border-slate-200 pl-2 text-xs text-slate-700">{step.comment}</p>}</div>
              </div>
            ))}</div>
          </section>

          {decisionStep && <div className="sticky bottom-0 -mx-6 flex gap-2 border-t bg-white px-6 pt-4"><Button variant="outline" className="flex-1 gap-2 border-red-200 text-red-700 hover:bg-red-50" onClick={() => setRejectOpen(true)}><XCircle size={15} /> {t('approvals.actions.reject')}</Button><Button className="flex-1 gap-2 bg-blue-600 text-white hover:bg-blue-700" onClick={() => setApproveOpen(true)}><CheckCircle size={15} /> {t('approvals.actions.approve')}</Button></div>}
        </div>
      ) : w && p ? (
        <div className="space-y-5 p-6">
          <div className="border-b border-slate-200 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ERPStatusBadge tone={WORKFLOW_STATUS_TONES[w.status] ?? 'neutral'}>{String(t(`approvals.workflow.statusValues.${w.status}`, { defaultValue: w.status }))}</ERPStatusBadge>
                  {p.status && <ERPStatusBadge tone={PROPOSAL_STATUS_TONES[p.status] ?? 'neutral'}>{String(t(`proposals.status.${p.status}`, { defaultValue: p.status }))}</ERPStatusBadge>}
                </div>
                <p className="mt-2 text-base font-semibold text-slate-900">{party.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{p.unit?.code ?? '—'}{p.unit?.floor?.name ? ` · ${p.unit.floor.name}` : ''} · {Number(p.area ?? 0).toLocaleString('vi-VN')} m²</p>
                {position.state === 'CURRENT' && <p className="mt-2 text-xs font-medium text-blue-700">{t('approvals.decision.currentStep', { current: position.current, total: position.total })}</p>}
                <p className="mt-1 text-[11px] text-slate-400">{t('approvals.workflow.timestamps', { created: fmtDateTime(w.createdAt), updated: fmtDateTime(w.updatedAt) })}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('approvals.workflow.fields.contractValue')}</p>
                <p className="mt-1 text-base font-semibold tabular-nums text-slate-900">{p.rentCurrency ? formatMoneyWithCode(p.totalContractValue, p.rentCurrency) : '—'}</p>
                <p className="mt-1 text-xs text-slate-500">{t('approvals.workflow.completedSteps', { done: approvedStepCount, total: steps.length })}</p>
              </div>
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

          <SheetSection label={t('approvals.workflow.section.proposalInfo')} className="rounded-none border-b border-slate-200 bg-transparent px-0">
            <div className="grid gap-x-4 sm:grid-cols-2">
              <SheetRow label={t('approvals.workflow.fields.tenantBrand')} value={p.tenant?.brandName ?? p.lead?.brandName} icon={User} />
              <SheetRow label={t('approvals.workflow.fields.company')} value={p.tenant?.companyName ?? p.lead?.company} icon={Building2} />
              <SheetRow label={t('approvals.workflow.fields.unit')} value={`${p.unit?.code ?? '—'}${p.unit?.floor?.name ? ` · ${p.unit.floor.name}` : ''}`} icon={Building2} />
              <SheetRow label={t('approvals.workflow.fields.area')} value={p.area ? `${Number(p.area).toLocaleString('vi-VN')} m²` : null} icon={Building2} />
              <SheetRow label={t('approvals.workflow.fields.term')} value={p.term ? `${p.term} tháng` : null} icon={CalendarDays} />
              <SheetRow label={t('approvals.workflow.fields.dateRange')} value={`${p.startDate ? new Date(p.startDate).toLocaleDateString('vi-VN') : '—'} – ${p.endDate ? new Date(p.endDate).toLocaleDateString('vi-VN') : '—'}`} icon={CalendarDays} />
            </div>
          </SheetSection>

          <SheetSection
            label={t('approvals.workflow.section.financial')}
            className="rounded-none border-b border-slate-200 bg-transparent px-0"
            action={<span className="text-xs font-mono font-semibold text-gray-500 border border-gray-300 rounded px-1.5 py-0.5">{p.rentCurrency ?? '—'}</span>}
          >
            <div className="grid gap-x-4 sm:grid-cols-2">
              <SheetRow label={t('approvals.workflow.fields.rentPerSqm')} value={p.rentCurrency && p.rentPerSqm != null ? formatMoneyWithCode(p.rentPerSqm, p.rentCurrency) : null} icon={DollarSign} />
              <SheetRow label={t('approvals.workflow.fields.monthlyRent')} value={p.rentCurrency && p.monthlyRent != null ? formatMoneyWithCode(p.monthlyRent, p.rentCurrency) : null} icon={DollarSign} />
              <SheetRow label={t('approvals.workflow.fields.camFee')} value={p.rentCurrency && p.monthlyCAM != null ? formatMoneyWithCode(p.monthlyCAM, p.rentCurrency) : null} icon={DollarSign} />
              <SheetRow label={t('approvals.workflow.fields.discount')} value={`${p.discount ?? 0}%`} icon={DollarSign} />
              <SheetRow label={t('approvals.workflow.fields.rentFree')} value={`${p.rentFree ?? 0} ${t('proposals.scenarios.days')}`} icon={CalendarDays} />
              <SheetRow label={t('approvals.workflow.fields.contractValue')} value={p.rentCurrency && p.totalContractValue != null ? formatMoneyWithCode(p.totalContractValue, p.rentCurrency) : null} icon={DollarSign} />
            </div>
            {(p.specialConditions || p.notes) && <div className="mt-3 rounded-lg border bg-white p-3 text-sm"><span className="font-semibold">{t('approvals.workflow.fields.conditionsNotes')}: </span>{p.specialConditions ?? p.notes}</div>}
          </SheetSection>

          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500"><ShieldCheck size={15} /> {t('approvals.workflow.section.log')}</div>
            <div className="space-y-0">
              {steps.map((step, index) => <div key={step.id} className="relative flex gap-3 pb-4 last:pb-0">{index < steps.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-slate-200" />}<span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${step.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : step.status === 'REJECTED' ? 'bg-red-100 text-red-700' : decisionStep?.id === step.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{step.status === 'APPROVED' ? <CheckCircle size={16} /> : step.status === 'REJECTED' ? <XCircle size={16} /> : <Clock3 size={15} />}</span><div className="min-w-0 flex-1 border-b border-slate-100 pb-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{t('approvals.workflow.step.stepRole', { order: step.stepOrder, role: t(`approvals.roles.${step.approverRole}`, { defaultValue: step.approverRole }) })}</p><p className="mt-0.5 text-xs text-slate-500">{t('approvals.workflow.step.position', { order: step.stepOrder, total: steps.length })}</p></div><ERPStatusBadge tone={step.status === 'APPROVED' ? 'success' : step.status === 'REJECTED' ? 'danger' : decisionStep?.id === step.id ? 'brand' : 'neutral'}>{step.status === 'APPROVED' ? t('approvals.workflow.step.approved') : step.status === 'REJECTED' ? t('approvals.workflow.step.rejected') : decisionStep?.id === step.id ? t('approvals.decision.current') : t('approvals.workflow.step.pending')}</ERPStatusBadge></div>{step.approver && <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2"><span><User size={12} className="mr-1 inline" />{step.approver.fullName} · {step.approver.departmentInfo?.name ?? t('missingInformation', { ns: 'departments' })}</span><span><Clock3 size={12} className="mr-1 inline" />{fmtDateTime(step.decidedAt)}</span>{step.approver.email && <span className="sm:col-span-2">{step.approver.email}</span>}</div>}{step.comment && <div className="mt-2 border-l-2 border-slate-200 pl-2 text-xs text-slate-700"><MessageSquare size={12} className="mr-1 inline" />{step.comment}</div>}</div></div>)}
            </div>
          </section>

          {decisionStep ? (
            <div className="sticky bottom-0 -mx-6 flex gap-2 border-t bg-white px-6 pt-4">
              <Button variant="outline" className="flex-1 gap-2 border-red-200 text-red-700 hover:bg-red-50" onClick={() => setRejectOpen(true)}><XCircle size={15} /> {t('approvals.actions.reject')}</Button>
              <Button className="flex-1 gap-2 bg-blue-600 text-white hover:bg-blue-700" onClick={() => setApproveOpen(true)}><CheckCircle size={15} /> {t('approvals.actions.approve')}</Button>
            </div>
          ) : completed ? <div className="sticky bottom-0 flex gap-2 border-t bg-white pt-4"><Button className="flex-1 gap-2" onClick={() => getPdf('open')}><Eye size={15} /> {t('approvals.workflow.printReady')}</Button><Button variant="outline" className="flex-1 gap-2" onClick={() => getPdf('download')}><Download size={15} /> {t('approvals.workflow.savePdf')}</Button></div> : <div className="border-l-2 border-amber-300 pl-3 text-sm text-amber-800"><FileText size={15} className="mr-2 inline" />{t('approvals.workflow.printPending')}</div>}
        </div>
      ) : null}
    </Sheet>
    <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('approvals.decision.approveTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="border-y border-slate-200 py-3">
            <p className="text-xs font-semibold text-slate-700">{decisionDocumentLabel}</p>
            <p className="mt-1 font-medium text-slate-900">{decisionPartyName}</p>
            <p className="mt-1 text-xs text-slate-500">{decisionStep ? t('approvals.workflow.step.stepRole', { order: decisionStep.stepOrder, role: t(`approvals.roles.${decisionStep.approverRole}`, { defaultValue: decisionStep.approverRole }) }) : '—'} · {decisionUnitCode ?? '—'}</p>
            {p?.rentCurrency && <p className="mt-2 text-base font-semibold tabular-nums">{formatMoneyWithCode(p.totalContractValue, p.rentCurrency)}</p>}
          </div>
          <label className="block text-xs font-medium text-slate-600">
            {t('approvals.decision.optionalComment')}
            <textarea className="mt-1 h-24 w-full resize-none rounded-md border border-slate-200 p-2 text-sm" value={approveComment} onChange={(e) => setApproveComment(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setApproveOpen(false)}>{t('common:actions.cancel')}</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" disabled={!decisionStep || approveMutation.isPending} onClick={() => approveMutation.mutate()}>{t('approvals.decision.confirmApprove')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('approvals.decision.rejectTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">{decisionDocumentLabel} · {decisionStep ? t('approvals.workflow.step.stepRole', { order: decisionStep.stepOrder, role: t(`approvals.roles.${decisionStep.approverRole}`, { defaultValue: decisionStep.approverRole }) }) : '—'}</p>
          <label className="block text-xs font-medium text-slate-600">
            {t('approvals.decision.requiredReason')}
            <textarea className="mt-1 h-28 w-full resize-none rounded-md border border-red-200 p-2 text-sm" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>{t('common:actions.cancel')}</Button>
            <Button variant="destructive" disabled={!decisionStep || rejectReason.trim().length < 5 || rejectMutation.isPending} onClick={() => rejectMutation.mutate()}>{t('approvals.decision.confirmReject')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

export default function ApprovalsPage() {
  const { t, i18n } = useTranslation(['deals', 'common']);
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { role } = usePermission();
  const { selectedMallId } = useMallStore();
  const canApprovePrices = !!role && ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR'].includes(role);
  const [view, setView] = useState<'proposals' | 'fitout' | 'prices' | 'history'>('proposals');
  const [proposalPage, setProposalPage] = useState(1);
  const [fitoutPage, setFitoutPage] = useState(1);
  const [pricePage, setPricePage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyStatus, setHistoryStatus] = useState<'ALL' | 'APPROVED' | 'REJECTED'>('ALL');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(searchParams.get('workflowId'));
  const [selectedDecisionStepId, setSelectedDecisionStepId] = useState<string | null>(null);
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
    setProposalPage(1); setFitoutPage(1); setHistoryPage(1); setSelectedWorkflowId(null); setSelectedDecisionStepId(null);
    setSearch(''); setFloorId(''); setUnitId(''); setLeaseTermType('');
  }, [selectedMallId]);

  // Booking price approval remains a separate individual-decision queue.
  const [rejectDialog, setRejectDialog] = useState<{ id: string; type: 'price' } | null>(null);
  const [priceApproveTarget, setPriceApproveTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // ── Queries ──
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['pending-approvals', proposalPage, selectedMallId, search, floorId, unitId, leaseTermType],
    queryFn: () => approvalsApi.pending({ entityType: 'PROPOSAL', page: proposalPage, limit: 15, mallId: selectedMallId || undefined, search: search || undefined, floorId: floorId || undefined, unitId: unitId || undefined, leaseTermType: leaseTermType || undefined }),
    refetchInterval: 30_000,
  });
  const { data: fitoutData, isLoading: loadingFitout, isError: fitoutError, refetch: refetchFitout } = useQuery({
    queryKey: ['pending-fitout-approvals', fitoutPage, selectedMallId, search, floorId, unitId],
    queryFn: () => approvalsApi.pending({ entityType: 'FITOUT_SUBMITTAL', page: fitoutPage, limit: 15, mallId: selectedMallId || undefined, search: search || undefined, floorId: floorId || undefined, unitId: unitId || undefined }),
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
  const fitoutSteps: any[] = fitoutData?.data ?? [];
  const fitoutTotalPages: number = fitoutData?.totalPages ?? 1;
  const fitoutTotal: number = fitoutData?.total ?? 0;
  const priceApprovals: any[] = priceApprovalsData?.data ?? [];
  const priceTotalPages: number = priceApprovalsData?.totalPages ?? 1;
  const priceTotal: number = priceApprovalsData?.total ?? 0;
  const historySteps: any[] = historyData?.data ?? [];
  const historyTotalPages: number = historyData?.totalPages ?? 1;
  const historyTotal: number = historyData?.total ?? 0;

  // ── Booking price mutations — individual only ──
  const approvePriceMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => bookingApi.approvePrice(id, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pending-price-approvals'] }); qc.invalidateQueries({ queryKey: ['bookings'] }); toast({ title: t('approvals.approvePriceSuccess') }); setPriceApproveTarget(null); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });
  const rejectPriceMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => bookingApi.rejectPrice(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pending-price-approvals'] }); qc.invalidateQueries({ queryKey: ['bookings'] }); toast({ title: t('approvals.rejectPriceSuccess'), variant: 'destructive' }); closeRejectDialog(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  function closeRejectDialog() { setRejectDialog(null); setRejectReason(''); }

  function handleRejectConfirm() {
    if (!rejectDialog) return;
    const reason = rejectReason.trim();
    if (reason.length < 5) return;
    rejectPriceMutation.mutate({ id: rejectDialog.id, reason });
  }

  const anyPending = approvePriceMutation.isPending || rejectPriceMutation.isPending;

  return (
    <div>
      <PageHeader
        className="mb-4"
        eyebrow={t('approvals.command.eyebrow')}
        title={t('approvals.title')}
        description={t('approvals.subtitle')}
        actions={<ERPStatusBadge tone="brand">{t('approvals.pendingCount', { count: proposalTotal + fitoutTotal })}</ERPStatusBadge>}
      />

      {/* Compact decision queue switch */}
      <div className="mb-3 flex max-w-full gap-1 overflow-x-auto border-y border-gray-200 py-2">
        <button
          onClick={() => { setView('proposals'); setProposalPage(1); }}
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition ${view === 'proposals' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          {t('approvals.views.proposals')} <span className="ml-1 tabular-nums opacity-80">{proposalTotal}</span>
        </button>
        <button
          onClick={() => { setView('fitout'); setFitoutPage(1); }}
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition ${view === 'fitout' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          {t('approvals.views.fitout')} <span className="ml-1 tabular-nums opacity-80">{fitoutTotal}</span>
        </button>
        {canApprovePrices && <button
          onClick={() => { setView('prices'); setPricePage(1); }}
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition ${view === 'prices' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          {t('approvals.views.prices')} <span className="ml-1 tabular-nums opacity-80">{priceTotal}</span>
        </button>}
        <button
          onClick={() => { setView('history'); setHistoryPage(1); }}
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition ${view === 'history' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          {t('approvals.views.history')} <span className="ml-1 tabular-nums opacity-80">{historyTotal}</span>
        </button>
      </div>

      {view !== 'prices' && (
        <ERPToolbar className="mb-4">
            <div className="relative min-w-[240px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><Input className="h-9 pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setProposalPage(1); setFitoutPage(1); setHistoryPage(1); }} placeholder={view === 'fitout' ? t('approvals.fitout.searchPlaceholder') : t('approvals.searchPlaceholder')} /></div>
            {view !== 'fitout' && <Select value={leaseTermType || 'ALL'} onValueChange={(value) => { setLeaseTermType(value === 'ALL' ? '' : value); setProposalPage(1); setHistoryPage(1); }}><SelectTrigger className="h-9 w-44"><SelectValue placeholder={t('proposals.filters.leaseType')} /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('proposals.filters.allLeaseTypes')}</SelectItem><SelectItem value="LONG">{t('proposals.filters.longTerm')}</SelectItem><SelectItem value="SHORT">{t('proposals.filters.shortTerm')}</SelectItem></SelectContent></Select>}
            <Select value={floorId || 'ALL'} onValueChange={(value) => { setFloorId(value === 'ALL' ? '' : value); setUnitId(''); setProposalPage(1); setFitoutPage(1); setHistoryPage(1); }}><SelectTrigger className="h-9 w-44"><SelectValue placeholder={t('approvals.filters.floor')} /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('approvals.filters.allFloors')}</SelectItem>{floors.map((floor) => <SelectItem key={floor.id} value={floor.id}>{floor.name}</SelectItem>)}</SelectContent></Select>
            <Select value={unitId || 'ALL'} onValueChange={(value) => { setUnitId(value === 'ALL' ? '' : value); setProposalPage(1); setFitoutPage(1); setHistoryPage(1); }}><SelectTrigger className="h-9 w-52"><SelectValue placeholder={t('approvals.filters.unit')} /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('approvals.filters.allUnits')}</SelectItem>{units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.code}{unit.name ? ` — ${unit.name}` : ''}</SelectItem>)}</SelectContent></Select>
            {(search || floorId || unitId || leaseTermType) && <Button variant="outline" size="sm" className="h-9 gap-1 text-gray-500" onClick={() => { setSearch(''); setFloorId(''); setUnitId(''); setLeaseTermType(''); }}><X size={13} /> {t('common:actions.reset')}</Button>}
            <span className="ml-auto whitespace-nowrap text-xs text-gray-500">{view === 'history' ? historyTotal : view === 'fitout' ? fitoutTotal : proposalTotal} {t('approvals.command.records')}</span>
        </ERPToolbar>
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
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="min-w-[1100px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-blue-50/40">
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.proposal')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.tenant')} / {t('approvals.table.unit')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.approvalStep')}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.monthlyRent')}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.discount')}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('approvals.table.contractValue')}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">{t('common:labels.currency')}</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {steps.map((step: any) => {
                      const proposal = step.workflow?.proposal;
                      const party = getProposalParty(proposal);
                      const createdAt = step.workflow?.createdAt ?? step.createdAt;
                      const isNew = isRecent(createdAt);
                      return (
                        <tr key={step.id}
                          className={`cursor-pointer transition-colors ${isNew ? 'bg-sky-50/40' : 'hover:bg-gray-50/60'}`}
                          tabIndex={0}
                          aria-label={t('approvals.actions.reviewFile', { number: proposal?.proposalNumber ?? '' })}
                          onClick={() => { setSelectedWorkflowId(step.workflowId); setSelectedDecisionStepId(step.id); }}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget || !['Enter', ' '].includes(e.key)) return;
                            e.preventDefault(); setSelectedWorkflowId(step.workflowId); setSelectedDecisionStepId(step.id);
                          }}
                        >
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs font-semibold text-gray-700">
                              {proposal?.proposalNumber ?? '—'}
                            </span>
                            {isNew && <Badge className="ml-2 gap-1 border-0 bg-blue-600 px-1.5 py-0 text-[10px] text-white"><Sparkles size={10} /> {t('approvals.new')}</Badge>}
                            <div className={`mt-1 flex items-center gap-1 text-xs ${isNew ? 'font-medium text-blue-700' : 'text-gray-500'}`}><Clock3 size={12} />{approvalAge(createdAt)} · {fmtDateTime(createdAt)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{party.name}</div>
                            <div className="mt-0.5 text-xs text-gray-500">{proposal?.unit?.code ?? '—'}{proposal?.unit?.floor?.name ? ` · ${proposal.unit.floor.name}` : ''}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800 text-sm">{t(`approvals.roles.${step.approverRole}`, { defaultValue: step.approverRole })}</div>
                            <div className="mt-1 flex items-center gap-2"><ERPStatusBadge tone="brand">{step.workflow?.steps?.length ? t('approvals.table.stepOfTotal', { order: step.stepOrder, total: step.workflow.steps.length }) : t('approvals.table.step', { order: step.stepOrder })}</ERPStatusBadge></div>
                          </td>
                          <td className="px-4 py-3 text-right"><ERPAmount amount={proposal?.monthlyRent} currencyCode={proposal?.rentCurrency} /></td>
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
                          <td className="px-4 py-3 text-right"><ERPAmount amount={proposal?.totalContractValue} currencyCode={proposal?.rentCurrency} strong /></td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-500">{proposal?.rentCurrency ?? '—'}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                title={t('approvals.actions.detail')}
                                onClick={(e) => { e.stopPropagation(); setSelectedWorkflowId(step.workflowId); setSelectedDecisionStepId(step.id); }}
                              >
                                <Eye size={13} /> {t('approvals.actions.review')}
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
                  onClick={() => setProposalPage(p => p - 1)}>
                  <ChevronLeft size={14} />
                </Button>
                <span className="px-2 py-1 text-xs">{t('proposals.page', { current: proposalPage, total: proposalTotalPages })}</span>
                <Button variant="outline" size="sm" disabled={proposalPage >= proposalTotalPages}
                  onClick={() => setProposalPage(p => p + 1)}>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Fitout approval worklist is isolated from Proposal and price decisions. */}
      {view === 'fitout' && (
        <>
          {fitoutError ? (
            <AsyncState isLoading={false} isError onRetry={refetchFitout} errorTitle={t('approvals.fitout.error')}>
              <div />
            </AsyncState>
          ) : loadingFitout ? (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-6">
              {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
            </div>
          ) : fitoutSteps.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              <CheckSquare size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">{t('approvals.fitout.empty')}</p>
              <p className="mt-1 text-sm">{t('approvals.fitout.emptyDesc')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-blue-50/40">
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500">{t('approvals.fitout.table.document')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500">{t('approvals.fitout.table.context')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500">{t('approvals.fitout.table.stage')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500">{t('approvals.fitout.table.approvalStep')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500">{t('approvals.fitout.table.timeline')}</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {fitoutSteps.map((step: any) => {
                    const submittal = getFitoutSubmittalFromApproval(step);
                    if (!submittal) return null;
                    const createdAt = step.workflow?.createdAt ?? step.createdAt;
                    const isNew = !!createdAt && isRecent(createdAt);
                    return (
                      <tr
                        key={step.id}
                        className={`cursor-pointer transition-colors ${isNew ? 'bg-sky-50/40' : 'hover:bg-gray-50/60'}`}
                        tabIndex={0}
                        aria-label={t('approvals.actions.reviewFile', { number: submittal.title })}
                        onClick={() => { setSelectedWorkflowId(step.workflowId); setSelectedDecisionStepId(step.id); }}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
                          event.preventDefault();
                          setSelectedWorkflowId(step.workflowId); setSelectedDecisionStepId(step.id);
                        }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">{submittal.title}</span>
                            {isNew && <Badge className="gap-1 border-0 bg-blue-600 px-1.5 py-0 text-[10px] text-white"><Sparkles size={10} /> {t('approvals.new')}</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-gray-500">{submittal.formType?.name ?? '—'} · {t('approvals.fitout.revision', { revision: submittal.revisionNo })}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{submittal.project?.tenant?.brandName ?? '—'}</p>
                          <p className="mt-1 text-xs text-gray-500">{submittal.project?.unit?.code ?? '—'}{submittal.project?.unit?.floor?.name ? ` · ${submittal.project.unit.floor.name}` : ''}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-gray-700">{getFitoutStageName(submittal) ?? t('approvals.fitout.unknownStage')}</p>
                          <ERPStatusBadge tone={submittal.status === 'REJECTED' ? 'danger' : submittal.status === 'APPROVED' || submittal.status === 'PUBLISHED' ? 'success' : 'brand'} className="mt-1">
                            {t(`approvals.fitout.status.${submittal.status}`, { defaultValue: t('approvals.fitout.status.unknown') })}
                          </ERPStatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-800">{step.stepName}</p>
                          <p className="mt-1 text-xs text-gray-500">{t('approvals.workflow.step.stepRole', { order: step.stepOrder, role: t(`approvals.roles.${step.approverRole}`, { defaultValue: step.approverRole }) })}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          <p>{t('approvals.fitout.submittedAt')}: {fmtDateTime(submittal.submittedAt, i18n.language)}</p>
                          <p className="mt-1">{t('approvals.fitout.dueDate')}: {fmtDateTime(submittal.dueDate, i18n.language)}</p>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={(event) => { event.stopPropagation(); setSelectedWorkflowId(step.workflowId); setSelectedDecisionStepId(step.id); }}>
                            <Eye size={13} /> {t('approvals.actions.review')}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!loadingFitout && fitoutTotalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <span>{t('approvals.fitout.pendingCount', { count: fitoutTotal })}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={fitoutPage === 1} onClick={() => setFitoutPage((page) => page - 1)}><ChevronLeft size={14} /></Button>
                <span className="px-2 py-1 text-xs">{t('proposals.page', { current: fitoutPage, total: fitoutTotalPages })}</span>
                <Button variant="outline" size="sm" disabled={fitoutPage >= fitoutTotalPages} onClick={() => setFitoutPage((page) => page + 1)}><ChevronRight size={14} /></Button>
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
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto" key={pricePage}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-amber-50/40">
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
                      return (
                        <tr key={booking.id}
                          className="transition-colors hover:bg-gray-50/60"
                        >
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
                            {fmtPrice(cp?.minRentPerSqm, booking.currencyCode)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <span className={`font-bold ${devColor}`}>{fmtPrice(booking.proposedRentPerSqm, booking.currencyCode)}</span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-green-700">
                            {fmtPrice(cp?.maxRentPerSqm, booking.currencyCode)}
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
                                onClick={(e) => { e.stopPropagation(); setRejectDialog({ id: booking.id, type: 'price' }); }}
                              >
                                <XCircle size={13} /> {t('approvals.actions.reject')}
                              </button>
                              <button
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 hover:border-green-300 transition-colors disabled:opacity-40"
                                title={t('approvals.actions.approvePrice')}
                                disabled={anyPending}
                                onClick={(e) => { e.stopPropagation(); setPriceApproveTarget(booking); }}
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
                <Button variant="outline" size="sm" disabled={pricePage === 1} onClick={() => setPricePage(p => p - 1)}>{t('proposals.prev')}</Button>
                <span className="px-2 py-1">{t('proposals.page', { current: pricePage, total: priceTotalPages })}</span>
                <Button variant="outline" size="sm" disabled={pricePage >= priceTotalPages} onClick={() => setPricePage(p => p + 1)}>{t('proposals.next')}</Button>
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
                      <tr key={step.id} className="cursor-pointer hover:bg-gray-50/60 transition-colors" tabIndex={0} aria-label={t('approvals.actions.reviewFile', { number: proposal?.proposalNumber ?? '' })} onClick={() => { setSelectedWorkflowId(step.workflowId); setSelectedDecisionStepId(null); }} onKeyDown={(e) => { if (e.target !== e.currentTarget || !['Enter', ' '].includes(e.key)) return; e.preventDefault(); setSelectedWorkflowId(step.workflowId); setSelectedDecisionStepId(null); }}>
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
                          <div className="text-sm font-medium text-gray-800">{t(`approvals.roles.${step.approverRole}`, { defaultValue: step.approverRole })}</div>
                          <span className="text-xs text-gray-400">{t('approvals.table.step', { order: step.stepOrder })}</span>
                        </td>
                        <td className="px-4 py-3">
                          {step.approver ? (
                            <div>
                              <div className="text-sm font-medium">{step.approver.fullName}</div>
                              <div className="text-xs text-gray-400">{t(`approvals.roles.${step.approver.role}`, { defaultValue: step.approver.role })}</div>
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

      <ApprovalDetailSheet
        workflowId={selectedWorkflowId}
        decisionStepId={selectedDecisionStepId}
        onClose={() => { setSelectedWorkflowId(null); setSelectedDecisionStepId(null); }}
      />

      <Dialog open={!!priceApproveTarget} onOpenChange={(open) => { if (!open) setPriceApproveTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle size={18} className="text-emerald-600" />{t('approvals.priceDecision.approveTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p className="text-gray-600">{t('approvals.priceDecision.approvePrompt')}</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-y border-gray-100 py-3">
              <span className="text-gray-500">{t('approvals.table.bookingNo')}</span><span className="text-right font-mono font-medium">{priceApproveTarget?.bookingNumber ?? '—'}</span>
              <span className="text-gray-500">{t('approvals.table.unit')}</span><span className="text-right font-medium">{priceApproveTarget?.unit?.code ?? '—'}</span>
              <span className="text-gray-500">{t('approvals.table.proposed')}</span><span className="text-right font-semibold tabular-nums">{fmtPrice(priceApproveTarget?.proposedRentPerSqm, priceApproveTarget?.currencyCode)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceApproveTarget(null)}>{t('common:actions.cancel')}</Button>
            <Button disabled={!priceApproveTarget || approvePriceMutation.isPending} onClick={() => approvePriceMutation.mutate({ id: priceApproveTarget.id })}>
              {approvePriceMutation.isPending && <Loader2 size={14} className="mr-1 animate-spin" />}{t('approvals.priceDecision.confirmApprove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectDialog} onOpenChange={() => closeRejectDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle size={18} className="text-red-500" />
              {t('approvals.rejectDialog.title', { type: t('approvals.rejectDialog.typePrice') })}
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
              disabled={rejectReason.trim().length < 5 || rejectPriceMutation.isPending}>
              {t('approvals.rejectDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
