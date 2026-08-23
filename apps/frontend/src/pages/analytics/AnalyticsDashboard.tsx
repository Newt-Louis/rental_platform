import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { analyticsApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { AsyncState } from '@/components/ui/async-state';
import { useMallStore } from '@/store/mall.store';
import {
  TrendingUp, TrendingDown, Building2, AlertTriangle, DollarSign,
  Calendar, Percent, Users, Clock, Shield, RefreshCw,
} from 'lucide-react';
import { formatMoney, formatMoneyAmount, formatMoneyCompact, type CurrencyCode } from '@/lib/currency';

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#06b6d4'];

function StatCard({ title, value, valueTitle, subtitle, icon: Icon, trend, trendUp }: {
  title: string;
  value: string | number;
  /** CR-109 Wave 2: full, non-abbreviated value shown as a native tooltip when
   * `value` is a compact/abbreviated display. */
  valueTitle?: string;
  subtitle?: string;
  icon: any;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">{title}</p>
            <p className="text-2xl font-bold text-gray-900" title={valueTitle}>{value}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
            {trend && (
              <div className={`flex items-center gap-1 mt-1 text-xs ${trendUp ? 'text-green-500' : 'text-red-500'}`}>
                {trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {trend}
              </div>
            )}
          </div>
          <div className="p-2 bg-gray-50 rounded-lg">
            <Icon size={20} className="text-gray-500" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OccupancyTab({ mallId }: { mallId?: string }) {
  const { data: occupancy, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-occupancy', mallId],
    queryFn: () => analyticsApi.getOccupancyV2({ mallId }),
  });

  const { data: trend = [] } = useQuery({
    queryKey: ['analytics-occupancy-trend', mallId],
    queryFn: () => analyticsApi.getOccupancyTrend({ mallId, months: 12 }),
  });

  const { data: vacancy } = useQuery({
    queryKey: ['analytics-vacancy', mallId],
    queryFn: () => analyticsApi.getVacancyAnalysis(mallId),
  });

  if (isLoading) return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}</div>;
  if (isError) return <AsyncState isLoading={false} isError onRetry={refetch} errorTitle="Không thể tải phân tích lấp đầy"><div /></AsyncState>;

  const s = occupancy?.summary ?? {};
  const byCategory = occupancy?.byCategory ?? [];
  const byFloor = occupancy?.byFloor ?? [];
  const byLeaseTerm = occupancy?.byLeaseTerm ?? [];
  const trendData = trend as any[];
  const vacancySummary = vacancy?.summary ?? {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Tỷ lệ lấp đầy" value={`${s.occupancyRate ?? 0}%`} icon={Percent}
          subtitle={`${s.occupiedUnits ?? 0}/${s.totalUnits ?? 0} units`} />
        <StatCard title="Lấp đầy hiệu dụng" value={`${s.effectiveOccupancy ?? 0}%`} icon={Building2}
          subtitle="Bao gồm đang fitout" />
        <StatCard title="Diện tích trống" value={`${Math.round(s.vacantArea ?? 0).toLocaleString()} m²`}
          icon={AlertTriangle} subtitle={`${s.vacantUnits ?? 0} units`} />
        <StatCard title="Ước tính thất thu" value={formatMoneyCompact(vacancySummary.totalEstimatedLoss ?? 0, 'VND')}
          valueTitle={formatMoney(vacancySummary.totalEstimatedLoss ?? 0, 'VND')}
          icon={DollarSign} subtitle="/ tháng" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {byLeaseTerm.map((zone: any) => (
          <Card key={zone.leaseTermType} className={zone.leaseTermType === 'LONG' ? 'border-blue-200' : 'border-violet-200'}>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-800">{zone.name}</div>
                  <div className="text-xs text-gray-400">Tính theo diện tích từng khu</div>
                </div>
                <div className={`text-2xl font-bold ${zone.leaseTermType === 'LONG' ? 'text-blue-700' : 'text-violet-700'}`}>
                  {zone.occupancyRate}%
                </div>
              </div>
              <Progress value={zone.occupancyRate} className="h-3" />
              <div className="mt-2 flex justify-between text-xs text-gray-500">
                <span>{zone.occupied}/{zone.total} mặt bằng</span>
                <span>{Math.round(zone.occupiedArea ?? 0).toLocaleString()} / {Math.round(zone.area ?? 0).toLocaleString()} m²</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Xu hướng lấp đầy 12 tháng</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="occupancyRate" name="Tỷ lệ %" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Theo danh mục</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="occupancyRate" name="Tỷ lệ %" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Theo tầng</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {byFloor.map((f: any) => (
              <div key={f.name} className="flex items-center gap-4">
                <span className="w-16 text-sm font-medium">{f.name}</span>
                <div className="flex-1">
                  <Progress value={f.occupancyRate} className="h-3" />
                </div>
                <span className="w-16 text-sm text-right">{f.occupancyRate}%</span>
                <span className="w-24 text-xs text-gray-400">{f.occupied}/{f.total} units</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RenewalRiskTab({ mallId }: { mallId?: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-renewal-risk', mallId],
    queryFn: () => analyticsApi.getRenewalRiskDashboard(mallId),
  });

  if (isLoading) return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}</div>;
  if (isError) return <AsyncState isLoading={false} isError onRetry={refetch} errorTitle="Không thể tải phân tích rủi ro gia hạn"><div /></AsyncState>;

  const summary = data?.summary ?? {};
  const topRisks = data?.topRisks ?? [];

  const pieData = [
    { name: 'Critical', value: summary.critical ?? 0, color: '#ef4444' },
    { name: 'High', value: summary.high ?? 0, color: '#f97316' },
    { name: 'Medium', value: summary.medium ?? 0, color: '#eab308' },
    { name: 'Low', value: summary.low ?? 0, color: '#22c55e' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Critical" value={summary.critical ?? 0} icon={AlertTriangle}
          subtitle="Cần hành động ngay" />
        <StatCard title="High Risk" value={summary.high ?? 0} icon={TrendingDown}
          subtitle="Cần theo dõi" />
        {(() => {
          // CR-110 (INV-CUR-001): atRiskMonthlyRevenueByCurrency is a per-currency
          // map -- never summed across VND/USD/MMK. Show the largest currency's
          // figure as the headline value; list any others in the subtitle rather
          // than silently dropping them.
          const byCurrency: Record<string, number> = summary.atRiskMonthlyRevenueByCurrency ?? {};
          const entries = Object.entries(byCurrency).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
          const [primaryCode, primaryValue] = entries[0] ?? ['VND', 0];
          const others = entries.slice(1);
          return (
            <StatCard
              title="Doanh thu rủi ro"
              value={formatMoneyCompact(primaryValue, primaryCode as CurrencyCode)}
              valueTitle={formatMoney(primaryValue, primaryCode as CurrencyCode)}
              icon={DollarSign}
              subtitle={others.length > 0
                ? `+ ${others.map(([code, v]) => formatMoneyCompact(v, code as CurrencyCode)).join(', ')} / tháng`
                : '/ tháng'}
            />
          );
        })()}
        <StatCard title="Tổng HĐ theo dõi" value={summary.total ?? 0} icon={Users} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Phân bố rủi ro</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top 10 HĐ rủi ro cao</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {topRisks.map((r: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{r.tenant}</p>
                    <p className="text-xs text-gray-400">{r.contractNumber} • {r.unit}</p>
                  </div>
                  <div className="text-right">
                    <Badge className={
                      r.riskLevel === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                      r.riskLevel === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                      r.riskLevel === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }>
                      {r.riskScore}pts
                    </Badge>
                    <p className="text-xs text-gray-400 mt-1">{r.daysToExpiry} ngày còn lại</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MultiMallTab() {
  const [leaseTermType, setLeaseTermType] = useState<'LONG' | 'SHORT'>('LONG');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-multi-mall'],
    queryFn: () => analyticsApi.getMultiMallComparison(),
  });

  if (isLoading) return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}</div>;
  if (isError) return <AsyncState isLoading={false} isError onRetry={refetch} errorTitle="Không thể tải phân tích liên trung tâm"><div /></AsyncState>;

  const malls = ((data ?? []) as any[]).map((mall) => {
    const segment = mall.byLeaseTerm?.[leaseTermType];
    return segment ? { ...mall, ...segment, totalUnits: segment.total, occupiedUnits: segment.occupied } : mall;
  });

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg border bg-white p-1">
        {(['LONG', 'SHORT'] as const).map((term) => (
          <button key={term} type="button" onClick={() => setLeaseTermType(term)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${leaseTermType === term ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
            {term === 'LONG' ? 'Cho thuê dài hạn' : 'Cho thuê ngắn hạn'}
          </button>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">So sánh hiệu suất các TTTM</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">TTTM</th>
                  <th className="text-right py-2 font-medium">Lấp đầy</th>
                  <th className="text-right py-2 font-medium">Units</th>
                  <th className="text-right py-2 font-medium">Doanh thu/tháng (VND)</th>
                  <th className="text-right py-2 font-medium">VND/m²</th>
                  <th className="text-center py-2 font-medium">Policy</th>
                </tr>
              </thead>
              <tbody>
                {malls.map((m: any) => (
                  <tr key={m.code} className="border-b hover:bg-gray-50">
                    <td className="py-3">
                      <p className="font-medium">{m.mall}</p>
                      <p className="text-xs text-gray-400">{m.code}</p>
                    </td>
                    <td className="text-right py-3">
                      <span className={m.occupancyRate >= 90 ? 'text-green-600' : m.occupancyRate >= 70 ? 'text-yellow-600' : 'text-red-600'}>
                        {m.occupancyRate}%
                      </span>
                    </td>
                    <td className="text-right py-3">{m.occupiedUnits}/{m.totalUnits}</td>
                    <td className="text-right py-3 whitespace-nowrap">{formatMoneyAmount(m.monthlyRevenue, 'VND')}</td>
                    <td className="text-right py-3 whitespace-nowrap">{formatMoneyAmount(m.revenuePerSqm, 'VND')}</td>
                    <td className="text-center py-3">
                      {m.hasPolicy ? (
                        <Badge className="bg-green-100 text-green-700">Đã cấu hình</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-500">Chưa có</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">So sánh tỷ lệ lấp đầy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={malls}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mall" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="occupancyRate" name="Tỷ lệ lấp đầy %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ComplianceTab({ mallId }: { mallId?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: exportsData } = useQuery({
    queryKey: ['compliance-exports', mallId],
    queryFn: () => analyticsApi.listComplianceExports({ mallId }),
  });

  const { data: defaultRetention } = useQuery({
    queryKey: ['compliance-retention-default'],
    queryFn: () => analyticsApi.getDefaultRetention(),
  });

  const { data: mallRetentionData, refetch: refetchRetention } = useQuery({
    queryKey: ['compliance-retention', mallId],
    queryFn: () => analyticsApi.getMallRetention(mallId!),
    enabled: !!mallId,
  });

  const defRet = (defaultRetention as any)?.data ?? defaultRetention ?? {};
  const mallRet = (mallRetentionData as any)?.data?.retentionDays ?? defRet;
  const [retention, setRetention] = useState<Record<string, number>>(mallRet);
  useEffect(() => { setRetention(mallRet); }, [JSON.stringify(mallRet)]);

  const exports: any[] = (exportsData as any)?.data ?? exportsData ?? [];

  const triggerMonthlyMutation = useMutation({
    mutationFn: () => analyticsApi.triggerMonthlyReports(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance-exports'] });
      toast({ title: 'Đã kích hoạt tạo báo cáo tháng' });
    },
  });

  const requestExportMutation = useMutation({
    mutationFn: (exportType: string) => analyticsApi.requestComplianceExport({
      exportType,
      mallId,
      periodStart: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString(),
      periodEnd: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString(),
    }),
    onSuccess: (r: any) => {
      const id = r?.data?.id ?? r?.id;
      if (id) analyticsApi.generateComplianceExport(id);
      qc.invalidateQueries({ queryKey: ['compliance-exports'] });
      toast({ title: 'Đã tạo export' });
    },
  });

  const saveRetentionMutation = useMutation({
    mutationFn: () => analyticsApi.updateMallRetention(mallId!, retention),
    onSuccess: () => { refetchRetention(); toast({ title: 'Đã lưu chính sách lưu trữ' }); },
  });

  const STATUS_COLOR: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-700',
    COMPLETED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-gray-700" />
          <span className="font-semibold text-sm">Compliance & Lưu trữ tài liệu</span>
        </div>
        <div className="flex gap-2">
          {['CONTRACTS', 'INVOICES', 'APPROVALS', 'AUDIT_TRAIL'].map((t) => (
            <Button key={t} size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => requestExportMutation.mutate(t)} disabled={requestExportMutation.isPending}>
              Export {t.replace('_', ' ')}
            </Button>
          ))}
          <Button size="sm" className="h-7 text-xs gap-1" variant="outline"
            onClick={() => triggerMonthlyMutation.mutate()} disabled={triggerMonthlyMutation.isPending}>
            <RefreshCw size={12} /> Monthly Reports
          </Button>
        </div>
      </div>

      {/* Compliance export list */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Export lịch sử</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {exports.slice(0, 20).map((e: any) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{e.exportType}</Badge>
                    <span className="text-xs text-gray-500">{e.mallId ? 'Mall-specific' : 'Global'}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(e.periodStart).toLocaleDateString('vi-VN')} → {new Date(e.periodEnd).toLocaleDateString('vi-VN')}
                  </div>
                </div>
                <div className="text-right">
                  <Badge className={`${STATUS_COLOR[e.status] ?? 'bg-gray-100 text-gray-600'} border-0 text-xs`}>{e.status}</Badge>
                  <div className="text-xs text-gray-400 mt-0.5">{new Date(e.createdAt).toLocaleString('vi-VN')}</div>
                </div>
              </div>
            ))}
            {exports.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Chưa có export nào</p>}
          </div>
        </CardContent>
      </Card>

      {/* Retention policy */}
      {mallId && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Chính sách lưu trữ tài liệu</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-gray-500 mb-3">Số ngày lưu trữ tối thiểu theo loại tài liệu</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {Object.entries(Object.keys(defRet).length ? defRet : { CONTRACTS: 3650, INVOICES: 2555, APPROVALS: 1825, AUDIT_TRAIL: 2555, FITOUT_DOCS: 3650, PAYMENTS: 2555 }).map(([key, defaultDays]) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 mb-1 block">{key} (ngày)</label>
                  <Input type="number" className="h-8 text-xs" value={retention[key] ?? defaultDays}
                    onChange={(e) => setRetention((r) => ({ ...r, [key]: +e.target.value }))} />
                  <div className="text-xs text-gray-400">{Math.round(((retention[key] ?? (defaultDays as number)) / 365) * 10) / 10} năm</div>
                </div>
              ))}
            </div>
            <Button size="sm" onClick={() => saveRetentionMutation.mutate()} disabled={saveRetentionMutation.isPending}>
              Lưu chính sách
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const selectedMall = useMallStore((state) => state.selectedMallId) || '';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-500 text-sm">Phân tích hiệu suất và rủi ro</p>
        </div>
      </div>

      <Tabs defaultValue="occupancy">
        <TabsList className="mb-6">
          <TabsTrigger value="occupancy">Lấp đầy & Trống</TabsTrigger>
          <TabsTrigger value="renewal-risk">Rủi ro gia hạn</TabsTrigger>
          <TabsTrigger value="multi-mall">So sánh TTTM</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="occupancy">
          <OccupancyTab mallId={selectedMall || undefined} />
        </TabsContent>

        <TabsContent value="renewal-risk">
          <RenewalRiskTab mallId={selectedMall || undefined} />
        </TabsContent>

        <TabsContent value="multi-mall">
          <MultiMallTab />
        </TabsContent>

        <TabsContent value="compliance">
          <ComplianceTab mallId={selectedMall || undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
