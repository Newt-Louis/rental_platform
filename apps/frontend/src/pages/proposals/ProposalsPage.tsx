import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Selecto from 'react-selecto';
import { useDragSelect, DRAG_SELECT_CLASS } from '@/hooks/useDragSelect';
import { BulkSelectionBar } from '@/components/BulkSelectionBar';
import { proposalsApi, dealScoringApi, proposalScenariosApi, spacesApi } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { useToast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/spaces/dialogs/ConfirmDialog';
import {
  Search, FileText, Send, Building2, DollarSign, Calendar, User, CheckCircle, XCircle,
  Download, History, Plus, Star, Trash2, ArrowRight, Link2, AlertTriangle, PenSquare,
  X, Loader2, Pencil, CheckSquare, Square, SlidersHorizontal, Clock3, Sparkles,
} from 'lucide-react';
import type { Proposal } from '@/types';
import { ProposalEditorDialog } from './ProposalEditor';
import { usePermission } from '@/hooks/usePermission';
import { useMallStore } from '@/store/mall.store';

const STATUS_COLOR: Record<string, string> = {
  DRAFT:        'bg-gray-100 text-gray-700',
  SUBMITTED:    'bg-yellow-100 text-yellow-700',
  UNDER_REVIEW: 'bg-blue-100 text-gray-700',
  APPROVED:     'bg-green-100 text-green-700',
  REJECTED:     'bg-red-100 text-red-700',
  CONVERTED:    'bg-purple-100 text-purple-700',
};

function fmt(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', notation: 'compact' }).format(n);
}

function fmtFull(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function proposalAge(createdAt: string) {
  const elapsed = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Vừa tạo';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(createdAt).toLocaleDateString('vi-VN');
}

function isNewProposal(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000;
}

function ProposalVersionsPanel({ proposalId }: { proposalId: string }) {
  const { t } = useTranslation('deals');
  const [fromV, setFromV] = useState(1);
  const [toV, setToV] = useState(2);

  const { data: versions } = useQuery({
    queryKey: ['proposal-versions', proposalId],
    queryFn: () => proposalsApi.listVersions(proposalId),
  });

  const { data: diff } = useQuery({
    queryKey: ['proposal-compare', proposalId, fromV, toV],
    queryFn: () => proposalsApi.compareVersions(proposalId, fromV, toV),
    enabled: fromV > 0 && toV > 0 && fromV !== toV,
  });

  const list: any[] = versions?.data ?? versions ?? [];
  const changes: any[] = diff?.changes ?? diff?.data?.changes ?? diff ?? [];

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-gray-400 flex items-center gap-1"><History size={12} /> {t('proposals.versions.title')}</div>
      {list.map((v) => (
        <div key={v.id} className="flex justify-between text-sm p-2 bg-gray-50 rounded-lg">
          <span>v{v.version} — {v.changeReason ?? '—'}</span>
          <span className="text-xs text-gray-500">{new Date(v.createdAt).toLocaleString('vi-VN')}</span>
        </div>
      ))}
      {list.length >= 2 && (
        <div className="border-t pt-3">
          <p className="text-xs font-medium mb-2">{t('proposals.versions.compare')}</p>
          <div className="flex gap-2 mb-2">
            <Input type="number" className="h-8" value={fromV} onChange={(e) => setFromV(+e.target.value)} />
            <Input type="number" className="h-8" value={toV} onChange={(e) => setToV(+e.target.value)} />
          </div>
          {Array.isArray(changes) && changes.map((c: any, i: number) => (
            <div key={i} className="text-xs py-1 border-b">
              <span className="font-medium">{c.field}</span>: {String(c.from)} → {String(c.to)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddScenarioDialog({
  open, onClose, proposalId,
}: { open: boolean; onClose: () => void; proposalId: string }) {
  const { t } = useTranslation('deals');
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: '', description: '', area: '', rentPerSqm: '', camPerSqm: '', term: '24', deposit: '3', rentFree: '0', escalation: '0', discount: '0',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => proposalScenariosApi.create(proposalId, {
      name: form.name,
      description: form.description,
      terms: {
        area: +form.area, rentPerSqm: +form.rentPerSqm, camPerSqm: +form.camPerSqm,
        term: +form.term, deposit: +form.deposit, rentFree: +form.rentFree,
        escalation: +form.escalation, discount: +form.discount,
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposal-scenarios', proposalId] });
      toast({ title: t('proposals.scenarios.addSuccess') });
      onClose();
    },
    onError: () => toast({ title: t('proposals.bulk.errorSubmit'), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('proposals.scenarios.addTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">{t('proposals.scenarios.name')}</label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('proposals.scenarios.namePlaceholder')} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('proposals.scenarios.fields.area')}</label>
              <Input type="number" value={form.area} onChange={(e) => set('area', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('proposals.scenarios.fields.rentPerSqm')}</label>
              <Input type="number" value={form.rentPerSqm} onChange={(e) => set('rentPerSqm', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('proposals.scenarios.fields.camPerSqm')}</label>
              <Input type="number" value={form.camPerSqm} onChange={(e) => set('camPerSqm', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('proposals.scenarios.fields.term')}</label>
              <Input type="number" value={form.term} onChange={(e) => set('term', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('proposals.scenarios.fields.deposit')}</label>
              <Input type="number" value={form.deposit} onChange={(e) => set('deposit', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('proposals.scenarios.fields.rentFree')}</label>
              <Input type="number" value={form.rentFree} onChange={(e) => set('rentFree', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('proposals.scenarios.fields.discount')}</label>
              <Input type="number" value={form.discount} onChange={(e) => set('discount', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('proposals.scenarios.fields.escalation')}</label>
              <Input type="number" value={form.escalation} onChange={(e) => set('escalation', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>{t('common:actions.cancel', 'Hủy')}</Button>
            <Button disabled={!form.name || mutation.isPending} onClick={() => mutation.mutate()}>{t('common:actions.save', 'Lưu')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProposalScenariosPanel({ proposalId }: { proposalId: string }) {
  const { t } = useTranslation('deals');
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [deletingScenario, setDeletingScenario] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['proposal-scenarios', proposalId],
    queryFn: () => proposalScenariosApi.list(proposalId),
  });

  const scenarios: any[] = data?.data ?? data ?? [];

  const selectMutation = useMutation({
    mutationFn: (sid: string) => proposalScenariosApi.select(proposalId, sid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposal-scenarios', proposalId] });
      toast({ title: t('proposals.scenarios.selectSuccess') });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sid: string) => proposalScenariosApi.delete(proposalId, sid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposal-scenarios', proposalId] });
      setDeletingScenario(null);
      toast({ title: t('proposals.scenarios.deleteSuccess') });
    },
  });

  if (isLoading) return <Skeleton className="h-20" />;

  return (
    <div className="space-y-3">
      <AddScenarioDialog open={showAdd} onClose={() => setShowAdd(false)} proposalId={proposalId} />
      <ConfirmDialog
        open={!!deletingScenario}
        title={t('proposals.scenarios.deleteTitle')}
        description={t('proposals.scenarios.deleteDesc', { name: deletingScenario?.name ?? '' })}
        onCancel={() => setDeletingScenario(null)}
        onConfirm={() => deletingScenario && deleteMutation.mutate(deletingScenario.id)}
        loading={deleteMutation.isPending}
        confirmLabel={t('proposals.scenarios.deleteConfirm')}
        loadingLabel={t('common:actions.deleting', 'Đang xóa...')}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('proposals.scenarios.title')} ({scenarios.length})</span>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
          <Plus size={12} /> {t('proposals.scenarios.add')}
        </Button>
      </div>

      {scenarios.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">{t('proposals.scenarios.empty')}</div>
      ) : (
        <div className="space-y-2">
          {scenarios.map((s: any) => {
            const terms = s.terms ?? {};
            return (
              <div key={s.id} className={`rounded-xl border p-3 transition-all ${s.isSelected ? 'border-blue-400 bg-gray-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {s.isSelected && <Star size={13} className="text-gray-500 fill-blue-500" />}
                    <span className="font-semibold text-sm">{s.name}</span>
                    {s.score != null && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${s.score >= 70 ? 'bg-green-100 text-green-700' : s.score >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {s.score.toFixed(0)} pts
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {!s.isSelected && (
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => selectMutation.mutate(s.id)} disabled={selectMutation.isPending}>
                        {t('proposals.scenarios.select')}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400 hover:text-red-500" onClick={() => setDeletingScenario({ id: s.id, name: s.name })} aria-label={`${t('proposals.scenarios.deleteConfirm')} ${s.name}`}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-600">
                  <div><span className="text-gray-400">DT:</span> {terms.area?.toLocaleString()} m²</div>
                  <div><span className="text-gray-400">{t('proposals.scenarios.compare.rentPerSqm')}:</span> {terms.rentPerSqm?.toLocaleString()}</div>
                  <div><span className="text-gray-400">{t('proposals.scenarios.compare.term')}:</span> {terms.term} th</div>
                  <div><span className="text-gray-400">{t('proposals.scenarios.compare.monthlyRent')}:</span> <span className="font-medium text-gray-700">{terms.monthlyRent?.toLocaleString()}</span></div>
                  <div><span className="text-gray-400">{t('proposals.scenarios.compare.depositAmount')}:</span> {terms.depositAmount?.toLocaleString()}</div>
                  <div><span className="text-gray-400">{t('proposals.scenarios.compare.totalValue')}:</span> <span className="font-medium text-green-700">{terms.totalValue?.toLocaleString()}</span></div>
                  {terms.discount > 0 && <div><span className="text-gray-400">CK:</span> {terms.discount}%</div>}
                  {terms.rentFree > 0 && <div><span className="text-gray-400">MFR:</span> {terms.rentFree} th</div>}
                  {terms.escalation > 0 && <div><span className="text-gray-400">{t('proposals.scenarios.fields.escalation')}:</span> {terms.escalation}%/năm</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Side-by-side comparison table */}
      {scenarios.length >= 2 && (
        <div className="overflow-x-auto border rounded-xl mt-4">
          <table className="text-xs w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2 text-gray-400 font-medium w-28">{t('proposals.scenarios.compare.metric')}</th>
                {scenarios.map((s: any) => (
                  <th key={s.id} className="px-3 py-2 text-center font-medium text-gray-700">
                    {s.name} {s.isSelected && '★'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { labelKey: 'proposals.scenarios.compare.area', key: 'area', fmt: (v: number) => v?.toLocaleString() },
                { labelKey: 'proposals.scenarios.compare.rentPerSqm', key: 'rentPerSqm', fmt: (v: number) => v?.toLocaleString() },
                { labelKey: 'proposals.scenarios.compare.camPerSqm', key: 'camPerSqm', fmt: (v: number) => v?.toLocaleString() },
                { labelKey: 'proposals.scenarios.compare.term', key: 'term', fmt: (v: number) => `${v} th` },
                { labelKey: 'proposals.scenarios.compare.discount', key: 'discount', fmt: (v: number) => `${v}%` },
                { labelKey: 'proposals.scenarios.compare.rentFree', key: 'rentFree', fmt: (v: number) => `${v} th` },
                { labelKey: 'proposals.scenarios.compare.monthlyRent', key: 'monthlyRent', fmt: (v: number) => v?.toLocaleString(), highlight: true },
                { labelKey: 'proposals.scenarios.compare.depositAmount', key: 'depositAmount', fmt: (v: number) => v?.toLocaleString() },
                { labelKey: 'proposals.scenarios.compare.totalValue', key: 'totalValue', fmt: (v: number) => v?.toLocaleString(), highlight: true },
                { labelKey: 'proposals.scenarios.compare.score', key: '_score', fmt: (_v: number, s: any) => s.score?.toFixed(1) },
              ].map(({ labelKey, key, fmt: f, highlight }) => (
                <tr key={key} className={`border-t ${highlight ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-3 py-1.5 text-gray-500">{t(labelKey)}</td>
                  {scenarios.map((s: any) => (
                    <td key={s.id} className={`px-3 py-1.5 text-center ${highlight ? 'font-semibold' : ''}`}>
                      {key === '_score' ? s.score?.toFixed(1) : f?.(s.terms?.[key], s) ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProposalDetailSheet({
  proposal,
  onClose,
}: {
  proposal: Proposal | null;
  onClose: () => void;
}) {
  const { t } = useTranslation(['deals', 'common']);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: detail, isFetching } = useQuery({
    queryKey: ['proposal-detail', proposal?.id],
    queryFn: () => proposalsApi.getProposal(proposal!.id),
    enabled: !!proposal?.id,
  });

  const p: any = detail?.data ?? detail ?? proposal;
  const statusColor = p ? STATUS_COLOR[p.status] ?? STATUS_COLOR.DRAFT : null;
  const statusLabel = p ? t(`proposals.status.${p.status}`, p.status as string) : null;

  const navigate = useNavigate();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [showTenantDialog, setShowTenantDialog] = useState(false);
  const [tenantForm, setTenantForm] = useState<any>({ companyName: '', brandName: '', taxCode: '', contactName: '', contactEmail: '', contactPhone: '', address: '' });

  const submitMutation = useMutation({
    mutationFn: () => proposalsApi.submitProposal(p!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      toast({ title: t('proposals.actions.submitSuccess') });
      onClose();
    },
    onError: () => toast({ title: t('proposals.bulk.errorSubmit'), variant: 'destructive' }),
  });

  const convertMutation = useMutation({
    mutationFn: (tenant?: Record<string, unknown>) => proposalsApi.convertProposal(p!.id, tenant),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['proposal-stats'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['unit-detail'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      qc.invalidateQueries({ queryKey: ['floor-map'] });
      toast({ title: t('proposals.actions.convertSuccess') });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('proposals.bulk.errorSubmit'), variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => proposalsApi.rejectProposal(p!.id, rejectReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      toast({ title: t('proposals.actions.rejectSuccess') });
      setShowRejectDialog(false);
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('proposals.bulk.errorSubmit'), variant: 'destructive' }),
  });

  const scoreMutation = useMutation({
    mutationFn: () => dealScoringApi.scoreProposal(p!.id),
    onSuccess: (r) => toast({ title: `Deal score: ${r?.grade ?? r?.data?.grade} (${r?.totalScore ?? r?.data?.totalScore})` }),
  });

  // Approval steps from detail
  const approvals: any[] = p?.approvalWorkflow?.steps ?? p?.approvals ?? [];

  return (
    <>
      {showEditor && p && (
        <ProposalEditorDialog
          proposal={p}
          onClose={() => setShowEditor(false)}
        />
      )}
    <Sheet
      open={!!proposal}
      onClose={onClose}
      title={p?.proposalNumber ?? 'Proposal'}
      subtitle={p?.tenant?.brandName}
    >
      {p && (
        <>
          <Dialog open={showTenantDialog} onOpenChange={setShowTenantDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Tạo khách thuê và tài khoản Tenant Portal</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">Kiểm tra thông tin lấy từ Lead trước khi ký hợp đồng. Hệ thống sẽ gửi email kích hoạt tài khoản portal cho khách.</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Tên pháp nhân *<Input value={tenantForm.companyName} onChange={(e) => setTenantForm({ ...tenantForm, companyName: e.target.value })} /></label>
                <label className="text-sm">Tên thương hiệu *<Input value={tenantForm.brandName} onChange={(e) => setTenantForm({ ...tenantForm, brandName: e.target.value })} /></label>
                <label className="text-sm">Mã số thuế<Input value={tenantForm.taxCode} onChange={(e) => setTenantForm({ ...tenantForm, taxCode: e.target.value })} /></label>
                <label className="text-sm">Người liên hệ *<Input value={tenantForm.contactName} onChange={(e) => setTenantForm({ ...tenantForm, contactName: e.target.value })} /></label>
                <label className="text-sm">Email đăng nhập portal *<Input type="email" value={tenantForm.contactEmail} onChange={(e) => setTenantForm({ ...tenantForm, contactEmail: e.target.value })} /></label>
                <label className="text-sm">Điện thoại<Input value={tenantForm.contactPhone} onChange={(e) => setTenantForm({ ...tenantForm, contactPhone: e.target.value })} /></label>
                <label className="col-span-2 text-sm">Địa chỉ<Input value={tenantForm.address} onChange={(e) => setTenantForm({ ...tenantForm, address: e.target.value })} /></label>
              </div>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowTenantDialog(false)}>Hủy</Button><Button disabled={convertMutation.isPending || !tenantForm.companyName.trim() || !tenantForm.brandName.trim() || !tenantForm.contactName.trim() || !tenantForm.contactEmail.trim()} onClick={() => convertMutation.mutate(tenantForm)}>Tạo khách thuê và ký hợp đồng</Button></div>
            </DialogContent>
          </Dialog>
          {/* Reject dialog — renders via portal, not clipped by sheet overflow */}
          <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle size={16} className="text-red-500" />{t('proposals.actions.rejectTitle')}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-gray-600">{t('proposals.actions.rejectReason')} <strong>{p.proposalNumber}</strong>:</p>
                <textarea
                  className="w-full border rounded-md p-2 text-sm resize-none h-24"
                  placeholder={t('approvals.rejectDialog.placeholder')}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowRejectDialog(false)}>{t('common:actions.cancel')}</Button>
                  <Button
                    variant="destructive"
                    disabled={!rejectReason.trim() || rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate()}
                  >{t('proposals.actions.rejectConfirm')}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Tabs defaultValue="detail">
            {/* Tabs header — sticky at top of scroll area */}
            <div className="px-6 pt-4 pb-0 border-b border-gray-100 sticky top-0 bg-white z-10">
              {isFetching && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                  <Loader2 size={11} className="animate-spin" /> {t('common:actions.loading')}
                </div>
              )}
              <TabsList className="mb-0">
                <TabsTrigger value="detail">{t('proposals.tabs.detail')}</TabsTrigger>
                <TabsTrigger value="scenarios">{t('proposals.tabs.scenarios')}</TabsTrigger>
                <TabsTrigger value="versions">{t('proposals.tabs.versions')}</TabsTrigger>
              </TabsList>
            </div>

            {/* Scrollable content */}
            <div className="px-6 py-4">
              <TabsContent value="detail" className="space-y-4 mt-0">
                {/* Status */}
                <div className="flex items-center gap-2">
                  {statusColor && <Badge className={`${statusColor} border-0 px-3 py-1 text-sm font-medium`}>{statusLabel}</Badge>}
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => scoreMutation.mutate()}>
                    {t('proposals.actions.score')}
                  </Button>
                </div>

                {/* Lead source */}
                {p.lead && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                      <Link2 size={11} /> {t('proposals.sections.leadSource')}
                    </div>
                    <button
                      className="flex items-center justify-between w-full text-sm hover:text-gray-700 group"
                      onClick={() => { onClose(); navigate(`/crm?leadId=${p.lead.id}`); }}
                    >
                      <div>
                        <div className="font-medium text-gray-900">{p.lead.brandName}</div>
                        <div className="text-xs text-gray-500">{p.lead.contactName}</div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <span>{p.lead.status}</span>
                        <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  </div>
                )}

                {/* Contract result — màu phản ánh đúng trạng thái thật của hợp đồng, không mặc định
                    xanh lá (đã xong) ngay cả khi hợp đồng vẫn còn ở DRAFT/chưa ký. */}
                {p.contract && (() => {
                  const inForce = ['ACTIVE', 'EXPIRING'].includes(p.contract.status);
                  const ended = ['EXPIRED', 'TERMINATED'].includes(p.contract.status);
                  const tone = inForce
                    ? { border: 'border-green-200', bg: 'bg-green-50', text: 'text-green-600', hover: 'hover:text-green-700' }
                    : ended
                    ? { border: 'border-gray-200', bg: 'bg-gray-50', text: 'text-gray-500', hover: 'hover:text-gray-700' }
                    : { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-600', hover: 'hover:text-amber-700' };
                  return (
                    <div className={`rounded-xl border ${tone.border} ${tone.bg} p-3`}>
                      <div className={`text-xs font-semibold ${tone.text} mb-1.5 flex items-center gap-1`}>
                        <CheckCircle size={11} /> {t('proposals.sections.contractResult')}
                      </div>
                      <button
                        className={`flex items-center justify-between w-full text-sm ${tone.hover} group`}
                        onClick={() => { onClose(); navigate(`/contracts?id=${p.contract.id}`); }}
                      >
                        <div className="font-medium text-gray-900">{p.contract.contractNumber}</div>
                        <div className={`flex items-center gap-1 text-xs ${tone.text}`}>
                          <span>{t(`contracts.status.${p.contract.status}`, p.contract.status as string)}</span>
                          <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </button>
                    </div>
                  );
                })()}

                {/* Parties */}
                <SheetSection label={t('proposals.sections.proposedFor')} className="bg-gray-50">
                  <SheetRow label={t('proposals.fields.tenant')} value={p.tenant?.brandName} icon={User} />
                  <SheetRow label={t('common:labels.name')} value={p.tenant?.companyName} icon={Building2} />
                  <SheetRow label={t('proposals.fields.unit')} value={p.unit?.code} icon={Building2} />
                  <SheetRow label={t('common:labels.area')} value={p.area ? `${p.area.toLocaleString()} m²` : null} icon={Building2} />
                </SheetSection>

                {/* Financials */}
                <SheetSection label={t('proposals.sections.financials')} className="bg-gray-50">
                  <SheetRow
                    label={t('proposals.fields.proposedRent')}
                    value={<span className="text-gray-700 font-semibold">{fmtFull(p.monthlyRent)}</span>}
                    icon={DollarSign}
                  />
                  <SheetRow
                    label={t('contracts.fields.camFee')}
                    value={p.monthlyCAM ? fmtFull(p.monthlyCAM) : null}
                    icon={DollarSign}
                  />
                  {p.marketingFee > 0 && (
                    <SheetRow label={t('proposals.fields.marketingFee')} value={fmtFull(p.marketingFee)} icon={DollarSign} />
                  )}
                  {p.rentFree > 0 && (
                    <SheetRow label={t('proposals.fields.freeRentMonths')} value={`${p.rentFree} tháng`} icon={Calendar} />
                  )}
                  {p.discount > 0 && (
                    <SheetRow label={t('common:labels.deposit')} value={`${p.discount}%`} icon={DollarSign} />
                  )}
                  <SheetRow
                    label={t('contracts.fields.rentAmount')}
                    value={<span className="font-bold text-green-700">{fmt(p.totalContractValue)}</span>}
                    icon={DollarSign}
                  />
                </SheetSection>

                {/* Term */}
                <SheetSection label={t('proposals.sections.term')} className="bg-gray-50">
                  <SheetRow label={t('proposals.fields.startDate')} value={fmtDate(p.startDate)} icon={Calendar} />
                  <SheetRow label={t('proposals.fields.endDate')} value={fmtDate(p.endDate)} icon={Calendar} />
                  <SheetRow
                    label={t('common:labels.duration')}
                    value={p.term ? `${p.term} tháng` : null}
                    icon={Calendar}
                  />
                  {p.escalationPercent > 0 && (
                    <SheetRow label={t('proposals.scenarios.fields.escalation')} value={`${p.escalationPercent}%`} icon={Calendar} />
                  )}
                </SheetSection>

                {/* Approval workflow */}
                {approvals.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-semibold tracking-wider text-gray-400">{t('proposals.sections.approvalWorkflow')}</div>
                      {p.approvalWorkflow?.id && (
                        <button
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          onClick={() => { onClose(); navigate(`/approvals?workflowId=${p.approvalWorkflow.id}`); }}
                        >
                          {t('proposals.sections.viewApprovalWorkflow')} <ArrowRight size={11} />
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {approvals.map((a: any) => (
                        <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                          {a.status === 'APPROVED' ? (
                            <CheckCircle size={16} className="text-green-500 shrink-0" />
                          ) : a.status === 'REJECTED' ? (
                            <XCircle size={16} className="text-red-500 shrink-0" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">
                              {t('proposals.approval.level', { level: a.level })}: {a.approver?.fullName ?? '—'}
                            </div>
                            {a.comment && (
                              <div className="text-xs text-gray-500 mt-0.5 truncate">{a.comment}</div>
                            )}
                          </div>
                          <Badge className={`text-xs border-0 shrink-0 ${
                            a.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                            a.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {a.status === 'APPROVED' ? t('proposals.approval.statusApproved') : a.status === 'REJECTED' ? t('proposals.approval.statusRejected') : t('proposals.approval.statusPending')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="scenarios" className="mt-0">
                <ProposalScenariosPanel proposalId={p.id} />
              </TabsContent>
              <TabsContent value="versions" className="mt-0">
                <ProposalVersionsPanel proposalId={p.id} />
              </TabsContent>
            </div>

            {/* Action footer — sticky at bottom of scroll area */}
            <div className="px-6 py-4 border-t border-gray-100 bg-white sticky bottom-0 space-y-2">
              {p.status === 'DRAFT' && (
                <Button
                  className="w-full gap-2"
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending}
                >
                  <Send size={15} /> {t('proposals.actions.submit')}
                </Button>
              )}
              {p.status === 'APPROVED' && (
                <Button
                  className="w-full gap-2 bg-green-600 hover:bg-green-700"
                  onClick={() => { if (p.tenantId) convertMutation.mutate(undefined); else { setTenantForm({ companyName: p.lead?.company || p.lead?.brandName || '', brandName: p.lead?.brandName || '', taxCode: '', contactName: p.lead?.contactName || '', contactEmail: p.lead?.email || '', contactPhone: p.lead?.phone || '', address: '' }); setShowTenantDialog(true); } }}
                  disabled={convertMutation.isPending}
                >
                  <FileText size={15} /> {t('proposals.actions.convert')}
                </Button>
              )}
              {['SUBMITTED', 'UNDER_REVIEW'].includes(p.status) && (
                <Button
                  variant="outline"
                  className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => { setRejectReason(''); setShowRejectDialog(true); }}
                >
                  <XCircle size={15} /> {t('proposals.actions.reject')}
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2 text-white bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => setShowEditor(true)}
                >
                  <PenSquare size={15} /> {t('proposals.actions.editDoc')}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={async () => {
                    try {
                      const blob = await proposalsApi.exportPdf(p.id);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `proposal-${p.proposalNumber}.pdf`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      toast({ title: t('proposals.exportPdfError'), variant: 'destructive' });
                    }
                  }}
                >
                  <Download size={15} />
                </Button>
              </div>
            </div>
          </Tabs>
        </>
      )}
    </Sheet>
    </>
  );
}

const EMPTY_FILTERS = { search: '', status: '', floorId: '', unitId: '', dateFrom: '', dateTo: '' };

export default function ProposalsPage() {
  const { t } = useTranslation('deals');
  const [searchParams] = useSearchParams();
  // draft = what user is typing; applied = what's sent to API
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setSelectedProposal({ id } as Proposal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);
  const [deletingProposal, setDeletingProposal] = useState<Proposal | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { role } = usePermission();
  const { selectedMallId } = useMallStore();
  const canEdit = !!role && ['ADMIN', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR'].includes(role);
  const canConvert = !!role && ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR'].includes(role);

  const { data: floorsResponse } = useQuery({
    queryKey: ['proposal-filter-floors', selectedMallId],
    queryFn: () => spacesApi.listFloors(selectedMallId || undefined),
  });
  const floors: any[] = floorsResponse?.data ?? floorsResponse ?? [];
  const { data: unitsResponse } = useQuery({
    queryKey: ['proposal-filter-units', selectedMallId, draft.floorId],
    queryFn: () => spacesApi.listUnits({
      mallId: selectedMallId || undefined,
      floorId: draft.floorId || undefined,
      page: 1,
      limit: 500,
    }),
  });
  const units: any[] = unitsResponse?.data ?? unitsResponse ?? [];

  useEffect(() => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
    setSelectedProposal(null);
  }, [selectedMallId]);

  const STATUS_MAP: Record<string, { label: string; color: string }> = {
    DRAFT:        { label: t('proposals.status.DRAFT'),        color: 'bg-gray-100 text-gray-700' },
    SUBMITTED:    { label: t('proposals.status.SUBMITTED'),    color: 'bg-yellow-100 text-yellow-700' },
    UNDER_REVIEW: { label: t('proposals.status.UNDER_REVIEW'), color: 'bg-blue-100 text-gray-700' },
    APPROVED:     { label: t('proposals.status.APPROVED'),     color: 'bg-green-100 text-green-700' },
    REJECTED:     { label: t('proposals.status.REJECTED'),     color: 'bg-red-100 text-red-700' },
    CONVERTED:    { label: t('proposals.status.CONVERTED'),    color: 'bg-purple-100 text-purple-700' },
  };

  // ── Bulk selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const { gridRef, selectoRef, selectoProps } = useDragSelect({
    onSelect: (ids) => setSelectedIds(new Set(ids)),
    onClear: () => setSelectedIds(new Set()),
    idAttribute: 'data-proposal-id',
    selectFromInside: true,
  });

  const setDraftField = (k: keyof typeof draft, v: string) =>
    setDraft((f) => ({ ...f, [k]: v }));

  const hasApplied = Object.values(applied).some(Boolean);
  const isDirty = Object.keys(draft).some((key) => draft[key as keyof typeof draft] !== applied[key as keyof typeof applied]);
  const appliedFilterCount = [applied.status, applied.floorId, applied.unitId, applied.dateFrom || applied.dateTo].filter(Boolean).length;

  function applyFilters() { setApplied({ ...draft }); setPage(1); }
  function clearFilters() { setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setPage(1); }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['proposals', applied, page, selectedMallId],
    queryFn: () => proposalsApi.listProposals({
      search: applied.search || undefined,
      status: applied.status || undefined,
      floorId: applied.floorId || undefined,
      unitId: applied.unitId || undefined,
      dateFrom: applied.dateFrom || undefined,
      dateTo: applied.dateTo || undefined,
      mallId: selectedMallId || undefined,
      page,
      limit: 15,
    }),
  });

  const { data: statsResponse, isError: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['proposal-stats', selectedMallId],
    queryFn: () => proposalsApi.getStats(selectedMallId || undefined),
  });
  const stats = statsResponse?.data ?? statsResponse ?? {};

  const submitMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.submitProposal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['proposal-stats'] });
      toast({ title: t('proposals.actions.submitSuccess') });
    },
    onError: () => toast({ title: t('proposals.bulk.errorSubmit'), variant: 'destructive' }),
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.convertProposal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['proposal-stats'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['unit-detail'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      qc.invalidateQueries({ queryKey: ['floor-map'] });
      toast({ title: t('proposals.actions.convertSuccess') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('proposals.bulk.errorSubmit'), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.deleteProposal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['proposal-stats'] });
      toast({ title: t('proposals.deleteSuccess') });
      setDeletingProposal(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('proposals.bulk.errorDelete'), variant: 'destructive' }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.allSettled(ids.map((id) => proposalsApi.deleteProposal(id))).then((results) => ({
        ok: results.filter((r) => r.status === 'fulfilled').length,
        fail: results.filter((r) => r.status === 'rejected').length,
      })),
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['proposal-stats'] });
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      if (fail > 0) {
        toast({ title: t('proposals.bulk.deletePartial', { ok, fail }), variant: 'destructive' });
      } else {
        toast({ title: t('proposals.bulk.deleteSuccess', { ok }) });
      }
    },
    onError: () => toast({ title: t('proposals.bulk.errorDelete'), variant: 'destructive' }),
  });

  const bulkSubmitMutation = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.allSettled(ids.map((id) => proposalsApi.submitProposal(id))).then((results) => ({
        ok: results.filter((r) => r.status === 'fulfilled').length,
        fail: results.filter((r) => r.status === 'rejected').length,
      })),
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['proposal-stats'] });
      setSelectedIds(new Set());
      if (fail > 0) {
        toast({ title: t('proposals.bulk.submitPartial', { ok, fail }), variant: 'destructive' });
      } else {
        toast({ title: t('proposals.bulk.submitSuccess', { ok }) });
      }
    },
    onError: () => toast({ title: t('proposals.bulk.errorSubmit'), variant: 'destructive' }),
  });

  const proposals: Proposal[] = data?.data ?? [];
  const totalPages: number = data?.totalPages ?? 1;
  const total: number = data?.total ?? 0;

  const selectedList = proposals.filter((p) => selectedIds.has(p.id));
  const canBulkSubmit = selectedList.some((p) => p.status === 'DRAFT');
  const canBulkDelete = selectedList.some((p) => ['DRAFT', 'REJECTED'].includes(p.status));

  return (
    <div>
      {/* Bulk Selection Bar */}
      <BulkSelectionBar
        selectedCount={selectedIds.size}
        totalCount={proposals.length}
        onSelectAll={() => setSelectedIds(new Set(proposals.map((p) => p.id)))}
        onClear={() => setSelectedIds(new Set())}
      >
        {canEdit && canBulkSubmit && (
          <Button
            size="sm"
            variant="ghost"
            className="text-white gap-1.5 shrink-0"
            disabled={bulkSubmitMutation.isPending}
            onClick={() => bulkSubmitMutation.mutate([...selectedIds].filter((id) => proposals.find((p) => p.id === id)?.status === 'DRAFT'))}
          >
            <Send size={14} /> {t('proposals.actions.submit')}
          </Button>
        )}
        {canEdit && canBulkDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300 gap-1.5 shrink-0"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => setConfirmBulkDelete(true)}
          >
            <Trash2 size={14} /> {t('proposals.actions.delete')}
          </Button>
        )}
      </BulkSelectionBar>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('proposals.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('proposals.manage')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {[
          { key: '', label: t('proposals.stats.total'), value: stats.total ?? 0, color: 'text-gray-900' },
          { key: 'DRAFT', label: t('proposals.stats.draft'), value: stats.DRAFT ?? 0, color: 'text-gray-700' },
          { key: 'SUBMITTED', label: t('proposals.stats.pending'), value: (stats.SUBMITTED ?? 0) + (stats.UNDER_REVIEW ?? 0), color: 'text-amber-600' },
          { key: 'APPROVED', label: t('proposals.stats.approved'), value: stats.APPROVED ?? 0, color: 'text-green-600' },
          { key: 'CONVERTED', label: t('proposals.stats.converted'), value: stats.CONVERTED ?? 0, color: 'text-purple-600' },
        ].map((item) => (
          <Card key={item.label} className="cursor-pointer hover:border-blue-300 transition-colors" onClick={() => { const next = { ...draft, status: item.key }; setDraft(next); setApplied(next); setPage(1); }}>
            <CardContent className="p-4"><p className="text-xs text-gray-500">{item.label}</p><p className={`text-2xl font-semibold mt-1 ${item.color}`}>{item.value}</p></CardContent>
          </Card>
        ))}
      </div>
      {statsError && <button className="text-sm text-amber-700 mb-3" onClick={() => refetchStats()}>{t('proposals.errorLoad')} {t('common:actions.refresh')}</button>}

      {/* Search and filters */}
      <Card className="mb-4 border-gray-200 shadow-sm">
      <CardContent className="p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <SlidersHorizontal size={16} className="text-blue-600" /> Tìm kiếm và bộ lọc
          {appliedFilterCount > 0 && <Badge className="bg-blue-100 text-blue-700 border-0">{appliedFilterCount} bộ lọc</Badge>}
        </div>
        <span className="text-xs text-gray-500">{total} đề xuất</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={t('proposals.filters.search')}
            value={draft.search}
            onChange={(e) => setDraftField('search', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            className="pl-9 h-9"
          />
        </div>
        <Select value={draft.status || 'ALL'} onValueChange={(v) => setDraftField('status', v === 'ALL' ? '' : v)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder={t('proposals.filters.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('proposals.filters.all')}</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={draft.floorId || 'ALL'}
          onValueChange={(v) => setDraft((f) => ({ ...f, floorId: v === 'ALL' ? '' : v, unitId: '' }))}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Tầng" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả tầng</SelectItem>
            {floors.map((floor) => <SelectItem key={floor.id} value={floor.id}>{floor.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={draft.unitId || 'ALL'} onValueChange={(v) => setDraftField('unitId', v === 'ALL' ? '' : v)}>
          <SelectTrigger className="h-9 w-52">
            <SelectValue placeholder="Mặt bằng" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả mặt bằng</SelectItem>
            {units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.code}{unit.name ? ` — ${unit.name}` : ''}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateRangePicker
          from={draft.dateFrom}
          to={draft.dateTo}
          onFromChange={(v) => setDraftField('dateFrom', v)}
          onToChange={(v) => setDraftField('dateTo', v)}
          placeholder={t('proposals.filters.dateRange')}
        />
        <Button
          className="h-9 gap-1.5"
          onClick={applyFilters}
          disabled={!isDirty && hasApplied}
        >
          <Search size={14} /> {t('common:actions.search')}
        </Button>
        {(hasApplied || isDirty) && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1 text-gray-500"
            onClick={clearFilters}
          >
            <X size={13} /> {t('common:actions.reset')}
          </Button>
        )}
      </div>
      </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16" /></CardContent></Card>
          ))}
        </div>
      ) : isError ? (
        <Card><CardContent className="py-12 text-center"><AlertTriangle className="mx-auto text-amber-500 mb-2"/><p className="text-gray-600 mb-3">{t('proposals.errorLoad')}</p><Button variant="outline" onClick={() => refetch()}>{t('common:actions.refresh')}</Button></CardContent></Card>
      ) : (
        <>
          {!selectedProposal && !editingProposal && <Selecto ref={selectoRef} container={gridRef.current} {...selectoProps} />}
          <div ref={gridRef} className="bg-white rounded-lg border overflow-x-auto select-none">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <div
                      className="cursor-pointer"
                      onClick={() => {
                        if (selectedIds.size === proposals.length) {
                          setSelectedIds(new Set());
                        } else {
                          setSelectedIds(new Set(proposals.map((p) => p.id)));
                        }
                      }}
                    >
                      {selectedIds.size === proposals.length && proposals.length > 0
                        ? <CheckSquare size={15} className="text-blue-600" />
                        : <Square size={15} className="text-gray-300" />}
                    </div>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">{t('proposals.table.proposalNo')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">Thời gian tạo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">{t('proposals.table.tenant')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">{t('proposals.table.unit')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">{t('proposals.table.area')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">{t('proposals.table.monthlyRent')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">{t('proposals.table.contractValue')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">{t('proposals.table.status')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {proposals.map((p) => {
                  const st = STATUS_MAP[p.status] ?? STATUS_MAP.DRAFT;
                  const isNew = isNewProposal(p.createdAt);
                  return (
                    <tr
                      key={p.id}
                      className={`${DRAG_SELECT_CLASS} hover:bg-gray-50 cursor-pointer transition-colors ${selectedIds.has(p.id) ? 'bg-blue-50' : isNew ? 'bg-sky-50/40' : ''}`}
                      data-proposal-id={p.id}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('[data-checkbox]')) return;
                        setSelectedProposal(p);
                      }}
                    >
                      <td className="px-3 py-3 w-8" data-checkbox>
                        <div
                          data-checkbox
                          className="cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setSelectedIds((prev) => { const next = new Set(prev); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; }); }}
                        >
                          {selectedIds.has(p.id)
                            ? <CheckSquare size={15} className="text-blue-600" />
                            : <Square size={15} className="text-gray-300" />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-gray-900">{p.proposalNumber}</span>
                          {isNew && <Badge className="gap-1 border-0 bg-blue-600 text-white text-[10px] px-1.5 py-0"><Sparkles size={10} /> Mới</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className={`flex items-center gap-1.5 text-xs ${isNew ? 'font-medium text-blue-700' : 'text-gray-600'}`}>
                          <Clock3 size={13} /> {proposalAge(p.createdAt)}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {new Date(p.createdAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {p.tenant?.brandName ?? p.lead?.brandName ?? p.booking?.lead?.brandName ?? p.booking?.customer?.brandName ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{p.unit?.code}</div>
                        <div className="text-xs text-gray-400">{p.unit?.floor?.name ?? 'Chưa xác định tầng'}</div>
                      </td>
                      <td className="px-4 py-3 text-right">{p.area.toLocaleString()} m²</td>
                      <td className="px-4 py-3 text-right">{fmt(p.monthlyRent)}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(p.totalContractValue)}</td>
                      <td className="px-4 py-3">
                        <Badge className={`${st.color} border-0 text-xs`}>{st.label}</Badge>
                        {p.status === 'CONVERTED' && p.contract && (
                          <div className="mt-1 text-[11px] text-gray-400">
                            {t(`contracts.status.${p.contract.status}`, p.contract.status as string)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          {canEdit && p.status === 'DRAFT' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                              onClick={(e) => { e.stopPropagation(); submitMutation.mutate(p.id); }}
                              disabled={submitMutation.isPending}
                            >
                              <Send size={12} /> {t('proposals.actions.send')}
                            </Button>
                          )}
                          {canConvert && p.status === 'APPROVED' && (
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                              onClick={(e) => { e.stopPropagation(); convertMutation.mutate(p.id); }}
                              disabled={convertMutation.isPending}
                            >
                              <FileText size={12} /> {t('proposals.actions.convert')}
                            </Button>
                          )}
                          {canEdit && p.status === 'DRAFT' && <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-gray-400 hover:text-indigo-600"
                            title={t('proposals.edit')}
                            onClick={(e) => { e.stopPropagation(); setEditingProposal(p); }}
                          >
                            <Pencil size={13} />
                          </Button>}
                          {canEdit && ['DRAFT', 'REJECTED'].includes(p.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                              title={t('proposals.actions.delete')}
                              onClick={(e) => { e.stopPropagation(); setDeletingProposal(p); }}
                            >
                              <Trash2 size={13} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {proposals.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <FileText size={40} className="mx-auto mb-2 opacity-20" />
                <p>{t('proposals.noneYet')}</p>
              </div>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>{t('proposals.count', { count: total })}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => { setPage(p => p - 1); setSelectedIds(new Set()); }}>{t('proposals.prev')}</Button>
                <span className="px-2 py-1">{t('proposals.page', { current: page, total: totalPages })}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(p => p + 1); setSelectedIds(new Set()); }}>{t('proposals.next')}</Button>
              </div>
            </div>
          )}
        </>
      )}

      <ProposalDetailSheet
        proposal={selectedProposal}
        onClose={() => setSelectedProposal(null)}
      />

      {editingProposal && (
        <ProposalEditorDialog
          proposal={editingProposal}
          onClose={() => setEditingProposal(null)}
        />
      )}

      {/* Bulk delete confirm dialog */}
      <Dialog open={confirmBulkDelete} onOpenChange={(open) => !open && setConfirmBulkDelete(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" /> {t('proposals.bulk.deleteTitle')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {t('proposals.bulk.deleteDesc', { count: [...selectedIds].filter((id) => proposals.find((p) => p.id === id && ['DRAFT', 'REJECTED'].includes(p.status))).length })}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmBulkDelete(false)}>{t('common:actions.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => {
                const ids = [...selectedIds].filter((id) => proposals.find((p) => p.id === id && ['DRAFT', 'REJECTED'].includes(p.status)));
                bulkDeleteMutation.mutate(ids);
              }}
            >
              {bulkDeleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t('proposals.actions.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deletingProposal} onOpenChange={(open) => !open && setDeletingProposal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" /> {t('proposals.deleteTitle')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {t('proposals.deleteDesc', { number: deletingProposal?.proposalNumber ?? '' })}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeletingProposal(null)}>{t('common:actions.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletingProposal && deleteMutation.mutate(deletingProposal.id)}
            >
              {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t('proposals.actions.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
