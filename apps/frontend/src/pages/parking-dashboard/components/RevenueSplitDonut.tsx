import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { parkingDashboardApi, ParkingDashboardKpiFilter } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncState } from '@/components/ui/async-state';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatMoneyCompact } from '@/lib/currency';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];

function fmtVnd(n: number) {
  return formatMoneyCompact(n, 'VND');
}

export function RevenueSplitDonut({ filter }: { filter: ParkingDashboardKpiFilter }) {
  const { t } = useTranslation('parking');
  const [dimension, setDimension] = useState<'vehicle_type_name' | 'card_type_name'>('vehicle_type_name');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parking-revenue-split-chart', filter, dimension],
    queryFn: () => parkingDashboardApi.getRevenueSplitChart(filter, dimension),
  });
  const points: { label: string; revenue: number; count: number }[] = data?.data ?? data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">{t('report.revenueSplitChart', 'Doanh thu theo loại xe/thẻ')}</CardTitle>
        <select
          value={dimension}
          onChange={(e) => setDimension(e.target.value as typeof dimension)}
          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
        >
          <option value="vehicle_type_name">{t('report.byVehicleType', 'Theo loại xe')}</option>
          <option value="card_type_name">{t('report.byCardType', 'Theo loại thẻ')}</option>
        </select>
      </CardHeader>
      <CardContent>
        <AsyncState isLoading={isLoading} isError={isError} onRetry={refetch}
          isEmpty={points.length === 0}
          emptyTitle={t('report.empty', 'Chưa có dữ liệu')}
          loading={<Skeleton className="h-64" />}
        >
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={points} dataKey="revenue" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {points.map((p, i) => (
                  <Cell key={p.label} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmtVnd(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </AsyncState>
      </CardContent>
    </Card>
  );
}
