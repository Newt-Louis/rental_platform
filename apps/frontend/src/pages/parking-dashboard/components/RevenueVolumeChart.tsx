import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { parkingDashboardApi, ParkingDashboardKpiFilter } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncState } from '@/components/ui/async-state';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

function fmtVnd(n: number) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(n) + ' đ';
}

export function RevenueVolumeChart({ filter }: { filter: ParkingDashboardKpiFilter }) {
  const { t } = useTranslation('parking');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parking-revenue-volume-chart', filter],
    queryFn: () => parkingDashboardApi.getRevenueVolumeChart(filter),
  });
  const points: { label: string; revenue: number; volume: number }[] = data?.data ?? data ?? [];

  return (
    <Card>
      <CardHeader className="space-y-0">
        <CardTitle className="text-sm">{t('report.revenueVolumeChart', 'Doanh thu & lượt xe theo thời gian')}</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncState isLoading={isLoading} isError={isError} onRetry={refetch}
          isEmpty={points.length === 0}
          emptyTitle={t('report.empty', 'Chưa có dữ liệu')}
          loading={<Skeleton className="h-64" />}
        >
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={points}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="volume" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis yAxisId="revenue" orientation="right" tick={{ fontSize: 11 }} tickFormatter={fmtVnd} />
              <Tooltip formatter={(v: number, name: string) => (name === 'revenue' ? fmtVnd(v) : v)} />
              <Legend />
              <Bar yAxisId="volume" dataKey="volume" name={t('report.volume', 'Lượt xe')} fill="#10b981" radius={[4, 4, 0, 0]} />
              <Line yAxisId="revenue" type="monotone" dataKey="revenue" name={t('report.revenue', 'Doanh thu')} stroke="#4f46e5" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </AsyncState>
      </CardContent>
    </Card>
  );
}
