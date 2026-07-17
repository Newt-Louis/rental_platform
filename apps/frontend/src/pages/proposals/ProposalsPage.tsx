import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Selecto from 'react-selecto';
import { useDragSelect, DRAG_SELECT_CLASS } from '@/hooks/useDragSelect';
import { BulkSelectionBar } from '@/components/BulkSelectionBar';
import { proposalsApi, dealScoringApi, proposalScenariosApi } from '@/api';
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
  X, Loader2, Pencil, CheckSquare, Square,
} from 'lucide-react';
import type { Proposal } from '@/types';
import { ProposalEditorDialog } from './ProposalEditor';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT:        { label: 'Draft',         color: 'bg-gray-100 text-gray-700' },
  SUBMITTED:    { label: 'Chờ duyệt',    color: 'bg-yellow-100 text-yellow-700' },
  UNDER_REVIEW: { label: 'Đang xem',     color: 'bg-blue-100 text-gray-700' },
  APPROVED:     { label: 'Đã duyệt',     color: 'bg-green-100 text-green-700' },
  REJECTED:     { label: 'Từ chối',      color: 'bg-red-100 text-red-700' },
  CONVERTED:    { label: 'Đã ký HĐ',    color: 'bg-purple-100 text-purple-700' },
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

function ProposalVersionsPanel({ proposalId }: { proposalId: string }) {
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
      <div className="text-xs font-semibold text-gray-400 flex items-center gap-1"><History size={12} /> LỊCH SỬ PHIÊN BẢN</div>
      {list.map((v) => (
        <div key={v.id} className="flex justify-between text-sm p-2 bg-gray-50 rounded-lg">
          <span>v{v.version} — {v.changeReason ?? '—'}</span>
          <span className="text-xs text-gray-500">{new Date(v.createdAt).toLocaleString('vi-VN')}</span>
        </div>
      ))}
      {list.length >= 2 && (
        <div className="border-t pt-3">
          <p className="text-xs font-medium mb-2">So sánh version</p>
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
      toast({ title: 'Đã thêm kịch bản' });
      onClose();
    },
    onError: () => toast({ title: 'Lỗi', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Thêm kịch bản tài chính</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Tên kịch bản *</label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="VD: Kịch bản A" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Diện tích (m²)</label>
              <Input type="number" value={form.area} onChange={(e) => set('area', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Thuê / m² (₫)</label>
              <Input type="number" value={form.rentPerSqm} onChange={(e) => set('rentPerSqm', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">CAM / m² (₫)</label>
              <Input type="number" value={form.camPerSqm} onChange={(e) => set('camPerSqm', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Thời hạn (tháng)</label>
              <Input type="number" value={form.term} onChange={(e) => set('term', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Đặt cọc (tháng)</label>
              <Input type="number" value={form.deposit} onChange={(e) => set('deposit', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Miễn thuê (tháng)</label>
              <Input type="number" value={form.rentFree} onChange={(e) => set('rentFree', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Chiết khấu (%)</label>
              <Input type="number" value={form.discount} onChange={(e) => set('discount', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tăng giá hàng năm (%)</label>
              <Input type="number" value={form.escalation} onChange={(e) => set('escalation', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Hủy</Button>
            <Button disabled={!form.name || mutation.isPending} onClick={() => mutation.mutate()}>Lưu</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProposalScenariosPanel({ proposalId }: { proposalId: string }) {
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
      toast({ title: 'Đã chọn kịch bản' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sid: string) => proposalScenariosApi.delete(proposalId, sid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposal-scenarios', proposalId] });
      setDeletingScenario(null);
      toast({ title: 'Đã xóa kịch bản' });
    },
  });

  if (isLoading) return <Skeleton className="h-20" />;

  return (
    <div className="space-y-3">
      <AddScenarioDialog open={showAdd} onClose={() => setShowAdd(false)} proposalId={proposalId} />
      <ConfirmDialog
        open={!!deletingScenario}
        title="Xóa kịch bản tài chính?"
        description={`Kịch bản “${deletingScenario?.name ?? ''}” sẽ bị xóa khỏi đề xuất. Các số liệu so sánh của kịch bản này sẽ không còn hiển thị.`}
        onCancel={() => setDeletingScenario(null)}
        onConfirm={() => deletingScenario && deleteMutation.mutate(deletingScenario.id)}
        loading={deleteMutation.isPending}
        confirmLabel="Xóa kịch bản"
        loadingLabel="Đang xóa..."
      />
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Kịch bản tài chính ({scenarios.length})</span>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
          <Plus size={12} /> Thêm
        </Button>
      </div>

      {scenarios.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">Chưa có kịch bản nào</div>
      ) : (
        <div className="space-y-2">
          {scenarios.map((s: any) => {
            const t = s.terms ?? {};
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
                        Chọn
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400 hover:text-red-500" onClick={() => setDeletingScenario({ id: s.id, name: s.name })} aria-label={`Xóa kịch bản ${s.name}`}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-600">
                  <div><span className="text-gray-400">DT:</span> {t.area?.toLocaleString()} m²</div>
                  <div><span className="text-gray-400">Thuê/m²:</span> {t.rentPerSqm?.toLocaleString()}</div>
                  <div><span className="text-gray-400">Thời hạn:</span> {t.term} th</div>
                  <div><span className="text-gray-400">Thuê/tháng:</span> <span className="font-medium text-gray-700">{t.monthlyRent?.toLocaleString()}</span></div>
                  <div><span className="text-gray-400">Đặt cọc:</span> {t.depositAmount?.toLocaleString()}</div>
                  <div><span className="text-gray-400">Tổng HĐ:</span> <span className="font-medium text-green-700">{t.totalValue?.toLocaleString()}</span></div>
                  {t.discount > 0 && <div><span className="text-gray-400">CK:</span> {t.discount}%</div>}
                  {t.rentFree > 0 && <div><span className="text-gray-400">MFR:</span> {t.rentFree} th</div>}
                  {t.escalation > 0 && <div><span className="text-gray-400">Tăng:</span> {t.escalation}%/năm</div>}
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
                <th className="text-left px-3 py-2 text-gray-400 font-medium w-28">Chỉ số</th>
                {scenarios.map((s: any) => (
                  <th key={s.id} className={`px-3 py-2 text-center font-medium ${s.isSelected ? 'text-gray-700' : 'text-gray-700'}`}>
                    {s.name} {s.isSelected && '★'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Diện tích (m²)', key: 'area', fmt: (v: number) => v?.toLocaleString() },
                { label: 'Thuê/m²', key: 'rentPerSqm', fmt: (v: number) => v?.toLocaleString() },
                { label: 'CAM/m²', key: 'camPerSqm', fmt: (v: number) => v?.toLocaleString() },
                { label: 'Thời hạn', key: 'term', fmt: (v: number) => `${v} th` },
                { label: 'Chiết khấu', key: 'discount', fmt: (v: number) => `${v}%` },
                { label: 'Miễn thuê', key: 'rentFree', fmt: (v: number) => `${v} th` },
                { label: 'Thuê/tháng', key: 'monthlyRent', fmt: (v: number) => v?.toLocaleString(), highlight: true },
                { label: 'Đặt cọc', key: 'depositAmount', fmt: (v: number) => v?.toLocaleString() },
                { label: 'Tổng HĐ', key: 'totalValue', fmt: (v: number) => v?.toLocaleString(), highlight: true },
                { label: 'Điểm', key: '_score', fmt: (_v: number, s: any) => s.score?.toFixed(1) },
              ].map(({ label, key, fmt: f, highlight }) => (
                <tr key={key} className={`border-t ${highlight ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-3 py-1.5 text-gray-500">{label}</td>
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
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: detail, isFetching } = useQuery({
    queryKey: ['proposal-detail', proposal?.id],
    queryFn: () => proposalsApi.getProposal(proposal!.id),
    enabled: !!proposal?.id,
  });

  const p: any = detail?.data ?? detail ?? proposal;
  const st = p ? STATUS_MAP[p.status] : null;

  const navigate = useNavigate();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showEditor, setShowEditor] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () => proposalsApi.submitProposal(p!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      toast({ title: 'Đã gửi phê duyệt' });
      onClose();
    },
    onError: () => toast({ title: 'Lỗi', variant: 'destructive' }),
  });

  const convertMutation = useMutation({
    mutationFn: () => proposalsApi.convertProposal(p!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      toast({ title: 'Đã chuyển thành hợp đồng' });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => proposalsApi.rejectProposal(p!.id, rejectReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      toast({ title: 'Đã từ chối đề xuất' });
      setShowRejectDialog(false);
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
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
          {/* Reject dialog — renders via portal, not clipped by sheet overflow */}
          <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle size={16} className="text-red-500" />Từ chối đề xuất</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-gray-600">Vui lòng nhập lý do từ chối đề xuất <strong>{p.proposalNumber}</strong>:</p>
                <textarea
                  className="w-full border rounded-md p-2 text-sm resize-none h-24"
                  placeholder="Lý do từ chối..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Hủy</Button>
                  <Button
                    variant="destructive"
                    disabled={!rejectReason.trim() || rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate()}
                  >Xác nhận từ chối</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Tabs defaultValue="detail">
            {/* Tabs header — sticky at top of scroll area */}
            <div className="px-6 pt-4 pb-0 border-b border-gray-100 sticky top-0 bg-white z-10">
              {isFetching && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                  <Loader2 size={11} className="animate-spin" /> Đang tải...
                </div>
              )}
              <TabsList className="mb-0">
                <TabsTrigger value="detail">Chi tiết</TabsTrigger>
                <TabsTrigger value="scenarios">Kịch bản</TabsTrigger>
                <TabsTrigger value="versions">Phiên bản</TabsTrigger>
              </TabsList>
            </div>

            {/* Scrollable content */}
            <div className="px-6 py-4">
              <TabsContent value="detail" className="space-y-4 mt-0">
                {/* Status */}
                <div className="flex items-center gap-2">
                  {st && <Badge className={`${st.color} border-0 px-3 py-1 text-sm font-medium`}>{st.label}</Badge>}
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => scoreMutation.mutate()}>
                    Tính deal score
                  </Button>
                </div>

                {/* Lead nguồn */}
                {p.lead && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                      <Link2 size={11} /> LEAD NGUỒN
                    </div>
                    <button
                      className="flex items-center justify-between w-full text-sm hover:text-gray-700 group"
                      onClick={() => { onClose(); navigate('/crm'); }}
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

                {/* Contract kết quả */}
                {p.contract && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                    <div className="text-xs font-semibold text-green-600 mb-1.5 flex items-center gap-1">
                      <CheckCircle size={11} /> HỢP ĐỒNG ĐÃ KÝ
                    </div>
                    <button
                      className="flex items-center justify-between w-full text-sm hover:text-green-700 group"
                      onClick={() => { onClose(); navigate('/contracts'); }}
                    >
                      <div className="font-medium text-gray-900">{p.contract.contractNumber}</div>
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <span>{p.contract.status}</span>
                        <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  </div>
                )}

                {/* Parties */}
                <SheetSection label="ĐỀ XUẤT CHO" className="bg-gray-50">
                  <SheetRow label="Khách thuê" value={p.tenant?.brandName} icon={User} />
                  <SheetRow label="Công ty" value={p.tenant?.companyName} icon={Building2} />
                  <SheetRow label="Mặt bằng" value={p.unit?.code} icon={Building2} />
                  <SheetRow label="Diện tích" value={p.area ? `${p.area.toLocaleString()} m²` : null} icon={Building2} />
                </SheetSection>

                {/* Financials */}
                <SheetSection label="TÀI CHÍNH" className="bg-gray-50">
                  <SheetRow
                    label="Tiền thuê / tháng"
                    value={<span className="text-gray-700 font-semibold">{fmtFull(p.monthlyRent)}</span>}
                    icon={DollarSign}
                  />
                  <SheetRow
                    label="Phí CAM / tháng"
                    value={p.monthlyCAM ? fmtFull(p.monthlyCAM) : null}
                    icon={DollarSign}
                  />
                  {p.marketingFee > 0 && (
                    <SheetRow label="Phí marketing" value={fmtFull(p.marketingFee)} icon={DollarSign} />
                  )}
                  {p.rentFree > 0 && (
                    <SheetRow label="Miễn tiền thuê" value={`${p.rentFree} tháng`} icon={Calendar} />
                  )}
                  {p.discount > 0 && (
                    <SheetRow label="Chiết khấu" value={`${p.discount}%`} icon={DollarSign} />
                  )}
                  <SheetRow
                    label="Tổng giá trị HĐ"
                    value={<span className="font-bold text-green-700">{fmt(p.totalContractValue)}</span>}
                    icon={DollarSign}
                  />
                </SheetSection>

                {/* Term */}
                <SheetSection label="THỜI HẠN" className="bg-gray-50">
                  <SheetRow label="Ngày bắt đầu" value={fmtDate(p.startDate)} icon={Calendar} />
                  <SheetRow label="Ngày kết thúc" value={fmtDate(p.endDate)} icon={Calendar} />
                  <SheetRow
                    label="Thời hạn"
                    value={p.term ? `${p.term} tháng` : null}
                    icon={Calendar}
                  />
                  {p.escalationPercent > 0 && (
                    <SheetRow label="Tăng giá/năm" value={`${p.escalationPercent}%`} icon={Calendar} />
                  )}
                </SheetSection>

                {/* Approval workflow */}
                {approvals.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold tracking-wider text-gray-400 mb-3">QUY TRÌNH PHÊ DUYỆT</div>
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
                              Cấp {a.level}: {a.approver?.fullName ?? '—'}
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
                            {a.status === 'APPROVED' ? 'Duyệt' : a.status === 'REJECTED' ? 'Từ chối' : 'Chờ'}
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
                  <Send size={15} /> Gửi phê duyệt
                </Button>
              )}
              {p.status === 'APPROVED' && (
                <Button
                  className="w-full gap-2 bg-green-600 hover:bg-green-700"
                  onClick={() => convertMutation.mutate()}
                  disabled={convertMutation.isPending}
                >
                  <FileText size={15} /> Chuyển thành Hợp đồng
                </Button>
              )}
              {['SUBMITTED', 'UNDER_REVIEW'].includes(p.status) && (
                <Button
                  variant="outline"
                  className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => { setRejectReason(''); setShowRejectDialog(true); }}
                >
                  <XCircle size={15} /> Từ chối đề xuất
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2 text-white bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => setShowEditor(true)}
                >
                  <PenSquare size={15} /> Chỉnh sửa Tờ Trình
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
                      toast({ title: 'Không thể xuất PDF', variant: 'destructive' });
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

const EMPTY_FILTERS = { search: '', status: '', dateFrom: '', dateTo: '' };

export default function ProposalsPage() {
  // draft = what user is typing; applied = what's sent to API
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);
  const [deletingProposal, setDeletingProposal] = useState<Proposal | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

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

  const hasApplied = !!(applied.search || applied.status || applied.dateFrom || applied.dateTo);
  const isDirty =
    draft.search !== applied.search ||
    draft.status !== applied.status ||
    draft.dateFrom !== applied.dateFrom ||
    draft.dateTo !== applied.dateTo;

  function applyFilters() { setApplied({ ...draft }); setPage(1); }
  function clearFilters() { setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setPage(1); }

  const { data, isLoading } = useQuery({
    queryKey: ['proposals', applied, page],
    queryFn: () => proposalsApi.listProposals({
      search: applied.search || undefined,
      status: applied.status || undefined,
      dateFrom: applied.dateFrom || undefined,
      dateTo: applied.dateTo || undefined,
      page,
      limit: 15,
    }),
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.submitProposal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      toast({ title: 'Proposal đã được gửi phê duyệt' });
    },
    onError: () => toast({ title: 'Lỗi', variant: 'destructive' }),
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.convertProposal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      toast({ title: 'Đã chuyển thành hợp đồng' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.deleteProposal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      toast({ title: 'Đã xóa đề xuất' });
      setDeletingProposal(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi khi xóa', variant: 'destructive' }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.allSettled(ids.map((id) => proposalsApi.deleteProposal(id))).then((results) => ({
        ok: results.filter((r) => r.status === 'fulfilled').length,
        fail: results.filter((r) => r.status === 'rejected').length,
      })),
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      if (fail > 0) {
        toast({ title: `Đã xóa ${ok} đề xuất, ${fail} không thể xóa (sai trạng thái)`, variant: 'destructive' });
      } else {
        toast({ title: `Đã xóa ${ok} đề xuất` });
      }
    },
    onError: () => toast({ title: 'Lỗi khi xóa hàng loạt', variant: 'destructive' }),
  });

  const bulkSubmitMutation = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.allSettled(ids.map((id) => proposalsApi.submitProposal(id))).then((results) => ({
        ok: results.filter((r) => r.status === 'fulfilled').length,
        fail: results.filter((r) => r.status === 'rejected').length,
      })),
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      setSelectedIds(new Set());
      if (fail > 0) {
        toast({ title: `Đã gửi ${ok} đề xuất, ${fail} không thể gửi`, variant: 'destructive' });
      } else {
        toast({ title: `Đã gửi ${ok} đề xuất để phê duyệt` });
      }
    },
    onError: () => toast({ title: 'Lỗi khi gửi hàng loạt', variant: 'destructive' }),
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
        {canBulkSubmit && (
          <Button
            size="sm"
            variant="ghost"
            className="text-white gap-1.5 shrink-0"
            disabled={bulkSubmitMutation.isPending}
            onClick={() => bulkSubmitMutation.mutate([...selectedIds].filter((id) => proposals.find((p) => p.id === id)?.status === 'DRAFT'))}
          >
            <Send size={14} /> Gửi phê duyệt
          </Button>
        )}
        {canBulkDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300 gap-1.5 shrink-0"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => setConfirmBulkDelete(true)}
          >
            <Trash2 size={14} /> Xóa
          </Button>
        )}
      </BulkSelectionBar>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proposals</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý đề xuất cho thuê</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Tìm proposal, khách thuê, mặt bằng..."
            value={draft.search}
            onChange={(e) => setDraftField('search', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            className="pl-9 h-9"
          />
        </div>
        <Select value={draft.status || 'ALL'} onValueChange={(v) => setDraftField('status', v === 'ALL' ? '' : v)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangePicker
          from={draft.dateFrom}
          to={draft.dateTo}
          onFromChange={(v) => setDraftField('dateFrom', v)}
          onToChange={(v) => setDraftField('dateTo', v)}
          placeholder="Khoảng ngày tạo"
        />
        <Button
          className="h-9 gap-1.5"
          onClick={applyFilters}
          disabled={!isDirty && hasApplied}
        >
          <Search size={14} /> Tìm kiếm
        </Button>
        {(hasApplied || isDirty) && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1 text-gray-500"
            onClick={clearFilters}
          >
            <X size={13} /> Xóa
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          {!selectedProposal && !editingProposal && <Selecto ref={selectoRef} container={gridRef.current} {...selectoProps} />}
          <div ref={gridRef} className="bg-white rounded-lg border overflow-hidden select-none">
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">Số PO</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">Khách thuê</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">Mặt bằng</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">Diện tích</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">Thuê/tháng</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">Giá trị HĐ</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs tracking-wider">Trạng thái</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {proposals.map((p) => {
                  const st = STATUS_MAP[p.status] ?? STATUS_MAP.DRAFT;
                  return (
                    <tr
                      key={p.id}
                      className={`${DRAG_SELECT_CLASS} hover:bg-gray-50 cursor-pointer transition-colors ${selectedIds.has(p.id) ? 'bg-blue-50' : ''}`}
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
                      <td className="px-4 py-3 font-mono text-xs">{p.proposalNumber}</td>
                      <td className="px-4 py-3">
                        {p.tenant?.brandName ?? p.lead?.brandName ?? p.booking?.lead?.brandName ?? p.booking?.customer?.brandName ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{p.unit?.code}</td>
                      <td className="px-4 py-3 text-right">{p.area.toLocaleString()} m²</td>
                      <td className="px-4 py-3 text-right">{fmt(p.monthlyRent)}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(p.totalContractValue)}</td>
                      <td className="px-4 py-3">
                        <Badge className={`${st.color} border-0 text-xs`}>{st.label}</Badge>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          {p.status === 'DRAFT' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                              onClick={(e) => { e.stopPropagation(); submitMutation.mutate(p.id); }}
                              disabled={submitMutation.isPending}
                            >
                              <Send size={12} /> Gửi
                            </Button>
                          )}
                          {p.status === 'APPROVED' && (
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                              onClick={(e) => { e.stopPropagation(); convertMutation.mutate(p.id); }}
                              disabled={convertMutation.isPending}
                            >
                              <FileText size={12} /> Ký HĐ
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-gray-400 hover:text-indigo-600"
                            title="Chỉnh sửa"
                            onClick={(e) => { e.stopPropagation(); setEditingProposal(p); }}
                          >
                            <Pencil size={13} />
                          </Button>
                          {['DRAFT', 'REJECTED'].includes(p.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                              title="Xóa"
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
                <p>Chưa có proposal nào</p>
              </div>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>{total} đề xuất</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => { setPage(p => p - 1); setSelectedIds(new Set()); }}>Trước</Button>
                <span className="px-2 py-1">Trang {page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(p => p + 1); setSelectedIds(new Set()); }}>Sau</Button>
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
              <AlertTriangle size={16} className="text-red-500" /> Xác nhận xóa hàng loạt
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Bạn có chắc muốn xóa <strong>{[...selectedIds].filter((id) => proposals.find((p) => p.id === id && ['DRAFT', 'REJECTED'].includes(p.status))).length}</strong> đề xuất đã chọn? Hành động này không thể hoàn tác.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmBulkDelete(false)}>Hủy</Button>
            <Button
              variant="destructive"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => {
                const ids = [...selectedIds].filter((id) => proposals.find((p) => p.id === id && ['DRAFT', 'REJECTED'].includes(p.status)));
                bulkDeleteMutation.mutate(ids);
              }}
            >
              {bulkDeleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Xóa
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deletingProposal} onOpenChange={(open) => !open && setDeletingProposal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" /> Xác nhận xóa
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Bạn có chắc muốn xóa đề xuất <strong>{deletingProposal?.proposalNumber}</strong>? Hành động này không thể hoàn tác.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeletingProposal(null)}>Hủy</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletingProposal && deleteMutation.mutate(deletingProposal.id)}
            >
              {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Xóa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
