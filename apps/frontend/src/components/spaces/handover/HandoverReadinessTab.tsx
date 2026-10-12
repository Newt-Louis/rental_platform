import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CalendarClock, Camera, CheckCircle2, Eye, EyeOff, History, RotateCcw, ShieldAlert, Trash2, UserPlus, X,
} from 'lucide-react';
import {
  apiErrorMessage, businessDaysBetween, fmtBusinessDate, handoverReadinessApi,
  type HandoverDetail, type HandoverRiskSeverity, type UnitHandoverState,
} from '@/api/handover-readiness';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ReasonActionDialog } from '@/components/ui/reason-action-dialog';
import { AuthenticatedImage } from '@/components/ui/authenticated-image';
import { useToast } from '@/components/ui/use-toast';
import { useAuthStore } from '@/store/auth.store';
import {
  EVENT_LABEL, HandoverStatusBadge, handoverDaysLabel, RISK_FLAG_LABEL, RISK_SEVERITY_META,
} from './handoverPresentation';

const MIN_REASON = 5;
const SELECT_CLASS = 'h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm';

function Section({ title, icon: Icon, children, action }: { title: string; icon?: React.ComponentType<any>; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-gray-500">
          {Icon && <Icon size={13} />} {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value}</span>
    </div>
  );
}

/** A mutation whose success response is the authoritative detail (no optimistic state). */
function useDetailMutation<T>(
  apply: (detail: HandoverDetail) => void,
  fn: (arg: T) => Promise<HandoverDetail>,
  success: string,
  after?: () => void,
) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => { apply(detail); toast({ title: success }); after?.(); },
    onError: (e: any) => toast({ title: 'Không thực hiện được', description: apiErrorMessage(e), variant: 'destructive' }),
  });
}

