import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesApi } from '@/api';
import { useAuthStore } from '@/store/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { AsyncState } from '@/components/ui/async-state';
import { ReasonActionDialog } from '@/components/ui/reason-action-dialog';
import { TrendingUp, Trophy, AlertTriangle, CheckCircle2, Clock, History, XCircle } from 'lucide-react';

const SALES_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Chờ duyệt', color: 'bg-gray-100 text-gray-600' },
  APPROVED: { label: 'Đã duyệt', color: 'bg-green-100 text-green-700' },
  DISPUTED: { label: 'Tranh chấp', color: 'bg-red-100 text-red-700' },
};

function getPeriod(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmt(n: number) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(n) + ' VNĐ';
}

function AuditTrailDialog({ salesId, open, onClose }: { salesId: string; open: boolean; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['sales-audit', salesId],
    queryFn: () => salesApi.getAuditTrail(salesId),
    enabled: open && !!salesId,
  });
  const logs: any[] = data?.data ?? data ?? [];
  const ACTION_COLOR: Record<string, string> = {
    SUBMITTED: 'bg-blue-100 text-gray-700', REVISED: 'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100 text-green-700', DISPUTED: 'bg-red-100 text-red-700',
  };
  return open ? (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[70vh] overflow-y-auto p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <History size={16} className="text-gray-500" />
          <h3 className="font-semibold text-sm">Audit Trail</h3>
        </div>
        {logs.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Chưa có log</p> : logs.map((l: any) => (
          <div key={l.id} className="border-b py-2 text-xs">
            <div className="flex justify-between mb-1">
              <Badge className={`${ACTION_COLOR[l.action] ?? 'bg-gray-100 text-gray-600'} border-0 text-xs`}>{l.action}</Badge>
              <span className="text-gray-400">{new Date(l.performedAt).toLocaleString('vi-VN')}</span>
            </div>
            <div className="text-gray-600">{l.performedBy?.fullName ?? '—'} ({l.performedBy?.role})</div>
            {l.oldValue != null && <div className="text-gray-400">Thay đổi: {l.oldValue?.toLocaleString()} → {l.newValue?.toLocaleString()}</div>}
            {l.reason && <div className="text-gray-500 italic mt-0.5">{l.reason}</div>}
          </div>
        ))}
        <Button size="sm" variant="outline" className="w-full mt-3 text-xs" onClick={onClose}>Đóng</Button>
      </div>
    </div>
  ) : null;
}

