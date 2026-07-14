import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { crmApi, customersApi, followUpApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Layers, Percent, Target, CheckCircle, Bell, ArrowRight, Clock,
} from 'lucide-react';

const SOURCE_LABELS: Record<string, string> = {
  BROKER: 'Môi giới',
  WEBSITE: 'Website',
  REFERRAL: 'Giới thiệu',
  WALK_IN: 'Trực tiếp',
  EXISTING_TENANT: 'KH hiện tại',
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  HOT:  { label: 'Hot',  color: 'bg-red-500 text-white' },
  WARM: { label: 'Warm', color: 'bg-orange-400 text-white' },
  COLD: { label: 'Cold', color: 'bg-gray-400 text-white' },
};

function getDaysAgo(date: string | null | undefined): number {
  if (!date) return 999;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

function KpiCards() {
  const { data: leadStats, isLoading: l1 } = useQuery({
    queryKey: ['crm-stats'],
    queryFn: crmApi.stats,
    select: (r: any) => r?.data ?? r,
  });
  const { data: custStats, isLoading: l2 } = useQuery({
    queryKey: ['customers-stats'],
    queryFn: customersApi.stats,
    select: (r: any) => r?.data ?? r,
  });
  const { data: followUpsTodayRaw, isLoading: l3 } = useQuery({
    queryKey: ['follow-ups-today-count'],
    queryFn: () => followUpApi.list({ isDone: 'false', daysAhead: 1 }),
    select: (r: any) => {
      const arr = Array.isArray(r) ? r : r?.data ?? [];
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return arr.filter((fu: any) => {
        const d = new Date(fu.dueDate);
        return d >= todayStart && d <= todayEnd;
      });
    },
  });

  const wonCount: number = Array.isArray(leadStats?.byStatus)
    ? (leadStats.byStatus.find((s: any) => s.status === 'WON')?._count ?? 0)
    : 0;
  const lostCount: number = Array.isArray(leadStats?.byStatus)
    ? (leadStats.byStatus.find((s: any) => s.status === 'LOST')?._count ?? 0)
    : 0;
  const winRate = (wonCount + lostCount) > 0
    ? Math.round((wonCount / (wonCount + lostCount)) * 100)
    : 0;

  const kpis = [
    { label: 'Tổng leads',        value: leadStats?.total ?? 0,                                                               icon: Layers,      color: 'text-gray-700',    bg: 'bg-gray-50' },
    { label: 'Tỷ lệ thành công',  value: `${winRate}%`,                                                                       icon: Percent,     color: 'text-green-600',   bg: 'bg-green-50' },
    { label: 'Đang đàm phán',     value: (custStats?.byStatus ?? []).find((s: any) => s.status === 'NEGOTIATING')?.count ?? 0, icon: Target,      color: 'text-orange-600',  bg: 'bg-orange-50' },
    { label: 'Đang thuê',         value: (custStats?.byStatus ?? []).find((s: any) => s.status === 'ACTIVE')?.count ?? 0,     icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Follow-up hôm nay', value: (followUpsTodayRaw ?? []).length,                                                    icon: Bell,        color: 'text-purple-600',  bg: 'bg-purple-50' },
  ];

  if (l1 || l2 || l3) {
    return (
      <div className="grid grid-cols-5 gap-3 mb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-3 mb-5">
      {kpis.map((k) => {
        const Icon = k.icon;
        return (
          <div key={k.label} className={`${k.bg} rounded-xl p-3 flex items-center gap-3`}>
            <div className="shrink-0 w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm">
              <Icon size={17} className={k.color} />
            </div>
            <div>
              <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-gray-500 leading-tight">{k.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SourceBreakdownCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-pipeline-stats'],
    queryFn: crmApi.pipelineStats,
    select: (r: any) => r?.data ?? r,
  });

  const rows = Object.entries(
    (data?.winLossBySource ?? {}) as Record<string, { won: number; lost: number; rate: number }>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Phân bổ theo nguồn</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Chưa có dữ liệu</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b">
                <th className="text-left pb-2 font-medium">Nguồn</th>
                <th className="text-center pb-2 font-medium">WON</th>
                <th className="text-center pb-2 font-medium">Lost</th>
                <th className="text-left pb-2 font-medium pl-3">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([source, stat]) => (
                <tr key={source} className="border-b last:border-0">
                  <td className="py-2 text-gray-700">{SOURCE_LABELS[source] ?? source}</td>
                  <td className="py-2 text-center text-green-600 font-medium">{stat.won}</td>
                  <td className="py-2 text-center text-red-500">{stat.lost}</td>
                  <td className="py-2 pl-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-400 rounded-full"
                          style={{ width: `${Math.round(stat.rate)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-7 text-right">{Math.round(stat.rate)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function StaleLeadsCard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['crm-stale-leads'],
    queryFn: () => crmApi.staleLeads(14),
    select: (r: any) => (Array.isArray(r) ? r : r?.data ?? []),
  });

  const leads: any[] = (data ?? []).slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Top leads cần theo dõi</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
          </div>
        ) : leads.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Không có leads nào bị bỏ quên 👍</p>
        ) : (
          <div className="space-y-1">
            {leads.map((lead: any) => {
              const cfg = PRIORITY_CFG[lead.priority] ?? PRIORITY_CFG.COLD;
              const daysAgo = getDaysAgo(lead.lastActivityAt ?? lead.createdAt);
              return (
                <div
                  key={lead.id}
                  className="flex items-center gap-2 py-1.5 border-b last:border-0 cursor-pointer hover:bg-gray-50 rounded px-1 transition-colors"
                  onClick={() => navigate('/crm')}
                >
                  <Badge className={`${cfg.color} text-[10px] px-1.5 py-0 shrink-0`}>{cfg.label}</Badge>
                  <span className="flex-1 text-xs text-gray-700 truncate">
                    {lead.brandName ?? lead.contactName ?? '—'}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-orange-500 shrink-0">
                    <Clock size={10} />
                    {daysAgo} ngày
                  </span>
                </div>
              );
            })}
            <button
              onClick={() => navigate('/crm')}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 pt-2 transition-colors"
            >
              Xem tất cả <ArrowRight size={11} />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FollowUpScheduleCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['follow-ups-upcoming'],
    queryFn: () => followUpApi.list({ isDone: 'false', daysAhead: 7 }),
    select: (r: any) => (Array.isArray(r) ? r : r?.data ?? []),
  });

  const items: any[] = data ?? [];
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const grouped: Record<string, any[]> = {};
  [...items]
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .forEach((fu) => {
      const key = new Date(fu.dueDate).toDateString();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(fu);
    });

  const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const formatGroupDate = (key: string) => {
    const d = new Date(key);
    return `${DAY_LABELS[d.getDay()]}, ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Lịch follow-up sắp tới (7 ngày)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Không có follow-up nào trong 7 ngày tới</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([key, fus]) => {
              const isOverdue = new Date(key) < todayStart;
              return (
                <div key={key}>
                  <div className={`text-xs font-semibold mb-1 flex items-center gap-2 ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
                    {formatGroupDate(key)}
                    {isOverdue && (
                      <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px]">Quá hạn</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {fus.map((fu: any) => (
                      <div key={fu.id} className="flex items-start gap-2 py-1.5 border-b last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-700 font-medium truncate">
                            {fu.lead?.brandName ?? fu.customer?.companyName ?? fu.customer?.brandName ?? '—'}
                          </div>
                          {fu.note && (
                            <div className="text-[11px] text-gray-400 truncate">
                              {fu.note.length > 60 ? `${fu.note.slice(0, 60)}…` : fu.note}
                            </div>
                          )}
                        </div>
                        {fu.assignedTo && (
                          <span className="shrink-0 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {fu.assignedTo.fullName}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CrmOverviewPage() {
  return (
    <div className="flex flex-col h-full p-6">
      <div className="mb-5 shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Tổng quan CRM</h1>
        <p className="text-sm text-gray-500 mt-0.5">Theo dõi sức khỏe pipeline và các leads cần hành động</p>
      </div>

      <KpiCards />

      <div className="grid grid-cols-[55fr_45fr] gap-4 mb-4">
        <SourceBreakdownCard />
        <StaleLeadsCard />
      </div>

      <FollowUpScheduleCard />
    </div>
  );
}
