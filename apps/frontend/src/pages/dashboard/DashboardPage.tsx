import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dashboardApi, reportsApi, analyticsApi, billingApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { useAuthStore } from '@/store/auth.store';
import { canAccessPath, canAccessModule } from '@/lib/permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncState } from '@/components/ui/async-state';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ERPSection, ERPStatusBadge } from '@/components/erp';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowUpRight, Info, RefreshCw, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoneyWithCode } from '@/lib/currency';
import { ERP_TONE_TEXT_CLASSES, type ERPTone } from '@/lib/erp-tones';

function formatArea(value: number) {
  return `${Math.round(Math.max(0, value)).toLocaleString('vi-VN')} m²`;
}

const FINANCE_STAFF_ROLES = new Set(['ADMIN', 'FINANCE', 'MALL_DIRECTOR']);

function FinancialMetric({ label, value, sub, tone = 'neutral', to, primary = false }: {
  label: string;
  value: string;
  sub?: string;
  tone?: ERPTone;
  to?: string;
  primary?: boolean;
}) {
  const navigate = useNavigate();
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {to && <ArrowUpRight size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
      </div>
      <div className={cn(
        'mt-1.5 break-words font-semibold leading-tight tabular-nums text-foreground',
        primary ? 'text-[clamp(1.125rem,1.55vw,1.5rem)]' : 'text-[clamp(1rem,1.3vw,1.25rem)]',
        tone !== 'neutral' && ERP_TONE_TEXT_CLASSES[tone],
      )}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] leading-none text-muted-foreground">{sub}</div>}
    </>
  );

  const classes = cn(
    'min-w-0 py-3 text-left',
    to && 'transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
  );

  if (!to) return <div className={classes}>{content}</div>;
  return <button type="button" className={classes} onClick={() => navigate(to)}>{content}</button>;
}

type WorkPriority = 'critical' | 'high' | 'normal';
interface WorkItem {
  label: string;
  context: string;
  detail?: string;
  value: number;
  priority: WorkPriority;
  action: string;
  to: string;
}

const PRIORITY_WEIGHT: Record<WorkPriority, number> = { critical: 3, high: 2, normal: 1 };
const PRIORITY_TONE: Record<WorkPriority, ERPTone> = { critical: 'danger', high: 'warning', normal: 'neutral' };