export default function SalesPage() {
  const [period, setPeriod] = useState(getPeriod(0));
  const [auditSalesId, setAuditSalesId] = useState<string | null>(null);
  const [disputeSalesId, setDisputeSalesId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();
  // Xếp hạng theo tenant + tình trạng tuân thủ nộp báo cáo lộ tên/doanh thu của các khách thuê khác —
  // chỉ dành cho nhân viên, không hiển thị cho khách thuê xem trang Doanh thu của chính mình.
  const isStaff = user?.role !== 'TENANT';

  const periods = [getPeriod(-2), getPeriod(-1), getPeriod(0)];

  const { data: summary, isLoading: loadingSummary, isError: summaryError, refetch: refetchSummary, dataUpdatedAt } = useQuery({
    queryKey: ['sales-summary', period],
    queryFn: () => salesApi.salesSummary(period),
  });

  const { data: topTenants, isLoading: loadingTop, isError: topError, refetch: refetchTop } = useQuery({
    queryKey: ['sales-top', period],
    queryFn: () => salesApi.topTenants(period),
    enabled: isStaff,
  });

  const { data: deadlineData } = useQuery({
    queryKey: ['sales-deadline', period],
    queryFn: () => salesApi.getDeadlineStatus(period),
    enabled: isStaff,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => salesApi.approveSales(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-top'] });
      qc.invalidateQueries({ queryKey: ['sales-summary'] });
      toast({ title: 'Đã duyệt doanh thu' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi duyệt doanh thu', variant: 'destructive' }),
  });

  const disputeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => salesApi.disputeSales(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-top'] });
      qc.invalidateQueries({ queryKey: ['sales-summary'] });
      toast({ title: 'Đã đánh dấu tranh chấp' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi cập nhật', variant: 'destructive' }),
  });

  const handleDispute = (id: string) => {
    setDisputeSalesId(id);
  };

  const s = summary?.data ?? summary;
  const tops = topTenants?.data ?? topTenants ?? [];
  const deadline = deadlineData?.data ?? deadlineData;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Doanh thu khách thuê</h1>
          <p className="text-sm text-gray-500 mt-1">Doanh thu khách thuê hàng tháng</p>
          {dataUpdatedAt > 0 && <p className="text-xs text-gray-400 mt-1">Cập nhật gần nhất: {new Date(dataUpdatedAt).toLocaleTimeString('vi-VN')}</p>}
        </div>
        <div className="flex gap-1 rounded-lg border overflow-hidden">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                period === p ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {summaryError ? (
        <AsyncState isLoading={false} isError onRetry={refetchSummary}
          errorTitle="Không thể tải tổng hợp doanh thu"><div /></AsyncState>
      ) : (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {loadingSummary ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-12" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500">Doanh thu gộp</p>
                <p className="text-xl font-bold text-gray-700">{fmt(s?.totalGross ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500">Doanh thu ròng</p>
                <p className="text-xl font-bold">{fmt(s?.totalNet ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500">Giao dịch</p>
                <p className="text-xl font-bold">{(s?.totalTxn ?? 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-gray-500">KT báo cáo</p>
                <p className="text-xl font-bold">{s?.count ?? 0}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
      )}

      {auditSalesId && <AuditTrailDialog salesId={auditSalesId} open={!!auditSalesId} onClose={() => setAuditSalesId(null)} />}

      {/* Deadline compliance panel — chỉ dành cho nhân viên, lộ tên khách thuê khác chưa nộp */}
      {isStaff && deadline && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {deadline.isOverdue ? (
                  <AlertTriangle size={16} className="text-red-500" />
                ) : (
                  <Clock size={16} className="text-yellow-500" />
                )}
                <span className="font-semibold text-sm">Tuân thủ báo cáo doanh thu — {period}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`border-0 text-xs ${deadline.complianceRate >= 90 ? 'bg-green-100 text-green-700' : deadline.complianceRate >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                  {deadline.complianceRate}% tuân thủ
                </Badge>
                <span className="text-xs text-gray-400">Hạn: {new Date(deadline.deadline).toLocaleDateString('vi-VN')}</span>
              </div>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div className={`h-full rounded-full transition-all ${deadline.complianceRate >= 90 ? 'bg-green-500' : deadline.complianceRate >= 60 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${deadline.complianceRate}%` }} />
            </div>
            <div className="text-xs text-gray-500 mb-2">
              {deadline.submitted}/{deadline.totalRequired} tenant có doanh thu bắt buộc đã nộp
            </div>
            {deadline.missing?.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-red-600 mb-1">Chưa nộp ({deadline.missing.length}):</div>
                {deadline.missing.map((m: any) => (
                  <div key={m.contractId} className="flex items-center justify-between text-xs bg-red-50 rounded-lg px-2 py-1">
                    <span className="font-medium">{m.tenant?.brandName}</span>
                    <span className="text-gray-400">{m.unit?.code}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Top tenants — chỉ dành cho nhân viên, lộ tên/doanh thu của các khách thuê khác */}
      {isStaff && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy size={18} className="text-yellow-500" />
            Top khách thuê theo doanh thu
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topError ? (
            <AsyncState isLoading={false} isError onRetry={refetchTop}
              errorTitle="Không thể tải xếp hạng doanh thu"><div /></AsyncState>
          ) : loadingTop ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {tops.map((t: any, i: number) => {
                const pct = s?.totalGross > 0 ? (t.grossSales / s.totalGross) * 100 : 0;
                const statusInfo = SALES_STATUS_MAP[t.status] ?? SALES_STATUS_MAP.PENDING;
                return (
                  <div key={t.id ?? i} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-yellow-400 text-white' :
                      i === 1 ? 'bg-gray-300 text-gray-700' :
                      i === 2 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-sm font-medium">{t.tenant?.brandName}</span>
                        <span className="text-sm font-bold">{fmt(t.grossSales)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                        <span>{t.unit?.code}</span>
                        <span>{pct.toFixed(1)}% thị phần</span>
                      </div>
                    </div>
                    <Badge className={`${statusInfo.color} border-0 text-xs shrink-0`}>{statusInfo.label}</Badge>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600 hover:bg-green-50"
                        title="Duyệt"
                        disabled={t.status === 'APPROVED' || !t.id || approveMutation.isPending}
                        onClick={() => t.id && approveMutation.mutate(t.id)}
                      >
                        <CheckCircle2 size={15} />
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                        title="Từ chối / tranh chấp"
                        disabled={t.status === 'DISPUTED' || !t.id || disputeMutation.isPending}
                        onClick={() => t.id && handleDispute(t.id)}
                      >
                        <XCircle size={15} />
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-50"
                        title="Lịch sử duyệt"
                        disabled={!t.id}
                        onClick={() => t.id && setAuditSalesId(t.id)}
                      >
                        <History size={15} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}
      <ReasonActionDialog
        open={!!disputeSalesId}
        onOpenChange={(open) => !open && setDisputeSalesId(null)}
        title="Tranh chấp số liệu doanh thu"
        description="Vui lòng ghi rõ lý do để bộ phận phụ trách kiểm tra và lưu vết xử lý."
        confirmLabel="Gửi tranh chấp"
        loading={disputeMutation.isPending}
        onConfirm={(reason) => disputeSalesId && disputeMutation.mutate({ id: disputeSalesId, reason }, { onSuccess: () => setDisputeSalesId(null) })}
      />
    </div>
  );
}
