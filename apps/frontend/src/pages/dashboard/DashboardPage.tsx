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
  CheckSquare, DollarSign, BookmarkCheck, ArrowUpRight,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';

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

function fmt(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', notation: 'compact' }).format(n);
}

function fmtArea(n: number) {
  return `${Math.round(Math.max(0, n)).toLocaleString('vi-VN')} m²`;
}

const COLOR_MAP = {
  blue:   { iconBg: 'bg-blue-100',    iconText: 'text-blue-600'   },
  green:  { iconBg: 'bg-emerald-100', iconText: 'text-emerald-600' },
  yellow: { iconBg: 'bg-amber-100',   iconText: 'text-amber-600'  },
  red:    { iconBg: 'bg-red-100',     iconText: 'text-red-600'    },
  purple: { iconBg: 'bg-violet-100',  iconText: 'text-violet-600' },
};

function StatCard({
  title, value, sub, icon: Icon, color = 'blue', badge, to,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: keyof typeof COLOR_MAP;
  badge?: { text: string; variant?: 'destructive' | 'secondary' | 'outline' };
  to?: string;
}) {
  const navigate = useNavigate();
  const c = COLOR_MAP[color];
  return (
    <Card
      className={`relative overflow-hidden border border-gray-100 shadow-sm ${to ? 'cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5' : ''}`}
      onClick={to ? () => navigate(to) : undefined}
    >
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider truncate">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1.5 leading-none">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
          </div>
          <div className={`ml-3 shrink-0 flex h-10 w-10 items-center justify-center rounded-xl ${c.iconBg}`}>
            <Icon size={18} className={c.iconText} />
          </div>
        </div>
        {badge && (
          <div className="mt-3 pt-2.5 border-t border-gray-50">
            <Badge variant={badge.variant ?? 'secondary'} className="text-[11px] font-medium">
              {badge.text}
            </Badge>
          </div>
        )}
        {to && (
          <ArrowUpRight size={13} className="absolute top-3 right-3 text-gray-200" />
        )}
      </CardContent>
    </Card>
  );
}

function OccupancyDonut({
  leasedArea, vacantArea, otherArea, occupancyRate,
}: {
  leasedArea: number;
  vacantArea: number;
  otherArea: number;
  occupancyRate: number;
}) {
  const raw = [
    { name: 'Đang cho thuê', value: Math.max(0, leasedArea), color: '#10b981' },
    { name: 'Trống', value: Math.max(0, vacantArea), color: '#e5e7eb' },
    { name: 'Khác', value: Math.max(0, otherArea), color: '#fbbf24' },
  ];
  const data = raw.filter((d) => d.value > 0);
  if (data.length === 0) data.push({ name: 'Chưa có dữ liệu', value: 1, color: '#f3f4f6' });

  return (
    <div className="relative select-none">
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={72}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            strokeWidth={2}
            stroke="#fff"
          >
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip
            formatter={(v: number) => [`${Math.round(v).toLocaleString('vi-VN')} m²`]}
            contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold text-gray-900 leading-none">{occupancyRate}%</span>
        <span className="text-[11px] text-gray-400 mt-1">lấp đầy</span>
      </div>
    </div>
  );
}