function Worklist({ items, emptyLabel }: { items: WorkItem[]; emptyLabel: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation('dashboard');
  const priorityLabel: Record<WorkPriority, string> = {
    critical: t('worklist.priorityCritical'),
    high: t('worklist.priorityHigh'),
    normal: t('worklist.priorityNormal'),
  };
  const sorted = [...items].sort((a, b) => {
    if (a.priority !== b.priority) return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    return b.value - a.value;
  });

  if (sorted.length === 0) {
    return <p className="py-7 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="divide-y divide-border">
      {sorted.map((item) => {
        const critical = item.priority === 'critical';
        return (
          <div
            key={item.label}
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-l-2 px-3 py-2.5 sm:px-4',
              critical ? 'border-l-destructive bg-destructive/[0.035]' : item.priority === 'high' ? 'border-l-amber-500' : 'border-l-transparent',
            )}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <ERPStatusBadge tone={PRIORITY_TONE[item.priority]} className="px-1.5 py-0 text-[9px] uppercase tracking-wide">
                  {priorityLabel[item.priority]}
                </ERPStatusBadge>
                <span className={cn('truncate text-sm font-medium', critical ? ERP_TONE_TEXT_CLASSES.danger : 'text-foreground')}>{item.label}</span>
              </div>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs tabular-nums">
                <span className="text-muted-foreground">{item.context}</span>
                {item.detail && <span className="font-semibold text-foreground">{item.detail}</span>}
              </div>
            </div>
            <Button
              type="button"
              variant={critical ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2.5 text-xs shadow-none"
              onClick={() => navigate(item.to)}
            >
              {item.action}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function OccupancyBar({ leasedArea, vacantArea, otherArea }: { leasedArea: number; vacantArea: number; otherArea: number }) {
  const total = Math.max(1, leasedArea + vacantArea + otherArea);
  const percent = (value: number) => Math.max(0, (value / total) * 100);
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-sm bg-muted" aria-hidden="true">
      <div className="bg-primary" style={{ width: `${percent(leasedArea)}%` }} />
      <div className="bg-amber-400" style={{ width: `${percent(otherArea)}%` }} />
      <div className="bg-muted" style={{ width: `${percent(vacantArea)}%` }} />
    </div>
  );
}

function PortfolioRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-xs leading-5 text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-semibold leading-5 tabular-nums text-foreground">
        {value}
        {sub && <span className="ml-1.5 block text-[10px] font-normal leading-4 text-muted-foreground xl:inline">{sub}</span>}
      </span>
    </div>
  );
}

interface FinancialScale { divisor: number; unit: string }

function financialScale(values: number[], t: (key: string) => string): FinancialScale {
  const peak = Math.max(0, ...values.map((value) => Math.abs(value)));
  if (peak >= 1_000_000_000) return { divisor: 1_000_000_000, unit: t('trend.unitBillionVnd') };
  if (peak >= 1_000_000) return { divisor: 1_000_000, unit: t('trend.unitMillionVnd') };
  if (peak >= 1_000) return { divisor: 1_000, unit: t('trend.unitThousandVnd') };
  return { divisor: 1, unit: t('trend.unitVnd') };
}

function axisValue(value: number, scale: FinancialScale) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value / scale.divisor);
}

function periodLabel(period: string, prefix: string) {
  const [year, month] = period.split('-');
  return month && year ? `${prefix} ${month}/${year}` : period;
}

function EmptyTrend({ height }: { height: number }) {
  const { t } = useTranslation('dashboard');
  return <div className="flex items-center justify-center px-4 text-xs text-muted-foreground" style={{ height }}>{t('trend.noData')}</div>;
}

function ChartFrame({ title, unit, children, compact = false }: {
  title: string;
  unit: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <ERPSection
      className="min-w-0"
      title={<span className={compact ? 'text-xs' : 'text-sm'}>{title}</span>}
      actions={<span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{unit}</span>}
      noPadding
    >
      {children}
    </ERPSection>
  );
}

export default function DashboardPage() {
  const [leaseTermType, setLeaseTermType] = useState<'LONG' | 'SHORT'>('LONG');
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
  const rawDashboard = data?.data ?? data;
  const d = rawDashboard?.byLeaseTerm?.[leaseTermType]
    ? { ...rawDashboard, ...rawDashboard.byLeaseTerm[leaseTermType] }
    : rawDashboard;
  const bookingStats = d?.bookingStats;
  const focusAreas: string[] = d?.focusAreas ?? ['overview'];
  const linkTo = (path: string) => (canAccessPath(user?.role, path) ? path : undefined);

  const showOccupancy = focusAreas.some((focus) => ['occupancy', 'pipeline', 'overview', 'booking'].includes(focus));
  const showFinance = focusAreas.some((focus) => ['billing', 'sales', 'overview'].includes(focus));
  const showOperations = focusAreas.some((focus) => ['tickets', 'fitout', 'overview'].includes(focus));
  const showLeasing = focusAreas.some((focus) => ['booking', 'pipeline', 'overview'].includes(focus));
  const showApprovals = focusAreas.some((focus) => ['approvals', 'pipeline', 'overview'].includes(focus));
  const showContracts = focusAreas.some((focus) => ['contracts', 'pipeline', 'overview'].includes(focus));

  const currentYear = new Date().getFullYear();
  const currentPeriod = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const canSeeReports = canAccessModule(user?.role, 'reports') && showFinance;
  const canSeeAnalytics = canAccessModule(user?.role, 'analytics') && showOccupancy;
  const canSeeCollectionKpi = !!user?.role && FINANCE_STAFF_ROLES.has(user.role) && showFinance;

  const { data: revenueTrendRaw, isLoading: revenueTrendLoading } = useQuery({
    queryKey: ['dashboard-revenue-trend', currentYear, selectedMallId],
    queryFn: () => reportsApi.revenueReport({ year: currentYear, mallId: selectedMallId ?? undefined }),
    enabled: canSeeReports,
  });
  const revenueTrend: { period: string; total: number; paid: number }[] =
    ((revenueTrendRaw?.data ?? revenueTrendRaw)?.byPeriod ?? []).filter((point: { period: string }) => point.period <= currentPeriod);

  const { data: occupancyTrendRaw, isLoading: occupancyTrendLoading } = useQuery({
    queryKey: ['dashboard-occupancy-trend', selectedMallId],
    queryFn: () => analyticsApi.getOccupancyTrend({ mallId: selectedMallId ?? undefined, months: 6 }),
    enabled: canSeeAnalytics,
  });
  const occupancyTrend: { period: string; occupancyRate: number }[] =
    Array.isArray(occupancyTrendRaw) ? occupancyTrendRaw : (occupancyTrendRaw?.data ?? []);

  const { data: collectionKpiRaw, isLoading: collectionKpiLoading } = useQuery({
    queryKey: ['dashboard-collection-kpi', selectedMallId],
    queryFn: () => billingApi.getCollectionKpi(6, selectedMallId ?? undefined),
    enabled: canSeeCollectionKpi,
  });
  const collectionKpi = collectionKpiRaw?.data ?? collectionKpiRaw ?? {};
  const arTrend: { period: string; current: number; overdue: number }[] = collectionKpi.agingTrend ?? [];
  const revenueScale = financialScale(revenueTrend.flatMap((point) => [point.total, point.paid]), (key) => t(key));
  const arScale = financialScale(arTrend.flatMap((point) => [point.current, point.overdue]), (key) => t(key));
  const revenueHasSignal = revenueTrend.length >= 2 && revenueTrend.some((point) => point.total !== 0 || point.paid !== 0);
  const arHasSignal = arTrend.length >= 2 && arTrend.some((point) => point.current !== 0 || point.overdue !== 0);
  const occupancyHasSignal = occupancyTrend.length >= 2;
  const trendCardsVisible = [canSeeReports, canSeeAnalytics, canSeeCollectionKpi].filter(Boolean).length;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="px-3 py-3">
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Skeleton className="h-56 lg:col-span-2" />
          <Skeleton className="h-56" />
        </div>
      </div>
    );
  }
  if (isError) {
    return <AsyncState isLoading={false} isError onRetry={refetch} errorTitle={t('error.loadFailed')}><div /></AsyncState>;
  }

  const otherArea = Math.max(0, (d?.totalArea ?? 0) - (d?.leasedArea ?? 0) - (d?.vacantArea ?? 0));
  const uncollected = Math.max(0, (d?.monthlyRevenue ?? 0) - (d?.collectedRevenue ?? 0));
  const healthScore: number | null = d?.healthScore ?? null;
  const hasBlendFormula = typeof d?.occupancyRate === 'number' && typeof d?.collectionRate === 'number';
  const hasCollectionOnly = !hasBlendFormula && typeof d?.collectionRate === 'number';
  const healthMethodology = hasBlendFormula
    ? t('portfolio.healthFormulaBlend', { occupancy: d.occupancyRate, collection: d.collectionRate })
    : hasCollectionOnly
      ? t('portfolio.healthFormulaCollection', { collection: d.collectionRate })
      : t('portfolio.healthFormulaOccupancy', { occupancy: d?.occupancyRate ?? 0 });

  const workItems = ([
    showFinance && {
      label: t('actionItems.overdueInvoices'),
      context: t('stats.overdueInvoices', { count: d?.overdueCount ?? 0 }),
      detail: formatMoneyWithCode(d?.overdueAmount ?? 0, 'VND'),
      value: d?.overdueCount ?? 0,
      priority: 'critical', action: t('worklist.process'), to: '/billing?status=OVERDUE',
    },
    (showLeasing || showFinance || showContracts) && {
      label: t('actionItems.expiringContracts30'),
      context: t('worklist.contractContext', { count: d?.expiringIn30 ?? 0 }),
      value: d?.expiringIn30 ?? 0,
      priority: 'high', action: t('worklist.view'), to: '/contracts?expiring=30',
    },
    showOperations && {
      label: t('actionItems.fitoutSlaBreaches'),
      context: t('worklist.projectContext', { count: d?.openFitoutSlaBreaches ?? 0 }),
      value: d?.openFitoutSlaBreaches ?? 0,
      priority: 'high', action: t('worklist.view'), to: '/fitout/dashboard',
    },
    showLeasing && {
      label: t('actionItems.expiringBookings'),
      context: t('worklist.bookingContext', { count: bookingStats?.expiringSoon ?? 0 }),
      value: bookingStats?.expiringSoon ?? 0,
      priority: 'high', action: t('worklist.view'), to: '/bookings?expiringSoon=true',
    },
    showApprovals && {
      label: t('actionItems.pendingApprovals'),
      context: t('worklist.approvalContext', { count: d?.pendingApprovals ?? 0 }),
      value: d?.pendingApprovals ?? 0,
      priority: 'normal', action: t('worklist.approve'), to: '/approvals',
    },
    showOperations && {
      label: t('actionItems.openTickets'),
      context: t('worklist.ticketContext', { count: d?.openTickets ?? 0 }),
      value: d?.openTickets ?? 0,
      priority: 'normal', action: t('worklist.view'), to: '/tickets?queue=open',
    },
  ].filter(Boolean) as WorkItem[]).filter((item) => item.value > 0 && canAccessPath(user?.role, item.to));

  return (
    <div className="min-w-0 space-y-3 bg-muted/20 pb-5 pt-2">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border border-t-2 border-t-primary bg-card px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <h1 className="text-base font-semibold tracking-tight text-foreground">{t('title')}</h1>
            {selectedMallName && <span className="truncate text-xs font-medium text-muted-foreground">/ {selectedMallName}</span>}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {t('roleDataRefresh', { role: user?.role?.replace(/_/g, ' ') })}
            {dataUpdatedAt ? ` · ${t('header.lastRefresh', { time: new Date(dataUpdatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) })}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5" aria-label={t('header.leaseTerm')}>
            {(['LONG', 'SHORT'] as const).map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => setLeaseTermType(term)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  leaseTermType === term ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-background',
                )}
              >
                {term === 'LONG' ? t('header.longTerm') : t('header.shortTerm')}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleForceRefresh} disabled={isFetching} className="h-7 gap-1.5 px-2.5 shadow-none">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
            {t('common:actions.refresh')}
          </Button>
        </div>
      </header>

      {showFinance && (
        <section aria-labelledby="financial-intelligence-title" className="min-w-0 border-y border-border border-t-2 border-t-primary bg-card sm:border-x">
          <div className="flex items-center justify-between bg-muted/35 px-4 py-1.5">
            <h2 id="financial-intelligence-title" className="text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground">{t('strip.title')}</h2>
            <span className="text-[10px] text-muted-foreground">{t('strip.exactValues')}</span>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-1 px-4 sm:grid-cols-2 lg:grid-cols-5">
            <FinancialMetric label={t('strip.revenue')} value={formatMoneyWithCode(d?.monthlyRevenue ?? 0, 'VND')} sub={t('strip.currentPeriod')} tone="brand" to={linkTo('/billing')} primary />
            <FinancialMetric label={t('strip.collected')} value={formatMoneyWithCode(d?.collectedRevenue ?? 0, 'VND')} sub={t('strip.collectedPeriod')} tone="success" to={linkTo('/billing')} />
            <FinancialMetric label={t('strip.uncollected')} value={formatMoneyWithCode(uncollected, 'VND')} sub={t('strip.outstandingPeriod')} tone="warning" to={linkTo('/billing')} />
            <FinancialMetric
              label={t('strip.overdue')}
              value={formatMoneyWithCode(d?.overdueAmount ?? 0, 'VND')}
              sub={t('stats.overdueInvoices', { count: d?.overdueCount ?? 0 })}
              tone="danger"
              to={linkTo('/billing?status=OVERDUE')}
            />
            {showOccupancy && (
              <FinancialMetric label={t('strip.occupancy')} value={`${d?.occupancyRate ?? 0}%`} sub={`${formatArea(d?.leasedArea ?? 0)} / ${formatArea(d?.totalArea ?? 0)}`} to={linkTo('/spaces')} />
            )}
          </div>
        </section>
      )}
      {!showFinance && showOccupancy && (
        <section className="max-w-sm overflow-hidden border border-border bg-card">
          <FinancialMetric label={t('strip.occupancy')} value={`${d?.occupancyRate ?? 0}%`} sub={formatArea(d?.leasedArea ?? 0)} to={linkTo('/spaces')} primary />
        </section>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
        <ERPSection
          className="min-w-0 border-t-2 border-t-primary lg:col-span-2"
          title={<span className="flex items-center gap-2"><AlertTriangle size={13} className="text-amber-500" aria-hidden="true" />{t('worklist.title')}</span>}
          description={t('worklist.description')}
          actions={<span className="text-xs font-semibold tabular-nums text-foreground">{t('worklist.queueCount', { count: workItems.length })}</span>}
          noPadding
        >
          <Worklist items={workItems} emptyLabel={t('noActionItems')} />
        </ERPSection>

        <ERPSection className="min-w-0" title={t('portfolio.title')} noPadding>
          <div className="px-3 pb-2 pt-2.5 sm:px-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('strip.occupancy')}</p>
                <p className="mt-1 text-3xl font-semibold leading-none tabular-nums text-foreground">{d?.occupancyRate ?? 0}%</p>
              </div>
              <p className="text-right text-xs font-medium tabular-nums text-foreground">{formatArea(d?.leasedArea ?? 0)} / {formatArea(d?.totalArea ?? 0)}</p>
            </div>
            <div className="mt-3"><OccupancyBar leasedArea={d?.leasedArea ?? 0} vacantArea={d?.vacantArea ?? 0} otherArea={otherArea} /></div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] tabular-nums text-muted-foreground">
              <span><strong className="block font-semibold text-foreground">{formatArea(d?.leasedArea ?? 0)}</strong>{t('occupancy.leased')}</span>
              <span><strong className="block font-semibold text-foreground">{formatArea(d?.vacantArea ?? 0)}</strong>{t('occupancy.vacant')}</span>
              <span className="text-right"><strong className="block font-semibold text-foreground">{formatArea(d?.totalArea ?? 0)}</strong>{t('occupancy.total')}</span>
            </div>
          </div>
          <div className="divide-y divide-border px-3 sm:px-4">
            {typeof d?.totalTenants === 'number' && <PortfolioRow label={t('portfolio.activeTenants')} value={d.totalTenants} />}
            {bookingStats && <PortfolioRow label={t('portfolio.activeBookings')} value={bookingStats.active ?? 0} sub={t('portfolio.pendingBookings', { count: bookingStats.pending ?? 0 })} />}
            {typeof d?.expiringIn30 === 'number' && <PortfolioRow label={t('portfolio.expiringContracts')} value={d.expiringIn30} sub={t('portfolio.expiringContracts90', { count: d?.expiringIn90 ?? 0 })} />}
          </div>
          {healthScore !== null && (
            <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/25 px-3 py-2 sm:px-4">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[11px] text-muted-foreground">{t('portfolio.healthScore')}</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('portfolio.healthMethodology')}>
                      <Info size={13} aria-hidden="true" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 rounded-md border-border bg-card p-3 text-foreground">
                    <p className="text-xs font-semibold">{t('portfolio.healthMethodology')}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{healthMethodology}</p>
                    <p className="mt-2 border-t border-border pt-2 text-[11px] font-medium leading-4 text-muted-foreground">{t('portfolio.healthDisclaimer')}</p>
                  </PopoverContent>
                </Popover>
              </div>
              <span className="text-sm font-semibold tabular-nums text-foreground">{healthScore}<span className="text-[10px] font-normal text-muted-foreground">/100</span></span>
            </div>
          )}
        </ERPSection>
      </div>

      {trendCardsVisible > 0 && (
        <section aria-labelledby="business-trends-title">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <h2 id="business-trends-title" className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground">{t('trend.title')}</h2>
            <span className="text-[10px] text-muted-foreground">{t('trend.tooltipPrecision')}</span>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
            {canSeeReports && (
              <div className={cn('min-w-0 lg:col-span-2', !revenueHasSignal && 'lg:col-span-1')}>
                <ChartFrame title={t('trend.revenue')} unit={revenueScale.unit}>
                  {!revenueTrendLoading && !revenueHasSignal ? <EmptyTrend height={64} /> : (
                    <div className="px-2 pb-2 pt-2">
                      <ResponsiveContainer width="100%" height={196}>
                        <AreaChart data={revenueTrend} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={(period: string) => period.slice(5)} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(value: number) => axisValue(value, revenueScale)} axisLine={false} tickLine={false} width={42} tickCount={5} />
                          <Tooltip
                            formatter={(value: number) => formatMoneyWithCode(value, 'VND')}
                            labelFormatter={(label: string) => periodLabel(label, t('trend.month'))}
                            contentStyle={{ fontSize: 11, borderRadius: 4, borderColor: 'hsl(var(--border))' }}
                          />
                          <Area type="monotone" dataKey="total" name={t('finance.totalInvoice')} stroke="#2563eb" fill="#2563eb" fillOpacity={0.09} strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="paid" name={t('finance.collected')} stroke="#059669" strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartFrame>
              </div>
            )}
            <div className={cn('grid min-w-0 gap-3', !canSeeReports && 'lg:col-span-3 lg:grid-cols-2', !revenueHasSignal && canSeeReports && 'lg:col-span-2 lg:grid-cols-2')}>
              {canSeeCollectionKpi && (
                <ChartFrame title={t('trend.ar')} unit={arScale.unit} compact>
                  {!collectionKpiLoading && !arHasSignal ? <EmptyTrend height={48} /> : (
                    <div className="px-2 pb-2 pt-2">
                      <ResponsiveContainer width="100%" height={80}>
                        <LineChart data={arTrend} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="period" tick={{ fontSize: 9 }} tickFormatter={(period: string) => period.slice(5)} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9 }} tickFormatter={(value: number) => axisValue(value, arScale)} axisLine={false} tickLine={false} width={34} tickCount={3} />
                          <Tooltip
                            formatter={(value: number) => formatMoneyWithCode(value, 'VND')}
                            labelFormatter={(label: string) => periodLabel(label, t('trend.month'))}
                            contentStyle={{ fontSize: 11, borderRadius: 4, borderColor: 'hsl(var(--border))' }}
                          />
                          <Line type="monotone" dataKey="current" name={t('trend.current')} stroke="#059669" strokeWidth={1.75} dot={false} />
                          <Line type="monotone" dataKey="overdue" name={t('trend.overdue')} stroke="#dc2626" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartFrame>
              )}
              {canSeeAnalytics && (
                <ChartFrame title={t('trend.occupancy')} unit={t('trend.unitPercent')} compact>
                  {!occupancyTrendLoading && !occupancyHasSignal ? <EmptyTrend height={48} /> : (
                    <div className="px-2 pb-2 pt-2">
                      <ResponsiveContainer width="100%" height={80}>
                        <AreaChart data={occupancyTrend} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="period" tick={{ fontSize: 9 }} tickFormatter={(period: string) => period.slice(5)} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9 }} domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} axisLine={false} tickLine={false} width={30} tickCount={3} />
                          <Tooltip formatter={(value: number) => `${value}%`} labelFormatter={(label: string) => periodLabel(label, t('trend.month'))} contentStyle={{ fontSize: 11, borderRadius: 4, borderColor: 'hsl(var(--border))' }} />
                          <Area type="monotone" dataKey="occupancyRate" name={t('strip.occupancy')} stroke="#2563eb" fill="#2563eb" fillOpacity={0.08} strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartFrame>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <TrendingUp size={11} aria-hidden="true" />
        {focusAreas.filter((focus) => focus !== 'overview').slice(0, 4).map((focus) => t(`focusAreas.${focus}`, focus)).join(' · ')}
      </div>
    </div>
  );
}
