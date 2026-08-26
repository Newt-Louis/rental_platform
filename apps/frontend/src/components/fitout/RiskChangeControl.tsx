import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fitoutChangeOrderApi,
  fitoutRiskApi,
  type FitoutChangeOrder,
  type FitoutRisk,
  type FitoutRiskStatus,
} from '@/api/fitout';
import { CircleDollarSign, Plus, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from 'react-i18next';
import { formatDecimalAmountWithoutCurrency, formatDecimalMoneyPreservingCode, getFitoutPresentationLabel, groupChangeOrderAmountsByCurrency } from '@/pages/fitout/fitoutPresentation';
import type { CurrencyCode } from '@/lib/currency';

const unwrapList = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  const data = (value as { data?: unknown } | undefined)?.data;
  return Array.isArray(data) ? data as T[] : [];
};

const riskTone = (score: number) => {
  if (score >= 16) return { level: 'CRITICAL', className: 'bg-red-100 text-red-700' };
  if (score >= 10) return { level: 'HIGH', className: 'bg-orange-100 text-orange-700' };
  if (score >= 5) return { level: 'MEDIUM', className: 'bg-amber-100 text-amber-700' };
  return { level: 'LOW', className: 'bg-emerald-100 text-emerald-700' };
};

const errorMessage = (error: any, fallback: string) => error?.response?.data?.message ?? fallback;

