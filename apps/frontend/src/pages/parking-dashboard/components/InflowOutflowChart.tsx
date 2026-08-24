import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { parkingDashboardApi, ParkingDashboardKpiFilter } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncState } from '@/components/ui/async-state';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function InflowOutflowChart({ filter }: { filter: ParkingDashboardKpiFilter }) {
  const { t } = useTranslation('parking');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parking-inflow-outflow-chart', filter],
    queryFn: () => parkingDashboardApi.getInflowOutflowChart(filter),
  });
  const points: { label: string; inflow: number; outflow: number }[] = data?.data ?? data ?? [];

  return (
    <Card>
      <CardHeader className="space-y-0">
        <CardTitle className="text-sm">{t('report.inflowOutflowChart', 'Lượt vào/ra theo giờ')}</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncState isLoading={isLoading} isError={isError} onRetry={refetch}
          isEmpty={points.length === 0}
          emptyTitle={t('report.empty', 'Chưa có dữ liệu')}
          loading={<Skeleton className="h-64" />}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={points}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="inflow" name={t('report.inflow', 'Vào')} stackId="flow" fill="#10b981" />
              <Bar dataKey="outflow" name={t('report.outflow', 'Ra')} stackId="flow" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </AsyncState>
      </CardContent>
    </Card>
  );
}
