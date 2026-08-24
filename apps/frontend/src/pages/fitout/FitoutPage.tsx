import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fitoutApi, fitoutSubmittalApi, fitoutIssueApi, approvalsApi, usersApi } from '@/api';
import { useAuthStore } from '@/store/auth.store';
import { useMallStore } from '@/store/mall.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { MallMapViewer } from '@/components/MallMapViewer';
import { ChangeOrderControl, RiskRegister } from '@/components/fitout/RiskChangeControl';
import { ReasonActionDialog } from '@/components/ui/reason-action-dialog';
import {
  Hammer, CheckCircle2, Circle, ChevronRight, User, Calendar,
  ClipboardList, ArrowRight, AlertTriangle, Clock, Upload,
  Plus, Trash2, ShieldAlert, Settings, RotateCcw, Send, Rocket, BarChart3, Compass, Sparkles, HardHat, FolderCheck,
} from 'lucide-react';

interface StageConfig {
  code: string;
  name: string;
  order: number;
  colorHex: string;
}

const ROLES_ALLOWED_TO_OVERRIDE_GATE = ['ADMIN', 'MALL_DIRECTOR'];

function useStageConfigs() {
  const { data = [] } = useQuery({
    queryKey: ['fitout-stage-configs'],
    queryFn: () => fitoutApi.listStageConfigs(),
    staleTime: 5 * 60 * 1000,
  });
  return data as StageConfig[];
}

function getProgress(stages: StageConfig[], status: string) {
  const idx = stages.findIndex((x) => x.code === status);
  return idx >= 0 && stages.length > 1 ? (idx / (stages.length - 1)) * 100 : 0;
}

function getNextStep(stages: StageConfig[], status: string) {
  const idx = stages.findIndex((x) => x.code === status);
  return idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : null;
}

