import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fitoutApi, spacesApi } from '@/api';
import { useAuthStore } from '@/store/auth.store';
import { useMallStore } from '@/store/mall.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Plus, Trash2, Pencil, Settings, AlertTriangle, ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/page-header';

interface StageConfig {
  code: string;
  name: string;
  phaseGroup: string;
  roleColumn: string;
  order: number;
  meetingRequired: boolean;
  triggersUnitStatus?: string | null;
  setsField?: string | null;
  colorHex: string;
  isActive: boolean;
}

interface FormType {
  id?: string;
  code: string;
  name: string;
  category: string;
  defaultStageCode?: string | null;
  order: number;
  isActive: boolean;
}

const EMPTY_STAGE: StageConfig = {
  code: '', name: '', phaseGroup: '', roleColumn: 'COORDINATOR', order: 0,
  meetingRequired: false, triggersUnitStatus: '', setsField: '', colorHex: '#6b7280', isActive: true,
};

const EMPTY_FORM_TYPE: FormType = {
  id: undefined, code: '', name: '', category: 'OTHER', defaultStageCode: '', order: 0, isActive: true,
};

function StageDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: StageConfig | null }) {
  const { t } = useTranslation('fitout');
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<StageConfig>(initial ?? EMPTY_STAGE);

  const mutation = useMutation({
    mutationFn: () => fitoutApi.upsertStageConfig({
      ...form,
      triggersUnitStatus: form.triggersUnitStatus || null,
      setsField: form.setsField || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-stage-configs'] });
      toast({ title: t('settings.stageDialog.toast.saved') });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common.error'), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? t('settings.stageDialog.editTitle', { code: initial.code }) : t('settings.stageDialog.addTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">{t('settings.stageDialog.codeLabel')}</label>
              <Input
                value={form.code}
                disabled={!!initial}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                placeholder={t('settings.stageDialog.codePlaceholder')}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('settings.stageDialog.orderLabel')}</label>
              <Input type="number" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: +e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">{t('settings.stageDialog.nameLabel')}</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('settings.stageDialog.namePlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">{t('settings.stageDialog.phaseGroupLabel')}</label>
              <Input value={form.phaseGroup} onChange={(e) => setForm((f) => ({ ...f, phaseGroup: e.target.value }))} placeholder={t('settings.stageDialog.phaseGroupPlaceholder')} />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('settings.stageDialog.roleLabel')}</label>
              <select
                className="w-full h-9 border border-input rounded-md px-2 text-sm bg-white"
                value={form.roleColumn}
                onChange={(e) => setForm((f) => ({ ...f, roleColumn: e.target.value }))}
              >
                <option value="OWNER">{t('settings.stageDialog.roleOwner')}</option>
                <option value="COORDINATOR">{t('settings.stageDialog.roleCoordinator')}</option>
                <option value="TENANT">{t('settings.stageDialog.roleTenant')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">{t('settings.stageDialog.triggerLabel')}</label>
              <Input value={form.triggersUnitStatus ?? ''} onChange={(e) => setForm((f) => ({ ...f, triggersUnitStatus: e.target.value }))} placeholder={t('settings.stageDialog.triggerPlaceholder')} />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('settings.stageDialog.setsFieldLabel')}</label>
              <Input value={form.setsField ?? ''} onChange={(e) => setForm((f) => ({ ...f, setsField: e.target.value }))} placeholder={t('settings.stageDialog.setsFieldPlaceholder')} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox checked={form.meetingRequired} onCheckedChange={(v) => setForm((f) => ({ ...f, meetingRequired: !!v }))} />
              <label className="text-sm">{t('settings.stageDialog.meetingRequired')}</label>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">{t('settings.stageDialog.colorLabel')}</label>
              <input type="color" value={form.colorHex} onChange={(e) => setForm((f) => ({ ...f, colorHex: e.target.value }))} className="w-8 h-8 rounded border" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('settings.stageDialog.cancel')}</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.code || !form.name || mutation.isPending}
          >
            {t('settings.stageDialog.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormTypeDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: FormType | null }) {
  const { t } = useTranslation('fitout');
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormType>(initial ?? EMPTY_FORM_TYPE);

  const mutation = useMutation({
    mutationFn: () => fitoutApi.upsertFormType({ ...form, defaultStageCode: form.defaultStageCode || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-form-types'] });
      toast({ title: t('settings.formTypeDialog.toast.saved') });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common.error'), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? t('settings.formTypeDialog.editTitle', { code: initial.code }) : t('settings.formTypeDialog.addTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">{t('settings.formTypeDialog.codeLabel')}</label>
              <Input
                value={form.code}
                disabled={!!initial}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                placeholder={t('settings.formTypeDialog.codePlaceholder')}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('settings.formTypeDialog.orderLabel')}</label>
              <Input type="number" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: +e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">{t('settings.formTypeDialog.nameLabel')}</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('settings.formTypeDialog.namePlaceholder')} />
          </div>
          <div>
            <label className="text-xs text-gray-500">{t('settings.formTypeDialog.categoryLabel')}</label>
            <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder={t('settings.formTypeDialog.categoryPlaceholder')} />
          </div>
          <div>
            <label className="text-xs text-gray-500">{t('settings.formTypeDialog.stageCodeLabel')}</label>
            <Input value={form.defaultStageCode ?? ''} onChange={(e) => setForm((f) => ({ ...f, defaultStageCode: e.target.value }))} placeholder={t('settings.formTypeDialog.stageCodePlaceholder')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('settings.formTypeDialog.cancel')}</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.code || !form.name || mutation.isPending}
          >
            {t('settings.formTypeDialog.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ApproverCandidate {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

interface ApprovalLevel {
  level: number;
  stepName: string;
  approverRole: string;
  approverId: string;
  approver: { id: string; fullName: string; email: string; role: string; isActive: boolean };
}

/** Một dòng đang soạn — approverId rỗng nghĩa là chưa chọn ai, chưa lưu được. */
interface DraftLevel {
  stepName: string;
  approverId: string;
}

/**
 * Soạn chuỗi duyệt của MỘT loại hồ sơ tại MỘT mall: mỗi cấp đúng một tài khoản, thứ tự từ trên
 * xuống chính là thứ tự duyệt. Thay cho ô "Số cấp duyệt" cũ — ô đó chỉ nói hồ sơ đi qua mấy cấp
 * mà không nói cấp nào của ai, nên nhìn vào màn hình không biết ai sẽ duyệt.
 */
function ApprovalChainEditor({ formType, mallId, candidates }: { formType: FormType; mallId: string; candidates: ApproverCandidate[] }) {
  const { t } = useTranslation('fitout');
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<DraftLevel[] | null>(null);

  const { data: saved = [], isLoading } = useQuery<ApprovalLevel[]>({
    queryKey: ['fitout-approval-levels', formType.code, mallId],
    queryFn: () => fitoutApi.listApprovalLevels(formType.code, mallId),
    enabled: Boolean(mallId),
  });

  // Chuỗi đang hiển thị: bản nháp nếu người dùng đã chỉnh, còn không thì bản đã lưu.
  const levels: DraftLevel[] = draft ?? saved.map((l) => ({ stepName: l.stepName, approverId: l.approverId }));
  const dirty = draft !== null;

  const mutation = useMutation({
    mutationFn: () => fitoutApi.replaceApprovalLevels(formType.code, mallId, levels.map((l) => ({
      stepName: l.stepName.trim() || undefined,
      approverId: l.approverId,
    }))),
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ['fitout-approval-levels', formType.code, mallId] });
      qc.invalidateQueries({ queryKey: ['fitout-approval-level-counts', mallId] });
      toast({ title: t('settings.approvalChain.saved') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common.error'), variant: 'destructive' }),
  });

  const update = (idx: number, patch: Partial<DraftLevel>) =>
    setDraft(levels.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const incomplete = levels.some((l) => !l.approverId);
  const duplicate = levels.some((l, i) => l.approverId && levels.findIndex((o) => o.approverId === l.approverId) !== i);
  const blocker = duplicate
    ? t('settings.approvalChain.duplicateApprover')
    : incomplete
      ? t('settings.approvalChain.incomplete')
      : null;

  if (isLoading) return <p className="text-sm text-gray-400 py-4">{t('settings.loading')}</p>;

  return (
    <div className="space-y-3">
      {levels.length === 0 ? (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t('settings.approvalChain.empty')}</span>
        </div>
      ) : (
        <ol className="space-y-2">
          {levels.map((level, idx) => {
            const chosen = candidates.find((c) => c.id === level.approverId);
            // Tài khoản đã lưu nhưng nay bị khoá/mất quyền mall sẽ không còn trong candidates —
            // vẫn phải hiện ra để người cấu hình thấy mà thay, thay vì im lặng biến mất.
            const staleApprover = !chosen && level.approverId
              ? saved.find((l) => l.approverId === level.approverId)?.approver
              : undefined;
            return (
              <li key={idx}>
                <div className="flex items-start gap-2 rounded-md border border-gray-200 p-3">
                  <Badge variant="outline" className="mt-1.5 shrink-0">{t('settings.approvalChain.level', { level: idx + 1 })}</Badge>
                  <div className="grid flex-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-gray-500">{t('settings.approvalChain.approverLabel')} *</label>
                      <Select value={level.approverId} onValueChange={(v) => update(idx, { approverId: v })}>
                        <SelectTrigger aria-label={t('settings.approvalChain.level', { level: idx + 1 })}>
                          <SelectValue placeholder={t('settings.approvalChain.approverPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {staleApprover && (
                            <SelectItem value={staleApprover.id}>
                              {staleApprover.fullName} — {t('settings.approvalChain.inactiveApprover')}
                            </SelectItem>
                          )}
                          {candidates.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.fullName} · {c.role}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">{t('settings.approvalChain.stepNameLabel')}</label>
                      <Input
                        value={level.stepName}
                        onChange={(e) => update(idx, { stepName: e.target.value })}
                        placeholder={t('settings.approvalChain.stepNamePlaceholder')}
                      />
                    </div>
                  </div>
                  <Button
                    aria-label={t('settings.approvalChain.removeLevel', { level: idx + 1 })}
                    size="sm" variant="ghost" className="mt-1 h-7 w-7 shrink-0 p-0 text-red-500"
                    onClick={() => setDraft(levels.filter((_, i) => i !== idx))}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
                {idx < levels.length - 1 && (
                  <div className="flex justify-center py-0.5 text-gray-300"><ArrowDown size={14} /></div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setDraft([...levels, { stepName: '', approverId: '' }])}>
          <Plus size={14} /> {t('settings.approvalChain.addLevel')}
        </Button>
        <Button size="sm" disabled={!dirty || Boolean(blocker) || mutation.isPending} onClick={() => mutation.mutate()}>
          {t('settings.approvalChain.save')}
        </Button>
        {blocker && <span className="text-xs text-red-600">{blocker}</span>}
      </div>
      <p className="text-xs text-gray-400">{t('settings.approvalChain.affectsNewOnly')}</p>
    </div>
  );
}

export default function FitoutSettingsPage() {
  const { t } = useTranslation('fitout');
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [stageDialog, setStageDialog] = useState<{ open: boolean; initial: StageConfig | null }>({ open: false, initial: null });
  const [formTypeDialog, setFormTypeDialog] = useState<{ open: boolean; initial: FormType | null }>({ open: false, initial: null });
  // Cấp duyệt khai báo theo từng mall, nên trang này cần một mall cụ thể — bộ chọn mall toàn cục
  // có thể đang ở 'Tất cả Mall' (ADMIN), lúc đó chưa cấu hình được gì.
  const globalMallId = useMallStore((state) => state.selectedMallId);
  const [chainMallId, setChainMallId] = useState<string>(globalMallId ?? '');
  const [chainFormTypeCode, setChainFormTypeCode] = useState<string>('');

  const canManage = user?.role === 'ADMIN';

  const { data: stages = [], isLoading: stagesLoading, isError: stagesError, refetch: refetchStages } = useQuery({
    queryKey: ['fitout-stage-configs'],
    queryFn: () => fitoutApi.listStageConfigs(),
    enabled: canManage,
  });

  const { data: formTypes = [], isLoading: formTypesLoading, isError: formTypesError, refetch: refetchFormTypes } = useQuery({
    queryKey: ['fitout-form-types'],
    queryFn: () => fitoutApi.listFormTypes(),
    enabled: canManage,
  });

  const { data: malls = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['spaces-malls'],
    queryFn: () => spacesApi.listMalls(),
    enabled: canManage,
  });

  const { data: approverCandidates = [] } = useQuery<ApproverCandidate[]>({
    queryKey: ['fitout-approver-candidates', chainMallId],
    queryFn: () => fitoutApi.listApproverCandidates(chainMallId),
    enabled: canManage && Boolean(chainMallId),
  });

  const { data: levelCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['fitout-approval-level-counts', chainMallId],
    queryFn: () => fitoutApi.countApprovalLevels(chainMallId),
    enabled: canManage && Boolean(chainMallId),
  });

  const deactivateStageMutation = useMutation({
    mutationFn: (code: string) => fitoutApi.deactivateStageConfig(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-stage-configs'] });
      toast({ title: t('settings.stageDialog.toast.deactivated') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common.error'), variant: 'destructive' }),
  });

  const deactivateFormTypeMutation = useMutation({
    mutationFn: (code: string) => fitoutApi.deactivateFormType(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-form-types'] });
      toast({ title: t('settings.formTypeDialog.toast.deactivated') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common.error'), variant: 'destructive' }),
  });

  if (!canManage) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Settings size={40} className="mx-auto mb-3 opacity-30" />
        <p>{t('settings.noAccess')}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/fitout')}>{t('settings.back')}</Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader className="mb-5" title={t('settings.title')} description={t('settings.subtitle')} actions={<Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/fitout')}><ArrowLeft size={16} /> {t('settings.back')}</Button>} />

      <Tabs defaultValue="stages">
        <TabsList>
          <TabsTrigger value="stages">{t('settings.stages')}</TabsTrigger>
          <TabsTrigger value="form-types">{t('settings.formTypes')}</TabsTrigger>
          <TabsTrigger value="approval-chain">{t('settings.approvalChain.title')}</TabsTrigger>
        </TabsList>

        <TabsContent value="stages" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('settings.stageList')}</CardTitle>
              <Button size="sm" className="gap-1" onClick={() => setStageDialog({ open: true, initial: null })}>
                <Plus size={14} /> {t('settings.addStage')}
              </Button>
            </CardHeader>
            <CardContent>
              {stagesLoading ? (
                <p className="text-sm text-gray-400 py-6 text-center">{t('settings.loading')}</p>
              ) : stagesError ? (
                <div role="alert" className="py-6 text-center">
                  <p className="text-sm text-red-600">{t('settings.loadError')}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchStages()}>{t('settings.retry')}</Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('settings.table.order')}</TableHead>
                      <TableHead>{t('settings.table.code')}</TableHead>
                      <TableHead>{t('settings.table.name')}</TableHead>
                      <TableHead>{t('settings.table.group')}</TableHead>
                      <TableHead>{t('settings.table.role')}</TableHead>
                      <TableHead>{t('settings.table.meeting')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stages as StageConfig[]).map((s) => (
                      <TableRow key={s.code}>
                        <TableCell>{s.order}</TableCell>
                        <TableCell className="font-mono text-xs">{s.code}</TableCell>
                        <TableCell>
                          <Badge className="border-0" style={{ backgroundColor: `${s.colorHex}22`, color: s.colorHex }}>{s.name}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">{s.phaseGroup}</TableCell>
                        <TableCell className="text-xs text-gray-500">{t(`settings.stageDialog.role${s.roleColumn === 'OWNER' ? 'Owner' : s.roleColumn === 'TENANT' ? 'Tenant' : 'Coordinator'}`)}</TableCell>
                        <TableCell>{s.meetingRequired ? '✓' : ''}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button aria-label={t('settings.editStage', { name: s.name })} size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setStageDialog({ open: true, initial: s })}>
                              <Pencil size={13} />
                            </Button>
                            <Button
                              aria-label={t('settings.deactivateStage', { name: s.name })}
                              size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500"
                              onClick={() => deactivateStageMutation.mutate(s.code)}
                              disabled={deactivateStageMutation.isPending}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="form-types" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('settings.formTypeList')}</CardTitle>
              <Button size="sm" className="gap-1" onClick={() => setFormTypeDialog({ open: true, initial: null })}>
                <Plus size={14} /> {t('settings.addFormType')}
              </Button>
            </CardHeader>
            <CardContent>
              {formTypesLoading ? (
                <p className="text-sm text-gray-400 py-6 text-center">{t('settings.loading')}</p>
              ) : formTypesError ? (
                <div role="alert" className="py-6 text-center">
                  <p className="text-sm text-red-600">{t('settings.loadError')}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchFormTypes()}>{t('settings.retry')}</Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('settings.table.order')}</TableHead>
                      <TableHead>{t('settings.table.code')}</TableHead>
                      <TableHead>{t('settings.table.name')}</TableHead>
                      <TableHead>{t('settings.table.category')}</TableHead>
                      <TableHead>{t('settings.table.stage')}</TableHead>
                      <TableHead>{t('settings.table.approvalLevels')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(formTypes as FormType[]).map((f) => (
                      <TableRow key={f.code}>
                        <TableCell>{f.order}</TableCell>
                        <TableCell className="font-mono text-xs">{f.code}</TableCell>
                        <TableCell>{f.name}</TableCell>
                        <TableCell className="text-xs text-gray-500">{f.category}</TableCell>
                        <TableCell className="text-xs text-gray-500">{f.defaultStageCode ?? '—'}</TableCell>
                        <TableCell>
                          {!chainMallId ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : levelCounts[f.id ?? ''] ? (
                            <span className="text-xs">{t('settings.approvalChain.levelsCount', { count: levelCounts[f.id ?? ''] })}</span>
                          ) : (
                            <Badge variant="outline" className="border-amber-300 text-amber-700">{t('settings.approvalChain.notConfigured')}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button aria-label={t('settings.editFormType', { name: f.name })} size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setFormTypeDialog({ open: true, initial: f })}>
                              <Pencil size={13} />
                            </Button>
                            <Button
                              aria-label={t('settings.deactivateFormType', { name: f.name })}
                              size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500"
                              onClick={() => deactivateFormTypeMutation.mutate(f.code)}
                              disabled={deactivateFormTypeMutation.isPending}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="approval-chain" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('settings.approvalChain.title')}</CardTitle>
              <p className="text-sm text-gray-500">{t('settings.approvalChain.subtitle')}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-gray-500">{t('settings.approvalChain.mallLabel')} *</label>
                  <Select value={chainMallId} onValueChange={(v) => { setChainMallId(v); setChainFormTypeCode(''); }}>
                    <SelectTrigger aria-label={t('settings.approvalChain.mallLabel')}>
                      <SelectValue placeholder={t('settings.approvalChain.mallPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {malls.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-gray-400">{t('settings.approvalChain.mallHint')}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">{t('settings.approvalChain.formTypeLabel')} *</label>
                  <Select value={chainFormTypeCode} onValueChange={setChainFormTypeCode} disabled={!chainMallId}>
                    <SelectTrigger aria-label={t('settings.approvalChain.formTypeLabel')}>
                      <SelectValue placeholder={t('settings.approvalChain.formTypeLabel')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(formTypes as FormType[]).map((f) => (
                        <SelectItem key={f.code} value={f.code}>
                          {f.name}{levelCounts[f.id ?? ''] ? '' : ` — ${t('settings.approvalChain.notConfigured')}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {chainMallId && approverCandidates.length === 0 && (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>{t('settings.approvalChain.noCandidates')}</span>
                </div>
              )}

              {chainMallId && chainFormTypeCode && (() => {
                const selected = (formTypes as FormType[]).find((f) => f.code === chainFormTypeCode);
                if (!selected) return null;
                return (
                  <ApprovalChainEditor
                    key={`${selected.code}:${chainMallId}`}
                    formType={selected}
                    mallId={chainMallId}
                    candidates={approverCandidates}
                  />
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {stageDialog.open && (
        <StageDialog open={stageDialog.open} initial={stageDialog.initial} onClose={() => setStageDialog({ open: false, initial: null })} />
      )}
      {formTypeDialog.open && (
        <FormTypeDialog open={formTypeDialog.open} initial={formTypeDialog.initial} onClose={() => setFormTypeDialog({ open: false, initial: null })} />
      )}
    </div>
  );
}
