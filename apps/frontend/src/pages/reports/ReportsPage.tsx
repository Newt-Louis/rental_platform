import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api';
import api from '@/lib/axios';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { PieChart as PieIcon, Download } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function OccupancyReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-occupancy'],
    queryFn: () => reportsApi.occupancyReport(),
  });

  const d = data?.data ?? data;
  if (isLoading) return <Skeleton className="h-64" />;

  const statusData = d?.byStatus
    ? Object.entries(d.byStatus).map(([k, v]: any) => ({ name: k, value: v }))
    : [];

  const floorData = d?.byFloor
    ? Object.entries(d.byFloor).map(([floor, v]: any) => ({
        floor,
        total: v.total,
        occupied: v.occupied,
        rate: v.total > 0 ? Math.round((v.occupied / v.total) * 100) : 0,
      }))
    : [];

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-sm">Theo trạng thái</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Theo tầng</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={floorData}>
              <XAxis dataKey="floor" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="occupied" name="Đang thuê" fill="#3b82f6" />
              <Bar dataKey="total" name="Tổng" fill="#e5e7eb" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function RevenueReport() {
  const year = new Date().getFullYear();
  const { data, isLoading } = useQuery({
    queryKey: ['report-revenue', year],
    queryFn: () => reportsApi.revenueReport({ year }),
  });

  const d = data?.data ?? data;
  const byPeriod = d?.byPeriod ?? [];

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Doanh thu theo tháng {year}</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={byPeriod}>
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
            <Tooltip formatter={(v: any) => [`${(v / 1e6).toFixed(1)}M VNĐ`]} />
            <Bar dataKey="total" name="Tổng phát hành" fill="#93c5fd" />
            <Bar dataKey="paid" name="Đã thu" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function PipelineReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-pipeline'],
    queryFn: reportsApi.pipelineReport,
  });

  const d = data?.data ?? data;
  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-sm">Leads theo trạng thái</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(d?.leads ?? []).map((l: any, i: number) => (
              <div key={i} className="flex justify-between items-center">
                <span className="text-sm">{l.status}</span>
                <Badge variant="secondary">{l._count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Proposals theo trạng thái</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(d?.proposals ?? []).map((p: any, i: number) => (
              <div key={i} className="flex justify-between items-center">
                <span className="text-sm">{p.status}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{p._count}</Badge>
                  {p._sum?.totalContractValue > 0 && (
                    <span className="text-xs text-gray-500">
                      {(p._sum.totalContractValue / 1e9).toFixed(1)}B
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ContractExpiryReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-expiry'],
    queryFn: () => reportsApi.contractExpiryReport({ days: 180 }),
  });

  const contracts = data?.data ?? data ?? [];
  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">HĐ số</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Khách thuê</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Mặt bằng</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Ngày hết hạn</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">Còn lại</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {contracts.map((c: any) => (
            <tr key={c.id} className={`hover:bg-gray-50 ${c.daysRemaining <= 30 ? 'bg-red-50' : c.daysRemaining <= 90 ? 'bg-yellow-50' : ''}`}>
              <td className="px-4 py-3 font-mono text-xs">{c.contractNumber}</td>
              <td className="px-4 py-3">{c.tenant?.brandName}</td>
              <td className="px-4 py-3 text-gray-500">{c.unit?.code}</td>
              <td className="px-4 py-3 text-gray-500">{new Date(c.endDate).toLocaleDateString('vi-VN')}</td>
              <td className={`px-4 py-3 text-right font-medium ${c.daysRemaining <= 30 ? 'text-red-600' : c.daysRemaining <= 90 ? 'text-orange-500' : 'text-gray-600'}`}>
                {c.daysRemaining} ngày
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {contracts.length === 0 && <div className="text-center py-8 text-gray-400">Không có hợp đồng sắp hết hạn</div>}
    </div>
  );
}

export default function ReportsPage() {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);

  const handleExportCsv = async (type: string) => {
    setExporting(true);
    try {
      const res = await api.get(`/reports/export/${type}`, {
        params: { from: dateFrom, to: dateTo },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${type}_${dateFrom}_${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Lỗi xuất báo cáo', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <PieIcon size={24} className="text-gray-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-sm text-gray-500">Báo cáo tổng hợp</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-500">Từ</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-500">Đến</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          <Button variant="outline" size="sm" onClick={() => handleExportCsv('revenue')} disabled={exporting} className="gap-1.5">
            <Download size={14} /> Xuất CSV
          </Button>
        </div>
      </div>

      <Tabs defaultValue="occupancy">
        <TabsList className="mb-6">
          <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="expiry">HĐ hết hạn</TabsTrigger>
        </TabsList>
        <TabsContent value="occupancy"><OccupancyReport /></TabsContent>
        <TabsContent value="revenue"><RevenueReport /></TabsContent>
        <TabsContent value="pipeline"><PipelineReport /></TabsContent>
        <TabsContent value="expiry"><ContractExpiryReport /></TabsContent>
      </Tabs>
    </div>
  );
}
