import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fitoutApi } from '@/api';
import { useAuthStore } from '@/store/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Plus, Trash2, Pencil, Settings } from 'lucide-react';
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
  code: string;
  name: string;
  category: string;
  defaultStageCode?: string | null;
  approvalLevels: number;
  order: number;
  isActive: boolean;
}

const EMPTY_STAGE: StageConfig = {
  code: '', name: '', phaseGroup: '', roleColumn: 'COORDINATOR', order: 0,
  meetingRequired: false, triggersUnitStatus: '', setsField: '', colorHex: '#6b7280', isActive: true,
};

const EMPTY_FORM_TYPE: FormType = {
  code: '', name: '', category: 'OTHER', defaultStageCode: '', approvalLevels: 1, order: 0, isActive: true,
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">{t('settings.formTypeDialog.categoryLabel')}</label>
              <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder={t('settings.formTypeDialog.categoryPlaceholder')} />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('settings.formTypeDialog.approvalLevelsLabel')}</label>
              <Input type="number" min={1} value={form.approvalLevels} onChange={(e) => setForm((f) => ({ ...f, approvalLevels: +e.target.value }))} />
            </div>
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

export default function FitoutSettingsPage() {
  const { t } = useTranslation('fitout');
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [stageDialog, setStageDialog] = useState<{ open: boolean; initial: StageConfig | null }>({ open: false, initial: null });
  const [formTypeDialog, setFormTypeDialog] = useState<{ open: boolean; initial: FormType | null }>({ open: false, initial: null });

  const canManage = user?.role === 'ADMIN' || user?.role === 'MALL_DIRECTOR';

  const { data: stages = [], isLoading: stagesLoading } = useQuery({
    queryKey: ['fitout-stage-configs'],
    queryFn: () => fitoutApi.listStageConfigs(),
  });

  const { data: formTypes = [], isLoading: formTypesLoading } = useQuery({
    queryKey: ['fitout-form-types'],
    queryFn: () => fitoutApi.listFormTypes(),
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
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setStageDialog({ open: true, initial: s })}>
                              <Pencil size={13} />
                            </Button>
                            <Button
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
                        <TableCell>{f.approvalLevels}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setFormTypeDialog({ open: true, initial: f })}>
                              <Pencil size={13} />
                            </Button>
                            <Button
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