function stageBadgeStyle(colorHex?: string) {
  const hex = colorHex ?? '#6b7280';
  return { backgroundColor: `${hex}22`, color: hex };
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function FitoutDetailSheet({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
  const { t } = useTranslation('fitout');
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const stages = useStageConfigs();
  const [newCkTitle, setNewCkTitle] = useState('');
  const [gateWarning, setGateWarning] = useState<{ missing: { documentType: string; description?: string }[] } | null>(null);
  const [pendingAdvanceStatus, setPendingAdvanceStatus] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [rejectStepId, setRejectStepId] = useState<string | null>(null);
  const canOverrideGate = !!user?.role && ROLES_ALLOWED_TO_OVERRIDE_GATE.includes(user.role);

  const { data: project, isLoading } = useQuery({
    queryKey: ['fitout-detail', projectId],
    queryFn: () => fitoutApi.getFitout(projectId!),
    enabled: !!projectId,
  });

  const { data: checklists = [], isLoading: ckLoading } = useQuery({
    queryKey: ['fitout-checklists', projectId],
    queryFn: () => fitoutApi.getChecklists(projectId!),
    enabled: !!projectId,
  });

  const { data: submittals = [] } = useQuery({
    queryKey: ['fitout-submittals', projectId],
    queryFn: () => fitoutSubmittalApi.list(projectId!),
    enabled: !!projectId,
  });

  const { data: formTypes = [] } = useQuery({
    queryKey: ['fitout-form-types'],
    queryFn: () => fitoutApi.listFormTypes(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: issues = [] } = useQuery({
    queryKey: ['fitout-issues', projectId],
    queryFn: () => fitoutIssueApi.list(projectId!),
    enabled: !!projectId,
  });

  const { data: dmap } = useQuery({
    queryKey: ['fitout-dmap', projectId],
    queryFn: () => fitoutIssueApi.getDMap(projectId!),
    enabled: !!projectId,
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ['fitout-milestones', projectId],
    queryFn: () => fitoutApi.getMilestones(projectId!),
    enabled: !!projectId,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-op'],
    queryFn: () => usersApi.listUsers({ role: 'OPERATION', limit: 100 }),
    enabled: !!projectId,
  });
  const opUsers: any[] = usersData?.data ?? [];

  const { data: contractorsData = [] } = useQuery({
    queryKey: ['fitout-contractors', projectId],
    queryFn: () => fitoutApi.listContractors(projectId!),
    enabled: !!projectId,
  });
  const contractors: any[] = (contractorsData as any)?.data ?? contractorsData ?? [];

  const { data: workerLogsData = [] } = useQuery({
    queryKey: ['fitout-workers', projectId],
    queryFn: () => fitoutApi.listWorkerLogs(projectId!),
    enabled: !!projectId,
  });
  const workerLogs: any[] = (workerLogsData as any)?.data ?? workerLogsData ?? [];

  const [contractorForm, setContractorForm] = useState({ companyName: '', contactName: '', phone: '', licenseNo: '', startDate: '' });
  const [workerForm, setWorkerForm] = useState({ contractorId: '', workerName: '', idNumber: '', entryDate: new Date().toISOString().slice(0, 10), purpose: '' });

  const createContractorMutation = useMutation({
    mutationFn: (dto: typeof contractorForm) => fitoutApi.createContractor(projectId!, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-contractors', projectId] });
      setContractorForm({ companyName: '', contactName: '', phone: '', licenseNo: '', startDate: '' });
      toast({ title: t('contractor.toast.added') });
    },
  });

  const logWorkerMutation = useMutation({
    mutationFn: (dto: typeof workerForm) => fitoutApi.logWorkerEntry(projectId!, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-workers', projectId] });
      setWorkerForm({ contractorId: '', workerName: '', idNumber: '', entryDate: new Date().toISOString().slice(0, 10), purpose: '' });
      toast({ title: t('contractor.toast.workerLogged') });
    },
  });

  const exitWorkerMutation = useMutation({
    mutationFn: (logId: string) => fitoutApi.logWorkerExit(projectId!, logId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fitout-workers', projectId] }),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ status, override, overrideReason: reason }: { status: string; override?: boolean; overrideReason?: string }) =>
      fitoutApi.advanceStatus(projectId!, status, { override, overrideReason: reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitouts'] });
      qc.invalidateQueries({ queryKey: ['fitout-detail', projectId] });
      qc.invalidateQueries({ queryKey: ['fitout-milestones', projectId] });
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['unit-detail'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      qc.invalidateQueries({ queryKey: ['floor-map'] });
      setGateWarning(null);
      setPendingAdvanceStatus(null);
      setOverrideReason('');
      toast({ title: t('status.advanceSuccess') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common.error'), variant: 'destructive' }),
  });

  const handleAdvance = async (status: string) => {
    try {
      const gate = await fitoutApi.checkGate(projectId!, status);
      if (!gate.canAdvance) {
        setPendingAdvanceStatus(status);
        setGateWarning(gate);
        return;
      }
    } catch {
      toast({ title: t('status.advanceError'), variant: 'destructive' });
      return;
    }
    advanceMutation.mutate({ status });
  };

  const checkMutation = useMutation({
    mutationFn: ({ checklistId, isCompleted }: { checklistId: string; isCompleted: boolean }) =>
      fitoutApi.updateChecklist(projectId!, checklistId, isCompleted),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fitout-checklists', projectId] }),
    onError: () => toast({ title: t('status.toast.checklistError'), variant: 'destructive' }),
  });

  const createCkMutation = useMutation({
    mutationFn: (title: string) => fitoutApi.createChecklist(projectId!, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-checklists', projectId] });
      setNewCkTitle('');
      toast({ title: t('status.checklistAdded') });
    },
    onError: () => toast({ title: t('status.toast.checklistCreateError'), variant: 'destructive' }),
  });

  const deleteCkMutation = useMutation({
    mutationFn: (checklistId: string) => fitoutApi.deleteChecklist(projectId!, checklistId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fitout-checklists', projectId] }),
    onError: () => toast({ title: t('status.toast.checklistDeleteError'), variant: 'destructive' }),
  });

  const assignMutation = useMutation({
    mutationFn: (operationManagerId: string) => fitoutApi.assign(projectId!, operationManagerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-detail', projectId] });
      qc.invalidateQueries({ queryKey: ['fitouts'] });
      toast({ title: t('status.assignSuccess') });
    },
    onError: () => toast({ title: t('status.toast.assignError'), variant: 'destructive' }),
  });

  const [newSubmittal, setNewSubmittal] = useState({ formTypeId: '', title: '' });

  const invalidateSubmittals = () => {
    qc.invalidateQueries({ queryKey: ['fitout-submittals', projectId] });
    qc.invalidateQueries({ queryKey: ['fitout-detail', projectId] });
  };

  const createSubmittalMutation = useMutation({
    mutationFn: () => fitoutSubmittalApi.create({ projectId: projectId!, formTypeId: newSubmittal.formTypeId, title: newSubmittal.title }),
    onSuccess: () => {
      invalidateSubmittals();
      setNewSubmittal({ formTypeId: '', title: '' });
      toast({ title: t('submittal.toast.submitted') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('submittal.toast.errorSubmit'), variant: 'destructive' }),
  });

  const approveStepMutation = useMutation({
    mutationFn: (stepId: string) => approvalsApi.approve(stepId),
    onSuccess: () => { invalidateSubmittals(); toast({ title: t('submittal.toast.approved') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('submittal.toast.errorApprove'), variant: 'destructive' }),
  });

  const rejectStepMutation = useMutation({
    mutationFn: ({ stepId, comment }: { stepId: string; comment?: string }) => approvalsApi.reject(stepId, comment),
    onSuccess: () => { invalidateSubmittals(); toast({ title: t('submittal.toast.rejected') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('submittal.toast.errorReject'), variant: 'destructive' }),
  });

  const resubmitMutation = useMutation({
    mutationFn: (id: string) => fitoutSubmittalApi.resubmit(id, {}),
    onSuccess: () => { invalidateSubmittals(); toast({ title: t('submittal.toast.resubmitted') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('submittal.toast.errorResubmit'), variant: 'destructive' }),
  });

  const publishSubmittalMutation = useMutation({
    mutationFn: (id: string) => fitoutSubmittalApi.publish(id),
    onSuccess: () => { invalidateSubmittals(); toast({ title: t('submittal.toast.published') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('submittal.toast.errorPublish'), variant: 'destructive' }),
  });

  const [newIssue, setNewIssue] = useState({ title: '', category: 'DEFECT', severity: 'MEDIUM' });

  const invalidateIssues = () => qc.invalidateQueries({ queryKey: ['fitout-issues', projectId] });

  const createIssueMutation = useMutation({
    mutationFn: () => fitoutIssueApi.create({ projectId, unitId: p?.unit?.id, ...newIssue }),
    onSuccess: () => {
      invalidateIssues();
      setNewIssue({ title: '', category: 'DEFECT', severity: 'MEDIUM' });
      toast({ title: t('issue.toast.created') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('issue.toast.errorCreate'), variant: 'destructive' }),
  });

  const transitionIssueMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => fitoutIssueApi.transition(id, status),
    onSuccess: () => { invalidateIssues(); toast({ title: t('issue.toast.updated') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('issue.toast.errorUpdate'), variant: 'destructive' }),
  });

  const p: any = project;
  const nextStep = p ? getNextStep(stages, p.status) : null;
  const currentStage = p ? stages.find((s) => s.code === p.status) : undefined;
  const ckList: any[] = checklists as any[];
  const doneCount = ckList.filter((c) => c.isCompleted).length;
  const totalCount = ckList.length;
  const pendingSubmittals = (submittals as any[]).filter((item) => !['APPROVED', 'OBSOLETED'].includes(item.status)).length;
  const openIssues = (issues as any[]).filter((item) => !['RESOLVED', 'CLOSED'].includes(item.status)).length;
  const nextActions = [
    !p?.operationManager && t('detail.nextActions.assignManager'),
    totalCount > doneCount && t('detail.nextActions.completeChecklist', { count: totalCount - doneCount }),
    pendingSubmittals > 0 && t('detail.nextActions.processDocs', { count: pendingSubmittals }),
    openIssues > 0 && t('detail.nextActions.closeIssues', { count: openIssues }),
  ].filter(Boolean) as string[];

  return (
    <Sheet
      open={!!projectId}
      onClose={onClose}
      title={p ? `${p.tenant?.brandName} — ${p.unit?.code}` : t('project.loading')}
      subtitle={currentStage?.name}
    >
      {isLoading ? (
        <div className="px-6 pt-4 space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : p && (
        <div className="px-6 pb-8 space-y-5 pt-4">

          <section className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50 p-4">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-orange-600 p-2 text-white"><Sparkles size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">{t('detail.nextActions')}</p>
                {nextActions.length > 0 ? (
                  <ol className="mt-2 space-y-2">
                    {nextActions.slice(0, 4).map((action, index) => (
                      <li key={action} className="flex gap-2 text-sm text-slate-700"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-orange-700 shadow-sm">{index + 1}</span><span>{action}</span></li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-emerald-700">{t('detail.noBacklog', { nextStep: nextStep?.name ?? t('detail.noBacklogFallback') })}</p>
                )}
              </div>
            </div>
          </section>

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Badge className="border-0" style={stageBadgeStyle(currentStage?.colorHex)}>
                {currentStage?.name ?? p.status}
              </Badge>
              <span className="text-xs text-gray-500">{Math.round(getProgress(stages, p.status))}{t('detail.progressComplete')}</span>
            </div>
            <Progress value={getProgress(stages, p.status)} className="h-2.5" />
          </div>

          {/* Mini pipeline */}
          <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
            {stages.map((s) => {
              const curOrder = currentStage?.order ?? 0;
              const isActive = s.code === p.status;
              const isDone = s.order < curOrder;
              return (
                <span
                  key={s.code}
                  className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap
                    ${isDone ? 'bg-green-100 text-green-700' : isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}
                >
                  {s.name}
                </span>
              );
            })}
          </div>

          {/* Dates */}
          <SheetSection label={t('detail.dates')}>
            <SheetRow label={t('detail.handoverDate')}    value={fmtDate(p.handoverDate)}     icon={Calendar} />
            <SheetRow label={t('detail.startDate')}       value={fmtDate(p.startDate)}        icon={Calendar} />
            <SheetRow label={t('detail.expectedOpenDate')} value={fmtDate(p.expectedOpenDate)} icon={Calendar} />
            {p.actualOpenDate && (
              <SheetRow label={t('detail.actualOpenDate')} value={fmtDate(p.actualOpenDate)}   icon={Calendar} />
            )}
            {p.contract && (
              <SheetRow label={t('detail.contract')} value={p.contract.contractNumber} icon={ClipboardList} />
            )}
          </SheetSection>

          {/* Assign OP */}
          <div>
            <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2">{t('detail.opManager')}</div>
            <Select
              value={p.operationManager?.id ?? ''}
              onValueChange={(val) => val && assignMutation.mutate(val)}
              disabled={assignMutation.isPending}
            >
              <SelectTrigger className="h-9 text-sm">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-gray-400 shrink-0" />
                  <SelectValue placeholder={t('detail.selectOpManager')}>
                    {p.operationManager?.fullName ?? t('detail.noOpManager')}
                  </SelectValue>
                </div>
              </SelectTrigger>
              <SelectContent>
                {opUsers.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                ))}
                {opUsers.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400">{t('detail.noOpUsers')}</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Gate Warning Dialog */}
          {gateWarning && (
            <Dialog open={!!gateWarning} onOpenChange={() => { setGateWarning(null); setPendingAdvanceStatus(null); setOverrideReason(''); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-amber-600">
                    <ShieldAlert size={18} /> {t('detail.gate.title')}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-gray-600">{t('detail.gate.description')}</p>
                  <div className="space-y-2">
                    {gateWarning.missing.map((m) => (
                      <div key={m.documentType} className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
                        <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-amber-800">{m.documentType.replace(/_/g, ' ')}</p>
                          {m.description && <p className="text-xs text-amber-600">{m.description}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {canOverrideGate && (
                    <Input
                      placeholder={t('detail.gate.overridePlaceholder')}
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="text-sm"
                    />
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setGateWarning(null); setPendingAdvanceStatus(null); setOverrideReason(''); }}>
                      {t('detail.gate.backToUpload')}
                    </Button>
                    {canOverrideGate && (
                      <Button
                        variant="destructive"
                        className="flex-1 text-xs"
                        onClick={() => { if (pendingAdvanceStatus) advanceMutation.mutate({ status: pendingAdvanceStatus, override: true, overrideReason }); }}
                        disabled={advanceMutation.isPending || !overrideReason.trim()}
                      >
                        {t('detail.gate.skipAndContinue')}
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Advance status */}
          {nextStep ? (
            <Button
              className="w-full gap-2"
              onClick={() => handleAdvance(nextStep.code)}
              disabled={advanceMutation.isPending}
            >
              <ArrowRight size={16} />
              {t('detail.advanceTo')} <strong className="ml-1">{nextStep.name}</strong>
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-2 py-2 text-green-600 font-medium text-sm bg-green-50 rounded-lg">
              <CheckCircle2 size={18} />
              {t('detail.completed')}
            </div>
          )}

          {/* Links to dedicated Daily Report / Gantt pages */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-xs gap-1"
              onClick={() => navigate(`/fitout/${projectId}/daily-report`)}>
              <ClipboardList size={13} /> {t('detail.navDailyReport')}
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-xs gap-1"
              onClick={() => navigate(`/fitout/${projectId}/gantt`)}>
              <Clock size={13} /> {t('detail.navGantt')}
            </Button>
          </div>

          {/* Tabs for Checklist, Documents & Milestones */}
          <Tabs defaultValue="checklist" className="mt-4">
            <div className="overflow-x-auto pb-1" aria-label={t('detail.tabs.ariaLabel')}>
              <TabsList className="inline-flex h-10 w-max min-w-full justify-start">
                <TabsTrigger value="checklist" className="text-xs">{t('detail.tabs.checklist')}</TabsTrigger>
                <TabsTrigger value="documents" className="text-xs">{t('detail.tabs.documents')}</TabsTrigger>
                <TabsTrigger value="issues" className="text-xs">{t('detail.tabs.issues')}</TabsTrigger>
                <TabsTrigger value="risks" className="text-xs">{t('detail.tabs.risks')}</TabsTrigger>
                <TabsTrigger value="changes" className="text-xs">{t('detail.tabs.changes')}</TabsTrigger>
                <TabsTrigger value="milestones" className="text-xs">{t('detail.tabs.milestones')}</TabsTrigger>
                <TabsTrigger value="contractors" className="text-xs">{t('detail.tabs.contractors')}</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="checklist" className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold tracking-wider text-gray-400">
                  {t('checklist.title')} {totalCount > 0 && `(${doneCount}/${totalCount})`}
                </div>
                {totalCount > 0 && (
                  <span className="text-xs text-gray-400">{Math.round((doneCount / totalCount) * 100)}%</span>
                )}
              </div>
              {totalCount > 0 && (
                <Progress value={(doneCount / totalCount) * 100} className="h-1.5 mb-3" />
              )}

              {/* Add new checklist item */}
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder={t('checklist.addPlaceholder')}
                  value={newCkTitle}
                  onChange={(e) => setNewCkTitle(e.target.value)}
                  className="text-sm h-8"
                  onKeyDown={(e) => { if (e.key === 'Enter' && newCkTitle.trim()) createCkMutation.mutate(newCkTitle.trim()); }}
                />
                <Button
                  size="sm"
                  className="h-8 px-2 shrink-0"
                  onClick={() => { if (newCkTitle.trim()) createCkMutation.mutate(newCkTitle.trim()); }}
                  disabled={!newCkTitle.trim() || createCkMutation.isPending}
                >
                  <Plus size={14} />
                </Button>
              </div>

              {ckLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : ckList.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg">
                  {t('checklist.empty')}
                </p>
              ) : (
                <div className="space-y-2">
                  {ckList.map((item: any) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-all group
                        ${item.isCompleted
                          ? 'bg-green-50 border-green-200'
                          : 'bg-gray-50 border-gray-100 hover:bg-gray-50 hover:border-gray-200'}`}
                    >
                      <button
                        className="mt-0.5 shrink-0"
                        onClick={() => checkMutation.mutate({ checklistId: item.id, isCompleted: !item.isCompleted })}
                        disabled={checkMutation.isPending}
                      >
                        {item.isCompleted
                          ? <CheckCircle2 size={18} className="text-green-500" />
                          : <Circle size={18} className="text-gray-300" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-snug
                          ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {item.title}
                        </p>
                        {item.description && (
                          <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                        )}
                        {item.isCompleted && item.completedAt && (
                          <p className="text-xs text-green-500 mt-0.5">{t('checklist.completedAt', { date: fmtDate(item.completedAt) })}</p>
                        )}
                      </div>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); deleteCkMutation.mutate(item.id); }}
                        disabled={deleteCkMutation.isPending}
                      >
                        <Trash2 size={13} className="text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="documents" className="mt-3 space-y-4">
              {/* New submittal form */}
              <div className="border rounded-xl p-3 bg-gray-50 space-y-2">
                <p className="text-xs font-semibold text-gray-500">{t('submittal.newTitle')}</p>
                <select
                  className="text-xs h-8 border border-input rounded-md px-2 bg-white w-full"
                  value={newSubmittal.formTypeId}
                  onChange={(e) => setNewSubmittal((f) => ({ ...f, formTypeId: e.target.value }))}
                >
                  <option value="">{t('submittal.selectFormType')}</option>
                  {(formTypes as any[]).map((ft: any) => (
                    <option key={ft.id} value={ft.id}>{ft.name} — {t('submittal.approvalLevels', { count: ft.approvalLevels })}</option>
                  ))}
                </select>
                <Input
                  className="text-xs h-8"
                  placeholder={t('submittal.titlePlaceholder')}
                  value={newSubmittal.title}
                  onChange={(e) => setNewSubmittal((f) => ({ ...f, title: e.target.value }))}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  disabled={!newSubmittal.formTypeId || !newSubmittal.title.trim() || createSubmittalMutation.isPending}
                  onClick={() => createSubmittalMutation.mutate()}
                >
                  <Send size={12} /> {t('submittal.submit')}
                </Button>
              </div>

              {/* Submittal list */}
              <div className="space-y-2">
                {(submittals as any[]).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg">
                    {t('submittal.empty')}
                  </p>
                ) : (
                  (submittals as any[]).map((sub: any) => {
                    const pendingStep = sub.workflow?.steps?.find((s: any) => s.status === 'PENDING');
                    const canAct = pendingStep && user?.role === pendingStep.approverRole;
                    const statusStyle: Record<string, string> = {
                      SUBMITTED: 'bg-blue-100 text-gray-700',
                      IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
                      APPROVED: 'bg-green-100 text-green-700',
                      REJECTED: 'bg-red-100 text-red-700',
                      PUBLISHED: 'bg-teal-100 text-teal-700',
                      OBSOLETED: 'bg-gray-100 text-gray-400',
                    };
                    return (
                      <div
                        key={sub.id}
                        className={`p-3 rounded-lg border space-y-2 bg-gray-50 border-gray-100 ${sub.status === 'OBSOLETED' ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {sub.title} <span className="text-xs text-gray-400">rev{sub.revisionNo}</span>
                            </p>
                            <p className="text-xs text-gray-400">{sub.formType?.name}</p>
                          </div>
                          <Badge className={`border-0 text-xs shrink-0 ${statusStyle[sub.status] ?? 'bg-gray-100 text-gray-700'}`}>
                            {sub.status}
                          </Badge>
                        </div>

                        {sub.workflow?.steps?.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {sub.workflow.steps.map((s: any) => (
                              <span
                                key={s.id}
                                className={`text-xs px-1.5 py-0.5 rounded font-medium
                                  ${s.status === 'APPROVED' ? 'bg-green-100 text-green-700' : s.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}
                              >
                                {s.stepOrder}. {s.approverRole}{s.approver ? ` (${s.approver.fullName})` : ''}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          {canAct && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => approveStepMutation.mutate(pendingStep.id)}>
                                {t('submittal.approve')}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-500"
                                onClick={() => setRejectStepId(pendingStep.id)}>
                                {t('submittal.reject')}
                              </Button>
                            </>
                          )}
                          {sub.status === 'REJECTED' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => resubmitMutation.mutate(sub.id)}>
                              <RotateCcw size={12} /> {t('submittal.resubmit')}
                            </Button>
                          )}
                          {sub.status === 'APPROVED' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => publishSubmittalMutation.mutate(sub.id)}>
                              <Rocket size={12} /> {t('submittal.publish')}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="issues" className="mt-3 space-y-4">
              {dmap?.floor?.floorPlanUrl ? (
                <div>
                  <p className="text-xs font-semibold tracking-wider text-gray-400 mb-2">{t('issue.dmapTitle')}</p>
                  <MallMapViewer
                    floors={[dmap.floor]}
                    initialFloorId={dmap.floor.id}
                    issuePins={(dmap.pins ?? []).map((pin: any) => ({ unitId: dmap.unit.id, severity: pin.severity }))}
                  />
                </div>
              ) : (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 text-center">
                  {t('issue.dmapEmpty')}
                </p>
              )}

              <div className="border rounded-xl p-3 bg-gray-50 space-y-2">
                <p className="text-xs font-semibold text-gray-500">{t('issue.newTitle')}</p>
                <Input
                  className="text-xs h-8"
                  placeholder={t('issue.descriptionPlaceholder')}
                  value={newIssue.title}
                  onChange={(e) => setNewIssue((f) => ({ ...f, title: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select className="text-xs h-8 border border-input rounded-md px-2 bg-white"
                    value={newIssue.category}
                    onChange={(e) => setNewIssue((f) => ({ ...f, category: e.target.value }))}>
                    <option value="DEFECT">{t('issue.category.DEFECT')}</option>
                    <option value="NCR">{t('issue.category.NCR')}</option>
                    <option value="SAFETY">{t('issue.category.SAFETY')}</option>
                    <option value="GENERAL">{t('issue.category.GENERAL')}</option>
                  </select>
                  <select className="text-xs h-8 border border-input rounded-md px-2 bg-white"
                    value={newIssue.severity}
                    onChange={(e) => setNewIssue((f) => ({ ...f, severity: e.target.value }))}>
                    <option value="LOW">{t('issue.severity.LOW')}</option>
                    <option value="MEDIUM">{t('issue.severity.MEDIUM')}</option>
                    <option value="HIGH">{t('issue.severity.HIGH')}</option>
                    <option value="CRITICAL">{t('issue.severity.CRITICAL')}</option>
                  </select>
                </div>
                <Button size="sm" className="h-7 text-xs gap-1"
                  disabled={!newIssue.title.trim() || createIssueMutation.isPending}
                  onClick={() => createIssueMutation.mutate()}>
                  <Plus size={12} /> {t('issue.create')}
                </Button>
              </div>

              <div className="space-y-2">
                {(issues as any[]).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg">{t('issue.empty')}</p>
                ) : (
                  (issues as any[]).map((iss: any) => {
                    const severityColor: Record<string, string> = {
                      LOW: 'bg-gray-100 text-gray-600', MEDIUM: 'bg-blue-100 text-gray-700',
                      HIGH: 'bg-orange-100 text-orange-700', CRITICAL: 'bg-red-100 text-red-700',
                    };
                    const statusColor: Record<string, string> = {
                      OPENED: 'bg-gray-100 text-gray-700', IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
                      DONE: 'bg-blue-100 text-gray-700', CLOSED: 'bg-green-100 text-green-700',
                      REOPENED: 'bg-purple-100 text-purple-700', CANCELLED: 'bg-gray-100 text-gray-400',
                    };
                    const nextOptions: Record<string, string[]> = {
                      OPENED: ['IN_PROGRESS', 'CANCELLED'],
                      IN_PROGRESS: ['DONE', 'CANCELLED'],
                      DONE: ['CLOSED', 'REOPENED'],
                      CLOSED: ['REOPENED'],
                      REOPENED: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
                      CANCELLED: [],
                    };
                    return (
                      <div key={iss.id} className="p-3 rounded-lg border bg-gray-50 border-gray-100 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{iss.title}</p>
                            <p className="text-xs text-gray-400">
                              {iss.unit?.code}{iss.assignee ? ` · ${t('issue.assignee', { name: iss.assignee.fullName })}` : ''}
                              {iss.isOverdue && <span className="text-red-500 font-medium"> · {t('issue.overdue')}</span>}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Badge className={`border-0 text-xs ${severityColor[iss.severity] ?? ''}`}>{iss.severity}</Badge>
                            <Badge className={`border-0 text-xs ${statusColor[iss.status] ?? ''}`}>{iss.status}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(nextOptions[iss.status] ?? []).map((next) => (
                            <Button key={next} size="sm" variant="outline" className="h-6 text-xs px-2"
                              onClick={() => transitionIssueMutation.mutate({ id: iss.id, status: next })}>
                              → {next}
                            </Button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="risks" className="mt-3">
              {projectId && <RiskRegister projectId={projectId} />}
            </TabsContent>

            <TabsContent value="changes" className="mt-3">
              {projectId && <ChangeOrderControl projectId={projectId} />}
            </TabsContent>

            <TabsContent value="milestones" className="mt-3">
              <div className="space-y-2">
                {(milestones as any[]).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg">
                    {t('milestone.empty')}
                  </p>
                ) : (
                  (milestones as any[]).map((m: any) => (
                    <div key={m.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                      m.isOverdue ? 'bg-red-50 border-red-200' : m.completedAt ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'
                    }`}>
                      <div className="flex items-center gap-2">
                        {m.isOverdue ? <AlertTriangle size={16} className="text-red-500" /> :
                         m.completedAt ? <CheckCircle2 size={16} className="text-green-500" /> :
                         <Clock size={16} className="text-gray-400" />}
                        <div>
                          <p className="text-sm font-medium">{stages.find(s => s.code === m.stage)?.name ?? m.stage}</p>
                          <p className="text-xs text-gray-400">{t('milestone.slaDays', { count: m.slaDays ?? '—' })}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {m.targetDate && (
                          <p className={`text-xs ${m.isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            {t('milestone.deadline', { date: fmtDate(m.targetDate) })}
                          </p>
                        )}
                        {m.completedAt && (
                          <p className="text-xs text-green-500">{t('milestone.done', { date: fmtDate(m.completedAt) })}</p>
                        )}
                        {m.isOverdue && !m.completedAt && (
                          <Badge className="bg-red-100 text-red-700 text-xs">{t('milestone.overdue')}</Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="contractors" className="mt-3 space-y-4">
              {/* Add contractor form */}
              <div className="border rounded-xl p-3 bg-gray-50 space-y-2">
                <p className="text-xs font-semibold text-gray-500">{t('contractor.addTitle')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input className="text-xs h-8" placeholder={t('contractor.companyName')} value={contractorForm.companyName}
                    onChange={(e) => setContractorForm((f) => ({ ...f, companyName: e.target.value }))} />
                  <Input className="text-xs h-8" placeholder={t('contractor.contactName')} value={contractorForm.contactName}
                    onChange={(e) => setContractorForm((f) => ({ ...f, contactName: e.target.value }))} />
                  <Input className="text-xs h-8" placeholder={t('contractor.phone')} value={contractorForm.phone}
                    onChange={(e) => setContractorForm((f) => ({ ...f, phone: e.target.value }))} />
                  <Input className="text-xs h-8" placeholder={t('contractor.licenseNo')} value={contractorForm.licenseNo}
                    onChange={(e) => setContractorForm((f) => ({ ...f, licenseNo: e.target.value }))} />
                  <Input type="date" className="text-xs h-8" value={contractorForm.startDate}
                    onChange={(e) => setContractorForm((f) => ({ ...f, startDate: e.target.value }))} />
                </div>
                <Button size="sm" className="h-7 text-xs gap-1"
                  disabled={!contractorForm.companyName || !contractorForm.contactName || !contractorForm.phone || createContractorMutation.isPending}
                  onClick={() => createContractorMutation.mutate(contractorForm)}>
                  <Plus size={12} /> {t('contractor.add')}
                </Button>
              </div>

              {/* Contractors list */}
              <div className="space-y-2">
                {contractors.map((c: any) => (
                  <div key={c.id} className="border rounded-xl p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{c.companyName}</div>
                        <div className="text-xs text-gray-500">{c.contactName} · {c.phone}</div>
                        {c.licenseNo && <div className="text-xs text-gray-400">{t('contractor.gpxd', { no: c.licenseNo })}</div>}
                      </div>
                      <Badge className="bg-green-100 text-green-700 text-xs border-0">{t('contractor.workerCount', { count: c.workers?.length ?? 0 })}</Badge>
                    </div>
                  </div>
                ))}
                {contractors.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{t('contractor.empty')}</p>}
              </div>

              {/* Worker entry log */}
              {contractors.length > 0 && (
                <>
                  <div className="border rounded-xl p-3 bg-gray-50 space-y-2">
                    <p className="text-xs font-semibold text-gray-700">{t('contractor.workerLogTitle')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <select className="text-xs h-8 border border-input rounded-md px-2 bg-white col-span-2"
                        value={workerForm.contractorId}
                        onChange={(e) => setWorkerForm((f) => ({ ...f, contractorId: e.target.value }))}>
                        <option value="">{t('contractor.selectContractor')}</option>
                        {contractors.map((c: any) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                      </select>
                      <Input className="text-xs h-8" placeholder={t('contractor.workerName')} value={workerForm.workerName}
                        onChange={(e) => setWorkerForm((f) => ({ ...f, workerName: e.target.value }))} />
                      <Input className="text-xs h-8" placeholder={t('contractor.idNumber')} value={workerForm.idNumber}
                        onChange={(e) => setWorkerForm((f) => ({ ...f, idNumber: e.target.value }))} />
                      <Input type="datetime-local" className="text-xs h-8" value={workerForm.entryDate}
                        onChange={(e) => setWorkerForm((f) => ({ ...f, entryDate: e.target.value }))} />
                      <Input className="text-xs h-8" placeholder={t('contractor.purpose')} value={workerForm.purpose}
                        onChange={(e) => setWorkerForm((f) => ({ ...f, purpose: e.target.value }))} />
                    </div>
                    <Button size="sm" className="h-7 text-xs gap-1 bg-gray-900 hover:bg-gray-800"
                      disabled={!workerForm.contractorId || !workerForm.workerName || !workerForm.idNumber || logWorkerMutation.isPending}
                      onClick={() => logWorkerMutation.mutate(workerForm)}>
                      <Plus size={12} /> {t('contractor.logEntry')}
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-500">{t('contractor.recentLogs')}</p>
                    {workerLogs.slice(0, 20).map((l: any) => (
                      <div key={l.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
                        <div>
                          <span className="font-medium">{l.workerName}</span>
                          <span className="text-gray-400 ml-1">({l.contractor?.companyName})</span>
                          <div className="text-gray-400">{l.idNumber} · {new Date(l.entryDate).toLocaleString('vi-VN')}</div>
                        </div>
                        {l.exitDate ? (
                          <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">{t('contractor.exitTime', { time: new Date(l.exitDate).toLocaleTimeString('vi-VN') })}</Badge>
                        ) : (
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                            onClick={() => exitWorkerMutation.mutate(l.id)} disabled={exitWorkerMutation.isPending}>
                            {t('contractor.exit')}
                          </Button>
                        )}
                      </div>
                    ))}
                    {workerLogs.length === 0 && <p className="text-xs text-gray-400 text-center py-3">{t('contractor.noLogs')}</p>}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          {p.notes && (
            <div className="mt-4">
              <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2">{t('detail.notes')}</div>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">{p.notes}</p>
            </div>
          )}
        </div>
      )}
      <ReasonActionDialog
        open={!!rejectStepId}
        onOpenChange={(open) => !open && setRejectStepId(null)}
        title={t('submittal.rejectDialog.title')}
        description={t('submittal.rejectDialog.description')}
        confirmLabel={t('submittal.rejectDialog.confirmLabel')}
        loading={rejectStepMutation.isPending}
        onConfirm={(reason) => rejectStepId && rejectStepMutation.mutate({ stepId: rejectStepId, comment: reason }, { onSuccess: () => setRejectStepId(null) })}
      />
    </Sheet>
  );
}

export default function FitoutPage() {
  const { t } = useTranslation('fitout');
  const { selectedMallId } = useMallStore();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('projectId'));
  const [filterStatus, setFilterStatus] = useState('');
  const stages = useStageConfigs();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const canManageConfig = user?.role === 'ADMIN' || user?.role === 'MALL_DIRECTOR';

  // Cross-module handoff (docs/audit/11-INFORMATION-FLOW.md): a Contract's
  // detail view links here with ?projectId=... so the target project opens
  // directly instead of forcing the user to find it again in the list.
  useEffect(() => {
    const id = searchParams.get('projectId');
    if (id) setSelectedId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['fitouts', selectedMallId],
    queryFn: () => fitoutApi.listFitouts({ limit: 100, mallId: selectedMallId ?? undefined }),
  });

  const allProjects: any[] = data?.data ?? [];
  const projects = filterStatus ? allProjects.filter((p) => p.status === filterStatus) : allProjects;
  const withoutManager = allProjects.filter((project) => !project.operationManager).length;
  const openingSoon = allProjects.filter((project) => project.expectedOpenDate && new Date(project.expectedOpenDate).getTime() - Date.now() <= 14 * 86400000 && new Date(project.expectedOpenDate).getTime() >= Date.now()).length;
  const completed = allProjects.filter((project) => ['OPENED', 'COMPLETED'].includes(project.status)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('page.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('page.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/fitout/dashboard')}>
            <BarChart3 size={14} /> Dashboard
          </Button>
          {canManageConfig && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/fitout/settings')}>
              <Settings size={14} /> {t('page.config')}
            </Button>
          )}
          <Badge className="bg-orange-100 text-orange-700 border-0 text-sm px-3 py-1">
            {t('page.projectCount', { count: allProjects.length })}
          </Badge>
        </div>
      </div>

      <section className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-orange-950 to-amber-900 p-5 text-white sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200"><Compass size={14} /> {t('page.operationMap')}</div>
            <h2 className="text-xl font-semibold sm:text-2xl">{withoutManager ? t('page.bannerTitle_withoutManager', { count: withoutManager }) : t('page.bannerTitle_default')}</h2>
            <p className="mt-2 text-sm leading-6 text-amber-100/75">{t('page.bannerSubtitle')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:flex">
            {([['1', t('page.step1')], ['2', t('page.step2')], ['3', t('page.step3')], ['4', t('page.step4')]] as [string, string][]).map(([step, label]) => (
              <div key={step} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white font-bold text-slate-900">{step}</span>{label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t('page.stats.activeProjects'), value: allProjects.length - completed, hint: t('page.stats.activeHint'), icon: HardHat, tone: 'border-orange-100 bg-orange-50 text-orange-700', action: () => setFilterStatus('') },
          { label: t('page.stats.noManager'), value: withoutManager, hint: t('page.stats.noManagerHint'), icon: User, tone: 'border-red-100 bg-red-50 text-red-700', action: () => setFilterStatus('') },
          { label: t('page.stats.openingSoon'), value: openingSoon, hint: t('page.stats.openingSoonHint'), icon: Rocket, tone: 'border-violet-100 bg-violet-50 text-violet-700', action: () => setFilterStatus('') },
          { label: t('page.stats.completed'), value: completed, hint: t('page.stats.completedHint'), icon: FolderCheck, tone: 'border-emerald-100 bg-emerald-50 text-emerald-700', action: () => setFilterStatus(stages.find((stage) => ['OPENED', 'COMPLETED'].includes(stage.code))?.code ?? '') },
        ].map(({ label, value, hint, icon: Icon, tone, action }) => (
          <button key={label} onClick={action} className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${tone}`}>
            <div className="flex items-center justify-between"><Icon size={18} /><span className="text-2xl font-bold">{value}</span></div>
            <div className="mt-2 text-sm font-semibold">{label}</div>
            <div className="text-[11px] opacity-70">{hint}</div>
          </button>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
        <button
          onClick={() => setFilterStatus('')}
          className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium border transition-colors whitespace-nowrap
            ${!filterStatus ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
        >
          {t('page.filterAll', { count: allProjects.length })}
        </button>
        {stages.map((s) => {
          const count = allProjects.filter((p: any) => p.status === s.code).length;
          const active = filterStatus === s.code;
          return (
            <button
              key={s.code}
              onClick={() => setFilterStatus(active ? '' : s.code)}
              style={stageBadgeStyle(s.colorHex)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium border transition-colors whitespace-nowrap
                ${active ? 'ring-2 ring-offset-1 ring-blue-400' : 'border-transparent'}`}
            >
              {s.name}{count > 0 && ` (${count})`}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-40" /></CardContent></Card>
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 py-14 text-center">
          <Hammer size={44} className="mx-auto mb-3 text-red-400" />
          <p className="font-medium text-red-700">{t('page.errorTitle')}</p>
          <p className="mt-1 text-sm text-red-600">{t('page.errorSubtitle')}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>{t('page.retry')}</Button>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Hammer size={48} className="mx-auto mb-3 opacity-30" />
          <p>{filterStatus ? t('page.noProjectsInStatus') : t('page.noProjects')}</p>
          {filterStatus && <Button variant="outline" size="sm" className="mt-4" onClick={() => setFilterStatus('')}>{t('page.viewAll')}</Button>}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {projects.map((p: any) => {
            const step = stages.find((s) => s.code === p.status);
            const progress = getProgress(stages, p.status);
            const nextS = getNextStep(stages, p.status);

            return (
              <Card
                key={p.id}
                className="hover:shadow-md transition-all cursor-pointer border hover:border-gray-300 group"
                onClick={() => setSelectedId(p.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{p.tenant?.brandName}</CardTitle>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {p.unit?.code} — {p.unit?.floor?.name}
                      </p>
                    </div>
                    <Badge className="border-0 text-xs shrink-0" style={stageBadgeStyle(step?.colorHex)}>
                      {step?.name ?? p.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                      <span>{t('page.processProgress')}</span>
                      <span className="font-medium">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <div className="flex items-center gap-3">
                      {p.expectedOpenDate && (
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {fmtDate(p.expectedOpenDate)}
                        </span>
                      )}
                      {nextS && (
                        <span className="flex items-center gap-1 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight size={11} />
                          {nextS.name}
                        </span>
                      )}
                    </div>
                    {p.operationManager && (
                      <span className="flex items-center gap-1">
                        <User size={11} />
                        {p.operationManager.fullName}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <FitoutDetailSheet
        projectId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
