import { useQuery } from '@tanstack/react-query';
import { bookingApi, crmApi, reportsApi, slotsApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BookmarkCheck, BookmarkPlus, AlertTriangle, ArrowRight, User,
  FileText, CheckCircle2, TrendingUp, RefreshCw, DollarSign,
  Hourglass, CalendarRange, CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n?: number | null) {
  if (!n) return '—';
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(n) + ' ₫';
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, icon: Icon, color = 'blue', badge }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string; badge?: string;
}) {
  const colorMap: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    yellow: 'bg-amber-50 text-amber-600',
    red:    'bg-red-50 text-red-600',
    purple: 'bg-violet-50 text-violet-600',
    teal:   'bg-teal-50 text-teal-600',
  };
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-lg ${colorMap[color]}`}><Icon size={18} /></div>
        </div>
        {badge && <Badge variant="secondary" className="mt-2 text-xs">{badge}</Badge>}
      </CardContent>
    </Card>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-wider text-gray-400 uppercase mb-3 flex items-center gap-1.5">
      <Icon size={11} /> {children}
    </p>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalesPipelineStatsPage() {
  const { selectedMallId } = useMallStore();

  const { data: bookingStatsData, refetch: refetchBooking, isFetching: fetchingBooking } = useQuery({
    queryKey: ['booking-stats', selectedMallId],
    queryFn: () => bookingApi.stats(selectedMallId ?? undefined),
    refetchInterval: 60_000,
  });

  const { data: pipelineStatsData, refetch: refetchPipeline, isFetching: fetchingPipeline } = useQuery({
    queryKey: ['crm-pipeline-stats'],
    queryFn: () => crmApi.pipelineStats(),
    refetchInterval: 60_000,
  });

  const { data: pipelineReportData, refetch: refetchReport, isFetching: fetchingReport } = useQuery({
    queryKey: ['pipeline-report'],
    queryFn: () => reportsApi.pipelineReport(),
    refetchInterval: 60_000,
  });

  const { data: slotBookingsData, refetch: refetchSlot, isFetching: fetchingSlot } = useQuery({
    queryKey: ['slot-bookings-all', selectedMallId],
    queryFn: () => slotsApi.listAllBookings({ mallId: selectedMallId ?? undefined }),
    refetchInterval: 60_000,
  });

  const isLoading = !bookingStatsData && !pipelineStatsData && !pipelineReportData;
  const isFetching = fetchingBooking || fetchingPipeline || fetchingReport || fetchingSlot;

  function refetchAll() {
    refetchBooking();
    refetchPipeline();
    refetchReport();
    refetchSlot();
  }

  const bs = bookingStatsData?.data ?? bookingStatsData;
  const ps = pipelineStatsData?.data ?? pipelineStatsData;
  const pr = pipelineReportData?.data ?? pipelineReportData;

  const allSlotBookings: any[] = slotBookingsData?.data ?? slotBookingsData ?? [];
  const slotStats = {
    pending:   allSlotBookings.filter((b) => b.status === 'PENDING').length,
    confirmed: allSlotBookings.filter((b) => b.status === 'CONFIRMED').length,
    completed: allSlotBookings.filter((b) => b.status === 'COMPLETED').length,
    revenue:   allSlotBookings
      .filter((b) => ['CONFIRMED', 'COMPLETED'].includes(b.status))
      .reduce((sum: number, b: any) => sum + (b.totalAmount ?? 0), 0),
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  const leadByStatus: Record<string, number> = {};
  (pr?.leads ?? []).forEach((l: any) => { leadByStatus[l.status] = l._count; });

  const proposalByStatus: Record<string, number> = {};
  const proposalValueByStatus: Record<string, number> = {};
  (pr?.proposals ?? []).forEach((p: any) => {
    proposalByStatus[p.status] = p._count;
    proposalValueByStatus[p.status] = p._sum?.totalContractValue ?? 0;
  });

  const activeLeads = Object.entries(leadByStatus)
    .filter(([k]) => !['WON', 'LOST'].includes(k))
    .reduce((sum, [, v]) => sum + v, 0);

  const totalProposals = Object.values(proposalByStatus).reduce((sum, v) => sum + v, 0);
  const approvedProposals = (proposalByStatus['APPROVED'] ?? 0) + (proposalByStatus['CONVERTED'] ?? 0);
  const maxLeadCount = Math.max(1, ...Object.values(leadByStatus));

  const totalProposalValue = Object.values(proposalValueByStatus).reduce((sum, v) => sum + v, 0);

  // ── Config ───────────────────────────────────────────────────────────────────

  const LEAD_STAGES = [
    { key: 'NEW',         label: 'Mới',            color: 'bg-gray-100 text-gray-600',     bar: 'bg-gray-400' },
    { key: 'CONTACTED',   label: 'Đã liên hệ',     color: 'bg-blue-100 text-blue-700',     bar: 'bg-blue-400' },
    { key: 'QUALIFIED',   label: 'Đủ điều kiện',   color: 'bg-indigo-100 text-indigo-700', bar: 'bg-indigo-400' },
    { key: 'PROPOSAL',    label: 'Đề xuất',         color: 'bg-violet-100 text-violet-700', bar: 'bg-violet-400' },
    { key: 'NEGOTIATION', label: 'Đàm phán',        color: 'bg-amber-100 text-amber-700',   bar: 'bg-amber-400' },
    { key: 'WON',         label: 'Thành công',      color: 'bg-green-100 text-green-700',   bar: 'bg-green-500' },
    { key: 'LOST',        label: 'Thất bại',        color: 'bg-red-100 text-red-600',       bar: 'bg-red-400' },
  ];

  const PROPOSAL_STATUSES = [
    { key: 'DRAFT',     label: 'Nháp',      color: 'text-gray-500',   badge: 'bg-gray-100 text-gray-600' },
    { key: 'SUBMITTED', label: 'Đã gửi',    color: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700' },
    { key: 'APPROVED',  label: 'Đã duyệt',  color: 'text-green-600',  badge: 'bg-green-100 text-green-700' },
    { key: 'REJECTED',  label: 'Từ chối',   color: 'text-red-500',    badge: 'bg-red-100 text-red-600' },
    { key: 'CONVERTED', label: 'Đã ký HĐ', color: 'text-violet-600', badge: 'bg-violet-100 text-violet-700' },
  ];

  const funnelSteps: { label: string; sub: string; value: number; color: string; icon: React.ElementType }[] = [
    { label: 'Leads',    sub: 'Đang hoạt động',  value: activeLeads,       color: 'bg-blue-50 border-blue-200 text-blue-700',     icon: User },
    { label: 'Booking',  sub: 'Đang giữ lô',      value: bs?.active ?? 0,   color: 'bg-amber-50 border-amber-200 text-amber-700',  icon: BookmarkCheck },
    { label: 'Proposal', sub: 'Tổng cộng',         value: totalProposals,    color: 'bg-violet-50 border-violet-200 text-violet-700', icon: FileText },
    { label: 'Proposal', sub: 'Đã duyệt / Ký HĐ', value: approvedProposals, color: 'bg-green-50 border-green-200 text-green-700',  icon: CheckCircle2 },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64"><Skeleton className="h-full w-full" /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-36 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Thống kê Quy trình Bán hàng</h1>
          <p className="text-sm text-gray-500 mt-1">Tổng quan pipeline từ Lead → Booking → Proposal → Hợp đồng</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={refetchAll} disabled={isFetching}>
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Làm mới
        </Button>
      </div>

      {/* ─── Funnel ───────────────────────────────────────────────────────────── */}
      <div>
        <SectionHeading icon={TrendingUp}>Phễu Quy Trình Bán Hàng</SectionHeading>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-stretch gap-3 overflow-x-auto">
            {funnelSteps.flatMap((step, i) => {
              const Icon = step.icon;
              const card = (
                <div key={`step-${i}`} className={`flex-1 min-w-[130px] rounded-xl border-2 ${step.color} p-5 text-center flex flex-col items-center justify-center gap-2`}>
                  <Icon size={22} className="opacity-60" />
                  <p className="text-3xl font-bold">{step.value}</p>
                  <div>
                    <p className="text-sm font-semibold">{step.label}</p>
                    <p className="text-xs opacity-70">{step.sub}</p>
                  </div>
                </div>
              );
              if (i < funnelSteps.length - 1) {
                return [card, (
                  <div key={`arrow-${i}`} className="flex items-center shrink-0">
                    <ArrowRight size={22} className="text-gray-300" />
                  </div>
                )];
              }
              return [card];
            })}
          </div>
          {totalProposalValue > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-500">
              <DollarSign size={14} className="text-green-500" />
              Tổng giá trị Proposal:
              <span className="font-bold text-gray-800 ml-1">
                {new Intl.NumberFormat('vi-VN').format(totalProposalValue)} ₫
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Detail grids ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <SectionHeading icon={User}>Lead theo Giai đoạn (CRM)</SectionHeading>
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            {LEAD_STAGES.map(({ key, label, color, bar }) => {
              const count = leadByStatus[key] ?? 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color} w-28 text-center shrink-0`}>
                    {label}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className={`h-2 rounded-full ${bar} transition-all`}
                      style={{ width: `${(count / maxLeadCount) * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-6 text-right shrink-0">{count}</span>
                </div>
              );
            })}
            <div className="pt-2 border-t border-gray-100 flex justify-between text-xs text-gray-500">
              <span>Tổng leads: <strong className="text-gray-700">{Object.values(leadByStatus).reduce((s, v) => s + v, 0)}</strong></span>
              <span>Won: <strong className="text-green-600">{leadByStatus['WON'] ?? 0}</strong> · Lost: <strong className="text-red-500">{leadByStatus['LOST'] ?? 0}</strong></span>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <SectionHeading icon={FileText}>Proposal theo Trạng thái</SectionHeading>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              {PROPOSAL_STATUSES.map(({ key, label, badge }) => {
                const count = proposalByStatus[key] ?? 0;
                const value = proposalValueByStatus[key] ?? 0;
                return (
                  <div key={key} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge}`}>{label}</span>
                    <div className="text-right">
                      <span className="text-sm font-bold text-gray-800">{count}</span>
                      {value > 0 && <div className="text-xs text-gray-400">{fmtMoney(value)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {ps?.conversionRates && (
            <div>
              <SectionHeading icon={TrendingUp}>Tỷ lệ Chuyển đổi Lead</SectionHeading>
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                {[
                  { label: 'Win Rate tổng thể',      value: ps.conversionRates.overallWinRate,        color: 'text-green-600',  bar: 'bg-green-400' },
                  { label: 'Liên hệ → Qualified',    value: ps.conversionRates.contactedToQualified,  color: 'text-blue-600',   bar: 'bg-blue-400' },
                  { label: 'Proposal → Đàm phán',    value: ps.conversionRates.proposalToNegotiation, color: 'text-violet-600', bar: 'bg-violet-400' },
                  { label: 'Đàm phán → Win',         value: ps.conversionRates.negotiationToWon,      color: 'text-amber-600',  bar: 'bg-amber-400' },
                ].map(({ label, value, color, bar }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">{label}</span>
                      <span className={`text-sm font-bold ${color}`}>{Number(value).toFixed(1)}%</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-1.5 rounded-full ${bar} transition-all`}
                        style={{ width: `${Math.min(100, value)}%` }} />
                    </div>
                  </div>
                ))}
                {ps.avgDaysToWin > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-500">Avg. ngày để chốt deal</span>
                    <span className="text-sm font-bold text-gray-700">{Math.round(ps.avgDaysToWin)} ngày</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Booking KPIs (tabs) ──────────────────────────────────────────────── */}
      <Tabs defaultValue="unit">
        <TabsList>
          <TabsTrigger value="unit" className="gap-1.5">
            <BookmarkCheck size={13} className="text-amber-600" /> Booking Giữ Lô
          </TabsTrigger>
          <TabsTrigger value="slot" className="gap-1.5">
            <CalendarDays size={13} className="text-violet-600" /> Booking Ngắn Hạn
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unit" className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Đang active"     value={bs?.active ?? 0}       icon={BookmarkCheck} color="yellow" sub="Đang giữ slot" />
            <StatCard title="Chờ trong queue" value={bs?.pending ?? 0}      icon={BookmarkPlus}  color="blue"   sub="Hàng đợi ưu tiên" />
            <StatCard title="Sắp hết hạn"     value={bs?.expiringSoon ?? 0} icon={AlertTriangle} color="red"
              badge={bs?.expiringSoon > 0 ? 'Cần xử lý' : undefined} />
            <StatCard title="Đã convert"      value={bs?.converted ?? 0}    icon={ArrowRight}    color="green"  sub="Thành Proposal" />
          </div>
        </TabsContent>

        <TabsContent value="slot" className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Chờ xác nhận"   value={slotStats.pending}          icon={Hourglass}     color="blue"   sub="Cần xử lý" />
            <StatCard title="Đã xác nhận"    value={slotStats.confirmed}         icon={CheckCircle2}  color="purple" sub="Đang hiệu lực" />
            <StatCard title="Hoàn thành"     value={slotStats.completed}         icon={CalendarRange} color="green"  sub="Đã kết thúc" />
            <StatCard title="Doanh thu slot" value={fmtMoney(slotStats.revenue)} icon={DollarSign}    color="teal"
              sub="Confirmed + Completed" badge={slotStats.revenue > 0 ? '₫' : undefined} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
