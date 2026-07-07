import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fitoutApi, fitoutSubmittalApi, fitoutIssueApi, approvalsApi, usersApi } from '@/api';
import { useAuthStore } from '@/store/auth.store';
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
import {
  Hammer, CheckCircle2, Circle, ChevronRight, User, Calendar,
  ClipboardList, ArrowRight, AlertTriangle, Clock, Upload,
  Plus, Trash2, ShieldAlert, Settings, RotateCcw, Send, Rocket, BarChart3,
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
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const stages = useStageConfigs();
  const [newCkTitle, setNewCkTitle] = useState('');
  const [gateWarning, setGateWarning] = useState<{ missing: { documentType: string; description?: string }[] } | null>(null);
  const [pendingAdvanceStatus, setPendingAdvanceStatus] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
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
      toast({ title: 'Đã thêm nhà thầu' });
    },
  });

  const logWorkerMutation = useMutation({
    mutationFn: (dto: typeof workerForm) => fitoutApi.logWorkerEntry(projectId!, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-workers', projectId] });
      setWorkerForm({ contractorId: '', workerName: '', idNumber: '', entryDate: new Date().toISOString().slice(0, 10), purpose: '' });
      toast({ title: 'Đã ghi nhận vào công trường' });
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
      setGateWarning(null);
      setPendingAdvanceStatus(null);
      setOverrideReason('');
      toast({ title: 'Đã cập nhật trạng thái' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
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
      toast({ title: 'Không thể kiểm tra điều kiện chuyển giai đoạn — vui lòng thử lại', variant: 'destructive' });
      return;
    }
    advanceMutation.mutate({ status });
  };

  const checkMutation = useMutation({
    mutationFn: ({ checklistId, isCompleted }: { checklistId: string; isCompleted: boolean }) =>
      fitoutApi.updateChecklist(projectId!, checklistId, isCompleted),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fitout-checklists', projectId] }),
    onError: () => toast({ title: 'Lỗi cập nhật checklist', variant: 'destructive' }),
  });

  const createCkMutation = useMutation({
    mutationFn: (title: string) => fitoutApi.createChecklist(projectId!, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-checklists', projectId] });
      setNewCkTitle('');
      toast({ title: 'Đã thêm checklist item' });
    },
    onError: () => toast({ title: 'Lỗi tạo checklist', variant: 'destructive' }),
  });

  const deleteCkMutation = useMutation({
    mutationFn: (checklistId: string) => fitoutApi.deleteChecklist(projectId!, checklistId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fitout-checklists', projectId] }),
    onError: () => toast({ title: 'Lỗi xóa checklist', variant: 'destructive' }),
  });

  const assignMutation = useMutation({
    mutationFn: (operationManagerId: string) => fitoutApi.assign(projectId!, operationManagerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-detail', projectId] });
      qc.invalidateQueries({ queryKey: ['fitouts'] });
      toast({ title: 'Đã phân công OP Manager' });
    },
    onError: () => toast({ title: 'Lỗi phân công', variant: 'destructive' }),
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
      toast({ title: 'Đã nộp đệ trình' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi nộp đệ trình', variant: 'destructive' }),
  });

  const approveStepMutation = useMutation({
    mutationFn: (stepId: string) => approvalsApi.approve(stepId),
    onSuccess: () => { invalidateSubmittals(); toast({ title: 'Đã duyệt' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi duyệt', variant: 'destructive' }),
  });

  const rejectStepMutation = useMutation({
    mutationFn: ({ stepId, comment }: { stepId: string; comment?: string }) => approvalsApi.reject(stepId, comment),
    onSuccess: () => { invalidateSubmittals(); toast({ title: 'Đã từ chối' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi từ chối', variant: 'destructive' }),
  });

  const resubmitMutation = useMutation({
    mutationFn: (id: string) => fitoutSubmittalApi.resubmit(id, {}),
    onSuccess: () => { invalidateSubmittals(); toast({ title: 'Đã nộp lại' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi nộp lại', variant: 'destructive' }),
  });

  const publishSubmittalMutation = useMutation({
    mutationFn: (id: string) => fitoutSubmittalApi.publish(id),
    onSuccess: () => { invalidateSubmittals(); toast({ title: 'Đã publish' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi publish', variant: 'destructive' }),
  });

  const [newIssue, setNewIssue] = useState({ title: '', category: 'DEFECT', severity: 'MEDIUM' });

  const invalidateIssues = () => qc.invalidateQueries({ queryKey: ['fitout-issues', projectId] });

  const createIssueMutation = useMutation({
    mutationFn: () => fitoutIssueApi.create({ projectId, unitId: p?.unit?.id, ...newIssue }),
    onSuccess: () => {
      invalidateIssues();
      setNewIssue({ title: '', category: 'DEFECT', severity: 'MEDIUM' });
      toast({ title: 'Đã tạo vấn đề' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi tạo vấn đề', variant: 'destructive' }),
  });

  const transitionIssueMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => fitoutIssueApi.transition(id, status),
    onSuccess: () => { invalidateIssues(); toast({ title: 'Đã cập nhật vấn đề' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi cập nhật', variant: 'destructive' }),
  });

  const p: any = project;
  const nextStep = p ? getNextStep(stages, p.status) : null;
  const currentStage = p ? stages.find((s) => s.code === p.status) : undefined;
  const ckList: any[] = checklists as any[];
  const doneCount = ckList.filter((c) => c.isCompleted).length;
  const totalCount = ckList.length;

  return (
    <Sheet
      open={!!projectId}
      onClose={onClose}
      title={p ? `${p.tenant?.brandName} — ${p.unit?.code}` : 'Đang tải...'}
      subtitle={currentStage?.name}
    >
      {isLoading ? (
        <div className="px-6 pt-4 space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : p && (
        <div className="px-6 pb-8 space-y-5 pt-4">

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Badge className="border-0" style={stageBadgeStyle(currentStage?.colorHex)}>
                {currentStage?.name ?? p.status}
              </Badge>
              <span className="text-xs text-gray-500">{Math.round(getProgress(stages, p.status))}% hoàn thành</span>
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
          <SheetSection label="TIẾN ĐỘ NGÀY">
            <SheetRow label="Bàn giao mặt bằng"    value={fmtDate(p.handoverDate)}     icon={Calendar} />
            <SheetRow label="Bắt đầu thi công"      value={fmtDate(p.startDate)}        icon={Calendar} />
            <SheetRow label="Dự kiến khai trương"   value={fmtDate(p.expectedOpenDate)} icon={Calendar} />
            {p.actualOpenDate && (
              <SheetRow label="Khai trương thực tế" value={fmtDate(p.actualOpenDate)}   icon={Calendar} />
            )}
            {p.contract && (
              <SheetRow label="Hợp đồng" value={p.contract.contractNumber} icon={ClipboardList} />
            )}
          </SheetSection>

          {/* Assign OP */}
          <div>
            <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2">PHỤ TRÁCH VẬN HÀNH</div>
            <Select
              value={p.operationManager?.id ?? ''}
              onValueChange={(val) => val && assignMutation.mutate(val)}
              disabled={assignMutation.isPending}
            >
              <SelectTrigger className="h-9 text-sm">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-gray-400 shrink-0" />
                  <SelectValue placeholder="Chọn OP Manager">
                    {p.operationManager?.fullName ?? 'Chưa phân công'}
                  </SelectValue>
                </div>
              </SelectTrigger>
              <SelectContent>
                {opUsers.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                ))}
                {opUsers.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400">Không tìm thấy OPERATION user</div>
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
                    <ShieldAlert size={18} /> Cần hoàn thành trước khi chuyển giai đoạn
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-gray-600">Các tài liệu sau chưa được phê duyệt:</p>
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
                      placeholder="Lý do bỏ qua (bắt buộc)..."
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="text-sm"
                    />
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setGateWarning(null); setPendingAdvanceStatus(null); setOverrideReason(''); }}>
                      Quay lại upload tài liệu
                    </Button>
                    {canOverrideGate && (
                      <Button
                        variant="destructive"
                        className="flex-1 text-xs"
                        onClick={() => { if (pendingAdvanceStatus) advanceMutation.mutate({ status: pendingAdvanceStatus, override: true, overrideReason }); }}
                        disabled={advanceMutation.isPending || !overrideReason.trim()}
                      >
                        Bỏ qua & Tiếp tục
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
              Chuyển sang: <strong className="ml-1">{nextStep.name}</strong>
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-2 py-2 text-green-600 font-medium text-sm bg-green-50 rounded-lg">
              <CheckCircle2 size={18} />
              Đã khai trương — hoàn thành quy trình
            </div>
          )}

          {/* Links to dedicated Daily Report / Gantt pages */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-xs gap-1"
              onClick={() => navigate(`/fitout/${projectId}/daily-report`)}>
              <ClipboardList size={13} /> Nhật ký công trường
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-xs gap-1"
              onClick={() => navigate(`/fitout/${projectId}/gantt`)}>
              <Clock size={13} /> Tiến độ Gantt
            </Button>
          </div>

          {/* Tabs for Checklist, Documents & Milestones */}
          <Tabs defaultValue="checklist" className="mt-4">
            <TabsList className="w-full grid grid-cols-5">
              <TabsTrigger value="checklist" className="text-xs">Checklist</TabsTrigger>
              <TabsTrigger value="documents" className="text-xs">Submittals</TabsTrigger>
              <TabsTrigger value="issues" className="text-xs">Vấn đề</TabsTrigger>
              <TabsTrigger value="milestones" className="text-xs">SLA</TabsTrigger>
              <TabsTrigger value="contractors" className="text-xs">Nhà thầu</TabsTrigger>
            </TabsList>

            <TabsContent value="checklist" className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold tracking-wider text-gray-400">
                  CHECKLIST {totalCount > 0 && `(${doneCount}/${totalCount})`}
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
                  placeholder="Thêm checklist item..."
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
                  Chưa có checklist items — thêm bên trên
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
                          <p className="text-xs text-green-500 mt-0.5">Hoàn thành: {fmtDate(item.completedAt)}</p>
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
                <p className="text-xs font-semibold text-gray-500">Nộp đệ trình mới</p>
                <select
                  className="text-xs h-8 border border-input rounded-md px-2 bg-white w-full"
                  value={newSubmittal.formTypeId}
                  onChange={(e) => setNewSubmittal((f) => ({ ...f, formTypeId: e.target.value }))}
                >
                  <option value="">Chọn loại hồ sơ (Form)</option>
                  {(formTypes as any[]).map((ft: any) => (
                    <option key={ft.id} value={ft.id}>{ft.name} — {ft.approvalLevels} cấp duyệt</option>
                  ))}
                </select>
                <Input
                  className="text-xs h-8"
                  placeholder="Tiêu đề đệ trình"
                  value={newSubmittal.title}
                  onChange={(e) => setNewSubmittal((f) => ({ ...f, title: e.target.value }))}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  disabled={!newSubmittal.formTypeId || !newSubmittal.title.trim() || createSubmittalMutation.isPending}
                  onClick={() => createSubmittalMutation.mutate()}
                >
                  <Send size={12} /> Nộp
                </Button>
              </div>

              {/* Submittal list */}
              <div className="space-y-2">
                {(submittals as any[]).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg">
                    Chưa có đệ trình nào
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
                                Duyệt
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-500"
                                onClick={() => {
                                  const reason = window.prompt('Lý do từ chối:');
                                  if (reason !== null) rejectStepMutation.mutate({ stepId: pendingStep.id, comment: reason });
                                }}>
                                Từ chối
                              </Button>
                            </>
                          )}
                          {sub.status === 'REJECTED' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => resubmitMutation.mutate(sub.id)}>
                              <RotateCcw size={12} /> Nộp lại
                            </Button>
                          )}
                          {sub.status === 'APPROVED' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => publishSubmittalMutation.mutate(sub.id)}>
                              <Rocket size={12} /> Publish
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
                  <p className="text-xs font-semibold tracking-wider text-gray-400 mb-2">D-MAP — GHIM VỊ TRÍ VẤN ĐỀ</p>
                  <MallMapViewer
                    floors={[dmap.floor]}
                    initialFloorId={dmap.floor.id}
                    issuePins={(dmap.pins ?? []).map((pin: any) => ({ unitId: dmap.unit.id, severity: pin.severity }))}
                  />
                </div>
              ) : (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 text-center">
                  Tầng này chưa có sơ đồ mặt bằng số — vào Mặt bằng → Bản đồ số để thiết lập.
                </p>
              )}

              <div className="border rounded-xl p-3 bg-gray-50 space-y-2">
                <p className="text-xs font-semibold text-gray-500">Tạo vấn đề mới</p>
                <Input
                  className="text-xs h-8"
                  placeholder="Mô tả vấn đề..."
                  value={newIssue.title}
                  onChange={(e) => setNewIssue((f) => ({ ...f, title: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select className="text-xs h-8 border border-input rounded-md px-2 bg-white"
                    value={newIssue.category}
                    onChange={(e) => setNewIssue((f) => ({ ...f, category: e.target.value }))}>
                    <option value="DEFECT">Khiếm khuyết (Defect)</option>
                    <option value="NCR">NCR</option>
                    <option value="SAFETY">An toàn</option>
                    <option value="GENERAL">Chung</option>
                  </select>
                  <select className="text-xs h-8 border border-input rounded-md px-2 bg-white"
                    value={newIssue.severity}
                    onChange={(e) => setNewIssue((f) => ({ ...f, severity: e.target.value }))}>
                    <option value="LOW">Thấp</option>
                    <option value="MEDIUM">Trung bình</option>
                    <option value="HIGH">Cao</option>
                    <option value="CRITICAL">Nghiêm trọng</option>
                  </select>
                </div>
                <Button size="sm" className="h-7 text-xs gap-1"
                  disabled={!newIssue.title.trim() || createIssueMutation.isPending}
                  onClick={() => createIssueMutation.mutate()}>
                  <Plus size={12} /> Tạo vấn đề
                </Button>
              </div>

              <div className="space-y-2">
                {(issues as any[]).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg">Chưa có vấn đề nào</p>
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
                              {iss.unit?.code}{iss.assignee ? ` · Giao: ${iss.assignee.fullName}` : ''}
                              {iss.isOverdue && <span className="text-red-500 font-medium"> · Quá hạn</span>}
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

            <TabsContent value="milestones" className="mt-3">
              <div className="space-y-2">
                {(milestones as any[]).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg">
                    Chưa có milestone SLA nào
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
                          <p className="text-xs text-gray-400">SLA: {m.slaDays ?? '—'} ngày</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {m.targetDate && (
                          <p className={`text-xs ${m.isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            Hạn: {fmtDate(m.targetDate)}
                          </p>
                        )}
                        {m.completedAt && (
                          <p className="text-xs text-green-500">Xong: {fmtDate(m.completedAt)}</p>
                        )}
                        {m.isOverdue && !m.completedAt && (
                          <Badge className="bg-red-100 text-red-700 text-xs">Quá hạn</Badge>
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
                <p className="text-xs font-semibold text-gray-500">Thêm nhà thầu mới</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input className="text-xs h-8" placeholder="Tên công ty *" value={contractorForm.companyName}
                    onChange={(e) => setContractorForm((f) => ({ ...f, companyName: e.target.value }))} />
                  <Input className="text-xs h-8" placeholder="Người liên hệ *" value={contractorForm.contactName}
                    onChange={(e) => setContractorForm((f) => ({ ...f, contactName: e.target.value }))} />
                  <Input className="text-xs h-8" placeholder="Điện thoại *" value={contractorForm.phone}
                    onChange={(e) => setContractorForm((f) => ({ ...f, phone: e.target.value }))} />
                  <Input className="text-xs h-8" placeholder="Số GPXD" value={contractorForm.licenseNo}
                    onChange={(e) => setContractorForm((f) => ({ ...f, licenseNo: e.target.value }))} />
                  <Input type="date" className="text-xs h-8" value={contractorForm.startDate}
                    onChange={(e) => setContractorForm((f) => ({ ...f, startDate: e.target.value }))} />
                </div>
                <Button size="sm" className="h-7 text-xs gap-1"
                  disabled={!contractorForm.companyName || !contractorForm.contactName || !contractorForm.phone || createContractorMutation.isPending}
                  onClick={() => createContractorMutation.mutate(contractorForm)}>
                  <Plus size={12} /> Thêm nhà thầu
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
                        {c.licenseNo && <div className="text-xs text-gray-400">GPXD: {c.licenseNo}</div>}
                      </div>
                      <Badge className="bg-green-100 text-green-700 text-xs border-0">{c.workers?.length ?? 0} công nhân</Badge>
                    </div>
                  </div>
                ))}
                {contractors.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Chưa có nhà thầu</p>}
              </div>

              {/* Worker entry log */}
              {contractors.length > 0 && (
                <>
                  <div className="border rounded-xl p-3 bg-gray-50 space-y-2">
                    <p className="text-xs font-semibold text-gray-700">Ghi nhận công nhân vào công trường</p>
                    <div className="grid grid-cols-2 gap-2">
                      <select className="text-xs h-8 border border-input rounded-md px-2 bg-white col-span-2"
                        value={workerForm.contractorId}
                        onChange={(e) => setWorkerForm((f) => ({ ...f, contractorId: e.target.value }))}>
                        <option value="">Chọn nhà thầu</option>
                        {contractors.map((c: any) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                      </select>
                      <Input className="text-xs h-8" placeholder="Họ tên công nhân" value={workerForm.workerName}
                        onChange={(e) => setWorkerForm((f) => ({ ...f, workerName: e.target.value }))} />
                      <Input className="text-xs h-8" placeholder="CCCD/CMND" value={workerForm.idNumber}
                        onChange={(e) => setWorkerForm((f) => ({ ...f, idNumber: e.target.value }))} />
                      <Input type="datetime-local" className="text-xs h-8" value={workerForm.entryDate}
                        onChange={(e) => setWorkerForm((f) => ({ ...f, entryDate: e.target.value }))} />
                      <Input className="text-xs h-8" placeholder="Mục đích" value={workerForm.purpose}
                        onChange={(e) => setWorkerForm((f) => ({ ...f, purpose: e.target.value }))} />
                    </div>
                    <Button size="sm" className="h-7 text-xs gap-1 bg-gray-900 hover:bg-gray-800"
                      disabled={!workerForm.contractorId || !workerForm.workerName || !workerForm.idNumber || logWorkerMutation.isPending}
                      onClick={() => logWorkerMutation.mutate(workerForm)}>
                      <Plus size={12} /> Ghi nhận vào
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-500">Log công nhân gần đây</p>
                    {workerLogs.slice(0, 20).map((l: any) => (
                      <div key={l.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
                        <div>
                          <span className="font-medium">{l.workerName}</span>
                          <span className="text-gray-400 ml-1">({l.contractor?.companyName})</span>
                          <div className="text-gray-400">{l.idNumber} · {new Date(l.entryDate).toLocaleString('vi-VN')}</div>
                        </div>
                        {l.exitDate ? (
                          <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Ra: {new Date(l.exitDate).toLocaleTimeString('vi-VN')}</Badge>
                        ) : (
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                            onClick={() => exitWorkerMutation.mutate(l.id)} disabled={exitWorkerMutation.isPending}>
                            Ra
                          </Button>
                        )}
                      </div>
                    ))}
                    {workerLogs.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Chưa có log</p>}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          {p.notes && (
            <div className="mt-4">
              <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2">GHI CHÚ</div>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">{p.notes}</p>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

export default function FitoutPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const stages = useStageConfigs();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const canManageConfig = user?.role === 'ADMIN' || user?.role === 'MALL_DIRECTOR';

  const { data, isLoading } = useQuery({
    queryKey: ['fitouts'],
    queryFn: () => fitoutApi.listFitouts({ limit: 100 }),
  });

  const allProjects: any[] = data?.data ?? [];
  const projects = filterStatus ? allProjects.filter((p) => p.status === filterStatus) : allProjects;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fitout Management</h1>
          <p className="text-sm text-gray-500 mt-1">Theo dõi tiến độ thi công nội thất</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/fitout/dashboard')}>
            <BarChart3 size={14} /> Dashboard
          </Button>
          {canManageConfig && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/fitout/settings')}>
              <Settings size={14} /> Cấu hình
            </Button>
          )}
          <Badge className="bg-orange-100 text-orange-700 border-0 text-sm px-3 py-1">
            {allProjects.length} dự án
          </Badge>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
        <button
          onClick={() => setFilterStatus('')}
          className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium border transition-colors whitespace-nowrap
            ${!filterStatus ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
        >
          Tất cả ({allProjects.length})
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
      ) : projects.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Hammer size={48} className="mx-auto mb-3 opacity-30" />
          <p>{filterStatus ? 'Không có dự án ở trạng thái này' : 'Chưa có dự án fitout nào'}</p>
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
                      <span>Tiến độ quy trình</span>
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