export function HandoverReadinessTab({ unitId }: { unitId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const viewerId = useAuthStore((s) => s.user?.id);
  const queryKey = ['unit-handover', unitId];
  const { data, isLoading, isError, error } = useQuery<UnitHandoverState>({
    queryKey,
    queryFn: () => handoverReadinessApi.getForUnit(unitId),
  });
  const { data: candidates = [] } = useQuery({
    queryKey: ['unit-handover-candidates', unitId],
    queryFn: () => handoverReadinessApi.candidates(unitId),
    enabled: !!data?.capabilities.view,
    staleTime: 60_000,
  });

  /** Only server-confirmed state reaches the cache -- never an optimistic CONFIRMED. */
  const applyDetail = (detail: HandoverDetail) => {
    qc.setQueryData<UnitHandoverState>(queryKey, (old) => old ? {
      ...old,
      readiness: detail.lifecycleStatus === 'CANCELLED' ? null : detail,
      canStart: detail.lifecycleStatus === 'CANCELLED' ? old.capabilities.manage : false,
    } : old);
    qc.invalidateQueries({ queryKey: ['handover-list'] });
    if (detail.lifecycleStatus === 'CANCELLED') qc.invalidateQueries({ queryKey });
  };

  // Start form
  const [tick, setTick] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [startNote, setStartNote] = useState('');
  // Dialogs
  const [dateOpen, setDateOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [dateReason, setDateReason] = useState('');
  const [riskOpen, setRiskOpen] = useState(false);
  const [risk, setRisk] = useState<{ title: string; description: string; severity: HandoverRiskSeverity; ownerId: string; dueDate: string }>(
    { title: '', description: '', severity: 'MEDIUM', ownerId: '', dueDate: '' },
  );
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmNote, setConfirmNote] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [followerId, setFollowerId] = useState('');
  const [uploading, setUploading] = useState(false);

  const r = data?.readiness ?? null;
  const caps = data?.capabilities;

  const startMutation = useMutation({
    mutationFn: () => handoverReadinessApi.start(unitId, {
      targetReadyDate: startDate,
      projectOwnerId: ownerId || undefined,
      projectOwnerName: ownerId ? undefined : ownerName.trim() || undefined,
      note: startNote.trim() || undefined,
    }),
    onSuccess: (detail) => {
      applyDetail(detail);
      setTick(false); setStartDate(''); setOwnerId(''); setOwnerName(''); setStartNote('');
      toast({ title: 'Đã bắt đầu theo dõi bàn giao mặt bằng' });
    },
    onError: (e: any) => toast({ title: 'Không bắt đầu được', description: apiErrorMessage(e), variant: 'destructive' }),
  });
  const dateMutation = useDetailMutation(applyDetail, 
    () => handoverReadinessApi.changeTargetDate(r!.id, { targetReadyDate: newDate, reason: dateReason.trim(), expectedVersion: r!.version }),
    'Đã cập nhật ngày dự kiến bàn giao',
    () => { setDateOpen(false); setNewDate(''); setDateReason(''); },
  );
  const riskMutation = useDetailMutation(applyDetail, 
    () => handoverReadinessApi.addRisk(r!.id, {
      title: risk.title.trim(), description: risk.description.trim() || undefined, severity: risk.severity,
      ownerId: risk.ownerId || undefined, dueDate: risk.dueDate || undefined,
    }),
    'Đã ghi nhận rủi ro',
    () => { setRiskOpen(false); setRisk({ title: '', description: '', severity: 'MEDIUM', ownerId: '', dueDate: '' }); },
  );
  const resolveMutation = useDetailMutation(applyDetail, (note: string) => handoverReadinessApi.resolveRisk(r!.id, resolveId!, note), 'Đã xử lý rủi ro', () => setResolveId(null));
  const followMutation = useDetailMutation(applyDetail, (userId?: string) => handoverReadinessApi.follow(r!.id, userId), 'Đã thêm người theo dõi', () => setFollowerId(''));
  const unfollowMutation = useDetailMutation(applyDetail, (userId: string) => handoverReadinessApi.unfollow(r!.id, userId), 'Đã bỏ theo dõi');
  const removeEvidenceMutation = useDetailMutation(applyDetail, (evidenceId: string) => handoverReadinessApi.removeEvidence(r!.id, evidenceId), 'Đã xóa ảnh');
  const confirmMutation = useDetailMutation(applyDetail, () => handoverReadinessApi.confirm(r!.id, confirmNote.trim()), 'Đã xác nhận mặt bằng đủ điều kiện bàn giao', () => { setConfirmOpen(false); setConfirmNote(''); });
  const reopenMutation = useDetailMutation(applyDetail, (reason: string) => handoverReadinessApi.reopen(r!.id, reason), 'Đã mở lại theo dõi', () => setReopenOpen(false));
  const cancelMutation = useDetailMutation(applyDetail, (reason: string) => handoverReadinessApi.cancel(r!.id, reason), 'Đã hủy theo dõi', () => setCancelOpen(false));

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || !r) return;
    setUploading(true);
    try {
      let latest: HandoverDetail | null = null;
      for (const file of Array.from(files)) latest = await handoverReadinessApi.uploadEvidence(r.id, file);
      if (latest) applyDetail(latest);
      toast({ title: `Đã tải ${files.length} ảnh` });
    } catch (e: any) {
      toast({ title: 'Tải ảnh thất bại', description: apiErrorMessage(e), variant: 'destructive' });
      qc.invalidateQueries({ queryKey });
    } finally {
      setUploading(false);
    }
  };

  const dateDiff = useMemo(() => (r && newDate ? businessDaysBetween(r.targetReadyDate, newDate) : null), [r, newDate]);
  const stagedEvidence = r?.evidence.filter((e) => !e.confirmationEventId) ?? [];
  const confirmedEvidence = r?.evidence.filter((e) => e.confirmationEventId) ?? [];
  const tracking = r?.lifecycleStatus === 'TRACKING';

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />;
  if (isError) {
    const forbidden = (error as any)?.response?.status === 403;
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        {forbidden ? 'Bạn không có quyền xem theo dõi bàn giao mặt bằng của Mall này.' : apiErrorMessage(error, 'Không tải được dữ liệu bàn giao.')}
      </div>
    );
  }
  if (!data || !caps) return null;

  // ─── Not tracked yet ───────────────────────────────────────────────────────
  if (!r) {
    return (
      <div className="space-y-3" data-testid="handover-tab">
        <Section title="BDA DỰ KIẾN BÀN GIAO MẶT BẰNG" icon={CalendarClock}>
          {data.canStart ? (
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={tick} onCheckedChange={(v) => setTick(v === true)} aria-label="Theo dõi ngày BDA dự kiến bàn giao mặt bằng" />
                <span>
                  <span className="font-medium">Theo dõi ngày BDA dự kiến bàn giao mặt bằng</span>
                  <span className="block text-xs text-gray-500">Ngày Ban dự án (BDA) dự kiến bàn giao mặt bằng cho Leasing/Vận hành. Không thay đổi trạng thái mặt bằng.</span>
                </span>
              </label>
              {tick && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-600">
                    Ngày Ban dự án dự kiến bàn giao *
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" aria-label="Ngày dự kiến bàn giao" />
                  </label>
                  <label className="text-xs font-medium text-gray-600">
                    Đầu mối Ban dự án (có tài khoản)
                    <select className={`${SELECT_CLASS} mt-1`} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label="Đầu mối Ban dự án">
                      <option value="">— Không chọn —</option>
                      {candidates.map((c) => <option key={c.id} value={c.id}>{c.fullName} ({c.role})</option>)}
                    </select>
                  </label>
                  {!ownerId && (
                    <label className="text-xs font-medium text-gray-600 sm:col-span-2">
                      Hoặc tên đầu mối (không có tài khoản)
                      <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="mt-1" placeholder="VD: Anh Tuấn - Ban dự án" />
                    </label>
                  )}
                  <label className="text-xs font-medium text-gray-600 sm:col-span-2">
                    Ghi chú
                    <Textarea value={startNote} onChange={(e) => setStartNote(e.target.value)} className="mt-1" rows={2} />
                  </label>
                  <div className="sm:col-span-2">
                    <Button onClick={() => startMutation.mutate()} disabled={!startDate || startMutation.isPending}>
                      {startMutation.isPending ? 'Đang lưu…' : 'Bắt đầu theo dõi'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              {caps.manage ? 'Mặt bằng này hiện không thể theo dõi bàn giao (không còn hoạt động).' : 'Mặt bằng chưa được theo dõi bàn giao. Bạn không có quyền bắt đầu theo dõi.'}
            </p>
          )}
        </Section>
        {data.cancelledHistory.length > 0 && (
          <Section title="LẦN THEO DÕI ĐÃ HỦY" icon={History}>
            <ul className="space-y-1 text-xs text-gray-600">
              {data.cancelledHistory.map((h) => (
                <li key={h.id}>Dự kiến {fmtBusinessDate(h.targetReadyDate)} (ban đầu {fmtBusinessDate(h.originalTargetDate)}) — {h.cancelReason}</li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    );
  }

  // ─── Tracked ───────────────────────────────────────────────────────────────
  const e = r.evaluation;
  const openRisks = r.risks.filter((x) => x.status === 'OPEN');
  const canUpload = caps.confirm && tracking;
  const enoughEvidence = r.stagedEvidenceCount >= r.minConfirmationImages;

  return (
    <div className="space-y-3" data-testid="handover-tab">
      <div className="flex flex-wrap items-center gap-2">
        <HandoverStatusBadge status={r.status} />
        <span className={`text-sm font-semibold ${e.status === 'OVERDUE' ? 'text-red-700' : e.status === 'AT_RISK' ? 'text-amber-700' : 'text-gray-700'}`}>
          {handoverDaysLabel(e)}
        </span>
        {e.riskFlags.filter((f) => f !== 'OVERDUE').map((f) => (
          <span key={f} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{RISK_FLAG_LABEL[f]}</span>
        ))}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
            disabled={!viewerId || followMutation.isPending || unfollowMutation.isPending}
            onClick={() => (r.isFollowing ? unfollowMutation.mutate(viewerId!) : followMutation.mutate(undefined))}>
            {r.isFollowing ? <><EyeOff size={12} /> Bỏ theo dõi</> : <><Eye size={12} /> Theo dõi</>}
          </Button>
        </div>
      </div>

      {e.conflict && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="handover-conflict">
          <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> {e.conflict.message}</div>
          <div className="mt-1 grid gap-0.5 text-xs sm:grid-cols-2">
            <span>Ban dự án dự kiến: <b>{fmtBusinessDate(e.conflict.projectTargetDate)}</b></span>
            <span>Cam kết với khách: <b>{fmtBusinessDate(e.conflict.commitmentDate)}</b></span>
            <span>Chênh lệch: <b>{e.conflict.differenceDays} ngày</b></span>
            <span>Nguồn: {e.conflict.sourceType === 'PROPOSAL' ? 'Tờ trình' : 'Dự án fitout / HĐ'} {e.conflict.sourceRef ?? ''}</span>
          </div>
          <p className="mt-1 text-[11px] text-red-700">Chỉ cảnh báo — không chặn tạo/duyệt tờ trình hay hợp đồng.</p>
        </div>
      )}

      <Section
        title="TIẾN ĐỘ BÀN GIAO"
        icon={CalendarClock}
        action={caps.manage && tracking ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setNewDate(r.targetReadyDate); setDateOpen(true); }}>Đổi ngày</Button>
        ) : undefined}
      >
        <Row label="Ngày Ban dự án dự kiến" value={fmtBusinessDate(r.targetReadyDate)} />
        <Row label="Ngày dự kiến ban đầu" value={fmtBusinessDate(r.originalTargetDate)} />
        <Row label="Số lần đổi ngày" value={`${e.dateChangeCount}${e.delayDays > 0 ? ` · trễ ${e.delayDays} ngày` : ''}`} />
        <Row label="Đầu mối Ban dự án" value={r.projectOwner?.fullName ?? r.projectOwnerName ?? '—'} />
        <Row label="Người cập nhật ngày gần nhất" value={r.recordedBy.fullName} />
        {e.earliestCommitment && <Row label="Cam kết bàn giao cho khách" value={`${fmtBusinessDate(e.earliestCommitment.commitmentDate)} · ${e.earliestCommitment.sourceRef ?? ''}`} />}
        {r.lifecycleStatus === 'CONFIRMED' && (
          <div className="mt-2 rounded-lg bg-green-50 p-2 text-sm text-green-800">
            <div className="flex items-center gap-1.5 font-semibold"><CheckCircle2 size={14} /> Đã xác nhận đủ điều kiện bàn giao</div>
            <div className="text-xs">{r.confirmedBy?.fullName} · {r.confirmedAt ? new Date(r.confirmedAt).toLocaleString('vi-VN') : ''}</div>
            {r.confirmNote && <div className="mt-1 text-xs">“{r.confirmNote}”</div>}
          </div>
        )}
      </Section>

      <Section
        title={`RỦI RO (${openRisks.length} đang mở)`}
        icon={ShieldAlert}
        action={caps.riskManage && tracking ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRiskOpen(true)}>Thêm rủi ro</Button> : undefined}
      >
        {r.risks.length === 0 ? <p className="text-xs text-gray-400">Chưa có rủi ro nào.</p> : (
          <ul className="space-y-2">
            {r.risks.map((x) => (
              <li key={x.id} className="rounded-lg border border-gray-100 p-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${RISK_SEVERITY_META[x.severity].className}`}>{RISK_SEVERITY_META[x.severity].label}</span>
                    <span className={x.status === 'RESOLVED' ? 'text-gray-400 line-through' : 'font-medium'}>{x.title}</span>
                    {x.description && <p className="mt-0.5 text-xs text-gray-500">{x.description}</p>}
                    <p className="text-[11px] text-gray-400">
                      {x.owner ? `Phụ trách: ${x.owner.fullName} · ` : ''}{x.dueDate ? `Hạn: ${fmtBusinessDate(x.dueDate)} · ` : ''}Ghi nhận: {x.createdBy.fullName}
                    </p>
                    {x.resolutionNote && <p className="text-[11px] text-green-700">Đã xử lý: {x.resolutionNote}</p>}
                  </div>
                  {x.status === 'OPEN' && caps.riskManage && r.lifecycleStatus !== 'CANCELLED' && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setResolveId(x.id)}>Đã xử lý</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`ẢNH XÁC NHẬN (${r.stagedEvidenceCount}/${r.minConfirmationImages} ảnh cho lần xác nhận)`} icon={Camera}>
        {canUpload && (
          <label className="mb-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
            <Camera size={12} /> {uploading ? 'Đang tải…' : 'Tải ảnh (JPG/PNG/WEBP)'}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={uploading}
              onChange={(ev) => { void uploadFiles(ev.target.files); ev.target.value = ''; }} />
          </label>
        )}
        {stagedEvidence.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {stagedEvidence.map((ev) => (
              <div key={ev.id} className="relative">
                <AuthenticatedImage src={ev.downloadPath} alt={ev.fileName} className="h-20 w-full rounded-md object-cover" />
                {caps.confirm && tracking && (
                  <button type="button" aria-label={`Xóa ảnh ${ev.fileName}`} className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-red-600 shadow"
                    onClick={() => removeEvidenceMutation.mutate(ev.id)}><Trash2 size={11} /></button>
                )}
              </div>
            ))}
          </div>
        )}
        {confirmedEvidence.length > 0 && (
          <>
            <p className="mb-1 mt-2 text-[11px] font-medium text-gray-500">Ảnh đã dùng để xác nhận (không thể xóa)</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {confirmedEvidence.map((ev) => <AuthenticatedImage key={ev.id} src={ev.downloadPath} alt={ev.fileName} className="h-20 w-full rounded-md object-cover" />)}
            </div>
          </>
        )}
        {r.evidence.length === 0 && !canUpload && <p className="text-xs text-gray-400">Chưa có ảnh.</p>}
      </Section>

      <Section title={`NGƯỜI THEO DÕI (${r.followers.length})`} icon={UserPlus}>
        <ul className="flex flex-wrap gap-1.5">
          {r.followers.map((f) => (
            <li key={f.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
              {f.fullName}
              {caps.manage && (
                <button type="button" aria-label={`Bỏ ${f.fullName}`} onClick={() => unfollowMutation.mutate(f.userId)}><X size={11} /></button>
              )}
            </li>
          ))}
        </ul>
        {caps.manage && r.lifecycleStatus !== 'CANCELLED' && (
          <div className="mt-2 flex gap-2">
            <select className={SELECT_CLASS} value={followerId} onChange={(ev) => setFollowerId(ev.target.value)} aria-label="Chọn người theo dõi">
              <option value="">— Thêm người theo dõi (cùng Mall) —</option>
              {candidates.filter((c) => !r.followers.some((f) => f.userId === c.id)).map((c) => (
                <option key={c.id} value={c.id}>{c.fullName} ({c.role})</option>
              ))}
            </select>
            <Button size="sm" disabled={!followerId || followMutation.isPending} onClick={() => followMutation.mutate(followerId)}>Thêm</Button>
          </div>
        )}
      </Section>

      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        {caps.confirm && tracking && (
          <Button className="gap-1.5 bg-green-600 text-white hover:bg-green-700" onClick={() => setConfirmOpen(true)}>
            <CheckCircle2 size={14} /> Xác nhận đủ điều kiện
          </Button>
        )}
        {caps.reopen && r.lifecycleStatus === 'CONFIRMED' && (
          <Button variant="outline" className="gap-1.5" onClick={() => setReopenOpen(true)}><RotateCcw size={14} /> Mở lại</Button>
        )}
        {caps.manage && tracking && (
          <Button variant="outline" className="gap-1.5 text-red-600" onClick={() => setCancelOpen(true)}>Hủy theo dõi</Button>
        )}
      </div>

      <Section title="DÒNG THỜI GIAN" icon={History}>
        <ol className="space-y-2 border-l border-gray-200 pl-3" data-testid="handover-timeline">
          {[...r.timeline].reverse().map((t) => (
            <li key={t.id} className="text-xs">
              <div className="font-medium text-gray-800">{EVENT_LABEL[t.eventType] ?? t.eventType}</div>
              <div className="text-gray-500">
                {new Date(t.occurredAt).toLocaleString('vi-VN')} · {t.actor?.fullName ?? 'Hệ thống'}
              </div>
              {t.eventType === 'TARGET_DATE_CHANGED' && (
                <div className="text-gray-700">{fmtBusinessDate(t.oldDate)} → {fmtBusinessDate(t.newDate)}</div>
              )}
              {t.eventType === 'TRACKING_STARTED' && <div className="text-gray-700">Ngày dự kiến {fmtBusinessDate(t.newDate)}</div>}
              {t.reason && <div className="text-gray-600">“{t.reason}”</div>}
            </li>
          ))}
        </ol>
      </Section>

      {/* ─── Change date ─── */}
      <Dialog open={dateOpen} onOpenChange={setDateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi ngày dự kiến bàn giao</DialogTitle>
            <DialogDescription>Ngày dự kiến ban đầu ({fmtBusinessDate(r.originalTargetDate)}) luôn được giữ nguyên để đo mức trễ.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <Row label="Ngày hiện tại" value={fmtBusinessDate(r.targetReadyDate)} />
            <label className="block text-xs font-medium text-gray-600">
              Ngày mới
              <Input type="date" value={newDate} onChange={(ev) => setNewDate(ev.target.value)} className="mt-1" aria-label="Ngày mới" />
            </label>
            {dateDiff !== null && dateDiff !== 0 && (
              <p className={dateDiff > 0 ? 'font-medium text-amber-700' : 'text-sky-700'} data-testid="handover-date-diff">
                {dateDiff > 0 ? `Lùi ${dateDiff} ngày so với ngày hiện tại (trễ tiến độ)` : `Sớm hơn ${-dateDiff} ngày so với ngày hiện tại`}
              </p>
            )}
            <label className="block text-xs font-medium text-gray-600">
              Lý do thay đổi *
              <Textarea value={dateReason} onChange={(ev) => setDateReason(ev.target.value)} className="mt-1" rows={3} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateOpen(false)}>Quay lại</Button>
            <Button disabled={!newDate || !dateDiff || dateReason.trim().length < MIN_REASON || dateMutation.isPending} onClick={() => dateMutation.mutate(undefined)}>
              {dateMutation.isPending ? 'Đang lưu…' : 'Lưu ngày mới'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add risk ─── */}
      <Dialog open={riskOpen} onOpenChange={setRiskOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ghi nhận rủi ro bàn giao</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Tiêu đề rủi ro *" value={risk.title} onChange={(ev) => setRisk({ ...risk, title: ev.target.value })} aria-label="Tiêu đề rủi ro" />
            <Textarea placeholder="Mô tả" value={risk.description} onChange={(ev) => setRisk({ ...risk, description: ev.target.value })} rows={2} />
            <div className="grid grid-cols-2 gap-2">
              <select className={SELECT_CLASS} value={risk.severity} onChange={(ev) => setRisk({ ...risk, severity: ev.target.value as HandoverRiskSeverity })} aria-label="Mức độ">
                <option value="LOW">Thấp</option><option value="MEDIUM">Trung bình</option><option value="HIGH">Cao (gửi mail ngay)</option>
              </select>
              <Input type="date" value={risk.dueDate} onChange={(ev) => setRisk({ ...risk, dueDate: ev.target.value })} aria-label="Hạn xử lý" />
            </div>
            <select className={SELECT_CLASS} value={risk.ownerId} onChange={(ev) => setRisk({ ...risk, ownerId: ev.target.value })} aria-label="Người phụ trách">
              <option value="">— Người phụ trách —</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.fullName} ({c.role})</option>)}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskOpen(false)}>Quay lại</Button>
            <Button disabled={risk.title.trim().length < 3 || riskMutation.isPending} onClick={() => riskMutation.mutate(undefined)}>Lưu rủi ro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirm ─── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận mặt bằng đủ điều kiện bàn giao</DialogTitle>
            <DialogDescription>Sau khi xác nhận, ảnh và ghi chú được lưu vĩnh viễn làm bằng chứng và hệ thống gửi email cho quản lý Mall.</DialogDescription>
          </DialogHeader>
          {!r.sod.canSelfConfirm && (
            <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800" data-testid="handover-sod-warning">
              {r.sod.reason}
            </div>
          )}
          {!enoughEvidence && (
            <p className="text-sm text-red-600">Cần tối thiểu {r.minConfirmationImages} ảnh (hiện có {r.stagedEvidenceCount}).</p>
          )}
          {openRisks.length > 0 && (
            <p className="text-sm text-amber-700">Còn {openRisks.length} rủi ro chưa xử lý — sẽ được ghi vào email xác nhận.</p>
          )}
          <label className="block text-xs font-medium text-gray-600">
            Ghi chú xác nhận *
            <Textarea value={confirmNote} onChange={(ev) => setConfirmNote(ev.target.value)} className="mt-1" rows={3} aria-label="Ghi chú xác nhận" />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Quay lại</Button>
            <Button
              className="bg-green-600 text-white hover:bg-green-700"
              disabled={!r.sod.canSelfConfirm || !enoughEvidence || confirmNote.trim().length < MIN_REASON || confirmMutation.isPending}
              onClick={() => confirmMutation.mutate(undefined)}
            >
              {confirmMutation.isPending ? 'Đang xác nhận…' : 'Xác nhận'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReasonActionDialog open={!!resolveId} onOpenChange={(o) => !o && setResolveId(null)} title="Đánh dấu rủi ro đã xử lý"
        description="Ghi chú cách xử lý để lưu vào lịch sử." confirmLabel="Đã xử lý" minLength={MIN_REASON}
        loading={resolveMutation.isPending} onConfirm={(note) => resolveMutation.mutate(note)} />
      <ReasonActionDialog open={reopenOpen} onOpenChange={setReopenOpen} title="Mở lại xác nhận bàn giao?"
        description="Xác nhận trước đó và ảnh bằng chứng vẫn được lưu. Cần lý do." confirmLabel="Mở lại" minLength={MIN_REASON}
        loading={reopenMutation.isPending} onConfirm={(reason) => reopenMutation.mutate(reason)} />
      <ReasonActionDialog open={cancelOpen} onOpenChange={setCancelOpen} title="Hủy theo dõi bàn giao?"
        description="Lịch sử được giữ lại. Trạng thái mặt bằng không thay đổi." confirmLabel="Hủy theo dõi" minLength={MIN_REASON}
        loading={cancelMutation.isPending} onConfirm={(reason) => cancelMutation.mutate(reason)} />
    </div>
  );
}

