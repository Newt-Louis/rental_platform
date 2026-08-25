import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { openAuthenticatedFile } from '@/lib/downloadFile';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ReasonActionDialog } from '@/components/ui/reason-action-dialog';
import { Paperclip, Check, X } from 'lucide-react';
import { FitoutCommentThread } from './FitoutCommentThread';

/**
 * Hàng chờ duyệt Fitout riêng — dưới menu Fitout, không phải trang Phê duyệt chung.
 * Nguồn dữ liệu là endpoint /approvals/pending?entityType=FITOUT_SUBMITTAL đã có sẵn ngữ cảnh
 * đầy đủ (dự án/khách thuê/mặt bằng/giai đoạn/tệp đính kèm/lịch sử duyệt) — trang này chỉ trình
 * bày lại theo bối cảnh Fitout, tận dụng đúng engine duyệt/role/Mall-scope hiện có, không tạo
 * route hay logic duyệt riêng. Approve/Reject gọi thẳng /approvals/:stepId/approve|reject.
 */

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Nháp — chờ đính kèm & gửi duyệt',
  IN_PROGRESS: 'Đang chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
  PUBLISHED: 'Đã phát hành',
  OBSOLETED: 'Đã thay thế',
};

function formatSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FitoutApprovalsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const [rejectStepId, setRejectStepId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['fitout-approvals-pending'],
    queryFn: () => api.get('/approvals/pending', { params: { entityType: 'FITOUT_SUBMITTAL', limit: 50 } }).then((r) => r.data),
  });
  const rows: any[] = data?.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['fitout-approvals-pending'] });

  const approveMutation = useMutation({
    mutationFn: (stepId: string) => api.post(`/approvals/${stepId}/approve`).then((r) => r.data),
    onSuccess: () => { refresh(); toast({ title: 'Đã duyệt hồ sơ' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể duyệt', variant: 'destructive' }),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ stepId, comment }: { stepId: string; comment: string }) =>
      api.post(`/approvals/${stepId}/reject`, { comment }).then((r) => r.data),
    onSuccess: () => { refresh(); toast({ title: 'Đã từ chối hồ sơ' }); setRejectStepId(null); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể từ chối', variant: 'destructive' }),
  });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        eyebrow="Fitout"
        title="Duyệt hồ sơ Fitout"
        description="Hàng chờ duyệt các submittal Fitout đang cần bạn quyết định — trên mọi dự án bạn được phân quyền."
      />

      {isLoading ? (
        <p className="text-sm text-gray-400">Đang tải...</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Không có hồ sơ nào đang chờ bạn duyệt" description="Khi có submittal Fitout mới cần quyết định, hồ sơ sẽ xuất hiện ở đây." />
      ) : (
        <div className="space-y-3">
          {rows.map((step) => {
            const sub = step.workflow?.fitoutSubmittal;
            if (!sub) return null;
            const attachments: any[] = sub.attachments ?? [];
            const canAct = user?.role === 'ADMIN' || (step.approverId ? step.approverId === user?.id : step.approverRole === user?.role);
            return (
              <div key={step.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {sub.title} <span className="text-xs font-normal text-gray-400">rev{sub.revisionNo}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {sub.formType?.name} · {sub.project?.tenant?.brandName ?? sub.project?.tenant?.companyName} · {sub.project?.unit?.code}
                      {sub.stage?.name ? ` · ${sub.stage.name}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Nộp bởi {sub.submittedBy?.fullName} · {new Date(sub.submittedAt).toLocaleDateString('vi-VN')}
                      {sub.dueDate ? ` · Hạn ${new Date(sub.dueDate).toLocaleDateString('vi-VN')}` : ''}
                    </p>
                  </div>
                  <Badge variant="warning" className="shrink-0">Bước {step.stepOrder} · {step.approverRole}</Badge>
                </div>

                {attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((a) => (
                      <button
                        key={a.id}
                        className="inline-flex items-center gap-1.5 text-xs border border-gray-200 rounded-md px-2 py-1 hover:bg-gray-50"
                        onClick={() => openAuthenticatedFile(`/files/fitout-documents/${a.id}`, { download: a.fileName })}
                      >
                        <Paperclip size={11} className="text-gray-400" />
                        {a.fileName}
                        {a.fileSize ? <span className="text-gray-400">({formatSize(a.fileSize)})</span> : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600">Hồ sơ chưa có tệp đính kèm.</p>
                )}

                {step.workflow?.steps?.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    {step.workflow.steps.map((s: any) => (
                      <span
                        key={s.id}
                        className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                          s.status === 'APPROVED' ? 'bg-green-100 text-green-700'
                          : s.status === 'REJECTED' ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {s.stepOrder}. {s.approverRole}{s.approver ? ` (${s.approver.fullName})` : ''} · {s.status}
                        {s.comment ? ` — “${s.comment}”` : ''}
                      </span>
                    ))}
                  </div>
                )}

                {canAct && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="gap-1.5" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(step.id)}>
                      <Check size={13} /> Duyệt
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-red-600" onClick={() => setRejectStepId(step.id)}>
                      <X size={13} /> Từ chối
                    </Button>
                  </div>
                )}

                <FitoutCommentThread submittalId={sub.id} />
              </div>
            );
          })}
        </div>
      )}

      <ReasonActionDialog
        open={!!rejectStepId}
        onOpenChange={(open) => !open && setRejectStepId(null)}
        title="Từ chối hồ sơ Fitout"
        description="Lý do sẽ được lưu vào lịch sử duyệt và người phụ trách nhìn thấy khi nộp lại."
        confirmLabel="Từ chối"
        minLength={5}
        loading={rejectMutation.isPending}
        onConfirm={(reason) => rejectStepId && rejectMutation.mutate({ stepId: rejectStepId, comment: reason })}
      />
    </div>
  );
}
