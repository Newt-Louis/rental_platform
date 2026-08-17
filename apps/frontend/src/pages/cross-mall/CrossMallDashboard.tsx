import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, TrendingUp, AlertTriangle, Ticket, DollarSign } from 'lucide-react';
import { AsyncState } from '@/components/ui/async-state';
import { useState } from 'react';

function fmt(n: number) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(n);
}

function OccupancyBar({ rate }: { rate: number }) {
  const color = rate >= 90 ? 'bg-green-500' : rate >= 70 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(rate, 100)}%` }} />
    </div>
  );
}

export default function CrossMallDashboard() {
  const [leaseTermType, setLeaseTermType] = useState<'LONG' | 'SHORT'>('LONG');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['cross-mall-dashboard'],
    queryFn: () => dashboardApi.getCrossMallDashboard(),
    refetchInterval: 120_000,
  });

  const d = data?.data ?? data;
  const malls = d?.malls ?? [];
  const rawTotals = d?.totals;
  const totals = rawTotals?.byLeaseTerm?.[leaseTermType]
    ? { ...rawTotals, ...rawTotals.byLeaseTerm[leaseTermType] }
    : rawTotals;

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Cross-Mall Dashboard</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }
  if (isError) {
    return <AsyncState isLoading={false} isError onRetry={refetch} errorTitle="Không thể tải so sánh liên trung tâm"><div /></AsyncState>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cross-Mall Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Tổng hợp toàn bộ các Mall — CEO/ADMIN View</p>
        </div>
        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Live</Badge>
      </div>

      <div className="inline-flex rounded-lg border bg-white p-1 mb-6" aria-label="Loại hình cho thuê">
        {(['LONG', 'SHORT'] as const).map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => setLeaseTermType(term)}
            className={`rounded-md px-4 py-2 text-sm font-medium ${leaseTermType === term ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {term === 'LONG' ? 'Cho thuê dài hạn' : 'Cho thuê ngắn hạn'}
          </button>
        ))}
      </div>

      {/* Consolidated totals */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-gray-500">Tỷ lệ lấp đầy toàn hệ thống</p>
                  <p className="text-2xl font-bold mt-1">{totals.occupancyRate}%</p>
                  <p className="text-xs text-gray-400">{totals.leasedArea.toLocaleString()} / {totals.totalArea.toLocaleString()} m²</p>
                </div>
                <div className="bg-gray-50 text-gray-700 p-2.5 rounded-lg"><Building2 size={18} /></div>
              </div>
              <OccupancyBar rate={totals.occupancyRate} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-gray-500">Doanh thu tháng tổng</p>
                  <p className="text-2xl font-bold mt-1">{fmt(totals.monthlyRevenue)}</p>
                  <p className="text-xs text-gray-400">Thu: {fmt(totals.collectedRevenue)} ({totals.collectionRate}%)</p>
                </div>
                <div className="bg-green-50 text-green-600 p-2.5 rounded-lg"><TrendingUp size={18} /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-gray-500">HĐ hết hạn ≤ 30 ngày</p>
                  <p className="text-2xl font-bold mt-1 text-red-600">{totals.expiringIn30}</p>
                </div>
                <div className="bg-red-50 text-red-600 p-2.5 rounded-lg"><AlertTriangle size={18} /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-gray-500">Ticket đang mở</p>
                  <p className="text-2xl font-bold mt-1">{totals.openTickets}</p>
                  <p className="text-xs text-gray-400">Quá hạn: {totals.overdueCount} HĐ</p>
                </div>
                <div className="bg-purple-50 text-purple-600 p-2.5 rounded-lg"><Ticket size={18} /></div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-mall breakdown */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Từng Mall</h2>
        {malls.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Building2 size={40} className="mx-auto mb-2 opacity-20" />
            <p>Chưa có Mall nào</p>
          </div>
        ) : (
          malls.map((rawMall: any) => {
            const segment = rawMall.byLeaseTerm?.[leaseTermType];
            const m = segment ? { ...rawMall, ...segment } : rawMall;
            return (
            <Card key={m.mall.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{m.mall.name}</h3>
                      <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">{m.mall.code}</span>
                      {m.mall.city && <span className="text-xs text-gray-400">{m.mall.city}</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{m.unitCount} lô | {m.totalArea.toLocaleString()} m²</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.expiringIn30 > 0 && (
                      <Badge className="bg-red-100 text-red-700 border-0 text-xs">
                        <AlertTriangle size={10} className="mr-1" /> {m.expiringIn30} HĐ hết hạn
                      </Badge>
                    )}
                    {m.overdueCount > 0 && (
                      <Badge className="bg-orange-100 text-orange-700 border-0 text-xs">
                        {m.overdueCount} quá hạn
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Lấp đầy</div>
                    <div className="font-semibold text-lg">{m.occupancyRate}%</div>
                    <OccupancyBar rate={m.occupancyRate} />
                    <div className="text-xs text-gray-400 mt-0.5">{m.leasedArea.toLocaleString()} / {m.totalArea.toLocaleString()} m²</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Doanh thu tháng</div>
                    <div className="font-semibold">{fmt(m.monthlyRevenue)}</div>
                    <div className="text-xs text-gray-400">Thu {fmt(m.collectedRevenue)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Tỷ lệ thu</div>
                    <div className={`font-semibold ${m.collectionRate >= 80 ? 'text-green-600' : m.collectionRate >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {m.collectionRate}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Ticket mở</div>
                    <div className="font-semibold">{m.openTickets}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Diện tích trống</div>
                    <div className="font-semibold">{m.vacantArea.toLocaleString()} m²</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