function OccupancyLegend({
  leasedArea, vacantArea, otherArea,
}: {
  leasedArea: number;
  vacantArea: number;
  otherArea: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50">
      {[
        { label: 'Cho thuê', value: fmtArea(leasedArea), dot: 'bg-emerald-500' },
        { label: 'Trống',    value: fmtArea(vacantArea), dot: 'bg-gray-200' },
        { label: 'Khác',     value: fmtArea(otherArea),  dot: 'bg-amber-400' },
      ].map((item) => (
        <div key={item.label} className="flex flex-col items-center gap-1 text-center">
          <div className={`h-2 w-2 rounded-full ${item.dot}`} />
          <span className="text-[10px] text-gray-400 leading-none">{item.label}</span>
          <span className="text-xs font-semibold text-gray-700">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function BillingProgress({
  monthlyRevenue, collectedRevenue, overdueAmount,
}: {
  monthlyRevenue: number;
  collectedRevenue: number;
  overdueAmount: number;
}) {
  const max = Math.max(monthlyRevenue, 1);
  const collectionPct = monthlyRevenue > 0 ? (collectedRevenue / monthlyRevenue) * 100 : 0;

  const rows = [
    { label: 'Tổng hóa đơn', value: monthlyRevenue, pct: 100,                        barColor: 'bg-violet-400' },
    { label: 'Đã thu',        value: collectedRevenue, pct: (collectedRevenue / max) * 100, barColor: 'bg-emerald-500' },
    { label: 'Quá hạn',       value: overdueAmount,    pct: (overdueAmount / max) * 100,    barColor: 'bg-red-400'    },
  ];

  return (
    <div className="space-y-4 mt-1">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-500">{r.label}</span>
            <span className="text-xs font-semibold text-gray-800">{fmt(r.value)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${r.barColor}`}
              style={{ width: `${r.pct}%` }}
            />
          </div>
        </div>
      ))}
      <div className="pt-3 mt-1 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400">Tỷ lệ thu</span>
        <span className={`text-sm font-bold ${collectionPct >= 80 ? 'text-emerald-600' : collectionPct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
          {collectionPct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function ActionItems({ items }: {
  items: { label: string; value: number; urgent: boolean }[];
}) {
  const sorted = [...items].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return b.value - a.value;
  });

  return (
    <div className="space-y-2 mt-1">
      {sorted.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">Không có mục cần xử lý</p>
      )}
      {sorted.map((item) => {
        const isAlert = item.urgent && item.value > 0;
        return (
          <div
            key={item.label}
            className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${isAlert ? 'bg-red-50' : 'bg-gray-50'}`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${isAlert ? 'bg-red-500' : 'bg-gray-300'}`} />
              <span className={`text-sm truncate ${isAlert ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
                {item.label}
              </span>
            </div>
            <Badge
              variant={isAlert ? 'destructive' : 'secondary'}
              className="ml-3 shrink-0 min-w-[26px] justify-center text-xs"
            >
              {item.value}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const { selectedMallId, selectedMallName } = useMallStore();
  const { user } = useAuthStore();

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
  const showFinance   = focusAreas.some((f) => ['billing', 'sales', 'overview', 'contracts'].includes(f));
  const showOperations = focusAreas.some((f) => ['tickets', 'fitout', 'overview'].includes(f));
  const showLeasing   = focusAreas.some((f) => ['booking', 'approvals', 'pipeline', 'overview'].includes(f));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-44 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border border-gray-100 shadow-sm">
              <CardContent className="pt-5">
                <Skeleton className="h-3 w-24 mb-3" />
                <Skeleton className="h-7 w-20 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const otherArea = (d?.totalArea ?? 0) - (d?.leasedArea ?? 0) - (d?.vacantArea ?? 0);
  const today = new Date().toLocaleDateString('vi-VN', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });

  const actionItems = [
    showLeasing  && { label: 'Deal chờ phê duyệt',       value: d?.pendingApprovals ?? 0,      urgent: false },
    showFinance  && { label: 'Hóa đơn quá hạn',          value: d?.overdueCount ?? 0,          urgent: true  },
    (showLeasing || showFinance) && { label: 'HĐ hết hạn trong 30 ngày', value: d?.expiringIn30 ?? 0, urgent: true  },
    (showLeasing || showFinance) && { label: 'HĐ hết hạn trong 90 ngày', value: d?.expiringIn90 ?? 0, urgent: false },
    showOperations && { label: 'Ticket đang mở',          value: d?.openTickets ?? 0,           urgent: false },
    showLeasing  && { label: 'Booking sắp hết hạn',      value: bookingStats?.expiringSoon ?? 0, urgent: true },
  ].filter(Boolean) as { label: string; value: number; urgent: boolean }[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1 flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-gray-600">{selectedMallName}</span>
            <span className="text-gray-300">·</span>
            <span>{user?.role?.replace(/_/g, ' ')}</span>
            <span className="text-gray-300">·</span>
            <span>{today}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {focusAreas.filter((f) => f !== 'overview').slice(0, 3).map((f) => (
            <Badge key={f} variant="outline" className="text-xs bg-white border-gray-200 text-gray-600">
              {FOCUS_LABELS[f] ?? f}
            </Badge>
          ))}
        </div>
      </div>

      {/* KPI Row 1: Occupancy + Finance */}
      {(showOccupancy || showFinance) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {showOccupancy && (
            <>
              <StatCard
                title="Tỷ lệ lấp đầy"
                value={`${d?.occupancyRate ?? 0}%`}
                sub={`${fmtArea(d?.leasedArea ?? 0)} / ${fmtArea(d?.totalArea ?? 0)}`}
                icon={Building2}
                color="blue"
                to="/spaces"
              />
              <StatCard
                title="Khách thuê"
                value={d?.totalTenants ?? 0}
                sub="Hợp đồng đang hoạt động"
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
                sub={`Đã thu: ${fmt(d?.collectedRevenue ?? 0)}`}
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
                badge={(d?.overdueCount ?? 0) > 0 ? { text: 'Cần xử lý', variant: 'destructive' } : undefined}
                to="/billing?status=OVERDUE"
              />
            </>
          )}
        </div>
      )}

      {/* KPI Row 2: Leasing + Operations */}
      {(showLeasing || showOperations) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                badge={(bookingStats?.expiringSoon ?? 0) > 0 ? { text: 'Cần xử lý ngay', variant: 'destructive' } : undefined}
                to="/bookings?expiringSoon=true"
              />
              <StatCard
                title="Chờ phê duyệt"
                value={d?.pendingApprovals ?? 0}
                sub="Deal đang trong luồng"
                icon={CheckSquare}
                color="blue"
                to="/approvals"
              />
            </>
          )}
          {(showLeasing || showFinance) && (
            <StatCard
              title="HĐ hết hạn < 30 ngày"
              value={d?.expiringIn30 ?? 0}
              sub={`Trong 90 ngày: ${d?.expiringIn90 ?? 0}`}
              icon={AlertTriangle}
              color="red"
              badge={(d?.expiringIn30 ?? 0) > 0 ? { text: 'Khẩn', variant: 'destructive' } : undefined}
              to="/contracts?expiring=30"
            />
          )}
          {showOperations && (
            <StatCard
              title="Ticket đang mở"
              value={d?.openTickets ?? 0}
              sub="Chưa đóng / chưa giải quyết"
              icon={Ticket}
              color="purple"
              to="/tickets?status=OPEN"
            />
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {showOccupancy && (
          <Card className="border border-gray-100 shadow-sm">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-semibold text-gray-800">Phân bổ diện tích</CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">Tổng NLA: {fmtArea(d?.totalArea ?? 0)}</p>
            </CardHeader>
            <CardContent className="pt-2">
              <OccupancyDonut
                leasedArea={d?.leasedArea ?? 0}
                vacantArea={d?.vacantArea ?? 0}
                otherArea={otherArea}
                occupancyRate={d?.occupancyRate ?? 0}
              />
              <OccupancyLegend
                leasedArea={d?.leasedArea ?? 0}
                vacantArea={d?.vacantArea ?? 0}
                otherArea={otherArea}
              />
            </CardContent>
          </Card>
        )}

        {showFinance && (
          <Card className="border border-gray-100 shadow-sm">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-semibold text-gray-800">Tình hình billing</CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">Tháng hiện tại</p>
            </CardHeader>
            <CardContent className="pt-2">
              <BillingProgress
                monthlyRevenue={d?.monthlyRevenue ?? 0}
                collectedRevenue={d?.collectedRevenue ?? 0}
                overdueAmount={d?.overdueAmount ?? 0}
              />
            </CardContent>
          </Card>
        )}

        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-800">Cần xử lý</CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">Sắp xếp theo mức độ ưu tiên</p>
          </CardHeader>
          <CardContent className="pt-2">
            <ActionItems items={actionItems} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