export function RiskRegister({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation('fitout');
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', category: 'SAFETY', probability: '3', impact: '3',
    mitigation: '', dueDate: '',
  });
  const queryKey = ['fitout-risks', projectId];
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fitoutRiskApi.list(projectId),
  });
  const risks = unwrapList<FitoutRisk>(data);
  const openRisks = risks.filter((risk) => risk.status !== 'CLOSED');
  const critical = openRisks.filter((risk) => risk.probability * risk.impact >= 16).length;

  const createMutation = useMutation({
    mutationFn: () => fitoutRiskApi.create({
      projectId,
      title: form.title.trim(),
      category: form.category,
      probability: Number(form.probability),
      impact: Number(form.impact),
      mitigation: form.mitigation.trim() || undefined,
      dueDate: form.dueDate || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setForm({ title: '', category: 'SAFETY', probability: '3', impact: '3', mitigation: '', dueDate: '' });
      setShowForm(false);
      toast({ title: t('riskControl.toast.created') });
    },
    onError: (error) => toast({ title: errorMessage(error, t('riskControl.errorUpdate')), variant: 'destructive' }),
  });
  const transitionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FitoutRiskStatus }) =>
      fitoutRiskApi.transition(projectId, id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (error) => toast({ title: errorMessage(error, t('riskControl.errorUpdate')), variant: 'destructive' }),
  });

  return (
    <section aria-labelledby="risk-register-title" className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{t('riskControl.open')}</div><div className="text-xl font-semibold">{openRisks.length}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{t('riskControl.critical')}</div><div className="text-xl font-semibold text-red-600">{critical}</div></CardContent></Card>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 id="risk-register-title" className="font-semibold">{t('riskControl.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('riskControl.description')}</p>
        </div>
        <Button size="sm" className="gap-1 shrink-0" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
          <Plus size={14} /> {t('riskControl.add')}
        </Button>
      </div>
      {showForm && (
        <Card><CardContent className="p-4 space-y-3">
          <div><Label htmlFor="risk-title">{t('riskControl.fields.title')}</Label><Input id="risk-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><Label>{t('riskControl.fields.category')}</Label><Select value={form.category} onValueChange={(category) => setForm({ ...form, category })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['SAFETY', 'COST', 'SCHEDULE', 'QUALITY', 'COMPLIANCE'].map((category) => <SelectItem key={category} value={category}>{t(`riskControl.category.${category}`)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>{t('riskControl.fields.probability')}</Label><Select value={form.probability} onValueChange={(probability) => setForm({ ...form, probability })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4,5].map((n) => <SelectItem key={n} value={`${n}`}>{n}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>{t('riskControl.fields.impact')}</Label><Select value={form.impact} onValueChange={(impact) => setForm({ ...form, impact })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4,5].map((n) => <SelectItem key={n} value={`${n}`}>{n}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label htmlFor="risk-due">{t('riskControl.fields.dueDate')}</Label><Input id="risk-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          <div><Label htmlFor="risk-mitigation">{t('riskControl.fields.mitigation')}</Label><Textarea id="risk-mitigation" value={form.mitigation} onChange={(e) => setForm({ ...form, mitigation: e.target.value })} /></div>
          <Button className="w-full" disabled={!form.title.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>{t('riskControl.save')}</Button>
        </CardContent></Card>
      )}
      {isLoading && <p role="status" className="text-sm text-muted-foreground">{t('riskControl.loading')}</p>}
      {isError && <p role="alert" className="text-sm text-red-600">{t('riskControl.loadError')}</p>}
      {!isLoading && !isError && risks.length === 0 && <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t('riskControl.empty')}</div>}
      <div className="space-y-2">
        {risks.map((risk) => {
          const score = risk.probability * risk.impact;
          const tone = riskTone(score);
          const ownerName = typeof risk.owner === 'string' ? risk.owner : risk.owner?.fullName;
          return <Card key={risk.id}><CardContent className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2"><div className="flex items-start gap-2 min-w-0"><ShieldAlert size={16} className="mt-0.5 text-amber-600 shrink-0" /><div><p className="text-sm font-medium">{risk.title}</p><p className="text-xs text-muted-foreground">{risk.category ? getFitoutPresentationLabel(t, 'riskControl.category', risk.category) : t('riskControl.other')} · {ownerName || t('riskControl.unassigned')}</p></div></div><Badge className={tone.className}>{t(`riskControl.level.${tone.level}`)} {score}</Badge></div>
            {risk.mitigation && <p className="text-xs rounded bg-muted p-2">{risk.mitigation}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{risk.dueDate ? t('riskControl.due', { date: new Date(risk.dueDate).toLocaleDateString(i18n.resolvedLanguage) }) : t('riskControl.noDueDate')}</span><Select value={risk.status} onValueChange={(status) => transitionMutation.mutate({ id: risk.id, status: status as FitoutRiskStatus })}><SelectTrigger className="h-8 w-36" aria-label={t('riskControl.statusLabel', { title: risk.title })}><SelectValue /></SelectTrigger><SelectContent>{['OPEN', 'MITIGATING', 'CLOSED'].map((status) => <SelectItem key={status} value={status}>{t(`riskControl.status.${status}`)}</SelectItem>)}</SelectContent></Select></div>
          </CardContent></Card>;
        })}
      </div>
    </section>
  );
}

export function ChangeOrderControl({ projectId, contractCurrency }: { projectId: string; contractCurrency?: CurrencyCode }) {
  const { t, i18n } = useTranslation('fitout');
  const locale = i18n.resolvedLanguage ?? 'vi-VN';
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', reason: '', estimatedCost: '', scheduleImpactDays: '0' });
  const queryKey = ['fitout-change-orders', projectId];
  const { data, isLoading, isError } = useQuery({ queryKey, queryFn: () => fitoutChangeOrderApi.list(projectId) });
  const orders = unwrapList<FitoutChangeOrder>(data);
  const totals = useMemo(() => ({
    pending: orders.filter((order) => ['SUBMITTED', 'UNDER_REVIEW'].includes(order.status)).length,
    byCurrency: groupChangeOrderAmountsByCurrency(orders),
  }), [orders]);
  const createMutation = useMutation({
    mutationFn: () => fitoutChangeOrderApi.create({ projectId, title: form.title.trim(), reason: form.reason.trim() || undefined, estimatedCost: form.estimatedCost, scheduleImpactDays: Number(form.scheduleImpactDays) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); setShowForm(false); setForm({ title: '', reason: '', estimatedCost: '', scheduleImpactDays: '0' }); toast({ title: t('changeOrder.toast.created') }); },
    onError: (error) => toast({ title: errorMessage(error, t('changeOrder.errorUpdate')), variant: 'destructive' }),
  });
  const transitionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
      fitoutChangeOrderApi.transition(projectId, id, status, {
        approvedCost: status === 'APPROVED'
          ? orders.find((order) => order.id === id)?.estimatedCost ?? '0.00'
          : undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (error) => toast({ title: errorMessage(error, t('changeOrder.errorUpdate')), variant: 'destructive' }),
  });

  return <section aria-labelledby="change-order-title" className="space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{t('changeOrder.pending')}</div><div className="text-xl font-semibold">{totals.pending}</div></CardContent></Card><Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{t('changeOrder.proposed')}</div><div className="space-y-0.5 text-sm font-semibold">{Object.entries(totals.byCurrency).map(([currency, values]) => <div key={currency}>{currency === 'UNSPECIFIED' ? t('changeOrder.currencyMissing') : formatDecimalMoneyPreservingCode(values.estimated, currency, locale)}</div>)}</div></CardContent></Card><Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{t('changeOrder.approved')}</div><div className="space-y-0.5 text-sm font-semibold text-emerald-700">{Object.entries(totals.byCurrency).map(([currency, values]) => <div key={currency}>{currency === 'UNSPECIFIED' ? t('changeOrder.currencyMissing') : formatDecimalMoneyPreservingCode(values.approved, currency, locale)}</div>)}</div></CardContent></Card></div>
    <div className="flex items-center justify-between gap-2"><div><h3 id="change-order-title" className="font-semibold">{t('changeOrder.title')}</h3><p className="text-xs text-muted-foreground">{t('changeOrder.description')}</p></div><Button size="sm" className="gap-1 shrink-0" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}><Plus size={14} /> {t('changeOrder.add')}</Button></div>
    {showForm && <Card><CardContent className="p-4 space-y-3"><div><Label htmlFor="co-title">{t('changeOrder.fields.title')}</Label><Input id="co-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div><div><Label htmlFor="co-reason">{t('changeOrder.fields.reason')}</Label><Textarea id="co-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label htmlFor="co-cost">{t('changeOrder.fields.estimatedCost')}</Label><Input id="co-cost" inputMode="numeric" type="number" min="0" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">{contractCurrency ? t('changeOrder.inheritedCurrency', { currency: contractCurrency }) : t('changeOrder.currencyMissing')}</p></div><div><Label htmlFor="co-days">{t('changeOrder.fields.scheduleImpact')}</Label><Input id="co-days" type="number" min="0" value={form.scheduleImpactDays} onChange={(e) => setForm({ ...form, scheduleImpactDays: e.target.value })} /></div></div><p className="text-xs text-muted-foreground">{t('changeOrder.requesterHint')}</p><Button className="w-full" disabled={!contractCurrency || !form.title.trim() || !form.estimatedCost || createMutation.isPending} onClick={() => createMutation.mutate()}>{t('changeOrder.save')}</Button></CardContent></Card>}
    {isLoading && <p role="status" className="text-sm text-muted-foreground">{t('changeOrder.loading')}</p>}
    {isError && <p role="alert" className="text-sm text-red-600">{t('changeOrder.loadError')}</p>}
    {!isLoading && !isError && orders.length === 0 && <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t('changeOrder.empty')}</div>}
    <div className="space-y-2">{orders.map((order) => {
      const requesterName = typeof order.requestedBy === 'string' ? order.requestedBy : order.requestedBy?.fullName;
      const approvedAmountMissing = order.status === 'APPROVED' && order.approvedCost == null;
      const displayedAmount = order.status === 'APPROVED' ? order.approvedCost : order.estimatedCost;
      const formatOrderMoney = (amount: string | number) => order.currency?.trim()
        ? formatDecimalMoneyPreservingCode(amount, order.currency, i18n.resolvedLanguage)
        : `${formatDecimalAmountWithoutCurrency(amount, i18n.resolvedLanguage)} · ${t('changeOrder.currencyMissing')}`;
      return <Card key={order.id}><CardContent className="p-3 space-y-2"><div className="flex items-start justify-between gap-2"><div className="flex gap-2 min-w-0"><CircleDollarSign size={16} className="mt-0.5 text-blue-600 shrink-0" /><div><p className="text-sm font-medium">{order.code ? `${order.code} · ` : ''}{order.title}</p><p className="text-xs text-muted-foreground">{requesterName || t('changeOrder.unknownRequester')}</p></div></div><Badge variant="outline">{getFitoutPresentationLabel(t, 'changeOrder.status', order.status)}</Badge></div>{order.reason && <p className="text-xs rounded bg-muted p-2">{order.reason}</p>}<div className="grid grid-cols-2 gap-2 text-xs"><div><span className="text-muted-foreground">{order.status === 'APPROVED' ? t('changeOrder.approved') : t('changeOrder.proposed')}</span><p className="font-medium">{approvedAmountMissing || displayedAmount == null ? t('changeOrder.approvedAmountMissing') : formatOrderMoney(displayedAmount)}</p>{approvedAmountMissing && <p className="text-muted-foreground">{t('changeOrder.proposedValue', { value: formatOrderMoney(order.estimatedCost) })}</p>}</div><div><span className="text-muted-foreground">{t('changeOrder.schedule')}</span><p className="font-medium">{t('changeOrder.days', { count: order.scheduleImpactDays || 0 })}</p></div></div>{['SUBMITTED', 'UNDER_REVIEW'].includes(order.status) && <Select onValueChange={(status) => transitionMutation.mutate({ id: order.id, status: status as 'APPROVED' | 'REJECTED' })}><SelectTrigger className="h-8 w-full" aria-label={t('changeOrder.decisionLabel', { title: order.title })}><SelectValue placeholder={t('changeOrder.selectDecision')} /></SelectTrigger><SelectContent><SelectItem value="APPROVED">{t('changeOrder.approve')}</SelectItem><SelectItem value="REJECTED">{t('changeOrder.reject')}</SelectItem></SelectContent></Select>}</CardContent></Card>;
    })}</div>
  </section>;
}
