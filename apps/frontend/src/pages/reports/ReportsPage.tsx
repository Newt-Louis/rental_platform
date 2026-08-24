import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/axios';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { AsyncState } from '@/components/ui/async-state';
import { PageHeader } from '@/components/ui/page-header';
import { ERPToolbar } from '@/components/erp';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Download, ShieldCheck, AlertTriangle } from 'lucide-react';
import { formatMoneyAmount, type CurrencyCode } from '@/lib/currency';
import { formatExactReportingMoney, formatVndBillionsAxis } from './reportingPresentation';
import { invoiceTypeTranslationKey } from '@/lib/erpEnumPresentation';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function LeaseTermSelector({ value, onChange }: { value: 'LONG' | 'SHORT'; onChange: (value: 'LONG' | 'SHORT') => void }) {
  const { t } = useTranslation('reports');
  return (
    <div className="inline-flex rounded-lg border bg-white p-1">
      {(['LONG', 'SHORT'] as const).map((term) => (
        <button key={term} type="button" onClick={() => onChange(term)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${value === term ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
          {t(`leaseTerm.${term}`)}
        </button>
      ))}
    </div>
  );
}

function OccupancyReport() {
  const [leaseTermType, setLeaseTermType] = useState<'LONG' | 'SHORT'>('LONG');
  const { t } = useTranslation('reports');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['report-occupancy'],
    queryFn: () => reportsApi.occupancyReport(),
  });

  const raw = data?.data ?? data;
  const d = raw?.byLeaseTerm?.[leaseTermType] ?? raw;
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

  return <AsyncState
    isLoading={isLoading}
    isError={isError}
    isEmpty={statusData.length === 0 && floorData.length === 0}
    onRetry={refetch}
    loading={<Skeleton className="h-64" />}
    emptyTitle={t('occupancy.empty')}
    emptyDescription={t('occupancy.emptyDesc')}
  >(
    <div className="space-y-4">
      <LeaseTermSelector value={leaseTermType} onChange={setLeaseTermType} />
      <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-sm">{t('occupancy.byStatus')}</CardTitle></CardHeader>
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
        <CardHeader><CardTitle className="text-sm">{t('occupancy.byFloor')}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={floorData}>
              <XAxis dataKey="floor" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="occupied" name={t('occupancy.occupied')} fill="#3b82f6" />
              <Bar dataKey="total" name={t('occupancy.total')} fill="#e5e7eb" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      </div>
    </div>
  )</AsyncState>;
}

function RevenueReport() {
  const { t } = useTranslation('reports');
  const year = new Date().getFullYear();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['report-revenue', year],
    queryFn: () => reportsApi.revenueReport({ year }),
  });

  const d = data?.data ?? data;
  const byPeriod = d?.byPeriod ?? [];

  return <AsyncState isLoading={isLoading} isError={isError} isEmpty={byPeriod.length === 0} onRetry={refetch}
    loading={<Skeleton className="h-64" />} emptyTitle={t('revenue.empty')}>
    <Card>
      <CardHeader><CardTitle className="text-sm">{t('revenue.byMonth', { year })}<span className="ml-2 font-normal text-muted-foreground">{t('financialUnit')}</span></CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={byPeriod}>
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={formatVndBillionsAxis} />
            <Tooltip formatter={(v: any) => [formatExactReportingMoney(v, 'VND')]} />
            <Bar dataKey="total" name={t('revenue.issued')} fill="#93c5fd" />
            <Bar dataKey="paid" name={t('revenue.collected')} fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  </AsyncState>;
}

