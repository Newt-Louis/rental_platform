import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { parkingDashboardApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncState } from '@/components/ui/async-state';
import { StatCard } from '@/components/ui/stat-card';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { ParkingCircle, DollarSign, Car, CheckCircle2, Percent, Clock } from 'lucide-react';
import { ParkingFilterBar, presetToRange, TimeRangePreset } from './components/ParkingFilterBar';
import { RevenueVolumeChart } from './components/RevenueVolumeChart';
import { RevenueSplitDonut } from './components/RevenueSplitDonut';
import { InflowOutflowChart } from './components/InflowOutflowChart';
import { PromotionUtilizationChart } from './components/PromotionUtilizationChart';
import { formatMoneyCompact } from '@/lib/currency';

const PAYMENT_COLORS = { cash: '#10b981', bankTransfer: '#4f46e5', voucherCoupon: '#f59e0b', voucherBill: '#ec4899' };

// Parking revenue is currency-less by design (VND is the platform's implicit
// unit) — see apps/frontend/src/lib/currency.ts and CR-111.
function fmtVnd(n: number) {
  return formatMoneyCompact(n, 'VND');
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return undefined;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}% so với kỳ trước`;
}

function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ParkingReportPage() {
  const { t } = useTranslation('parking');
  const [parkingCode, setParkingCode] = useState('');
  const [preset, setPreset] = useState<TimeRangePreset>('today');
  const [customRange, setCustomRange] = useState(() => presetToRange('today'));

  const range = useMemo(
    () => (preset === 'custom' ? customRange : presetToRange(preset)),
    [preset, customRange],
  );

  const filter = useMemo(
    () => ({ parkingCode, startDate: range.startDate, endDate: range.endDate }),
    [parkingCode, range.startDate, range.endDate],
  );

  const { data: tenantsRes } = useQuery({
    queryKey: ['parking-tenants'],
    queryFn: () => parkingDashboardApi.getTenants(),
  });
  useEffect(() => {
    const tenants: { parkingCode: string; name: string }[] = tenantsRes?.data ?? tenantsRes ?? [];
    if (!parkingCode && tenants.length > 0) setParkingCode(tenants[0].parkingCode);
  }, [tenantsRes, parkingCode]);

  const { data: kpiRes, isLoading: kpiLoading, isError: kpiError, refetch: refetchKpi } = useQuery({
    queryKey: ['parking-kpi-summary', filter],
    queryFn: () => parkingDashboardApi.getKpiSummary(filter),
    enabled: !!parkingCode,
  });
  const kpi = kpiRes?.data ?? kpiRes;

  const { data: paymentRes, isLoading: paymentLoading, isError: paymentError, refetch: refetchPayment } = useQuery({
    queryKey: ['parking-payment-breakdown', filter],
    queryFn: () => parkingDashboardApi.paymentBreakdown(filter.parkingCode, filter.startDate, filter.endDate),
    enabled: !!parkingCode,
  });
  const payment = paymentRes?.data ?? paymentRes ?? {};
  const paymentPie = [
    { key: 'cash', label: t('report.cash', 'Tiền mặt'), value: payment.cash ?? 0 },
    { key: 'bankTransfer', label: t('report.bankTransfer', 'Chuyển khoản'), value: payment.bankTransfer ?? 0 },
    { key: 'voucherCoupon', label: t('report.voucherCoupon', 'Voucher coupon'), value: payment.voucherCoupon ?? 0 },
    { key: 'voucherBill', label: t('report.voucherBill', 'Voucher hóa đơn'), value: payment.voucherBill ?? 0 },
  ].filter((s) => s.value > 0);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <ParkingCircle size={22} className="text-indigo-600" />
          <h1 className="text-xl font-semibold tracking-tight">{t('report.title', 'Báo cáo bãi đỗ xe')}</h1>
        </div>
        <ParkingFilterBar
          parkingCode={parkingCode}
          onParkingCodeChange={setParkingCode}
          preset={preset}
          onPresetChange={setPreset}
          startDate={customRange.startDate}
          endDate={customRange.endDate}
          onCustomRangeChange={(startDate, endDate) => setCustomRange({ startDate, endDate })}
        />
      </section>

      <AsyncState isLoading={kpiLoading} isError={kpiError} onRetry={refetchKpi}
        isEmpty={!parkingCode}
        emptyTitle={t('report.selectTenant', 'Chọn bãi đỗ')}
        loading={
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard
            title={t('report.kpiRevenue', 'Tổng doanh thu')}
            value={fmtVnd(kpi?.revenue?.value ?? 0)}
            trend={fmtPct(kpi?.revenue?.changePct)}
            trendUp={(kpi?.revenue?.changePct ?? 0) >= 0}
            icon={DollarSign}
          />
          <StatCard
            title={t('report.kpiOccupancy', 'Đang đỗ')}
            value={(kpi?.activeOccupancy?.value ?? 0).toLocaleString()}
            subtitle={t('report.kpiOccupancySubtitle', 'Xe hiện đang trong bãi')}
            icon={Car}
          />
          <StatCard
            title={t('report.kpiCompleted', 'Giao dịch hoàn tất')}
            value={(kpi?.completedSessions?.value ?? 0).toLocaleString()}
            subtitle={t('report.kpiPeakHour', 'Cao điểm {{n}} lượt/giờ', { n: kpi?.completedSessions?.peakHourlyThroughput ?? 0 })}
            icon={CheckCircle2}
          />
          <StatCard
            title={t('report.kpiPromotions', 'Khuyến mãi áp dụng')}
            value={fmtVnd(kpi?.promotionsApplied?.value ?? 0)}
            subtitle={kpi?.promotionsApplied?.pctOfRevenue != null ? `${kpi.promotionsApplied.pctOfRevenue.toFixed(1)}% doanh thu` : undefined}
            icon={Percent}
          />
          <StatCard
            title={t('report.kpiAvgDuration', 'Thời gian đỗ TB')}
            value={fmtDuration(kpi?.avgDuration?.value ?? 0)}
            trend={fmtPct(kpi?.avgDuration?.changePct)}
            trendUp={(kpi?.avgDuration?.changePct ?? 0) <= 0}
            icon={Clock}
          />
        </div>
      </AsyncState>

      {parkingCode && (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <RevenueVolumeChart filter={filter} />
            <RevenueSplitDonut filter={filter} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <InflowOutflowChart filter={filter} />
            <PromotionUtilizationChart filter={filter} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-gray-500">{t('report.cash', 'Tiền mặt')}</p>
                  <p className="text-lg font-bold" style={{ color: PAYMENT_COLORS.cash }}>{fmtVnd(payment.cash ?? 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-gray-500">{t('report.bankTransfer', 'Chuyển khoản')}</p>
                  <p className="text-lg font-bold" style={{ color: PAYMENT_COLORS.bankTransfer }}>{fmtVnd(payment.bankTransfer ?? 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-gray-500">{t('report.voucherCoupon', 'Voucher coupon')}</p>
                  <p className="text-lg font-bold" style={{ color: PAYMENT_COLORS.voucherCoupon }}>{fmtVnd(payment.voucherCoupon ?? 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-gray-500">{t('report.voucherBill', 'Voucher hóa đơn')}</p>
                  <p className="text-lg font-bold" style={{ color: PAYMENT_COLORS.voucherBill }}>{fmtVnd(payment.voucherBill ?? 0)}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="space-y-0">
                <CardTitle className="text-sm">{t('report.paymentBreakdown', 'Cơ cấu thanh toán')}</CardTitle>
              </CardHeader>
              <CardContent>
                <AsyncState isLoading={paymentLoading} isError={paymentError} onRetry={refetchPayment}
                  isEmpty={paymentPie.length === 0}
                  emptyTitle={t('report.empty', 'Chưa có dữ liệu')}
                  loading={<Skeleton className="h-64" />}
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={paymentPie} dataKey="value" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {paymentPie.map((s) => (
                          <Cell key={s.key} fill={PAYMENT_COLORS[s.key as keyof typeof PAYMENT_COLORS]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmtVnd(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </AsyncState>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
