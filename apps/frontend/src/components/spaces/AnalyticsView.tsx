import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUS_CONFIG, STATUS_ICONS } from '@/pages/spaces/spaces.constants';
import { BarChart3, Layers, Calendar, Clock } from 'lucide-react';

export function AnalyticsView({ mallId }: { mallId?: string | null }) {
  const { data: occupancyData } = useQuery({
    queryKey: ['occupancy', mallId],
    queryFn: () => spacesApi.occupancySummary(mallId),
  });

  const occ = occupancyData?.data ?? occupancyData;
  const occTotal = occ
    ? Object.entries(STATUS_CONFIG).reduce(
        (s, [k]) => s + (occ[k === 'UNDER_FITOUT' ? 'underFitout' : k.toLowerCase()] ?? 0), 0)
    : 0;

  const { data: rentData, isLoading: loadingRent } = useQuery({
    queryKey: ['rent-analytics', mallId],
    queryFn: () => spacesApi.rentAnalytics(mallId ?? undefined),
  });

  const { data: calendarData } = useQuery({
    queryKey: ['availability-calendar', mallId],
    queryFn: () => spacesApi.availabilityCalendar({ mallId: mallId ?? undefined, months: 6 }),
  });

  const { data: expiringData } = useQuery({
    queryKey: ['expiring-leases-dashboard', mallId],
    queryFn: () => spacesApi.expiringLeases({ mallId: mallId ?? undefined, days: 180 }),
  });

  if (loadingRent) {
    return <div className="py-10 text-center text-gray-400">Đang tải analytics...</div>;
  }

  const summary = rentData?.summary;
  const byFloor = rentData?.byFloor ?? [];
  const byCategory = rentData?.byCategory ?? [];
  const vacancy = calendarData?.currentlyVacant;
  const expiringSummary = expiringData?.summary;

  return (
    <div className="space-y-6">
      {/* Occupancy status tiles */}
      {occ && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <Card className="relative border border-l-4 border-l-slate-400">
            <CardContent className="p-3">
              <span className="absolute top-2 right-2 min-w-[1.375rem] h-[1.375rem] px-1 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center">
                {occTotal}
              </span>
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center mb-2">
                <BarChart3 size={14} className="text-slate-600" />
              </div>
              <div className="text-xs font-medium text-gray-500">Tất cả</div>
            </CardContent>
          </Card>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = occ[key === 'UNDER_FITOUT' ? 'underFitout' : key.toLowerCase()] ?? 0;
            const pct = occTotal > 0 ? Math.round((count / occTotal) * 100) : 0;
            return (
              <Card key={key} className={`relative border border-l-4 ${cfg.leftBorder} border-gray-100`}>
                <CardContent className="p-3">
                  <span className={`absolute top-2 right-2 min-w-[1.375rem] h-[1.375rem] px-1 rounded-full ${cfg.iconBg} ${cfg.textColor} text-xs font-bold flex items-center justify-center`}>
                    {count}
                  </span>
                  <div className={`w-7 h-7 rounded-lg ${cfg.iconBg} ${cfg.textColor} flex items-center justify-center mb-2`}>
                    {STATUS_ICONS[key]}
                  </div>
                  <div className="text-xs font-medium text-gray-500 truncate">{cfg.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{pct}%</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Occupancy bar */}
      {occ && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-gray-500 whitespace-nowrap">Lấp đầy</span>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-700"
              style={{ width: `${occ.occupancyRate}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{occ.occupancyRate}%</span>
          <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">
            {(occ.leasedArea ?? 0).toLocaleString()} / {(occ.totalArea ?? 0).toLocaleString()} m²
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-gray-900">{summary?.totalUnits ?? 0}</div>
            <div className="text-sm text-gray-500">Tổng units</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{summary?.occupiedUnits ?? 0}</div>
            <div className="text-sm text-gray-500">Đang thuê</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-gray-700">{Number(summary?.avgRentPerSqm ?? 0).toLocaleString()}</div>
            <div className="text-sm text-gray-500">Giá thuê TB (₫/m²)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-purple-600">{Number(summary?.totalMonthlyRevenue ?? 0).toLocaleString()}</div>
            <div className="text-sm text-gray-500">Doanh thu/tháng (₫)</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Rent by Floor */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Layers size={16} className="text-gray-400" />
              Giá thuê theo tầng
            </h3>
            <div className="space-y-3">
              {byFloor.slice(0, 8).map((f: any) => (
                <div key={f.floorId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{f.floorName}</span>
                    <span className="text-xs text-gray-400">({f.unitCount} units)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{Number(f.avgRent).toLocaleString()} ₫/m²</span>
                    <span className="text-xs text-green-600">{f.occupancyRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Rent by Category */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-gray-400" />
              Giá thuê theo ngành hàng
            </h3>
            <div className="space-y-3">
              {byCategory.slice(0, 8).map((c: any) => (
                <div key={c.category} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{c.category}</span>
                    <span className="text-xs text-gray-400">({c.unitCount} units)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{Number(c.avgRent).toLocaleString()} ₫/m²</span>
                    <span className="text-xs text-green-600">{c.occupancyRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Availability Forecast */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-gray-400" />
              Dự báo khả dụng (6 tháng)
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 bg-red-50 rounded">
                <span className="text-sm">Đang trống</span>
                <div className="text-right">
                  <span className="font-bold text-red-600">{vacancy?.count ?? 0} units</span>
                  <span className="text-xs text-gray-500 ml-2">{(vacancy?.totalArea ?? 0).toLocaleString()} m²</span>
                </div>
              </div>
              {(calendarData?.upcomingAvailability ?? []).slice(0, 5).map((m: any) => (
                <div key={m.month} className="flex items-center justify-between">
                  <span className="text-sm">{m.month}</span>
                  <div className="text-right">
                    <span className="font-medium">{m.count} units</span>
                    <span className="text-xs text-gray-400 ml-2">{m.totalArea.toLocaleString()} m²</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Lease Expiry Summary */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Clock size={16} className="text-gray-400" />
              Lease sắp hết hạn
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 bg-red-50 rounded">
                <span className="text-sm text-red-700">Trong 30 ngày</span>
                <span className="font-bold text-red-600">{expiringSummary?.critical ?? 0} units</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-orange-50 rounded">
                <span className="text-sm text-orange-700">30-60 ngày</span>
                <span className="font-bold text-orange-600">{expiringSummary?.warning ?? 0} units</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-amber-50 rounded">
                <span className="text-sm text-amber-700">60-180 ngày</span>
                <span className="font-bold text-amber-600">{expiringSummary?.upcoming ?? 0} units</span>
              </div>
              <div className="pt-2 border-t text-sm text-gray-500">
                <div className="flex justify-between">
                  <span>Tổng diện tích rủi ro:</span>
                  <span className="font-medium">{(expiringSummary?.totalAreaAtRisk ?? 0).toLocaleString()} m²</span>
                </div>
                <div className="flex justify-between">
                  <span>Doanh thu rủi ro/tháng:</span>
                  <span className="font-medium">{(expiringSummary?.totalRevenueAtRisk ?? 0).toLocaleString()} ₫</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
