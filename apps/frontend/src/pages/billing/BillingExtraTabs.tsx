import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingApi, contractsApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { RefreshCw, Calendar, Bell, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useMallStore } from '@/store/mall.store';
import { formatMoneyAmount, formatMoneyWithCode, type CurrencyCode } from '@/lib/currency';

export function ScheduleTab() {
  const { t } = useTranslation(['billing', 'contracts', 'common']);
  const [contractId, setContractId] = useState('');
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: contracts } = useQuery({
    queryKey: ['contracts-active'],
    queryFn: () => contractsApi.listContracts({ status: 'ACTIVE', limit: 100 }),
  });

  const { data: schedule, isLoading, refetch } = useQuery({
    queryKey: ['billing-schedule', contractId],
    queryFn: () => billingApi.getSchedule(contractId),
    enabled: !!contractId,
  });

  const buildMutation = useMutation({
    mutationFn: () => billingApi.buildSchedule(contractId),
    onSuccess: () => { refetch(); toast({ title: t('billing:schedule.buildSuccess') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const generateMutation = useMutation({
    mutationFn: () => billingApi.generateDueInvoices(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: t('billing:schedule.generateSuccess', { count: r?.created ?? 0 }) });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('billing:schedule.generateError'), variant: 'destructive' }),
  });

  const entries: any[] = schedule?.data ?? schedule ?? [];
  const contractList: any[] = contracts?.data ?? [];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          className="border rounded-lg px-3 py-2 text-sm min-w-[240px]"
          value={contractId}
          onChange={(e) => setContractId(e.target.value)}
        >
          <option value="">{t('billing:schedule.selectContract')}</option>
          {contractList.map((c) => (
            <option key={c.id} value={c.id}>{c.contractNumber} — {c.tenant?.brandName}</option>
          ))}
        </select>
        {contractId && (
          <Button size="sm" variant="outline" onClick={() => buildMutation.mutate()} disabled={buildMutation.isPending}>
            <Calendar size={14} className="mr-1" /> {t('billing:schedule.rebuild')}
          </Button>
        )}
        <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
          <RefreshCw size={14} className="mr-1" /> {t('billing:schedule.generateDue')}
        </Button>
      </div>

      {!contractId ? (
        <p className="text-sm text-gray-500">{t('billing:schedule.selectContractPrompt')}</p>
      ) : isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2">{t('billing:list.period')}</th>
                <th className="text-right px-3 py-2">{t('billing:invoice.lineType.RENT')}</th>
                <th className="text-right px-3 py-2">{t('billing:invoice.lineType.CAM')}</th>
                <th className="text-left px-3 py-2">{t('common:labels.currency')}</th>
                <th className="text-left px-3 py-2">{t('billing:list.dueDate')}</th>
                <th className="text-left px-3 py-2">{t('billing:list.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2">{e.period}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoneyAmount(e.rentAmount, (e.currencyCode ?? 'VND') as CurrencyCode)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoneyAmount(e.camAmount, (e.currencyCode ?? 'VND') as CurrencyCode)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{e.currencyCode ?? 'VND'}</td>
                  <td className="px-3 py-2">{new Date(e.dueDate).toLocaleDateString('vi-VN')}</td>
                  <td className="px-3 py-2"><Badge variant="outline" title={e.status}>{t(`contracts:billingTab.entryStatus.${e.status}`, { defaultValue: t('common:unknownValue') })}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">{t('billing:schedule.noSchedule')}</p>}
        </div>
      )}
    </div>
  );
}

export function DunningTab() {
  const { t } = useTranslation(['billing', 'common']);
  const { toast } = useToast();
  const { data: policies, isLoading } = useQuery({
    queryKey: ['dunning-policies'],
    queryFn: billingApi.listDunningPolicies,
  });

  const runMutation = useMutation({
    mutationFn: billingApi.runDunning,
    onSuccess: (r) => toast({ title: t('billing:dunning.runSuccess', { count: r?.notified ?? 0 }) }),
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('billing:dunning.runError'), variant: 'destructive' }),
  });

  const penaltyMutation = useMutation({
    mutationFn: billingApi.runPenalty,
    onSuccess: (r) => toast({ title: t('billing:dunning.penaltySuccess', { count: r?.created ?? 0 }) }),
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('billing:dunning.penaltyError'), variant: 'destructive' }),
  });

  const list: any[] = policies?.data ?? policies ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
          <Bell size={14} className="mr-1" /> {t('billing:dunning.runBtn')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => penaltyMutation.mutate()} disabled={penaltyMutation.isPending}>
          {t('billing:dunning.penaltyBtn')}
        </Button>
      </div>
      {isLoading ? <Skeleton className="h-32" /> : (
        <div className="grid gap-3 md:grid-cols-3">
          {list.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">L{p.level} — {p.name}</CardTitle></CardHeader>
              <CardContent className="text-xs text-gray-600">
                Quá hạn {p.minDaysOverdue}–{p.maxDaysOverdue ?? '∞'} ngày
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function CollectionKpiTab() {
  const { selectedMallId } = useMallStore();
  const { data, isLoading } = useQuery({
    queryKey: ['collection-kpi', selectedMallId],
    queryFn: () => billingApi.getCollectionKpi(6, selectedMallId || undefined),
  });

  const kpi = data?.data ?? data ?? {};
  const chartData = (kpi.agingTrend ?? []).map((row: any) => ({
    ...row,
    currentBillions: Number(row.current || 0) / 1_000_000_000,
    overdueBillions: Number(row.overdue || 0) / 1_000_000_000,
  }));

  return (
    <div>
      {isLoading ? <Skeleton className="h-64" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6 xl:grid-cols-4">
            <Card><CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">DSO (ngày)</p>
              <p className="text-2xl font-bold text-gray-900">{kpi.dso ?? 0}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">Collection rate</p>
              <p className="text-2xl font-bold text-green-700">{kpi.collectionRate ?? 0}%</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">Đã thu</p>
              <p className="text-lg font-bold tabular-nums">{formatMoneyWithCode(kpi.totalCollected ?? 0, 'VND')}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">AR outstanding</p>
              <p className="text-lg font-bold text-red-600 tabular-nums">{formatMoneyWithCode(kpi.outstandingAr ?? 0, 'VND')}</p>
            </CardContent></Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp size={16} /> AR Aging trend</CardTitle><p className="text-xs text-muted-foreground">Đơn vị: Tỷ VND</p></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value)} />
                  <Tooltip formatter={(value: number) => formatMoneyWithCode(Number(value) * 1_000_000_000, 'VND')} />
                  <Legend />
                  <Line type="monotone" dataKey="currentBillions" name="Trong hạn" stroke="#22c55e" strokeWidth={2} />
                  <Line type="monotone" dataKey="overdueBillions" name="Quá hạn" stroke="#ef4444" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
