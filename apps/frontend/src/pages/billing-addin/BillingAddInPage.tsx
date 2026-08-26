import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingAddInApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { ERPToolbar } from '@/components/erp';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';

type ChargeType = 'MANAGEMENT_FEE_SURCHARGE' | 'UTILITY' | 'AFTER_HOURS_COOLING';
type EntryStatus = 'PENDING' | 'DRAFT' | 'CONFIRMED' | 'NO_CHARGE' | 'INVOICED';

const STATUS_BADGE: Record<EntryStatus, BadgeProps['variant']> = {
  PENDING: 'warning',
  DRAFT: 'blue',
  CONFIRMED: 'success',
  NO_CHARGE: 'slate',
  INVOICED: 'secondary',
};

const err = (e: any) => e?.response?.data?.message || e?.message || 'Có lỗi xảy ra';

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;

export default function BillingAddInPage() {
  const { t } = useTranslation('billing');
  const qc = useQueryClient();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const selectedMallId = useMallStore((s) => s.selectedMallId);
  const mallId = selectedMallId || '';

  const [chargeType, setChargeType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inputData, setInputData] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');

  const listQ = useQuery({
    queryKey: ['billing-addin', mallId, chargeType, status, search],
    queryFn: () =>
      billingAddInApi.list({
        ...(mallId && { mallId }),
        ...(chargeType && { chargeType }),
        ...(status && { status }),
        ...(search && { search }),
      }),
  });

  const detailQ = useQuery({
    queryKey: ['billing-addin-detail', selectedId],
    queryFn: () => billingAddInApi.detail(selectedId!),
    enabled: !!selectedId,
  });

  const rows: any[] = listQ.data || [];
  const entry: any = detailQ.data;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['billing-addin'] });
    qc.invalidateQueries({ queryKey: ['billing-addin-detail'] });
  };

  const openEntry = (row: any) => {
    setSelectedId(row.id);
    setInputData({});
    setNotes(row.notes || '');
  };

  const saveDraft = useMutation({
    mutationFn: () => {
      const parsed: Record<string, number> = {};
      for (const [key, value] of Object.entries(inputData)) parsed[key] = Number(value) || 0;
      return billingAddInApi.saveDraft(selectedId!, parsed, notes || undefined);
    },
    onSuccess: () => {
      refresh();
      toast({ title: t('addIn.toast.draftSaved') });
    },
    onError: (e: any) => toast({ title: 'Không thể lưu', description: err(e), variant: 'destructive' }),
  });

  const confirmNoCharge = useMutation({
    mutationFn: () => billingAddInApi.confirmNoCharge(selectedId!),
    onSuccess: () => {
      refresh();
      setSelectedId(null);
      toast({ title: t('addIn.toast.noChargeConfirmed') });
    },
    onError: (e: any) => toast({ title: 'Không thể xác nhận', description: err(e), variant: 'destructive' }),
  });

  const confirmEntry = useMutation({
    mutationFn: () => billingAddInApi.confirm(selectedId!),
    onSuccess: () => {
      refresh();
      setConfirmOpen(false);
      setSelectedId(null);
      toast({ title: t('addIn.toast.confirmed') });
    },
    onError: (e: any) => toast({ title: 'Không thể chốt', description: err(e), variant: 'destructive' }),
  });

  const reopenEntry = useMutation({
    mutationFn: () => billingAddInApi.reopen(selectedId!),
    onSuccess: () => {
      refresh();
      toast({ title: t('addIn.toast.reopened') });
    },
    onError: (e: any) => toast({ title: 'Không thể mở lại', description: err(e), variant: 'destructive' }),
  });

  const canReopen = user?.role === 'ADMIN' || user?.role === 'MALL_DIRECTOR';
  const canWrite = user?.role === 'ADMIN' || user?.role === 'OPERATION';

  const actionLabel = (row: any) => {
    if (row.status === 'PENDING') return t('addIn.actions.enterNow');
    if (row.status === 'DRAFT') return t('addIn.actions.viewAndConfirm');
    if (row.status === 'INVOICED') return t('addIn.actions.viewInvoice');
    return t('addIn.actions.viewDetail');
  };

  const requiredFields: Record<ChargeType, string[]> = {
    MANAGEMENT_FEE_SURCHARGE: ['headcount'],
    UTILITY: ['elecStart', 'elecEnd', 'waterStart', 'waterEnd'],
    AFTER_HOURS_COOLING: ['hours'],
  };

  const getValue = (key: string, fallback = '') => inputData[key] ?? (entry?.inputData?.[key] != null ? String(entry.inputData[key]) : fallback);

  const canSubmitDraft = entry ? requiredFields[entry.chargeType as ChargeType].every((key) => getValue(key) !== '') : false;

  const lines: any[] = Array.isArray(entry?.lines) ? entry.lines : [];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        eyebrow={t('addIn.eyebrow')}
        title={t('addIn.title')}
        description={t('addIn.description')}
      />

      <ERPToolbar>
        <Input
          placeholder={t('addIn.filters.search') as string}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={chargeType}
          onChange={(e) => setChargeType(e.target.value)}
        >
          <option value="">{t('addIn.filters.allChargeTypes')}</option>
          <option value="MANAGEMENT_FEE_SURCHARGE">{t('addIn.chargeType.MANAGEMENT_FEE_SURCHARGE')}</option>
          <option value="UTILITY">{t('addIn.chargeType.UTILITY')}</option>
          <option value="AFTER_HOURS_COOLING">{t('addIn.chargeType.AFTER_HOURS_COOLING')}</option>
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t('addIn.filters.allStatuses')}</option>
          {(['PENDING', 'DRAFT', 'CONFIRMED', 'NO_CHARGE', 'INVOICED'] as EntryStatus[]).map((s) => (
            <option key={s} value={s}>{t(`addIn.status.${s}`)}</option>
          ))}
        </select>
      </ERPToolbar>

      {!rows.length ? (
        <EmptyState title={t('addIn.title')} description={t('addIn.description')} />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('addIn.columns.contract')}</TableHead>
                <TableHead>{t('addIn.columns.tenant')}</TableHead>
                <TableHead>{t('addIn.columns.leaseCategory')}</TableHead>
                <TableHead>{t('addIn.columns.chargeType')}</TableHead>
                <TableHead>{t('addIn.columns.period')}</TableHead>
                <TableHead>{t('addIn.columns.status')}</TableHead>
                <TableHead>{t('addIn.columns.dueDate')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-semibold">{row.contract?.contractNumber}</TableCell>
                  <TableCell>{row.contract?.tenant?.brandName}</TableCell>
                  <TableCell>
                    <Badge variant={row.contract?.unit?.mall?.leaseCategory === 'OFFICE' ? 'sky' : 'violet'}>
                      {t(`addIn.leaseCategory.${row.contract?.unit?.mall?.leaseCategory || 'MALL'}`)}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge variant="slate">{t(`addIn.chargeType.${row.chargeType}`)}</Badge></TableCell>
                  <TableCell>{row.period}</TableCell>
                  <TableCell><Badge variant={STATUS_BADGE[row.status as EntryStatus]}>{t(`addIn.status.${row.status}`)}</Badge></TableCell>
                  <TableCell>{new Date(row.dueDate).toLocaleDateString('vi-VN')}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => openEntry(row)}>{actionLabel(row)}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selectedId && !confirmOpen} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-xl">
          {entry && (
            <>
              <DialogHeader>
                <DialogTitle>{t('addIn.form.title')}</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {entry.contract?.contractNumber} · {entry.contract?.tenant?.brandName} · {t('addIn.columns.period')} {entry.period}
                </p>
              </DialogHeader>

              <div className="space-y-3">
                {entry.chargeType === 'MANAGEMENT_FEE_SURCHARGE' && (
                  <div className="space-y-2">
                    <Field label={t('addIn.form.headcount') as string} hint={t('addIn.form.headcountHint') as string}>
                      <Input
                        type="number"
                        disabled={!canWrite || !['PENDING', 'DRAFT'].includes(entry.status)}
                        value={getValue('headcount')}
                        onChange={(e) => setInputData((s) => ({ ...s, headcount: e.target.value }))}
                      />
                    </Field>
                  </div>
                )}

                {entry.chargeType === 'UTILITY' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t('addIn.form.elecStart') as string}>
                      <Input type="number" disabled={!canWrite || !['PENDING', 'DRAFT'].includes(entry.status)} value={getValue('elecStart')} onChange={(e) => setInputData((s) => ({ ...s, elecStart: e.target.value }))} />
                    </Field>
                    <Field label={t('addIn.form.elecEnd') as string} hint={t('addIn.form.elecEndHint') as string}>
                      <Input type="number" disabled={!canWrite || !['PENDING', 'DRAFT'].includes(entry.status)} value={getValue('elecEnd')} onChange={(e) => setInputData((s) => ({ ...s, elecEnd: e.target.value }))} />
                    </Field>
                    <Field label={t('addIn.form.waterStart') as string}>
                      <Input type="number" disabled={!canWrite || !['PENDING', 'DRAFT'].includes(entry.status)} value={getValue('waterStart')} onChange={(e) => setInputData((s) => ({ ...s, waterStart: e.target.value }))} />
                    </Field>
                    <Field label={t('addIn.form.waterEnd') as string}>
                      <Input type="number" disabled={!canWrite || !['PENDING', 'DRAFT'].includes(entry.status)} value={getValue('waterEnd')} onChange={(e) => setInputData((s) => ({ ...s, waterEnd: e.target.value }))} />
                    </Field>
                  </div>
                )}

                {entry.chargeType === 'AFTER_HOURS_COOLING' && (
                  <Field label={t('addIn.form.hours') as string} hint={t('addIn.form.hoursHint') as string}>
                    <Input type="number" step="0.5" disabled={!canWrite || !['PENDING', 'DRAFT'].includes(entry.status)} value={getValue('hours')} onChange={(e) => setInputData((s) => ({ ...s, hours: e.target.value }))} />
                  </Field>
                )}

                {lines.length > 0 && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    {lines.map((line, i) => (
                      <div key={i} className="flex items-center justify-between py-1">
                        <span className="text-muted-foreground">{line.description}</span>
                        <span className="font-semibold">{vnd(line.amount)}</span>
                      </div>
                    ))}
                    <div className="mt-1 flex items-center justify-between border-t border-border pt-1 font-semibold">
                      <span>{t('addIn.confirmPopup.total')}</span>
                      <span>{vnd(entry.subtotal)}</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('addIn.form.notes')}</label>
                  <Input
                    placeholder={t('addIn.form.notesPlaceholder') as string}
                    disabled={!canWrite || !['PENDING', 'DRAFT'].includes(entry.status)}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter className="sm:justify-between">
                {canWrite && ['PENDING', 'DRAFT'].includes(entry.status) ? (
                  <Button variant="warning" onClick={() => confirmNoCharge.mutate()} disabled={confirmNoCharge.isPending}>
                    {t('addIn.form.noCharge')}
                  </Button>
                ) : <span />}
                <div className="flex gap-2">
                  {canReopen && entry.status === 'CONFIRMED' && (
                    <Button variant="outline" onClick={() => reopenEntry.mutate()} disabled={reopenEntry.isPending}>Mở lại</Button>
                  )}
                  {canWrite && ['PENDING', 'DRAFT'].includes(entry.status) && (
                    <>
                      <Button variant="secondary" onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending || !canSubmitDraft}>
                        {t('addIn.form.saveDraft')}
                      </Button>
                      <Button onClick={() => setConfirmOpen(true)} disabled={entry.status !== 'DRAFT'}>
                        {t('addIn.form.continueConfirm')}
                      </Button>
                    </>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          {entry && (
            <>
              <DialogHeader>
                <DialogTitle>{t('addIn.confirmPopup.title', { period: entry.period })}</DialogTitle>
                <p className="text-sm text-muted-foreground">{entry.contract?.contractNumber} · {entry.contract?.tenant?.brandName}</p>
              </DialogHeader>

              <div className="rounded-lg border border-border">
                {lines.map((line, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-0">
                    <div>
                      <div className="font-semibold">{t(`addIn.chargeType.${entry.chargeType}`)}</div>
                      <div className="text-xs text-muted-foreground">{line.description}</div>
                    </div>
                    <div className="font-semibold">{vnd(line.amount)}</div>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
                  <span className="text-sm font-semibold">{t('addIn.confirmPopup.total')}</span>
                  <span className="text-lg font-bold text-primary">{vnd(entry.subtotal)}</span>
                </div>
              </div>

              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {t('addIn.confirmPopup.warning')}
              </p>

              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmOpen(false)}>{t('addIn.confirmPopup.back')}</Button>
                <Button onClick={() => confirmEntry.mutate()} disabled={confirmEntry.isPending}>{t('addIn.confirmPopup.confirm')}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
