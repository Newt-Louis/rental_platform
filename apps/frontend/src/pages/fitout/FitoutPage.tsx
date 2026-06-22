import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fitoutApi, usersApi } from '@/api';
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
import {
  Hammer, CheckCircle2, Circle, ChevronRight, User, Calendar,
  ClipboardList, ArrowRight, FileText, AlertTriangle, Clock, Upload,
  Plus, Trash2, ShieldAlert,
} from 'lucide-react';

const STATUS_STEPS = [
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

const STATUS_COLOR: Record<string, string> = {
  CONTRACT_SIGNED:     'bg-gray-100 text-gray-700',
  SUBMIT_DESIGN:       'bg-blue-100 text-gray-700',
  DESIGN_REVIEW:       'bg-gray-100 text-gray-700',
  FIRE_SAFETY_REVIEW:  'bg-red-100 text-red-700',
  CONSTRUCTION_PERMIT: 'bg-yellow-100 text-yellow-700',
  FITOUT_IN_PROGRESS:  'bg-orange-100 text-orange-700',
  INSPECTION:          'bg-purple-100 text-purple-700',
  APPROVED_TO_OPEN:    'bg-teal-100 text-teal-700',
  OPENED:              'bg-green-100 text-green-700',
};

function getProgress(status: string) {
  const s = STATUS_STEPS.find((x) => x.key === status);
  return s ? ((s.step - 1) / (STATUS_STEPS.length - 1)) * 100 : 0;
}

function getNextStep(status: string) {
  const idx = STATUS_STEPS.findIndex((x) => x.key === status);
  return idx >= 0 && idx < STATUS_STEPS.length - 1 ? STATUS_STEPS[idx + 1] : null;
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function FitoutDetailSheet({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newCkTitle, setNewCkTitle] = useState('');
  const [gateWarning, setGateWarning] = useState<{ missing: { documentType: string; description?: string }[] } | null>(null);
  const [pendingAdvanceStatus, setPendingAdvanceStatus] = useState<string | null>(null);

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

  const { data: documents = [] } = useQuery({
    queryKey: ['fitout-documents', projectId],
    queryFn: () => fitoutApi.listDocuments(projectId!),
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
    mutationFn: (status: string) => fitoutApi.advanceStatus(projectId!, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitouts'] });
      qc.invalidateQueries({ queryKey: ['fitout-detail', projectId] });
      setGateWarning(null);
      setPendingAdvanceStatus(null);
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
      // nếu không có gate config → cho phép advance
    }
    advanceMutation.mutate(status);
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

  const reviewDocMutation = useMutation({
    mutationFn: ({ docId, decision, note }: { docId: string; decision: 'APPROVED' | 'REJECTED'; note?: string }) =>
      fitoutApi.reviewDocument(projectId!, docId, decision, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-documents', projectId] });
      toast({ title: 'Đã cập nhật trạng thái tài liệu' });
    },
    onError: () => toast({ title: 'Lỗi cập nhật tài liệu', variant: 'destructive' }),
  });

  const p: any = project;
  const nextStep = p ? getNextStep(p.status) : null;
  const ckList: any[] = checklists as any[];
  const doneCount = ckList.filter((c) => c.isCompleted).length;
  const totalCount = ckList.length;

  return (
    <Sheet
      open={!!projectId}
      onClose={onClose}
      title={p ? `${p.tenant?.brandName} — ${p.unit?.code}` : 'Đang tải...'}
      subtitle={p ? STATUS_STEPS.find((s) => s.key === p.status)?.label : undefined}
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
              <Badge className={`${STATUS_COLOR[p.status]} border-0`}>
                {STATUS_STEPS.find((s) => s.key === p.status)?.label}
              </Badge>
              <span className="text-xs text-gray-500">{Math.round(getProgress(p.status))}% hoàn thành</span>
            </div>
            <Progress value={getProgress(p.status)} className="h-2.5" />
          </div>

          {/* Mini pipeline */}
          <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
            {STATUS_STEPS.map((s) => {
              const curStep = STATUS_STEPS.find((x) => x.key === p.status)?.step ?? 0;
              const isActive = s.key === p.status;
              const isDone = s.step < curStep;
              return (
                <span
                  key={s.key}
                  className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap
                    ${isDone ? 'bg-green-100 text-green-700' : isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}
                >
                  {s.label}
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
            <Dialog open={!!gateWarning} onOpenChange={() => { setGateWarning(null); setPendingAdvanceStatus(null); }}>
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
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setGateWarning(null); setPendingAdvanceStatus(null); }}>
                      Quay lại upload tài liệu
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 text-xs"
                      onClick={() => { if (pendingAdvanceStatus) advanceMutation.mutate(pendingAdvanceStatus); }}
                      disabled={advanceMutation.isPending}
                    >
                      Bỏ qua & Tiếp tục
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Advance status */}
          {nextStep ? (
            <Button
              className="w-full gap-2"
              onClick={() => handleAdvance(nextStep.key)}
              disabled={advanceMutation.isPending}
            >
              <ArrowRight size={16} />
              Chuyển sang: <strong className="ml-1">{nextStep.label}</strong>
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-2 py-2 text-green-600 font-medium text-sm bg-green-50 rounded-lg">
              <CheckCircle2 size={18} />
              Đã khai trương — hoàn thành quy trình
            </div>
          )}

          {/* Checklist */}
          <div>
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
          </div>

          {/* Tabs for Documents & Milestones */}
          <Tabs defaultValue="checklist" className="mt-4">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="checklist" className="text-xs">Checklist</TabsTrigger>
              <TabsTrigger value="documents" className="text-xs">Tài liệu</TabsTrigger>
              <TabsTrigger value="milestones" className="text-xs">SLA</TabsTrigger>
              <TabsTrigger value="contractors" className="text-xs">Nhà thầu</TabsTrigger>
            </TabsList>

            <TabsContent value="checklist" className="mt-3">
              {/* Checklist content already exists above - but we move it into the tab */}
            </TabsContent>

            <TabsContent value="documents" className="mt-3">
              <div className="space-y-2">
                {(documents as any[]).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg">
                    Chưa có tài liệu nào được upload
                  </p>
                ) : (
                  (documents as any[]).map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-gray-500" />
                        <div>
                          <p className="text-sm font-medium">{doc.fileName}</p>
                          <p className="text-xs text-gray-400">{doc.documentType}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={
                          doc.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                          doc.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                          doc.status === 'SUBMITTED' ? 'bg-blue-100 text-gray-700' :
                          'bg-gray-100 text-gray-700'
                        }>
                          {doc.status}
                        </Badge>
                        {doc.status === 'SUBMITTED' && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => reviewDocMutation.mutate({ docId: doc.id, decision: 'APPROVED' })}>
                              Duyệt
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-500"
                              onClick={() => reviewDocMutation.mutate({ docId: doc.id, decision: 'REJECTED' })}>
                              Từ chối
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
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
                          <p className="text-sm font-medium">{STATUS_STEPS.find(s => s.key === m.stage)?.label ?? m.stage}</p>
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
        <Badge className="bg-orange-100 text-orange-700 border-0 text-sm px-3 py-1">
          {allProjects.length} dự án
        </Badge>
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
        {STATUS_STEPS.map((s) => {
          const count = allProjects.filter((p: any) => p.status === s.key).length;
          const active = filterStatus === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setFilterStatus(active ? '' : s.key)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium border transition-colors whitespace-nowrap
                ${STATUS_COLOR[s.key]} ${active ? 'ring-2 ring-offset-1 ring-blue-400' : 'border-transparent'}`}
            >
              {s.label}{count > 0 && ` (${count})`}
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
            const step = STATUS_STEPS.find((s) => s.key === p.status);
            const progress = getProgress(p.status);
            const nextS = getNextStep(p.status);

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
                    <Badge className={`${STATUS_COLOR[p.status]} border-0 text-xs shrink-0`}>
                      {step?.label}
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
                          {nextS.label}
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
