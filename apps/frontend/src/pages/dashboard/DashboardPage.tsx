import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dashboardApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { useAuthStore } from '@/store/auth.store';
import { canAccessPath } from '@/lib/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncState } from '@/components/ui/async-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building2, Users, TrendingUp, AlertTriangle, Clock, Ticket,
  CheckSquare, DollarSign, BookmarkCheck, ArrowUpRight, RefreshCw,
  Sparkles, ChevronRight, Activity, ShieldCheck,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';

function fmt(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', notation: 'compact' }).format(n);
}

function fmtArea(n: number) {
  return `${Math.round(Math.max(0, n)).toLocaleString('vi-VN')} m²`;
}

const COLOR_MAP = {
  blue:   { iconBg: 'bg-blue-50',    iconText: 'text-blue-700', accent: 'from-blue-600 to-cyan-400' },
  green:  { iconBg: 'bg-emerald-50', iconText: 'text-emerald-700', accent: 'from-emerald-600 to-teal-400' },
  yellow: { iconBg: 'bg-amber-50',   iconText: 'text-amber-700', accent: 'from-amber-500 to-orange-400' },
  red:    { iconBg: 'bg-rose-50',    iconText: 'text-rose-700', accent: 'from-rose-600 to-orange-400' },
  purple: { iconBg: 'bg-violet-50',  iconText: 'text-violet-700', accent: 'from-violet-600 to-fuchsia-400' },
};

