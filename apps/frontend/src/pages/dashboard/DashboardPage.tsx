import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, bookingApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { useAuthStore } from '@/store/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Building2, Users, TrendingUp, AlertTriangle, Clock, Ticket,
  CheckSquare, DollarSign, BookmarkCheck,
} from 'lucide-react';

function StatCard({
  title, value, sub, icon: Icon, color = 'blue', badge, to,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
  badge?: string;
  to?: string;
}) {
  const navigate = useNavigate();
  const colorMap: Record<string, string> = {
    blue: 'bg-gray-50 text-gray-700',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <Card
      className={to ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all' : ''}
      onClick={to ? () => navigate(to) : undefined}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
          </div>
          <div className={`p-3 rounded-lg ${colorMap[color]}`}>
            <Icon size={20} />
          </div>
        </div>
        {badge && (
          <Badge variant="secondary" className="mt-2 text-xs">
            {badge}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', notation: 'compact' }).format(n);
}

const FOCUS_LABELS: Record<string, string> = {
  occupancy: 'Mặt bằng & lấp đầy',
  booking: 'Booking & giữ chỗ',
  approvals: 'Phê duyệt deal',
  pipeline: 'Pipeline bán hàng',
  billing: 'Billing & thu nợ',
  sales: 'Doanh thu tenant',
  contracts: 'Hợp đồng',
  tickets: 'Ticket vận hành',
  fitout: 'Fit-out',
  overview: 'Tổng quan',
};

export default function DashboardPage() {
  const { selectedMallId, selectedMallName } = useMallStore();
  const { user } = useAuthStore();
  const mallName = selectedMallName;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', selectedMallId],
    queryFn: () => dashboardApi.getDashboard(selectedMallId ?? undefined),
    refetchInterval: 60_000,
  });
  const { data: bookingStats } = useQuery({
    queryKey: ['booking-stats', selectedMallId],
    queryFn: () => bookingApi.stats(selectedMallId ?? undefined),
    refetchInterval: 60_000,
  });

  const d = data?.data ?? data;
  const focusAreas: string[] = d?.focusAreas ?? ['overview'];

  const showOccupancy = focusAreas.some((f) => ['occupancy', 'pipeline', 'overview', 'booking'].includes(f));
  const showFinance = focusAreas.some((f) => ['billing', 'sales', 'overview', 'contracts'].includes(f));
  const showOperations = focusAreas.some((f) => ['tickets', 'fitout', 'overview'].includes(f));
  const showLeasing = focusAreas.some((f) => ['booking', 'approvals', 'pipeline', 'overview'].includes(f));

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mallName} · {user?.role?.replace(/_/g, ' ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {focusAreas.filter((f) => f !== 'overview').slice(0, 3).map((f) => (
            <Badge key={f} variant="outline" className="text-xs">
              {FOCUS_LABELS[f] ?? f}
            </Badge>
          ))}
        </div>
      </div>

      {(showOccupancy || showFinance) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {showOccupancy && (
            <>
              <StatCard
                title="Tỷ lệ lấp đầy"
                value={`${d?.occupancyRate ?? 0}%`}
                sub={`${(d?.leasedArea ?? 0).toLocaleString()} / ${(d?.totalArea ?? 0).toLocaleString()} m²`}
                icon={Building2}
                color="blue"
                to="/spaces"
              />
              <StatCard
                title="Khách thuê"
                value={d?.totalTenants ?? 0}
                icon={Users}
                color="green"
                to="/contracts?status=ACTIVE"
              />
            </>
          )}
          {showFinance && (
            <>
              <StatCard
                title="Doanh thu tháng"
                value={fmt(d?.monthlyRevenue ?? 0)}
                sub={`Thu: ${fmt(d?.collectedRevenue ?? 0)}`}
                icon={TrendingUp}
                color="purple"
                to="/billing"
              />
              <StatCard
                title="Công nợ quá hạn"
                value={fmt(d?.overdueAmount ?? 0)}
                sub={`${d?.overdueCount ?? 0} hóa đơn`}
                icon={DollarSign}
                color="red"
                to="/billing?status=OVERDUE"
              />
            </>
          )}
        </div>
      )}

      {(showLeasing || showOperations) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {showLeasing && (
            <>
              <StatCard
                title="Booking đang giữ"
                value={bookingStats?.active ?? 0}
                sub={`${bookingStats?.pending ?? 0} chờ kích hoạt`}
                icon={BookmarkCheck}
                color="yellow"
                to="/bookings"
              />
              <StatCard
                title="Sắp hết hạn (7 ngày)"
                value={bookingStats?.expiringSoon ?? 0}
                icon={Clock}
                color="red"
                badge={(bookingStats?.expiringSoon ?? 0) > 0 ? 'Cần xử lý' : undefined}
                to="/bookings?expiringSoon=true"
              />
              <StatCard
                title="Chờ phê duyệt"
                value={d?.pendingApprovals ?? 0}
                icon={CheckSquare}
                color="blue"
                to="/approvals"
              />
            </>
          )}
          {(showLeasing || showFinance) && (
            <>
              <StatCard
                title="HĐ hết hạn < 30 ngày"
                value={d?.expiringIn30 ?? 0}
                icon={AlertTriangle}
                color="red"
                badge="Khẩn"
                to="/contracts?expiring=30"
              />
              <StatCard
                title="HĐ hết hạn < 90 ngày"
                value={d?.expiringIn90 ?? 0}
                icon={Clock}
                color="yellow"
                to="/contracts?expiring=90"
              />
            </>
          )}
          {showOperations && (
            <StatCard
              title="Ticket đang mở"
              value={d?.openTickets ?? 0}
              icon={Ticket}
              color="purple"
              to="/tickets?status=OPEN"
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {showOccupancy && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Phân bổ diện tích</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: 'Đang cho thuê', value: d?.leasedArea ?? 0, color: 'bg-green-500' },
                  { label: 'Trống', value: d?.vacantArea ?? 0, color: 'bg-gray-200' },
                  {
                    label: 'Khác',
                    value: (d?.totalArea ?? 0) - (d?.leasedArea ?? 0) - (d?.vacantArea ?? 0),
                    color: 'bg-yellow-400',
                  },
                ].map((item) => {
                  const pct = d?.totalArea ? (item.value / d.totalArea) * 100 : 0;
                  return (
                    <div key={item.label}>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>{item.label}</span>
                        <span>{item.value.toLocaleString()} m² ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {showFinance && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Billing Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Tổng hóa đơn tháng</span>
                  <span className="font-medium">{fmt(d?.monthlyRevenue ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Đã thu</span>
                  <span className="font-medium text-green-600">{fmt(d?.collectedRevenue ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Quá hạn</span>
                  <span className="font-medium text-red-600">{fmt(d?.overdueAmount ?? 0)}</span>
                </div>
                <div className="h-px bg-gray-100" />
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Tỷ lệ thu</span>
                  <span className="font-medium">
                    {d?.monthlyRevenue
                      ? `${((d.collectedRevenue / d.monthlyRevenue) * 100).toFixed(1)}%`
                      : '0%'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cần xử lý</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                showLeasing && { label: 'Deal chờ phê duyệt', value: d?.pendingApprovals, urgent: false },
                showFinance && { label: 'Hóa đơn quá hạn', value: d?.overdueCount, urgent: true },
                (showLeasing || showFinance) && { label: 'HĐ hết hạn trong 30 ngày', value: d?.expiringIn30, urgent: true },
                showOperations && { label: 'Ticket đang mở', value: d?.openTickets, urgent: false },
                showLeasing && { label: 'Booking sắp hết hạn', value: bookingStats?.expiringSoon, urgent: true },
              ].filter(Boolean).map((item: any) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{item.label}</span>
                  <Badge
                    variant={item.urgent && item.value > 0 ? 'destructive' : 'secondary'}
                    className="text-xs"
                  >
                    {item.value ?? 0}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
