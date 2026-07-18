import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { crmApi, followUpApi } from '@/api';
import { AsyncState } from '@/components/ui/async-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/auth.store';
import { useMallStore } from '@/store/mall.store';
import { AlertTriangle, ArrowRight, Bell, Clock, Compass, Flame, Sparkles, Target, TrendingUp, Users } from 'lucide-react';

const SOURCE_LABELS: Record<string, string> = {
  BROKER: 'Môi giới', WEBSITE: 'Website', REFERRAL: 'Giới thiệu',
  WALK_IN: 'Trực tiếp', EXISTING_TENANT: 'Khách hiện tại',
};

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  HOT: { label: 'Nóng', className: 'bg-red-100 text-red-700' },
  WARM: { label: 'Ấm', className: 'bg-amber-100 text-amber-700' },
  COLD: { label: 'Lạnh', className: 'bg-gray-100 text-gray-600' },
};

function formatCompactVnd(value: number) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function daysSince(value?: string | null) {
  if (!value) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

export default function CrmOverviewPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { selectedMallId } = useMallStore();
  const canViewTeam = ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR'].includes(user?.role ?? '');
  const statsQuery = useQuery({ queryKey: ['crm-pipeline-stats', selectedMallId], queryFn: () => crmApi.pipelineStats(selectedMallId ?? undefined) });
  const staleQuery = useQuery({ queryKey: ['crm-stale-leads', 14, selectedMallId], queryFn: () => crmApi.staleLeads(14, selectedMallId ?? undefined) });
  const followUpsQuery = useQuery({
    queryKey: ['follow-ups-upcoming', 7, canViewTeam ? 'team' : 'mine', selectedMallId],
    queryFn: () => followUpApi.list({ isDone: 'false', daysAhead: 7, scope: canViewTeam ? 'team' : 'mine', mallId: selectedMallId ?? undefined }),
  });

  const stats: any = statsQuery.data?.data ?? statsQuery.data ?? {};
  const staleLeads: any[] = staleQuery.data?.data ?? staleQuery.data ?? [];
  const followUps: any[] = followUpsQuery.data?.data ?? followUpsQuery.data ?? [];
  const summary = stats.summary ?? {};
  const byStatus: Record<string, number> = stats.byStatus ?? {};
  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }, []);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const overdue = followUps.filter((item) => new Date(item.dueDate) < today);
  const dueToday = followUps.filter((item) => new Date(item.dueDate) >= today && new Date(item.dueDate) < tomorrow);
  const kpis = [
    { label: 'Lead đang xử lý', value: summary.totalActive ?? 0, icon: Target, tone: 'text-blue-700 bg-blue-50' },
    { label: 'Lead mới tháng này', value: summary.newThisMonth ?? 0, icon: TrendingUp, tone: 'text-violet-700 bg-violet-50' },
    { label: 'Giá trị pipeline', value: `${formatCompactVnd(summary.totalPipelineValue ?? 0)} ₫`, icon: Flame, tone: 'text-amber-700 bg-amber-50' },
    { label: 'Tỷ lệ thắng', value: `${(stats.conversionRates?.overallWinRate ?? 0).toFixed(1)}%`, icon: TrendingUp, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'Việc cần làm hôm nay', value: overdue.length + dueToday.length, icon: Bell, tone: 'text-red-700 bg-red-50' },
  ];
  const funnel = [
    { key: 'NEW', label: 'Mới', hint: 'Cần liên hệ', color: 'bg-sky-500' },
    { key: 'CONTACTED', label: 'Đã liên hệ', hint: 'Đang tìm hiểu', color: 'bg-blue-500' },
    { key: 'QUALIFIED', label: 'Tiềm năng', hint: 'Đủ điều kiện', color: 'bg-indigo-500' },
    { key: 'PROPOSAL', label: 'Đề xuất', hint: 'Đã gửi phương án', color: 'bg-violet-500' },
    { key: 'NEGOTIATION', label: 'Đàm phán', hint: 'Sắp chốt', color: 'bg-amber-500' },
    { key: 'WON', label: 'Thành công', hint: 'Đã chuyển đổi', color: 'bg-emerald-500' },
  ];
  const maxStage = Math.max(1, ...funnel.map((item) => byStatus[item.key] ?? 0));
  const isLoading = statsQuery.isLoading || staleQuery.isLoading || followUpsQuery.isLoading;
  const isError = statsQuery.isError || staleQuery.isError || followUpsQuery.isError;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Điều hành CRM"
        title="Tổng quan khách hàng tiềm năng"
        description="Ưu tiên công việc cần xử lý, sức khỏe pipeline và hiệu quả nguồn Lead. Các thao tác chi tiết được thực hiện tại CRM."
        actions={<Button onClick={() => navigate('/crm')} className="gap-2">Mở CRM <ArrowRight size={15} /></Button>}
      />

      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 px-5 py-5 text-white shadow-sm sm:px-7">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-200"><Compass size={14} /> Bắt đầu ngày làm việc</div>
            <h2 className="text-xl font-semibold sm:text-2xl">{overdue.length ? `${overdue.length} việc đã quá hạn cần ưu tiên` : 'Pipeline đang được kiểm soát tốt'}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100/80">Đi từ việc cần làm, mở đúng hồ sơ lead và ghi nhận kết quả. Mọi thay đổi sẽ cập nhật lại sức khỏe pipeline tại đây.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="gap-2 bg-white text-slate-900 hover:bg-blue-50" onClick={() => navigate('/crm?section=followups')}><Bell size={15} /> Xử lý {overdue.length + dueToday.length} việc hôm nay</Button>
            <Button className="gap-2 border border-white/20 bg-white/10 hover:bg-white/20" onClick={() => navigate('/crm?quickFilter=my-leads')}><Users size={15} /> Lead của tôi</Button>
          </div>
        </div>
      </section>

      <AsyncState
        isLoading={isLoading}
        isError={isError}
        onRetry={() => { statsQuery.refetch(); staleQuery.refetch(); followUpsQuery.refetch(); }}
        loading={<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}</div>}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map(({ label, value, icon: Icon, tone }) => (
            <Card key={label} className="shadow-none">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}><Icon size={18} /></div>
                <div><div className="text-xl font-bold text-gray-900">{value}</div><div className="text-xs text-gray-500">{label}</div></div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden border-blue-100 shadow-none">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <div><CardTitle className="flex items-center gap-2 text-base"><Sparkles size={16} className="text-blue-600" /> Khám phá hành trình chuyển đổi</CardTitle><p className="mt-1 text-xs text-gray-500">Chọn một giai đoạn để mở đúng nhóm lead cần xử lý.</p></div>
            <Badge className="bg-blue-50 text-blue-700">{summary.total ?? 0} lead</Badge>
          </CardHeader>
          <CardContent className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-6">
            {funnel.map((stage, index) => {
              const count = byStatus[stage.key] ?? 0;
              return <button key={stage.key} onClick={() => navigate(`/crm?status=${stage.key}`)} className="group relative overflow-hidden rounded-xl border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-2"><span className="text-xs font-medium text-gray-500">{index + 1}. {stage.label}</span><ArrowRight size={13} className="text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" /></div>
                <div className="mt-2 text-2xl font-bold text-gray-900">{count}</div><div className="text-[11px] text-gray-400">{stage.hint}</div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${stage.color}`} style={{ width: `${Math.max(count ? 8 : 0, count / maxStage * 100)}%` }} /></div>
              </button>;
            })}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle size={16} className="text-amber-600" /> Lead cần hành động</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/crm?quickFilter=stale-leads')}>Xem tất cả</Button>
            </CardHeader>
            <CardContent>
              {staleLeads.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">Không có Lead bị bỏ quên.</p> : (
                <div className="space-y-2">
                  {staleLeads.slice(0, 8).map((lead) => {
                    const priority = PRIORITY_CONFIG[lead.priority] ?? PRIORITY_CONFIG.WARM;
                    return (
                      <button key={lead.id} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:border-blue-200 hover:bg-blue-50" onClick={() => navigate(`/crm?leadId=${lead.id}`)}>
                        <Badge className={priority.className}>{priority.label}</Badge>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{lead.brandName ?? lead.contactName}</span>
                        <span className="flex items-center gap-1 text-xs text-amber-700"><Clock size={12} /> {daysSince(lead.lastActivityAt ?? lead.createdAt)} ngày</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Bell size={16} className="text-red-600" /> Công việc 7 ngày tới</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/crm?section=followups')}>Mở Follow-ups</Button>
            </CardHeader>
            <CardContent>
              {followUps.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">Không có follow-up sắp tới.</p> : (
                <div className="space-y-2">
                  {followUps.slice(0, 8).map((item) => {
                    const isOverdue = new Date(item.dueDate) < today;
                    return (
                      <button key={item.id} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-gray-50" onClick={() => item.lead?.id && navigate(`/crm?leadId=${item.lead.id}`)}>
                        <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{item.lead?.brandName ?? item.customer?.companyName ?? 'Follow-up'}</div><div className="truncate text-xs text-gray-500">{item.note ?? 'Chưa có ghi chú'}</div></div>
                        <Badge className={isOverdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}>{isOverdue ? 'Quá hạn' : new Date(item.dueDate).toLocaleDateString('vi-VN')}</Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Hiệu quả nguồn Lead</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b text-left text-xs text-gray-500"><th className="pb-2">Nguồn</th><th className="pb-2 text-right">Thắng</th><th className="pb-2 text-right">Thua</th><th className="pb-2 pl-6">Tỷ lệ thắng</th></tr></thead>
              <tbody>{Object.entries(stats.winLossBySource ?? {}).map(([source, raw]) => {
                const value = raw as { won: number; lost: number; rate: number };
                return <tr key={source} className="border-b last:border-0"><td className="py-3">{SOURCE_LABELS[source] ?? source}</td><td className="py-3 text-right font-medium text-green-700">{value.won}</td><td className="py-3 text-right text-red-600">{value.lost}</td><td className="py-3 pl-6"><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded bg-gray-100"><div className="h-full rounded bg-green-500" style={{ width: `${Math.min(100, value.rate)}%` }} /></div><span className="w-12 text-right">{value.rate.toFixed(1)}%</span></div></td></tr>;
              })}</tbody>
            </table>
          </CardContent>
        </Card>
      </AsyncState>
    </div>
  );
}
