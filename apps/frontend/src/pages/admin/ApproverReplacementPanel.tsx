import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, UserCog } from 'lucide-react';
import { approvalsApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

export type ApproverInUse = {
  user: { id: string; fullName: string; email: string; role: string; isActive: boolean };
  issues: Array<'INACTIVE' | 'ROLE_NOT_ELIGIBLE' | 'NO_MALL_ACCESS'>;
  ruleCount: number;
  pendingProposalSteps: number;
  pendingBookingPriceSteps: number;
};

type ReplaceResult = {
  rulesUpdated: number;
  reassignedProposalSteps: number;
  reassignedBookingPriceSteps: number;
  skipped: Array<{ entityType: string; reference: string; stepName: string; reason: string }>;
};

export const APPROVER_ISSUE_LABELS: Record<ApproverInUse['issues'][number], string> = {
  INACTIVE: 'Tài khoản đang bị khoá',
  ROLE_NOT_ELIGIBLE: 'Vai trò không còn được duyệt',
  NO_MALL_ACCESS: 'Mất quyền truy cập Mall',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin', LEASING_MANAGER: 'Leasing Manager', MALL_DIRECTOR: 'Mall Director', CEO: 'CEO', FINANCE: 'Finance', LEGAL: 'Legal',
};

function list<T>(raw: any): T[] {
  const value = raw?.data ?? raw;
  return Array.isArray(value) ? value : [];
}

/**
 * The people a Mall's approvals depend on. Replacing one of them rewrites every
 * rule naming them and moves every step still waiting on them, in one action.
 */
export function ApproverReplacementPanel({ mallId, mallName }: { mallId: string; mallName?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [from, setFrom] = useState<ApproverInUse | null>(null);
  const [toUserId, setToUserId] = useState('');
  const [skipped, setSkipped] = useState<ReplaceResult['skipped']>([]);

  const approversQuery = useQuery({
    queryKey: ['approval-approvers-in-use', mallId],
    queryFn: () => approvalsApi.listApproversInUse(mallId),
    enabled: Boolean(mallId),
  });
  const approvers = useMemo(() => list<ApproverInUse>(approversQuery.data), [approversQuery.data]);

  const candidatesQuery = useQuery({
    queryKey: ['approval-policy-approver-candidates', mallId],
    queryFn: () => approvalsApi.listPolicyApproverCandidates(mallId),
    enabled: Boolean(mallId) && !!from,
  });
  const candidates = useMemo(
    () => list<{ id: string; fullName: string; email?: string; role: string }>(candidatesQuery.data).filter((c) => c.id !== from?.user.id),
    [candidatesQuery.data, from],
  );

  const replace = useMutation({
    mutationFn: () => approvalsApi.replaceApprover({ mallId, fromUserId: from!.user.id, toUserId }),
    onSuccess: (raw: any) => {
      const result: ReplaceResult = raw?.data ?? raw;
      const successor = candidates.find((c) => c.id === toUserId)?.fullName ?? 'người mới';
      setSkipped(result.skipped ?? []);
      qc.invalidateQueries({ queryKey: ['approval-approvers-in-use', mallId] });
      qc.invalidateQueries({ queryKey: ['approval-policy-rules'] });
      const moved = result.reassignedProposalSteps + result.reassignedBookingPriceSteps;
      toast({
        title: `Đã thay ${from!.user.fullName} bằng ${successor}`,
        description: `${result.rulesUpdated} quy tắc đã cập nhật · ${moved} bước đang chờ đã chuyển.`,
      });
      setFrom(null);
    },
    onError: (error: any) => toast({ title: error?.response?.data?.message ?? 'Không thể thay người phụ trách', variant: 'destructive' }),
  });

  if (!mallId) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
        Chọn một Mall để xem người phụ trách phê duyệt và thay người khi có thay đổi nhân sự.
      </div>
    );
  }

  const pending = (a: ApproverInUse) => a.pendingProposalSteps + a.pendingBookingPriceSteps;

  return (
    <section className="rounded-xl border bg-white" aria-labelledby="approver-replacement-title">
      <div className="border-b px-4 py-3">
        <h3 id="approver-replacement-title" className="flex items-center gap-2 font-semibold text-slate-900">
          <UserCog size={16} aria-hidden /> Người phụ trách phê duyệt{mallName ? ` · ${mallName}` : ''}
        </h3>
        <p className="text-xs text-slate-500">
          Khi đổi nhân sự, dùng “Thay người phụ trách”: mọi quy tắc đang dùng người cũ và các bước đang chờ của họ chuyển sang người mới. Bước đã duyệt giữ nguyên người đã ký.
        </p>
      </div>

      {skipped.length > 0 && (
        <div role="alert" className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-semibold">Một số bước không được chuyển vì người phụ trách mới chính là người lập hồ sơ:</div>
          <ul className="mt-1 list-disc pl-4">
            {skipped.map((s, i) => <li key={i}>{s.entityType === 'PROPOSAL' ? 'Proposal' : 'Booking'} {s.reference} — {s.stepName}</li>)}
          </ul>
          <div className="mt-1">Các bước này vẫn ở người phụ trách cũ; cần chọn người khác cho hồ sơ đó.</div>
        </div>
      )}

      {approversQuery.isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : approversQuery.isError ? (
        <div className="flex items-center justify-between p-4 text-sm text-red-700">
          <span>Không thể tải danh sách người phụ trách.</span>
          <Button size="sm" variant="outline" onClick={() => approversQuery.refetch()}>Thử lại</Button>
        </div>
      ) : approvers.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Mall này chưa có quy tắc duyệt hay bước duyệt nào gắn với người phụ trách.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2">Người phụ trách</th>
                <th className="px-4 py-2">Tình trạng</th>
                <th className="px-4 py-2">Quy tắc</th>
                <th className="px-4 py-2">Đang chờ duyệt</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {approvers.map((a) => (
                <tr key={a.user.id} data-approver={a.user.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{a.user.fullName}</div>
                    <div className="text-xs text-slate-500">{ROLE_LABELS[a.user.role] ?? a.user.role} · {a.user.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    {a.issues.length === 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={13} aria-hidden /> Hợp lệ</span>
                    ) : (
                      <span className="inline-flex flex-col text-xs text-red-700">
                        {a.issues.map((issue) => <span key={issue} className="inline-flex items-center gap-1"><AlertTriangle size={12} aria-hidden /> {APPROVER_ISSUE_LABELS[issue]}</span>)}
                        <span className="text-[11px]">Cần thay người để hồ sơ không bị kẹt.</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">{a.ruleCount}</td>
                  <td className="px-4 py-2 text-xs text-slate-600">{pending(a) ? `${pending(a)} bước` : '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="outline" className="h-8" onClick={() => { setFrom(a); setToUserId(''); }} aria-label={`Thay người phụ trách ${a.user.fullName}`}>
                      Thay người phụ trách
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!from} onOpenChange={(open) => { if (!open) setFrom(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Thay người phụ trách</DialogTitle></DialogHeader>
          {from && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 rounded-md bg-slate-50 p-2">
                <div>
                  <div className="text-[11px] text-slate-500">Người cũ</div>
                  <div className="font-medium">{from.user.fullName}</div>
                </div>
                <ArrowRight size={16} className="text-slate-400" aria-hidden />
                <label className="flex-1">
                  <span className="text-[11px] text-slate-500">Người mới</span>
                  <select
                    aria-label="Người phụ trách mới"
                    className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={toUserId}
                    onChange={(e) => setToUserId(e.target.value)}
                    disabled={candidatesQuery.isLoading}
                  >
                    <option value="">— Chọn người —</option>
                    {candidates.map((c) => <option key={c.id} value={c.id}>{c.fullName} · {ROLE_LABELS[c.role] ?? c.role}</option>)}
                  </select>
                </label>
              </div>
              <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-800" data-testid="replacement-impact">
                {from.ruleCount} quy tắc và {pending(from)} bước đang chờ sẽ chuyển sang người mới. Người mới nhận thông báo cho các bước đến lượt duyệt.
              </p>
              {!candidatesQuery.isLoading && candidates.length === 0 && (
                <p className="text-xs text-red-600">Mall này chưa có tài khoản khác đủ quyền duyệt. Cấp quyền truy cập Mall cho tài khoản tương ứng trong phần Người dùng trước.</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setFrom(null)}>Huỷ</Button>
                <Button disabled={!toUserId || replace.isPending} onClick={() => replace.mutate()}>
                  {replace.isPending && <RefreshCw size={14} className="mr-2 animate-spin" aria-hidden />} Thay người
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
