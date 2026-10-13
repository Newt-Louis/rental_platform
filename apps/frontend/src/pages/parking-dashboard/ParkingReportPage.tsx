import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { parkingDashboardApi } from '@/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { AsyncState } from '@/components/ui/async-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ParkingCircle, Car } from 'lucide-react';
import { RevenueBreakdownCard } from './components/RevenueBreakdownCard';
import { RevenueVehicleLineChart } from './components/RevenueVehicleLineChart';
import { YearRangeControl } from './components/YearRangeControl';
import { TenantMultiSelect } from './components/TenantMultiSelect';

export default function ParkingReportPage() {
  const { t } = useTranslation('parking');
  const [parkingCodes, setParkingCodes] = useState<string[]>([]);
  // Stable query-key segment; also the "something selected" flag.
  const codesKey = parkingCodes.join(',');
  const currentYear = new Date().getFullYear();
  const [fromYear, setFromYear] = useState(currentYear - 2);
  const [toYear, setToYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const { data: tenantsRes } = useQuery({
    queryKey: ['parking-tenants'],
    queryFn: () => parkingDashboardApi.getTenants(),
  });
  const tenants: { parkingCode: string; name: string }[] = tenantsRes?.data ?? tenantsRes ?? [];
  // Default to the first lot once on load only — later the user may clear the selection to switch lots.
  const defaulted = useRef(false);
  useEffect(() => {
    if (!defaulted.current && tenants.length > 0) {
      defaulted.current = true;
      setParkingCodes([tenants[0].parkingCode]);
    }
  }, [tenants]);

  const {
    data: summaryRes,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['parking-monthly-summary', codesKey],
    queryFn: () => parkingDashboardApi.getMonthlySummary(parkingCodes),
    enabled: parkingCodes.length > 0,
  });
  const summary = summaryRes?.data ?? summaryRes;

  const {
    data: monthlyChartRes,
    isLoading: monthlyChartLoading,
    isError: monthlyChartError,
    refetch: refetchMonthlyChart,
  } = useQuery({
    queryKey: ['parking-daily-chart', codesKey, currentYear, month],
    queryFn: () => parkingDashboardApi.getRevenueVehicleChartByDay(parkingCodes, currentYear, month),
    enabled: parkingCodes.length > 0,
  });
  const monthlyChartData = monthlyChartRes?.data ?? monthlyChartRes ?? [];

  const {
    data: yearlyChartRes,
    isLoading: yearlyChartLoading,
    isError: yearlyChartError,
    refetch: refetchYearlyChart,
  } = useQuery({
    queryKey: ['parking-yearly-chart', codesKey, fromYear, toYear],
    queryFn: () => parkingDashboardApi.getRevenueVehicleChartByYear(parkingCodes, fromYear, toYear),
    enabled: parkingCodes.length > 0,
  });
  const yearlyChartData = yearlyChartRes?.data ?? yearlyChartRes ?? [];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <ParkingCircle size={22} className="text-indigo-600" />
          <h1 className="text-xl font-semibold tracking-tight">{t('report.title', 'Báo cáo bãi đỗ xe')}</h1>
        </div>
        <TenantMultiSelect tenants={tenants} value={parkingCodes} onChange={setParkingCodes} />
      </section>

      {parkingCodes.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-400">{t('report.pickTenant', 'Chọn ít nhất một bãi đỗ để xem báo cáo')}</p>
      )}

      {parkingCodes.length > 0 && (
        <>
          {/* Row 1: this-month / last-month revenue breakdown + vehicle count */}
          <AsyncState
            isLoading={summaryLoading}
            isError={summaryError}
            onRetry={refetchSummary}
            isEmpty={false}
            loading={
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <RevenueBreakdownCard
                title={t('report.thisMonthRevenue', 'Doanh Thu Tháng Này')}
                bucket={summary?.currentMonth}
                isLoading={summaryLoading}
              />
              <StatCard
                title={t('report.thisMonthVehicles', 'Lượt Xe Tháng Này')}
                value={(summary?.currentMonth?.vehicleCount ?? 0).toLocaleString()}
                icon={Car}
              />
              <RevenueBreakdownCard
                title={t('report.lastMonthRevenueTitle', 'Doanh Thu Tháng Trước')}
                bucket={summary?.previousMonth}
                isLoading={summaryLoading}
              />
              <StatCard
                title={t('report.lastMonthVehicles', 'Lượt Xe Tháng Trước')}
                value={(summary?.previousMonth?.vehicleCount ?? 0).toLocaleString()}
                icon={Car}
              />
            </div>
          </AsyncState>

          {/* Row 2: selected month of this year, by day (revenue) + vehicle type share (pie) */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">{t('report.month', 'Tháng')}</span>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="h-8 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>{`${m}/${currentYear}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <RevenueVehicleLineChart
                title={t('report.revenueChartTitle', 'Biểu Đồ Doanh Thu')}
                data={monthlyChartData}
                metric="revenue"
                isLoading={monthlyChartLoading}
                isError={monthlyChartError}
                onRetry={refetchMonthlyChart}
              />
              <RevenueVehicleLineChart
                title={t('report.vehicleChartTitle', 'Biểu Đồ Lượt Xe')}
                data={monthlyChartData}
                metric="vehicle"
                pie
                isLoading={monthlyChartLoading}
                isError={monthlyChartError}
                onRetry={refetchMonthlyChart}
              />
            </div>
          </div>

          {/* Row 3: adjustable year range, by year */}
          <div className="space-y-3">
            <YearRangeControl fromYear={fromYear} toYear={toYear} onChange={(f, t2) => { setFromYear(f); setToYear(t2); }} />
            <div className="grid gap-6 md:grid-cols-2">
              <RevenueVehicleLineChart
                title={t('report.revenueChartTitle', 'Biểu Đồ Doanh Thu')}
                data={yearlyChartData}
                metric="revenue"
                isLoading={yearlyChartLoading}
                isError={yearlyChartError}
                onRetry={refetchYearlyChart}
              />
              <RevenueVehicleLineChart
                title={t('report.vehicleChartTitle', 'Biểu Đồ Lượt Xe')}
                data={yearlyChartData}
                metric="vehicle"
                pie
                isLoading={yearlyChartLoading}
                isError={yearlyChartError}
                onRetry={refetchYearlyChart}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