function StatCard({
  title, value, sub, icon: Icon, color = 'blue', badge, to,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: keyof typeof COLOR_MAP;
  badge?: { text: string; variant?: 'destructive' | 'secondary' | 'outline' };
  to?: string;
}) {
  const navigate = useNavigate();
  const c = COLOR_MAP[color];
  return (
    <Card
      className={`group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_10px_35px_-24px_rgba(15,23,42,0.45)] ${to ? 'cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_18px_45px_-22px_rgba(15,23,42,0.4)]' : ''}`}
      onClick={to ? () => navigate(to) : undefined}
      onKeyDown={to ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(to);
        }
      } : undefined}
      role={to ? 'link' : undefined}
      tabIndex={to ? 0 : undefined}
      aria-label={to ? `${title}: ${value}` : undefined}
    >
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${c.accent} opacity-80`} />
      <CardContent className="px-5 pb-5 pt-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{title}</p>
            <p className="mt-2 text-[1.7rem] font-semibold leading-none tracking-tight text-slate-950">{value}</p>
            {sub && <p className="mt-2 text-xs leading-5 text-slate-500">{sub}</p>}
          </div>
          <div className={`ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 ${c.iconBg}`}>
            <Icon size={18} className={c.iconText} />
          </div>
        </div>
        {badge && (
          <div className="mt-3 pt-2.5 border-t border-gray-50">
            <Badge variant={badge.variant ?? 'secondary'} className="text-[11px] font-medium">
              {badge.text}
            </Badge>
          </div>
        )}
        {to && (
          <ArrowUpRight size={14} className="absolute bottom-4 right-4 text-slate-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-700" />
        )}
      </CardContent>
    </Card>
  );
}

function OccupancyDonut({
  leasedArea, vacantArea, otherArea, occupancyRate,
}: {
  leasedArea: number;
  vacantArea: number;
  otherArea: number;
  occupancyRate: number;
}) {
  const { t } = useTranslation('dashboard');
  const raw = [
    { name: t('occupancy.leasedFull'), value: Math.max(0, leasedArea), color: '#10b981' },
    { name: t('occupancy.vacant'), value: Math.max(0, vacantArea), color: '#e5e7eb' },
    { name: t('occupancy.other'), value: Math.max(0, otherArea), color: '#fbbf24' },
  ];
  const data = raw.filter((d) => d.value > 0);
  if (data.length === 0) data.push({ name: t('occupancy.noData'), value: 1, color: '#f3f4f6' });

  return (
    <div className="relative select-none">
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={72}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            strokeWidth={2}
            stroke="#fff"
          >
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip
            formatter={(v: number) => [`${Math.round(v).toLocaleString('vi-VN')} m²`]}
            contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold text-gray-900 leading-none">{occupancyRate}%</span>
        <span className="text-[11px] text-gray-400 mt-1">{t('occupancy.label')}</span>
      </div>
    </div>
  );
}

function OccupancyLegend({
  leasedArea, vacantArea, otherArea,
}: {
  leasedArea: number;
  vacantArea: number;
  otherArea: number;
}) {
  const { t } = useTranslation('dashboard');
  return (
    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50">
      {[
        { label: t('occupancy.leased'), value: fmtArea(leasedArea), dot: 'bg-emerald-500' },
        { label: t('occupancy.vacant'), value: fmtArea(vacantArea), dot: 'bg-gray-200' },
        { label: t('occupancy.other'),  value: fmtArea(otherArea),  dot: 'bg-amber-400' },
      ].map((item) => (
        <div key={item.label} className="flex flex-col items-center gap-1 text-center">
          <div className={`h-2 w-2 rounded-full ${item.dot}`} />
          <span className="text-[10px] text-gray-400 leading-none">{item.label}</span>
          <span className="text-xs font-semibold text-gray-700">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function BillingProgress({
  monthlyRevenue, collectedRevenue, overdueAmount,
}: {
  monthlyRevenue: number;
  collectedRevenue: number;
  overdueAmount: number;
}) {
  const { t } = useTranslation('dashboard');
  const max = Math.max(monthlyRevenue, 1);
  const collectionPct = monthlyRevenue > 0 ? (collectedRevenue / monthlyRevenue) * 100 : 0;

  const rows = [
    { label: t('finance.totalInvoice'), value: monthlyRevenue, pct: 100,                        barColor: 'bg-violet-400' },
    { label: t('finance.collected'),    value: collectedRevenue, pct: (collectedRevenue / max) * 100, barColor: 'bg-emerald-500' },
    { label: t('finance.overdue'),      value: overdueAmount,    pct: (overdueAmount / max) * 100,    barColor: 'bg-red-400'    },
  ];

  return (
    <div className="space-y-4 mt-1">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-500">{r.label}</span>
            <span className="text-xs font-semibold text-gray-800">{fmt(r.value)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${r.barColor}`}
              style={{ width: `${Math.min(100, Math.max(0, r.pct))}%` }}
            />
          </div>
        </div>
      ))}
      <div className="pt-3 mt-1 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400">{t('finance.collectionRate')}</span>
        <span className={`text-sm font-bold ${collectionPct >= 80 ? 'text-emerald-600' : collectionPct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
          {collectionPct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function ActionItems({ items }: {
  items: { label: string; value: number; urgent: boolean; to: string }[];
}) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const sorted = [...items].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return b.value - a.value;
  });

  return (
    <div className="space-y-2 mt-1">
      {sorted.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">{t('noActionItems')}</p>
      )}
      {sorted.map((item) => {
        const isAlert = item.urgent && item.value > 0;
        return (
          <button
            type="button"
            key={item.label}
            onClick={() => navigate(item.to)}
            className={`flex w-full items-center justify-between py-2.5 px-3 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isAlert ? 'bg-red-50 hover:bg-red-100' : 'bg-gray-50 hover:bg-gray-100'}`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${isAlert ? 'bg-red-500' : 'bg-gray-300'}`} />
              <span className={`text-sm truncate ${isAlert ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
                {item.label}
              </span>
            </div>
            <Badge
              variant={isAlert ? 'destructive' : 'secondary'}
              className="ml-3 shrink-0 min-w-[26px] justify-center text-xs"
            >
              {item.value}
            </Badge>
            <ArrowUpRight size={13} className="ml-2 shrink-0 text-gray-400" />
          </button>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { selectedMallId, selectedMallName } = useMallStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const queryKey = ['dashboard', selectedMallId];
  const { data, isLoading, isError, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey,
    queryFn: () => dashboardApi.getDashboard(selectedMallId ?? undefined),
    refetchInterval: 60_000,
  });
  const handleForceRefresh = () => queryClient.fetchQuery({
    queryKey,
    queryFn: () => dashboardApi.getDashboard(selectedMallId ?? undefined, true),
  });
  const d = data?.data ?? data;
  const bookingStats = d?.bookingStats;
  const focusAreas: string[] = d?.focusAreas ?? ['overview'];
  const linkTo = (path: string) => (canAccessPath(user?.role, path) ? path : undefined);

  const showOccupancy = focusAreas.some((f) => ['occupancy', 'pipeline', 'overview', 'booking'].includes(f));
  const showFinance   = focusAreas.some((f) => ['billing', 'sales', 'overview'].includes(f));
  const showOperations = focusAreas.some((f) => ['tickets', 'fitout', 'overview'].includes(f));
  const showLeasing   = focusAreas.some((f) => ['booking', 'pipeline', 'overview'].includes(f));
  const showApprovals = focusAreas.some((f) => ['approvals', 'pipeline', 'overview'].includes(f));
  const showContracts = focusAreas.some((f) => ['contracts', 'pipeline', 'overview'].includes(f));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-44 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border border-gray-100 shadow-sm">
              <CardContent className="pt-5">
                <Skeleton className="h-3 w-24 mb-3" />
                <Skeleton className="h-7 w-20 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }
  if (isError) {
    return <AsyncState isLoading={false} isError onRetry={refetch} errorTitle={t('error.loadFailed')}><div /></AsyncState>;
  }

  const otherArea = (d?.totalArea ?? 0) - (d?.leasedArea ?? 0) - (d?.vacantArea ?? 0);
  const today = new Date().toLocaleDateString('vi-VN', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
  const attentionTotal = (d?.overdueCount ?? 0) + (d?.pendingApprovals ?? 0) + (d?.expiringIn30 ?? 0) + (bookingStats?.expiringSoon ?? 0) + (d?.openTickets ?? 0);
  const healthScore: number | null = d?.healthScore ?? null;
  const healthLabel = healthScore === null ? '' : healthScore >= 85
    ? t('health.positive')
    : healthScore >= 70
    ? t('health.stable')
    : t('health.needsWork');

  const actionItems = ([
    showApprovals && { label: t('actionItems.pendingApprovals'), value: d?.pendingApprovals ?? 0, urgent: false, to: '/approvals' },
    showFinance  && { label: t('actionItems.overdueInvoices'), value: d?.overdueCount ?? 0, urgent: true, to: '/billing?status=OVERDUE' },
    (showLeasing || showFinance || showContracts) && { label: t('actionItems.expiringContracts30'), value: d?.expiringIn30 ?? 0, urgent: true, to: '/contracts?expiring=30' },
    (showLeasing || showFinance || showContracts) && { label: t('actionItems.expiringContracts90'), value: d?.expiringIn90 ?? 0, urgent: false, to: '/contracts?expiring=90' },
    showOperations && { label: t('actionItems.openTickets'), value: d?.openTickets ?? 0, urgent: false, to: '/tickets?queue=open' },
    showLeasing  && { label: t('actionItems.expiringBookings'), value: bookingStats?.expiringSoon ?? 0, urgent: true, to: '/bookings?expiringSoon=true' },
  ].filter(Boolean) as { label: string; value: number; urgent: boolean; to: string }[])
    .filter((item) => canAccessPath(user?.role, item.to));

  return (
    <div className="-m-4 min-h-full space-y-6 bg-[radial-gradient(circle_at_top_right,_rgba(219,234,254,0.55),_transparent_32%),linear-gradient(to_bottom,_#f8fafc,_#ffffff_26rem)] p-4 sm:-m-6 sm:p-6">
      <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(125deg,#071426_0%,#0b2441_48%,#0d4f55_100%)] px-5 py-6 text-white shadow-[0_30px_80px_-35px_rgba(2,20,35,0.75)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-cyan-200/10 bg-cyan-300/5" />
        <div className="pointer-events-none absolute right-16 top-8 h-40 w-40 rounded-full border border-white/5" />
        <div className="relative grid gap-7 xl:grid-cols-[1.35fr_1fr] xl:items-end">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-100"><Sparkles size={12} /> {t('executiveIntelligence')}</span>
              <span className="text-xs text-slate-300">{today}</span>
            </div>
            <p className="text-sm font-medium text-cyan-100/80">{t('subtitle', { mall: selectedMallName })}</p>
            <h1 className="mt-2 max-w-3xl text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">{t('tagline')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{t('description')}</p>
          </div>
          <div className={`grid ${['grid-cols-1', 'grid-cols-2', 'grid-cols-3'][(healthScore !== null ? 1 : 0) + (showOccupancy ? 1 : 0)]} overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] backdrop-blur-sm`}>
            {healthScore !== null && (
              <div className="border-r border-white/10 p-4 sm:p-5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Activity size={12} /> {t('health.label')}</div>
                <div className="mt-2 text-2xl font-semibold sm:text-3xl">{healthScore}<span className="text-sm text-slate-400">/100</span></div>
                <p className="mt-1 text-[11px] text-cyan-100">{healthLabel}</p>
              </div>
            )}
            {showOccupancy && (
              <div className="border-r border-white/10 p-4 sm:p-5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('occupancy.label')}</div>
                <div className="mt-2 text-2xl font-semibold sm:text-3xl">{d?.occupancyRate ?? 0}<span className="text-sm text-slate-400">%</span></div>
                <p className="mt-1 text-[11px] text-slate-300">{fmtArea(d?.leasedArea ?? 0)}</p>
              </div>
            )}
            <button type="button" onClick={() => document.getElementById('executive-actions')?.scrollIntoView({ behavior: 'smooth' })} className="group p-4 text-left transition-colors hover:bg-white/10 sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('needsAttention')}</div>
              <div className="mt-2 flex items-center gap-1 text-2xl font-semibold text-amber-300 sm:text-3xl">{attentionTotal}<ChevronRight size={17} className="transition-transform group-hover:translate-x-1" /></div>
              <p className="mt-1 text-[11px] text-slate-300">{t('openPriorityList')}</p>
            </button>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><ShieldCheck size={17} className="text-emerald-600" /><h2 className="text-lg font-semibold tracking-tight text-slate-950">{t('keyMetrics')}</h2></div>
          <p className="mt-1 text-xs text-slate-500">{t('roleDataRefresh', { role: user?.role?.replace(/_/g, ' ') })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {focusAreas.filter((f) => f !== 'overview').slice(0, 3).map((f) => (
            <Badge key={f} variant="outline" className="border-slate-200 bg-white text-xs text-slate-600">
              {t(`focusAreas.${f}`, f)}
            </Badge>
          ))}
          <span className="text-xs text-gray-400">
            {dataUpdatedAt ? t('common:messages.dataUpdated', { time: new Date(dataUpdatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) }) : ''}
          </span>
          <Button variant="outline" size="sm" onClick={handleForceRefresh} disabled={isFetching} className="gap-1.5 rounded-xl border-slate-200 bg-white shadow-sm">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            {t('common:actions.refresh')}
          </Button>
        </div>
      </div>

      {/* KPI Row 1: Occupancy + Finance */}
      {(showOccupancy || showFinance) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {showOccupancy && (
            <>
              <StatCard
                title={t('stats.occupancyRate')}
                value={`${d?.occupancyRate ?? 0}%`}
                sub={`${fmtArea(d?.leasedArea ?? 0)} / ${fmtArea(d?.totalArea ?? 0)}`}
                icon={Building2}
                color="blue"
                to={linkTo('/spaces')}
              />
              <StatCard
                title={t('stats.tenants')}
                value={d?.totalTenants ?? 0}
                sub={t('stats.activeContracts')}
                icon={Users}
                color="green"
                to={linkTo('/contracts?status=ACTIVE')}
              />
            </>
          )}
          {showFinance && (
            <>
              <StatCard
                title={t('stats.monthlyRevenue')}
                value={fmt(d?.monthlyRevenue ?? 0)}
                sub={t('stats.collectedRevenue', { amount: fmt(d?.collectedRevenue ?? 0) })}
                icon={TrendingUp}
                color="purple"
                to={linkTo('/billing')}
              />
              <StatCard
                title={t('stats.overdueDebt')}
                value={fmt(d?.overdueAmount ?? 0)}
                sub={t('stats.overdueInvoices', { count: d?.overdueCount ?? 0 })}
                icon={DollarSign}
                color="red"
                badge={(d?.overdueCount ?? 0) > 0 ? { text: t('badges.needsAction'), variant: 'destructive' } : undefined}
                to={linkTo('/billing?status=OVERDUE')}
              />
            </>
          )}
        </div>
      )}

      {/* KPI Row 2: Leasing + Operations */}
      {(showLeasing || showApprovals || showContracts || showFinance || showOperations) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {showLeasing && (
            <>
              <StatCard
                title={t('stats.activeBookings')}
                value={bookingStats?.active ?? 0}
                sub={t('stats.pendingBookings', { count: bookingStats?.pending ?? 0 })}
                icon={BookmarkCheck}
                color="yellow"
                to={linkTo('/bookings')}
              />
              <StatCard
                title={t('stats.expiringBookings')}
                value={bookingStats?.expiringSoon ?? 0}
                icon={Clock}
                color="red"
                badge={(bookingStats?.expiringSoon ?? 0) > 0 ? { text: t('badges.urgent'), variant: 'destructive' } : undefined}
                to={linkTo('/bookings?expiringSoon=true')}
              />
            </>
          )}
          {showApprovals && (
            <StatCard
              title={t('stats.pendingApprovals')}
              value={d?.pendingApprovals ?? 0}
              sub={t('stats.dealsInPipeline')}
              icon={CheckSquare}
              color="blue"
              to={linkTo('/approvals')}
            />
          )}
          {(showLeasing || showFinance || showContracts) && (
            <StatCard
              title={t('stats.expiringContracts30')}
              value={d?.expiringIn30 ?? 0}
              sub={t('stats.expiringContracts90', { count: d?.expiringIn90 ?? 0 })}
              icon={AlertTriangle}
              color="red"
              badge={(d?.expiringIn30 ?? 0) > 0 ? { text: t('badges.expiring'), variant: 'destructive' } : undefined}
              to={linkTo('/contracts?expiring=30')}
            />
          )}
          {showOperations && (
            <StatCard
              title={t('stats.openTickets')}
              value={d?.openTickets ?? 0}
              sub={t('stats.openTicketsDesc')}
              icon={Ticket}
              color="purple"
              to={linkTo('/tickets?queue=open')}
            />
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {showOccupancy && (
          <Card className="rounded-2xl border border-slate-200/70 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.5)]">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-semibold text-slate-900">{t('occupancy.chart')}</CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">{t('occupancy.totalNla', { area: fmtArea(d?.totalArea ?? 0) })}</p>
            </CardHeader>
            <CardContent className="pt-2">
              <OccupancyDonut
                leasedArea={d?.leasedArea ?? 0}
                vacantArea={d?.vacantArea ?? 0}
                otherArea={otherArea}
                occupancyRate={d?.occupancyRate ?? 0}
              />
              <OccupancyLegend
                leasedArea={d?.leasedArea ?? 0}
                vacantArea={d?.vacantArea ?? 0}
                otherArea={otherArea}
              />
            </CardContent>
          </Card>
        )}

        {showFinance && (
          <Card className="rounded-2xl border border-slate-200/70 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.5)]">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-semibold text-slate-900">{t('finance.cashflow')}</CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">{t('finance.currentMonth')}</p>
            </CardHeader>
            <CardContent className="pt-2">
              <BillingProgress
                monthlyRevenue={d?.monthlyRevenue ?? 0}
                collectedRevenue={d?.collectedRevenue ?? 0}
                overdueAmount={d?.overdueAmount ?? 0}
              />
            </CardContent>
          </Card>
        )}

        <Card id="executive-actions" className="scroll-mt-6 rounded-2xl border border-slate-200/70 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.5)]">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900"><AlertTriangle size={15} className="text-amber-500" /> {t('executiveActions')}</CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">{t('executiveActionsDesc')}</p>
          </CardHeader>
          <CardContent className="pt-2">
            <ActionItems items={actionItems} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
