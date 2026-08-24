import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tenantsApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { usePermission } from '@/hooks/usePermission';
import { formatMoney, type CurrencyCode } from '@/lib/currency';
import {
  Search, Building2, Phone, Mail, FileText, Receipt, Ticket,
  Plus, Edit2, Globe, Shield, MapPin, Hash, User, X,
  TrendingUp, CheckCircle, Clock, XCircle, AlertCircle,
  ChevronRight, CalendarDays, Banknote, MoreHorizontal, KeyRound, RotateCcw,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { color: string; emoji: string }> = {
  FB:            { color: 'bg-orange-100 text-orange-700 border-orange-200', emoji: '🍜' },
  FASHION:       { color: 'bg-pink-100 text-pink-700 border-pink-200',       emoji: '👗' },
  ENTERTAINMENT: { color: 'bg-purple-100 text-purple-700 border-purple-200', emoji: '🎮' },
  SERVICES:      { color: 'bg-blue-100 text-blue-700 border-blue-200',       emoji: '⚙️' },
  EDUCATION:     { color: 'bg-green-100 text-green-700 border-green-200',    emoji: '📚' },
  HEALTH:        { color: 'bg-red-100 text-red-700 border-red-200',          emoji: '🏥' },
  RETAIL:        { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', emoji: '🛍️' },
};

const CONTRACT_STATUS: Record<string, { color: string; dot: string }> = {
  ACTIVE:           { color: 'text-green-700', dot: 'bg-green-500'  },
  EXPIRING:         { color: 'text-orange-600', dot: 'bg-orange-400' },
  PENDING_SIGNATURE:{ color: 'text-blue-600',  dot: 'bg-blue-400'   },
  DRAFT:            { color: 'text-gray-500',  dot: 'bg-gray-300'   },
  TERMINATED:       { color: 'text-red-500',   dot: 'bg-red-400'    },
  EXPIRED:          { color: 'text-red-400',   dot: 'bg-red-300'    },
};

const INVOICE_STATUS: Record<string, { color: string }> = {
  PAID:           { color: 'bg-green-100 text-green-700' },
  OVERDUE:        { color: 'bg-red-100 text-red-700' },
  ISSUED:         { color: 'bg-blue-100 text-blue-700' },
  PARTIALLY_PAID: { color: 'bg-amber-100 text-amber-700' },
  DRAFT:          { color: 'bg-gray-100 text-gray-600' },
};

function fmtMoney(n?: number | null, currencyCode: CurrencyCode = 'VND') {
  if (!n) return '—';
  return formatMoney(n, currencyCode);
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function daysUntil(d?: string | null) {
  if (!d) return null;
  return Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
}

// ── Create/Edit Tenant Dialog ─────────────────────────────────────────────────

const EMPTY_FORM = {
  brandName: '', companyName: '', taxCode: '', contactName: '',
  contactEmail: '', contactPhone: '', address: '', category: '',
  isPortalUser: true,
};

const PHONE_RE = /^(0|\+84)[0-9]{8,10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAX_RE = /^\d{10}(-\d{3})?$/;

function validateField(k: string, v: string, t: (key: string) => string): string {
  switch (k) {
    case 'brandName':
      if (!v.trim()) return t('validation.brandRequired');
      if (v.length > 100) return t('validation.brandMaxLength');
      return '';
    case 'companyName':
      if (v.length > 200) return t('validation.companyMaxLength');
      return '';
    case 'taxCode':
      if (v && !TAX_RE.test(v.trim())) return t('validation.taxCodeInvalid');
      return '';
    case 'contactEmail':
      if (v && !EMAIL_RE.test(v.trim())) return t('validation.emailInvalid');
      return '';
    case 'contactPhone':
      if (v && !PHONE_RE.test(v.trim())) return t('validation.phoneInvalid');
      return '';
    case 'contactName':
      if (v.length > 100) return t('validation.contactNameMaxLength');
      return '';
    case 'address':
      if (v.length > 500) return t('validation.addressMaxLength');
      return '';
    default:
      return '';
  }
}

function TenantFormDialog({ open, onClose, onCreated, tenant }: { open: boolean; onClose: () => void; onCreated?: () => void; tenant?: any }) {
  const { t } = useTranslation(['tenants', 'common']);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(tenant ? {
    brandName: tenant.brandName ?? '',
    companyName: tenant.companyName ?? '',
    taxCode: tenant.taxCode ?? '',
    contactName: tenant.contactName ?? '',
    contactEmail: tenant.contactEmail ?? '',
    contactPhone: tenant.contactPhone ?? '',
    address: tenant.address ?? '',
    category: tenant.category ?? '',
    isPortalUser: tenant.isPortalUser ?? false,
  } : { ...EMPTY_FORM });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: any) => {
    setForm((f) => ({ ...f, [k]: v }));
    // Re-validate live only for fields that already show an error
    if (typeof v === 'string' && k in fieldErrors) {
      const err = validateField(k, v, (key) => t(key));
      setFieldErrors((prev) => {
        const next = { ...prev };
        if (err) next[k] = err; else delete next[k];
        return next;
      });
    }
  };

  const blur = (k: string) => {
    const v = (form as any)[k];
    if (typeof v !== 'string') return;
    const err = validateField(k, v, (key) => t(key));
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (err) next[k] = err; else delete next[k];
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: () => tenant
      ? tenantsApi.updateTenant(tenant.id, form)
      : tenantsApi.createTenant(form),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      if (tenant) qc.invalidateQueries({ queryKey: ['tenant', tenant.id] });
      toast({
        title: tenant ? t('tenants:updateSuccess') : t('tenants:createSuccess'),
        description: !tenant && result?.portalAccount
          ? (result.portalAccount.emailSent
            ? t('tenants:portal.invitationSent', { email: result.portalAccount.email })
            : t('tenants:portal.invitationNotSent', { email: result.portalAccount.email }))
          : undefined,
      });
      if (!tenant) onCreated?.();
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const handleSubmit = () => {
    const allErrors: Record<string, string> = {};
    for (const k of Object.keys(form)) {
      const v = (form as any)[k];
      if (typeof v !== 'string') continue;
      const err = validateField(k, v, (key) => t(key));
      if (err) allErrors[k] = err;
    }
    if (!tenant && !form.contactEmail.trim()) allErrors.contactEmail = t('tenants:validation.portalEmailRequired');
    setFieldErrors(allErrors);
    if (Object.keys(allErrors).length > 0) return;
    mutation.mutate();
  };

  const fe = fieldErrors;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tenant ? t('tenants:form.editTitle') : t('tenants:form.addTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('tenants:form.brand')}</label>
              <Input
                value={form.brandName}
                onChange={(e) => set('brandName', e.target.value)}
                onBlur={() => blur('brandName')}
                maxLength={100}
                placeholder={t('tenants:form.brandPlaceholder')}
                error={!!fe.brandName}
              />
              {fe.brandName && <p className="text-xs text-red-500 mt-1">{fe.brandName}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('tenants:form.company')}</label>
              <Input
                value={form.companyName}
                onChange={(e) => set('companyName', e.target.value)}
                onBlur={() => blur('companyName')}
                maxLength={200}
                placeholder={t('tenants:form.companyPlaceholder')}
                error={!!fe.companyName}
              />
              {fe.companyName && <p className="text-xs text-red-500 mt-1">{fe.companyName}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('tenants:form.taxCode')}</label>
              <Input
                value={form.taxCode}
                onChange={(e) => set('taxCode', e.target.value)}
                onBlur={() => blur('taxCode')}
                maxLength={14}
                placeholder={t('tenants:form.taxCodePlaceholder')}
                error={!!fe.taxCode}
              />
              {fe.taxCode && <p className="text-xs text-red-500 mt-1">{fe.taxCode}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('tenants:form.category')}</label>
              <select className="w-full border rounded-md h-9 px-2 text-sm" value={form.category}
                onChange={(e) => set('category', e.target.value)}>
                <option value="">{t('tenants:form.selectCategory')}</option>
                {Object.entries(CATEGORY_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.emoji} {t('tenants:category.' + k)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('tenants:form.contactName')}</label>
              <Input
                value={form.contactName}
                onChange={(e) => set('contactName', e.target.value)}
                onBlur={() => blur('contactName')}
                maxLength={100}
                error={!!fe.contactName}
              />
              {fe.contactName && <p className="text-xs text-red-500 mt-1">{fe.contactName}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('tenants:form.contactEmail')}</label>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
                onBlur={() => blur('contactEmail')}
                maxLength={255}
                placeholder="example@company.com"
                error={!!fe.contactEmail}
              />
              {fe.contactEmail && <p className="text-xs text-red-500 mt-1">{fe.contactEmail}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('tenants:form.contactPhone')}</label>
              <Input
                value={form.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)}
                onBlur={() => blur('contactPhone')}
                maxLength={15}
                placeholder="0912345678"
                error={!!fe.contactPhone}
              />
              {fe.contactPhone && <p className="text-xs text-red-500 mt-1">{fe.contactPhone}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('tenants:form.address')}</label>
              <Input
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                onBlur={() => blur('address')}
                maxLength={500}
                error={!!fe.address}
              />
              {fe.address && <p className="text-xs text-red-500 mt-1">{fe.address}</p>}
            </div>
          </div>
          {!tenant && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                <Globe size={15} /> {t('tenants:form.portalAutoTitle')}
              </div>
              <p className="mt-1 text-xs text-blue-700">{t('tenants:form.portalAutoNote')}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>{t('tenants:form.cancel')}</Button>
            <Button disabled={mutation.isPending} onClick={handleSubmit}>
              {mutation.isPending ? t('tenants:form.saving') : (tenant ? t('tenants:form.update') : t('tenants:form.create'))}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Tenant Detail Panel ───────────────────────────────────────────────────────

function TenantDetailPanel({ tenantId, onEdit, onClose, canEdit }: {
  tenantId: string; onEdit: () => void; onClose: () => void; canEdit: boolean;
}) {
  const { t } = useTranslation('tenants');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => tenantsApi.getTenant(tenantId),
    enabled: !!tenantId,
  });

  const td = data;
  const portalUser = td?.portalUsers?.[0];
  const contracts: any[] = td?.contracts ?? [];
  const invoices: any[] = td?.invoices ?? [];
  const tickets: any[] = td?.tickets ?? [];
  const units: any[] = td?.occupiedUnits ?? [];

  const activeContract = contracts.find((c: any) => c.status === 'ACTIVE' || c.status === 'EXPIRING');
  const overdueInvoices = invoices.filter((i: any) => i.status === 'OVERDUE');
  const monthlyRent = activeContract ? (activeContract.rent ?? 0) + (activeContract.cam ?? 0) : 0;

  const catMeta = td?.category ? CATEGORY_META[td.category] : null;

  const resetPortal = useMutation({
    mutationFn: () => tenantsApi.resetPortalPassword(tenantId),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      toast({
        title: t('portal.resetSuccess'),
        description: result?.emailSent
          ? t('portal.invitationSent', { email: result.email })
          : t('portal.invitationNotSent', { email: result?.email }),
      });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('portal.actionFailed'), variant: 'destructive' }),
  });

  const createPortal = useMutation({
    mutationFn: () => tenantsApi.createPortalAccount(tenantId),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast({
        title: t('portal.accountCreated'),
        description: result?.emailSent
          ? t('portal.invitationSent', { email: result.email })
          : t('portal.invitationNotSent', { email: result?.email }),
      });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('portal.actionFailed'), variant: 'destructive' }),
  });

  const setPortalPassword = useMutation({
    mutationFn: () => tenantsApi.setPortalPassword(tenantId, newPassword),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      setPasswordOpen(false);
      setNewPassword('');
      setConfirmPassword('');
      toast({ title: t('portal.passwordUpdated') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('portal.actionFailed'), variant: 'destructive' }),
  });

  const submitPassword = () => {
    if (newPassword.length < 8) return toast({ title: t('portal.passwordMin'), variant: 'destructive' });
    if (newPassword !== confirmPassword) return toast({ title: t('portal.passwordMismatch'), variant: 'destructive' });
    setPortalPassword.mutate();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-100 bg-slate-50 px-6 pb-4 pt-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-lg font-bold text-white">
              {td?.brandName?.[0] ?? '?'}
            </div>
            <div>
              {isLoading ? <Skeleton className="h-6 w-40 mb-1" /> : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-gray-900">{td?.brandName}</h2>
                  {catMeta && td?.category && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${catMeta.color}`}>
                      {catMeta.emoji} {t('category.' + td.category)}
                    </span>
                  )}
                  {td?.isPortalUser && (
                    <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <Globe size={10} /> Portal
                    </span>
                  )}
                </div>
              )}
              {isLoading ? <Skeleton className="h-4 w-56" /> : (
                <p className="text-sm text-gray-500 mt-0.5">{td?.companyName ?? '—'}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5 h-8">
              <Edit2 size={12} /> {t('list.edit')}
            </Button>}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X size={16} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-gray-800">{td?._count?.contracts ?? contracts.length}</div>
            <div className="text-xs text-gray-400 mt-0.5">{t('kpi.contracts')}</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-blue-700">{fmtMoney(monthlyRent, activeContract?.currencyCode)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{t('kpi.monthlyRent')}</div>
          </div>
          <div className={`border rounded-xl p-3 text-center ${overdueInvoices.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
            <div className={`text-lg font-bold ${overdueInvoices.length > 0 ? 'text-red-600' : 'text-gray-800'}`}>
              {overdueInvoices.length}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{t('kpi.overdue')}</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-gray-800">{units.length}</div>
            <div className="text-xs text-gray-400 mt-0.5">{t('kpi.units')}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-8 w-full" /><Skeleton className="h-32" /><Skeleton className="h-24" />
          </div>
        ) : (
          <Tabs defaultValue="info" className="px-5 pt-4 pb-6">
            <TabsList className="grid grid-cols-5 w-full mb-4">
              <TabsTrigger value="info">{t('tabs.info')}</TabsTrigger>
              <TabsTrigger value="contracts">{`${t('tabs.contracts')} (${contracts.length})`}</TabsTrigger>
              <TabsTrigger value="invoices">{`${t('tabs.invoices')} (${invoices.length})`}</TabsTrigger>
              <TabsTrigger value="tickets">{`${t('tabs.tickets')} (${tickets.length})`}</TabsTrigger>
              <TabsTrigger value="portal">{t('tabs.portal')}</TabsTrigger>
            </TabsList>

            {/* Tab: Thông tin */}
            <TabsContent value="info" className="space-y-4">
              <div className="space-y-2.5">
                {td?.contactName && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <User size={13} className="text-gray-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">{t('info.contact')}</div>
                      <div className="text-sm font-medium text-gray-800">{td.contactName}</div>
                    </div>
                  </div>
                )}
                {td?.contactPhone && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <Phone size={13} className="text-blue-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">{t('info.phone')}</div>
                      <a href={`tel:${td.contactPhone}`} className="text-sm font-medium text-blue-600 hover:underline">{td.contactPhone}</a>
                    </div>
                  </div>
                )}
                {td?.contactEmail && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <Mail size={13} className="text-blue-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">{t('info.email')}</div>
                      <a href={`mailto:${td.contactEmail}`} className="text-sm font-medium text-blue-600 hover:underline">{td.contactEmail}</a>
                    </div>
                  </div>
                )}
                {td?.taxCode && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <Hash size={13} className="text-gray-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">{t('info.taxCode')}</div>
                      <div className="text-sm font-medium text-gray-800 font-mono">{td.taxCode}</div>
                    </div>
                  </div>
                )}
                {td?.address && (
                  <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin size={13} className="text-gray-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">{t('info.address')}</div>
                      <div className="text-sm text-gray-700">{td.address}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mặt bằng đang thuê */}
              {units.length > 0 && (
                <div className="border-t pt-4">
                  <div className="text-xs font-bold tracking-wider text-gray-400 mb-2 uppercase">{t('info.unitsOccupied')}</div>
                  <div className="space-y-2">
                    {units.map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Building2 size={14} className="text-blue-600 shrink-0" />
                          <div>
                            <div className="text-sm font-semibold text-blue-900">{u.code}</div>
                            <div className="text-xs text-blue-600">{u.floor?.name}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-700">{u.areaNLA} m²</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Tab: Hợp đồng */}
            <TabsContent value="contracts" className="space-y-2">
              {contracts.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <FileText size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t('info.noContracts')}</p>
                </div>
              ) : contracts.map((c: any) => {
                const cs = CONTRACT_STATUS[c.status] ?? { color: 'text-gray-500', dot: 'bg-gray-300' };
                const days = daysUntil(c.endDate);
                return (
                  <div key={c.id}
                    className="p-3 border border-gray-100 rounded-xl hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer transition-all"
                    onClick={() => navigate('/contracts')}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-500">{c.contractNumber}</span>
                          <span className={`flex items-center gap-1 text-xs font-medium ${cs.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cs.dot}`} />
                            {t('contractStatus.' + c.status)}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-gray-800 mt-0.5">{c.unit?.code}</div>
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <CalendarDays size={10} />
                          {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
                          {days !== null && days <= 90 && days > 0 && (
                            <span className={`ml-1 font-medium ${days <= 30 ? 'text-red-500' : 'text-orange-500'}`}>
                              {t('info.daysLeft', { count: days })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-gray-800 whitespace-nowrap">
                          {fmtMoney(c.rent, c.currencyCode)}
                        </div>
                        <div className="text-xs text-gray-400">{t('info.perMonth')}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" size="sm" className="w-full gap-1.5 mt-2 text-xs h-8"
                onClick={() => navigate('/contracts')}>
                <ChevronRight size={12} /> {t('info.viewAllContracts')}
              </Button>
            </TabsContent>

            {/* Tab: Hóa đơn */}
            <TabsContent value="invoices" className="space-y-2">
              {invoices.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Receipt size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t('info.noInvoices')}</p>
                </div>
              ) : invoices.slice(0, 10).map((inv: any) => {
                const is = INVOICE_STATUS[inv.status] ?? { color: 'bg-gray-100 text-gray-600' };
                return (
                  <div key={inv.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">{inv.invoiceNumber}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${is.color}`}>{t('invoiceStatus.' + inv.status)}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <Clock size={10} /> {inv.period} · {t('info.dueDate')} {fmtDate(inv.dueDate)}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-gray-800 whitespace-nowrap">
                      {fmtMoney(inv.totalAmount, inv.currencyCode)}
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" size="sm" className="w-full gap-1.5 mt-2 text-xs h-8"
                onClick={() => navigate('/billing')}>
                <ChevronRight size={12} /> {t('info.viewAllInvoices')}
              </Button>
            </TabsContent>

            {/* Tab: Tickets */}
            <TabsContent value="tickets" className="space-y-2">
              {tickets.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Ticket size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t('info.noTickets')}</p>
                </div>
              ) : tickets.map((tk: any) => (
                <div key={tk.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                  <div>
                    <div className="font-mono text-xs text-gray-500">{tk.ticketNumber}</div>
                    <div className="text-sm text-gray-700 mt-0.5">{tk.subject ?? tk.title}</div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{t(`ticketStatus.${tk.status}`, { defaultValue: tk.status })}</Badge>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full gap-1.5 mt-2 text-xs h-8"
                onClick={() => navigate('/tickets')}>
                <ChevronRight size={12} /> {t('info.viewAllTickets')}
              </Button>
            </TabsContent>

            {/* Tab: Portal */}
            <TabsContent value="portal">
              <div className="rounded-xl border border-gray-100 p-4 space-y-3 mt-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Globe size={14} className="text-blue-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{t('portal.title')}</div>
                    <div className="text-xs text-gray-400">{t('portal.subtitle')}</div>
                  </div>
                  <div className="ml-auto">
                    {portalUser
                      ? <Badge className="bg-green-100 text-green-700 border-0 gap-1"><CheckCircle size={10} />{t('portal.granted')}</Badge>
                      : <Badge variant="outline" className="text-gray-400 gap-1"><XCircle size={10} />{t('portal.notGranted')}</Badge>
                    }
                  </div>
                </div>
                {portalUser ? (
                  <div className="space-y-3 border-t pt-3">
                    <div className="grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
                      <div><span className="text-gray-400">{t('portal.loginEmail')}</span><div className="font-medium text-gray-800">{portalUser.email}</div></div>
                      <div><span className="text-gray-400">{t('portal.accountStatus')}</span><div className="font-medium text-gray-800">{portalUser.isActive ? t('portal.active') : t('portal.locked')}</div></div>
                    </div>
                    {canEdit && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" disabled={resetPortal.isPending}
                          onClick={() => resetPortal.mutate()}>
                          <RotateCcw size={13} /> {resetPortal.isPending ? t('portal.sending') : t('portal.resetPassword')}
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPasswordOpen(true)}>
                          <KeyRound size={13} /> {t('portal.setPassword')}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-xs text-gray-400">{t('portal.notGrantedNote')}</p>
                    {canEdit && <Button size="sm" className="gap-1.5" disabled={createPortal.isPending || !td?.contactEmail} onClick={() => createPortal.mutate()}><Globe size={13} />{createPortal.isPending ? t('portal.creating') : t('portal.createAccount')}</Button>}
                    {canEdit && !td?.contactEmail && <p className="text-xs text-amber-600">{t('portal.emailRequiredForLegacy')}</p>}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('portal.setPasswordTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="mb-1 block text-xs text-gray-500">{t('portal.newPassword')}</label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
            <div><label className="mb-1 block text-xs text-gray-500">{t('portal.confirmPassword')}</label><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
            <p className="text-xs text-gray-400">{t('portal.passwordRule')}</p>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPasswordOpen(false)}>{t('form.cancel')}</Button><Button disabled={setPortalPassword.isPending} onClick={submitPassword}>{t('portal.savePassword')}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Tenant Card ───────────────────────────────────────────────────────────────

function TenantCard({ tenant, selected, onSelect, onEdit, canEdit }: {
  tenant: any; selected: boolean; onSelect: () => void; onEdit: (e: React.MouseEvent) => void; canEdit: boolean;
}) {
  const { t } = useTranslation('tenants');
  const catMeta = tenant.category ? CATEGORY_META[tenant.category] : null;
  const activeContract = tenant.contracts?.find((c: any) => c.status === 'ACTIVE' || c.status === 'EXPIRING');
  const cs = activeContract ? CONTRACT_STATUS[activeContract.status] : null;

  return (
    <div
      onClick={onSelect}
      className={`group relative p-4 border rounded-xl cursor-pointer transition-all ${
        selected
          ? 'border-blue-500 bg-blue-50/50 shadow-sm'
          : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
      }`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${
          selected ? 'bg-blue-600' : 'bg-slate-600'
        }`}>
          {tenant.brandName?.[0] ?? '?'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm truncate">{tenant.brandName}</span>
            {catMeta && tenant.category && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full border ${catMeta.color}`}>
                {catMeta.emoji + ' ' + t('category.' + tenant.category)}
              </span>
            )}
            {tenant.isPortalUser && <Globe size={11} className="text-blue-400 shrink-0" />}
          </div>

          {tenant.companyName && (
            <div className="text-xs text-gray-400 mt-0.5 truncate">{tenant.companyName}</div>
          )}
          {activeContract?.unit?.leaseTermType && <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${activeContract.unit.leaseTermType === 'SHORT' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{t(`leaseTerm.${activeContract.unit.leaseTermType}`, { defaultValue: activeContract.unit.leaseTermType })}</span>}

          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
            <span className="flex items-center gap-0.5">
              <FileText size={10} /> {tenant._count?.contracts ?? 0} HĐ
            </span>
            <span className="flex items-center gap-0.5">
              <Receipt size={10} /> {tenant._count?.invoices ?? 0} HĐon
            </span>
            {cs && activeContract && (
              <span className={`flex items-center gap-1 font-medium ${cs.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cs.dot}`} />
                {t('contractStatus.' + activeContract.status)}
              </span>
            )}
          </div>
        </div>

        {canEdit && <button
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Edit2 size={12} className="text-gray-400" />
        </button>}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const { t } = useTranslation('tenants');
  const { selectedMallId } = useMallStore();
  const { hasRole } = usePermission();
  const canManage = hasRole(['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR']);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [tenancyStatus, setTenancyStatus] = useState('');
  const [leaseTermType, setLeaseTermType] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTenant, setEditTenant] = useState<any>(null);

  useEffect(() => {
    setPage(1);
    setSelectedId(null);
  }, [search, category, tenancyStatus, leaseTermType, selectedMallId]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tenants', search, category, tenancyStatus, leaseTermType, page, selectedMallId],
    queryFn: () => tenantsApi.listTenants({
      search: search || undefined,
      category: category || undefined,
      tenancyStatus: tenancyStatus || undefined,
      leaseTermType: leaseTermType || undefined,
      mallId: selectedMallId || undefined,
      page,
      limit: 25,
    }),
  });

  const tenants: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = data?.totalPages ?? 1;

  const openEdit = useCallback((ten: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditTenant(ten);
    setShowForm(true);
  }, []);
  const closeForm = useCallback(() => { setShowForm(false); setEditTenant(null); }, []);

  const selectedTenant = tenants.find((ten) => ten.id === selectedId);

  // Stats
  const activeCount: number = data?.activeCount ?? 0;
  const tenantSummary = data?.summary ?? { total, activeContract: activeCount, noActiveContract: Math.max(0, total - activeCount) };

  return (
    <div className="flex gap-0 h-full -mx-6 -my-6">

      {/* ── LEFT: List panel ── */}
      <div className={`flex flex-col border-r border-gray-100 bg-white transition-all duration-200 ${
        selectedId ? 'w-80 shrink-0' : 'flex-1'
      }`}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('list.header')}</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {t('list.summary', { total, active: activeCount })}
              </p>
            </div>
            {canManage && <Button size="sm" className="gap-1.5 h-8 text-xs shrink-0"
              onClick={() => { setEditTenant(null); setShowForm(true); }}>
              <Plus size={13} /> {t('list.addNew')}
            </Button>}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('list.searchPlaceholder')}
                className="pl-8 h-8 text-sm" />
            </div>
            <select className="border rounded-lg h-8 px-2 text-xs min-w-24 bg-white"
              value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t('list.allCategories')}</option>
              {Object.entries(CATEGORY_META).map(([k, v]) => (
                <option key={k} value={k}>{v.emoji} {t('category.' + k)}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ['', t('list.statusAll'), tenantSummary.total],
              ['ACTIVE_CONTRACT', t('list.statusActive'), tenantSummary.activeContract],
              ['NO_ACTIVE_CONTRACT', t('list.statusInactive'), tenantSummary.noActiveContract],
            ].map(([key, label, count]) => <button key={String(key)} onClick={() => setTenancyStatus(String(key))}
              className={`rounded-lg border px-2 py-2 text-left transition ${tenancyStatus === key ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <div className="text-[10px] font-medium text-slate-500">{label}</div><div className="text-lg font-bold text-slate-800">{count}</div>
            </button>)}
          </div>
          <div className="mt-2 flex gap-1 rounded-lg bg-slate-100 p-1">
            {[['', t('list.termAll')], ['LONG', t('leaseTerm.LONG')], ['SHORT', t('leaseTerm.SHORT')]].map(([key, label]) => <button key={key || 'ALL'} onClick={() => setLeaseTermType(key)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${leaseTermType === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
          ) : isError ? (
            <div role="alert" className="text-center py-16 px-4">
              <Building2 size={40} className="mx-auto mb-2 text-red-300" />
              <p className="text-sm font-medium text-red-700">{t('list.errorLoad')}</p>
              <p className="mt-1 text-xs text-red-600">{t('list.errorDesc')}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>{t('list.retry')}</Button>
            </div>
          ) : tenants.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Building2 size={40} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium text-gray-600">{search || category ? t('list.noMatch') : t('list.empty')}</p>
              <p className="mt-1 text-xs">{search || category ? t('list.noMatchDesc') : t('list.emptyDesc')}</p>
              {search || category ? (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { setSearch(''); setCategory(''); setPage(1); }}>{t('list.clearFilter')}</Button>
              ) : (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { setEditTenant(null); setShowForm(true); }}>{t('list.addFirst')}</Button>
              )}
            </div>
          ) : tenants.map((ten) => (
            <TenantCard key={ten.id} tenant={ten} canEdit={canManage}
              selected={selectedId === ten.id}
              onSelect={() => setSelectedId(ten.id === selectedId ? null : ten.id)}
              onEdit={(e) => openEdit(ten, e)} />
          ))}
        </div>
        <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>{t('list.total', { count: total })}</span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('list.prev')}</Button>
            <span className="px-1">{t('list.page', { current: page, total: totalPages || 1 })}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('list.next')}</Button>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Detail panel ── */}
      {selectedId && (
        <div className="flex-1 overflow-hidden bg-white">
          <TenantDetailPanel
            tenantId={selectedId}
            canEdit={canManage}
            onEdit={() => { const ten = tenants.find((x) => x.id === selectedId); if (ten) openEdit(ten); }}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      {/* Empty state when nothing selected */}
      {!selectedId && !isLoading && tenants.length > 0 && (
        <div className="hidden lg:flex flex-1 items-center justify-center text-gray-300 bg-gray-50/50">
          <div className="text-center">
            <Building2 size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">{t('list.selectHint')}</p>
          </div>
        </div>
      )}

      <TenantFormDialog key={editTenant?.id ?? 'new'} open={showForm} onClose={closeForm} onCreated={() => setPage(1)} tenant={editTenant} />
    </div>
  );
}
