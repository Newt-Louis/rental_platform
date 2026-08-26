import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncState } from '@/components/ui/async-state';
import { formatMoneyCompact } from '@/lib/currency';
import { SERIES_COLORS, vehicleTypeColor } from './chartColors';
import type { RevenueVehicleSeriesPoint } from '@/api';

function fmtVnd(n: number) {
  return formatMoneyCompact(n, 'VND');
}

interface RevenueVehicleLineChartProps {
  title: string;
  data: RevenueVehicleSeriesPoint[];
  metric: 'revenue' | 'vehicle';
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function RevenueVehicleLineChart({ title, data, metric, isLoading, isError, onRetry }: RevenueVehicleLineChartProps) {
  const { t } = useTranslation('parking');

  // Zero-filled points (not an empty array) make every line flat and overlapping — reads as
  // "missing lines" rather than "no data". Treat all-zero as empty so the empty state shows.
  const hasValues =
    metric === 'revenue'
      ? data.some((p) => p.totalRevenue !== 0 || p.cashRevenue !== 0 || p.onlineRevenue !== 0 || p.voucherRevenue !== 0)
      : data.some((p) => p.vehicleCount !== 0);

  // Union of vehicle types across all buckets, sorted for stable colors. Skip the breakdown
  // when there's only one type — that line would just duplicate the total line.
  const allVehicleTypes =
    metric === 'vehicle'
      ? Array.from(new Set(data.flatMap((p) => Object.keys(p.vehicleCountByType)))).sort()
      : [];
  const vehicleTypes = allVehicleTypes.length > 1 ? allVehicleTypes : [];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-0">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className={metric === 'vehicle' ? 'flex flex-1 flex-col justify-center' : undefined}>
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          onRetry={onRetry}
          isEmpty={!isLoading && !hasValues}
          emptyTitle={t('report.empty', 'Chưa có dữ liệu')}
          loading={<Skeleton className="h-64" />}
        >
          {metric === 'revenue' ? (
            <div className="space-y-4">
              {/* Voucher gets its own chart below — its scale can dwarf cash/online/total. */}
              <div>
                {/* "Khác", not "Tổng": total_fee doesn't derive from cash/online/voucher, so
                    calling it "Total" read as a discrepancy when they don't sum to it. */}
                <p className="mb-1 text-xs text-gray-400">{t('report.other', 'Khác')} / {t('report.cash', 'Tiền Mặt')} / {t('report.online', 'Online')}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={fmtVnd} width={70} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => fmtVnd(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="totalRevenue" name={t('report.other', 'Khác')} stroke={SERIES_COLORS.total} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cashRevenue" name={t('report.cash', 'Tiền Mặt')} stroke={SERIES_COLORS.cash} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="onlineRevenue" name={t('report.online', 'Online')} stroke={SERIES_COLORS.online} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="mb-1 text-xs text-gray-400">{t('report.voucher', 'Voucher')}</p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={fmtVnd} width={70} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => fmtVnd(v)} />
                    <Line type="monotone" dataKey="voucherRevenue" name={t('report.voucher', 'Voucher')} stroke={SERIES_COLORS.voucher} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} width={40} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {vehicleTypes.length > 0 ? (
                  // Stacked: each type's area sums up to the total, so no separate total
                  // series (it would just duplicate the stack's top edge).
                  vehicleTypes.map((type, i) => (
                    <Area
                      key={type}
                      type="monotone"
                      dataKey={(p: RevenueVehicleSeriesPoint) => p.vehicleCountByType[type] ?? 0}
                      name={type}
                      stackId="vehicleTypes"
                      stroke={vehicleTypeColor(i)}
                      fill={vehicleTypeColor(i)}
                      fillOpacity={0.5}
                    />
                  ))
                ) : (
                  <Area
                    type="monotone"
                    dataKey="vehicleCount"
                    name={t('report.vehicleCount', 'Lượt xe')}
                    stroke={SERIES_COLORS.total}
                    fill={SERIES_COLORS.total}
                    fillOpacity={0.3}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </AsyncState>
      </CardContent>
    </Card>
  );
}