function PipelineReport() {
  const [leaseTermType, setLeaseTermType] = useState<'LONG' | 'SHORT'>('LONG');
  const { t } = useTranslation('reports');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['report-pipeline'],
    queryFn: reportsApi.pipelineReport,
  });

  const raw = data?.data ?? data;
  const d = raw?.byLeaseTerm?.[leaseTermType] ?? raw;
  const leads = d?.leads ?? [];
  const proposals = d?.proposals ?? [];

  return <AsyncState isLoading={isLoading} isError={isError}
    isEmpty={leads.length === 0 && proposals.length === 0} onRetry={refetch}
    loading={<Skeleton className="h-64" />} emptyTitle={t('pipeline.empty')}>
    <div className="space-y-4">
      <LeaseTermSelector value={leaseTermType} onChange={setLeaseTermType} />
      <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-sm">{t('pipeline.leadsByStatus')}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {leads.map((l: any, i: number) => (
              <div key={i} className="flex justify-between items-center">
                <span className="text-sm">{t(`pipeline.leadStatus.${l.status}`, { defaultValue: l.status })}</span>
                <Badge variant="secondary">{l._count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">{t('pipeline.proposalsByStatus')}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {proposals.map((p: any, i: number) => {
              // CR-110 (INV-CUR-001): valueByCurrency is a per-currency map --
              // rendered as one badge per currency present, never summed together.
              const currencies = Object.entries(p.valueByCurrency ?? {}).filter(([, v]) => (v as number) > 0);
              return (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-sm">{t(`pipeline.proposalStatus.${p.status}`, { defaultValue: p.status })}</span>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge variant="secondary">{p._count}</Badge>
                    {currencies.map(([code, value]) => (
                      <span key={code} className="text-xs text-gray-500 whitespace-nowrap">
                        {formatExactReportingMoney(value as number, code as CurrencyCode)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  </AsyncState>;
}

function ContractExpiryReport() {
  const { t } = useTranslation('reports');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['report-expiry'],
    queryFn: () => reportsApi.contractExpiryReport({ days: 180 }),
  });

  const contracts = data?.data ?? data ?? [];

  return <AsyncState isLoading={isLoading} isError={isError} isEmpty={contracts.length === 0}
    onRetry={refetch} loading={<Skeleton className="h-64" />}
    emptyTitle={t('expiry.empty')}
    emptyDescription={t('expiry.emptyDesc')}>
    <div className="bg-white rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">{t('expiry.contractNo')}</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">{t('expiry.tenant')}</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">{t('expiry.unit')}</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">{t('expiry.endDate')}</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">{t('expiry.remaining')}</th>
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
                {t('expiry.daysRemaining', { count: c.daysRemaining })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </AsyncState>;
}

// CR-109 Wave 2: this report's totals are computed VND-only server-side
// (reports.service.ts scopes revenue/receivables to currencyCode: 'VND' to
// avoid a cross-currency sum), so 'VND' is passed explicitly, not inferred --
// every card/label using this also discloses "(VND)" since the figure
// silently excludes any USD/MMK records.
function fmtMoney(n: number) {
  return formatMoneyAmount(n, 'VND');
}
function fmtMoneyFullVnd(n: number) {
  return formatExactReportingMoney(n, 'VND');
}

function RevenueReceivablesReport() {
  const { t } = useTranslation('reports');
  const year = new Date().getFullYear();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['report-revenue-receivables', year],
    queryFn: () => reportsApi.revenueReceivablesReport({ year }),
  });
  const d = data?.data ?? data;
  const byPeriod = d?.byPeriod ?? [];
  const byType = d?.byType ?? [];

  return <AsyncState isLoading={isLoading} isError={isError}
    isEmpty={!d || (byPeriod.length === 0 && byType.length === 0 && !d.totalBilled)}
    onRetry={refetch} loading={<Skeleton className="h-64" />}
    emptyTitle={t('revenueReceivables.empty')}>
    <div className="space-y-6">
      <p className="text-xs text-gray-400 -mt-2">{t('revenueReceivables.subtitle')}</p>
      <div className="grid grid-cols-2 border-y bg-card md:grid-cols-4">
        {[[t('revenueReceivables.totalBilled'), fmtMoney(d?.totalBilled ?? 0), ''], [t('revenueReceivables.totalCollected'), fmtMoney(d?.totalCollected ?? 0), 'text-green-700'], [t('revenueReceivables.totalOutstanding'), fmtMoney(d?.totalOutstanding ?? 0), 'text-red-700'], [t('revenueReceivables.collectionRate'), `${d?.collectionRate ?? 0}%`, '']].map(([label, value, tone]) => <div key={label} className="min-w-0 border-b px-4 py-3 even:border-l md:border-b-0 md:border-l md:first:border-l-0"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 break-words text-lg font-semibold tabular-nums ${tone}`}>{value}</p></div>)}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('revenueReceivables.byMonth')}<span className="ml-2 font-normal text-muted-foreground">{t('financialUnit')}</span></CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byPeriod}>
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={formatVndBillionsAxis} />
                <Tooltip formatter={(v: any) => [formatExactReportingMoney(v, 'VND')]} />
                <Bar dataKey="billed" name={t('revenueReceivables.issued')} fill="#93c5fd" />
                <Bar dataKey="collected" name={t('revenueReceivables.collected')} fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('revenueReceivables.byType')}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {byType.map((inv: any) => (
                <div key={inv.type} className="flex justify-between items-center text-sm">
                  <span title={inv.type}>{t(invoiceTypeTranslationKey(inv.type))}</span>
                  <span className="text-gray-500" title={`${fmtMoneyFullVnd(inv.collected)} / ${fmtMoneyFullVnd(inv.billed)}`}>{fmtMoney(inv.collected)} / {fmtMoney(inv.billed)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </AsyncState>;
}

function ArAgingReport() {
  const { t } = useTranslation('reports');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['report-ar-aging'],
    queryFn: () => reportsApi.arAgingReport(),
  });
  const rows: any[] = data?.data ?? data ?? [];

  return <AsyncState isLoading={isLoading} isError={isError} isEmpty={rows.length === 0}
    onRetry={refetch} loading={<Skeleton className="h-64" />}
    emptyTitle={t('arAging.empty')}
    emptyDescription={t('arAging.emptyDesc')}>
    <div className="bg-white rounded-lg border overflow-x-auto">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">{t('arAging.tenant')}</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">{t('arAging.current')}</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">{t('arAging.days30')}</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">{t('arAging.days60')}</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">{t('arAging.days90')}</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">{t('arAging.days90plus')}</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">{t('arAging.total')}</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">{t('common:labels.currency')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r: any, i: number) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">{r.tenant?.brandName}</td>
              <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{formatMoneyAmount(r.current, r.currencyCode)}</td>
              <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{formatMoneyAmount(r.days30, r.currencyCode)}</td>
              <td className="px-4 py-3 text-right text-orange-600 whitespace-nowrap">{formatMoneyAmount(r.days60, r.currencyCode)}</td>
              <td className="px-4 py-3 text-right text-orange-700 whitespace-nowrap">{formatMoneyAmount(r.days90, r.currencyCode)}</td>
              <td className="px-4 py-3 text-right text-red-600 font-medium whitespace-nowrap">{formatMoneyAmount(r.days90plus, r.currencyCode)}</td>
              <td className="px-4 py-3 text-right font-bold whitespace-nowrap">{formatMoneyAmount(r.total, r.currencyCode)}</td>
              <td className="px-4 py-3 text-xs font-mono text-gray-500">{r.currencyCode ?? 'VND'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </AsyncState>;
}

function ComplianceReport() {
  const { t } = useTranslation('reports');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['report-compliance'],
    queryFn: () => reportsApi.complianceReport(),
  });
  const d = data?.data ?? data;

  return <AsyncState isLoading={isLoading} isError={isError} isEmpty={!d}
    onRetry={refetch} loading={<Skeleton className="h-64" />}
    emptyTitle={t('compliance.empty')}>
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">{t('compliance.totalActions')}</p><p className="text-xl font-bold">{d?.totalActions ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">{t('compliance.errorCount')}</p><p className="text-xl font-bold text-red-600">{d?.errorCount ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">{t('compliance.errorRate')}</p><p className="text-xl font-bold">{d?.errorRate ?? 0}%</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">{t('compliance.entityTypes')}</p><p className="text-xl font-bold">{d?.entityTypesTracked ?? 0}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle size={14} className="text-red-500" /> {t('compliance.recentErrors')}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(d?.recentErrors ?? []).map((e: any) => (
              <div key={e.id} className="text-xs bg-red-50 border border-red-100 rounded-lg p-2">
                <div className="flex justify-between">
                  <span className="font-mono">{e.endpoint}</span>
                  <span className="text-gray-400">{new Date(e.createdAt).toLocaleString('vi-VN')}</span>
                </div>
                <div className="text-red-600 mt-0.5">{e.errorMessage}</div>
              </div>
            ))}
            {(!d?.recentErrors || d.recentErrors.length === 0) && (
              <p className="text-center text-gray-400 py-4">{t('compliance.noErrors')}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  </AsyncState>;
}

export default function ReportsPage() {
  const { t } = useTranslation('reports');
  const { user } = useAuthStore();
  const isAdminOrCeo = user?.role === 'ADMIN' || user?.role === 'CEO';
  // Khớp @Roles(...MODULE_ROLES.billingStaff, Role.CEO) của endpoint /reports/ar-aging ở backend.
  const isFinanceOrAbove = ['ADMIN', 'FINANCE', 'MALL_DIRECTOR', 'CEO'].includes(user?.role ?? '');
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
      toast({ title: t('exportError'), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('subtitle')} />
      <ERPToolbar>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-500">{t('dateFrom')}</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-500">{t('dateTo')}</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          <Button variant="outline" size="sm" onClick={() => handleExportCsv('revenue')} disabled={exporting} className="gap-1.5">
            <Download size={14} /> {exporting ? t('exporting') : t('exportCsv')}
          </Button>
        </div>
      </ERPToolbar>

      <Tabs defaultValue="occupancy">
        <TabsList className="mb-4 max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="occupancy">{t('tabs.occupancy')}</TabsTrigger>
          <TabsTrigger value="revenue">{t('tabs.revenue')}</TabsTrigger>
          <TabsTrigger value="pipeline">{t('tabs.pipeline')}</TabsTrigger>
          <TabsTrigger value="expiry">{t('tabs.expiry')}</TabsTrigger>
          <TabsTrigger value="revenue-receivables">{t('tabs.revenueReceivables')}</TabsTrigger>
          {isFinanceOrAbove && <TabsTrigger value="ar-aging">{t('tabs.arAging')}</TabsTrigger>}
          {isAdminOrCeo && (
            <TabsTrigger value="compliance" className="gap-1.5"><ShieldCheck size={13} /> {t('tabs.compliance')}</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="occupancy"><OccupancyReport /></TabsContent>
        <TabsContent value="revenue"><RevenueReport /></TabsContent>
        <TabsContent value="pipeline"><PipelineReport /></TabsContent>
        <TabsContent value="expiry"><ContractExpiryReport /></TabsContent>
        <TabsContent value="revenue-receivables"><RevenueReceivablesReport /></TabsContent>
        {isFinanceOrAbove && <TabsContent value="ar-aging"><ArAgingReport /></TabsContent>}
        {isAdminOrCeo && <TabsContent value="compliance"><ComplianceReport /></TabsContent>}
      </Tabs>
    </div>
  );
}
