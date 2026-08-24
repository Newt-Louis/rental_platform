import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { parkingDashboardApi, ParkingDashboardKpiFilter } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncState } from '@/components/ui/async-state';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function fmtVnd(n: number) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(n) + ' đ';
}

export function PromotionUtilizationChart({ filter }: { filter: ParkingDashboardKpiFilter }) {
  const { t } = useTranslation('parking');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parking-promotion-utilization-chart', filter],
    queryFn: () => parkingDashboardApi.getPromotionUtilizationChart(filter),
  });
  const points: { label: string; count: number; amount: number }[] = data?.data ?? data ?? [];

  return (
    <Card>
      <CardHeader className="space-y-0">
        <CardTitle className="text-sm">{t('report.promotionUtilizationChart', 'Sử dụng khuyến mãi/voucher')}</CardTitle>
      </CardHeader>
      <CardContent>
        <AsyncState isLoading={isLoading} isError={isError} onRetry={refetch}
          isEmpty={points.length === 0}
          emptyTitle={t('report.empty', 'Chưa có dữ liệu')}
          loading={<Skeleton className="h-64" />}
        >
          <ResponsiveContainer width="100%" height={Math.max(200, points.length * 40)}>
            <BarChart data={points} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtVnd} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={140} />
              <Tooltip formatter={(v: number) => fmtVnd(v)} />
              <Bar dataKey="amount" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </AsyncState>
      </CardContent>
    </Card>
  );
}
