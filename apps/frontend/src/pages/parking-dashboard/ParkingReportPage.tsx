import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { parkingDashboardApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncState } from '@/components/ui/async-state';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ParkingCircle } from 'lucide-react';
import { formatMoney, formatMoneyCompact } from '@/lib/currency';

const PARKING_LOTS = [
  { code: 'sKVuws6s', name: 'Sala' },
  { code: 'e5GPYQMe', name: 'PHI' },
  { code: 'HVkrxUsp', name: 'PVT' },
];

// Money Domain Consolidation: Parking revenue has no currency field on the
// schema at all (currency-less by design, deferred to a future CR per
// CR-102's "Deferred to CR-103" list) -- VND is the platform's implicit unit.
function fmtVnd(n: number) {
  return formatMoneyCompact(n, 'VND');
}
function fmtVndFull(n: number) {
  return formatMoney(n, 'VND');
}

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { startTime: start.toISOString().slice(0, 10), finishTime: end.toISOString().slice(0, 10) };
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ParkingReportPage() {
  const { t } = useTranslation('parking');
  const [parkingCode, setParkingCode] = useState(PARKING_LOTS[0].code);
  const [revenueMonth, setRevenueMonth] = useState(currentMonth());
  const [trafficMonth, setTrafficMonth] = useState(currentMonth());

  const revenueRange = useMemo(() => monthRange(revenueMonth), [revenueMonth]);
  const trafficRange = useMemo(() => monthRange(trafficMonth), [trafficMonth]);

  const { data: kpi, isLoading: kpiLoading, isError: kpiError, refetch: refetchKpi } = useQuery({
    queryKey: ['parking-revenue-report', parkingCode],
    queryFn: () => parkingDashboardApi.revenueReport(parkingCode),
  });

  const { data: revenueChart, isLoading: revenueLoading, isError: revenueError, refetch: refetchRevenue } = useQuery({
    queryKey: ['parking-revenue-chart', parkingCode, revenueRange.startTime, revenueRange.finishTime],
    queryFn: () => parkingDashboardApi.revenueChart(parkingCode, revenueRange.startTime, revenueRange.finishTime),
  });

  const { data: trafficChart, isLoading: trafficLoading, isError: trafficError, refetch: refetchTraffic } = useQuery({
    queryKey: ['parking-transaction-chart', parkingCode, trafficRange.startTime, trafficRange.finishTime],
    queryFn: () => parkingDashboardApi.transactionChart(parkingCode, trafficRange.startTime, trafficRange.finishTime),
  });

  const k = kpi?.data ?? kpi;
  const revenueData: { label: string; value: number }[] = revenueChart?.data ?? revenueChart ?? [];
  const trafficData: { label: string; value: number }[] = trafficChart?.data ?? trafficChart ?? [];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ParkingCircle size={22} className="text-indigo-600" />
          <h1 className="text-xl font-semibold tracking-tight">{t('report.title', 'Báo cáo bãi đỗ xe')}</h1>
        </div>
        <select
          value={parkingCode}
          onChange={(e) => setParkingCode(e.target.value)}
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
        >
          {PARKING_LOTS.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
      </section>

      <AsyncState isLoading={kpiLoading} isError={kpiError} onRetry={refetchKpi} loading={
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      }>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500">{t('report.todayRevenue', 'Doanh thu hôm nay')}</p>
              <p className="text-xl font-bold" title={fmtVndFull(k?.todayRevenue ?? 0)}>{fmtVnd(k?.todayRevenue ?? 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500">{t('report.todayTransactions', 'Lượt hôm nay')}</p>
              <p className="text-xl font-bold">{(k?.totalTodayTransaction ?? 0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500">{t('report.lastMonthRevenue', 'Doanh thu tháng trước')}</p>
              <p className="text-xl font-bold" title={fmtVndFull(k?.totalRevenueLastMonth ?? 0)}>{fmtVnd(k?.totalRevenueLastMonth ?? 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500">{t('report.lastMonthTransactions', 'Lượt tháng trước')}</p>
              <p className="text-xl font-bold">{(k?.totalTransactionLastMonth ?? 0).toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>
      </AsyncState>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">{t('report.revenueByMonth', 'Doanh thu theo ngày')}</CardTitle>
            <input
              type="month"
              value={revenueMonth}
              onChange={(e) => setRevenueMonth(e.target.value)}
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
            />
          </CardHeader>
          <CardContent>
            <AsyncState isLoading={revenueLoading} isError={revenueError} onRetry={refetchRevenue}
              isEmpty={revenueData.length === 0}
              emptyTitle={t('report.empty', 'Chưa có dữ liệu')}
              loading={<Skeleton className="h-64" />}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => fmtVnd(v)} />
                  <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </AsyncState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">{t('report.trafficByMonth', 'Lượt xe theo ngày')}</CardTitle>
            <input
              type="month"
              value={trafficMonth}
              onChange={(e) => setTrafficMonth(e.target.value)}
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
            />
          </CardHeader>
          <CardContent>
            <AsyncState isLoading={trafficLoading} isError={trafficError} onRetry={refetchTraffic}
              isEmpty={trafficData.length === 0}
              emptyTitle={t('report.empty', 'Chưa có dữ liệu')}
              loading={<Skeleton className="h-64" />}
            >
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trafficData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </AsyncState>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
