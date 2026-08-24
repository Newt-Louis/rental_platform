import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { contractsApi, terminationApi, spacesApi, billingApi } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { useToast } from '@/components/ui/use-toast';
import { AsyncState } from '@/components/ui/async-state';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { ERPAmount, ERPStatusBadge, ERPToolbar } from '@/components/erp';
import { useMallStore } from '@/store/mall.store';
import { useAuthStore } from '@/store/auth.store';
import { openAuthenticatedFile } from '@/lib/downloadFile';
import {
  Search, File, AlertTriangle, Calendar, DollarSign, User, FileText, History, GitBranch,
  ArrowRight, Link2, Upload, Trash2, Download, PenLine, ShieldCheck, QrCode,
  CheckCircle2, Clock, X, Loader2, AlertCircle, LogOut, SlidersHorizontal, Sparkles, ArrowLeft,
} from 'lucide-react';
import type { Contract, Role } from '@/types';
import { formatMoney, formatMoneyWithCode, type CurrencyCode } from '@/lib/currency';
import type { ERPTone } from '@/lib/erp-tones';

// ── Status maps ───────────────────────────────────────────────────────────────

export const CONTRACT_STATUS_PRESENTATION: Record<string, { tone: ERPTone }> = {
  DRAFT:             { tone: 'neutral' },
  PENDING_LEGAL:     { tone: 'info' },
  PENDING_SIGNATURE: { tone: 'warning' },
  ACTIVE:            { tone: 'success' },
  EXPIRING:          { tone: 'warning' },
  EXPIRED:           { tone: 'danger' },
  TERMINATING:       { tone: 'danger' },
  TERMINATED:        { tone: 'neutral' },
};
const STATUS_MAP = CONTRACT_STATUS_PRESENTATION;

const CONTRACT_EDIT_ROLES: Role[] = ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR', 'LEGAL'];
const CONTRACT_STATUS_ROLES: Role[] = ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR'];
const STAFF_CONTRACT_ROLES: Role[] = ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR', 'FINANCE', 'LEGAL'];
const BILLING_STAFF_ROLES: Role[] = ['ADMIN', 'MALL_DIRECTOR', 'FINANCE'];

export function getContractRoleCapabilities(role?: Role) {
  return {
    canEdit: !!role && CONTRACT_EDIT_ROLES.includes(role),
    canChangeStatus: !!role && CONTRACT_STATUS_ROLES.includes(role),
    canReadStaffDetail: !!role && STAFF_CONTRACT_ROLES.includes(role),
    canBuildSchedule: !!role && BILLING_STAFF_ROLES.includes(role),
  };
}

const TYPE_KEYS = ['LOI', 'LEASE_AGREEMENT', 'APPENDIX', 'RENEWAL', 'TERMINATION'] as const;

// Transition hiển thị trên UI — khớp với CONTRACT_STATUS_TRANSITIONS ở backend
// (contracts.service.ts), trừ nhánh TERMINATING/TERMINATED đã có tab "Chấm dứt hợp đồng" riêng.
const CONTRACT_UI_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_LEGAL', 'ACTIVE'],
  PENDING_LEGAL: ['PENDING_SIGNATURE', 'DRAFT'],
  PENDING_SIGNATURE: ['ACTIVE', 'PENDING_LEGAL'],
  ACTIVE: ['EXPIRING'],
  EXPIRING: ['ACTIVE', 'EXPIRED'],
  EXPIRED: [],
  TERMINATING: [],
  TERMINATED: [],
};

function daysUntil(date: string) {
  return Math.floor((new Date(date).getTime() - Date.now()) / 86400000);
}
function isRecentlyCreated(value: string) {
  return Date.now() - new Date(value).getTime() < 24 * 60 * 60 * 1000;
}
function createdAge(value: string) {
  const hours = Math.floor(Math.max(0, Date.now() - new Date(value).getTime()) / 3_600_000);
  if (hours < 1) return 'Vừa tạo';
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days} ngày trước` : new Date(value).toLocaleDateString('vi-VN');
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtCurrency(n?: number | null, currencyCode?: CurrencyCode) {
  return formatMoney(n ?? 0, currencyCode ?? 'VND');
}

const BILLING_ENTRY_STATUS_COLOR: Record<string, string> = {
  PENDING: 'border-gray-300 text-gray-600',
  INVOICED: 'border-blue-300 text-blue-700',
  SKIPPED: 'border-gray-200 text-gray-400',
};
const INVOICE_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ISSUED: 'bg-blue-100 text-blue-700',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-200 text-gray-500',
};
function fmtBytes(b?: number | null) {
  if (!b) return '';
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

function KeyFact({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 border-b border-border/70 py-2.5 last:border-b-0 ${className}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 min-w-0 text-sm font-medium text-foreground">{value ?? '—'}</div>
    </div>
  );
}

export function amendmentValue(value: unknown, currencyCode: CurrencyCode) {
  if (value == null || value === '') return '—';
  if (typeof value === 'number') return formatMoney(value, currencyCode);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return fmtDate(value);
  return String(value);
}

// ── Sign File Dialog ──────────────────────────────────────────────────────────

function SignFileDialog({ contractId, file, open, onClose }: {
  contractId: string; file: any; open: boolean; onClose: () => void;
}) {
  const { t } = useTranslation(['contracts', 'common']);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ signerName: '', signerRole: 'TENANT' });

  const mutation = useMutation({
    mutationFn: () => contractsApi.signFile(contractId, file?.id, {
      signerName: form.signerName,
      signerRole: form.signerRole,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract-files', contractId] });
      qc.invalidateQueries({ queryKey: ['contract-detail', contractId] });
      toast({ title: t('sign.success') });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine size={16} className="text-blue-600" /> {t('sign.title')}
          </DialogTitle>
          {file && <p className="text-sm text-gray-500 mt-1">{file.fileName}</p>}
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            {t('sign.infoBox')}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            <strong>{t('sign.warningNote')}</strong> {t('sign.warningBox')}
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">{t('sign.signerName')}</label>
            <Input value={form.signerName}
              onChange={(e) => setForm(p => ({ ...p, signerName: e.target.value }))}
              placeholder={t('sign.signerNamePlaceholder')} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">{t('sign.signerRole')}</label>
            <Select value={form.signerRole} onValueChange={(v) => setForm(p => ({ ...p, signerRole: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TENANT">{t('sign.roles.TENANT')}</SelectItem>
                <SelectItem value="LANDLORD">{t('sign.roles.LANDLORD')}</SelectItem>
                <SelectItem value="LEGAL">{t('sign.roles.LEGAL')}</SelectItem>
                <SelectItem value="CEO">{t('sign.roles.CEO')}</SelectItem>
                <SelectItem value="WITNESS">{t('sign.roles.WITNESS')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('sign.cancel')}</Button>
          <Button disabled={!form.signerName || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            <PenLine size={13} />
            {mutation.isPending ? t('sign.signing') : t('sign.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Verify Signature Dialog ───────────────────────────────────────────────────

function VerifyDialog({ verifyCode, open, onClose }: {
  verifyCode: string; open: boolean; onClose: () => void;
}) {
  const { t } = useTranslation('contracts');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['verify-signature', verifyCode],
    queryFn: () => contractsApi.verifyFile(verifyCode),
    enabled: open && !!verifyCode,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-green-600" /> {t('verify.title')}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
        ) : data?.valid ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
              <CheckCircle2 size={18} className="text-green-600 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-green-800">{t('verify.valid')}</div>
                <div className="text-xs text-green-600">{t('verify.validDesc')}</div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-gray-500">{t('verify.fileName')}</span>
                <span className="font-medium text-right max-w-48 truncate">{data.fileName}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-gray-500">{t('verify.contractNo')}</span>
                <span className="font-medium font-mono">{data.contractNumber}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-gray-500">{t('verify.signerName')}</span>
                <span className="font-medium">{data.signerName}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-gray-500">{t('verify.signerRole')}</span>
                <span className="font-medium">{data.signerRole}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-gray-500">{t('verify.signedAt')}</span>
                <span className="font-medium">{fmtDate(data.signedAt)}</span>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">{t('verify.hash')}</div>
                <div className="font-mono text-xs bg-gray-50 border rounded p-2 break-all text-gray-600">{data.sha256Hash}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <div className="text-sm text-red-700">{data?.message ?? t('verify.invalidCode')}</div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('verify.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────

function DocumentsTab({ contractId, canEdit }: { contractId: string; canEdit: boolean }) {
  const { t } = useTranslation('contracts');
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [signFile, setSignFile] = useState<any>(null);
  const [verifyCode, setVerifyCode] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteFile, setDeleteFile] = useState<any>(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['contract-files', contractId],
    queryFn: () => contractsApi.listFiles(contractId),
    enabled: !!contractId,
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => contractsApi.deleteFile(contractId, fileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract-files', contractId] });
      toast({ title: t('documents.deleteSuccess') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('documents.uploadError'), variant: 'destructive' }),
  });

  const handleUpload = useCallback(async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      await contractsApi.uploadFile(contractId, file);
      qc.invalidateQueries({ queryKey: ['contract-files', contractId] });
      toast({ title: t('documents.uploadSuccess', { name: file.name }) });
    } catch (e: any) {
      toast({ title: e?.response?.data?.message ?? t('documents.uploadError'), variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [contractId, qc, toast, t]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const fileIcon = (mime?: string) => {
    if (!mime) return '📄';
    if (mime.includes('pdf')) return '📕';
    if (mime.includes('image')) return '🖼️';
    if (mime.includes('word') || mime.includes('docx')) return '📘';
    if (mime.includes('excel') || mime.includes('xlsx')) return '📗';
    return '📄';
  };

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      {canEdit && <div
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
        } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}>
        <input ref={fileInputRef} type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={28} className="animate-spin text-blue-500" />
            <p className="text-sm text-blue-600 font-medium">{t('documents.uploading')}</p>
          </div>
        ) : (
          <>
            <Upload size={28} className={`mx-auto mb-2 ${dragging ? 'text-blue-500' : 'text-gray-300'}`} />
            <p className="text-sm font-medium text-gray-600">{t('documents.uploadDrag')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('documents.uploadTypes')}</p>
          </>
        )}
      </div>}

      {/* File list */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : (files as any[]).length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <FileText size={32} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm">{t('documents.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(files as any[]).map((f: any) => (
            <div key={f.id} className={`border rounded-xl p-3.5 transition-all ${
              f.signedAt ? 'border-green-200 bg-green-50/50' : 'border-gray-100 bg-white hover:border-gray-200'
            }`}>
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">{fileIcon(f.fileType)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800 truncate">{f.fileName}</span>
                    {f.signedAt && (
                      <span
                        title={t('documents.signedBadgeTitle')}
                        className="flex items-center gap-1 text-xs bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full">
                        <ShieldCheck size={10} /> {t('documents.signedBadge')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                    {f.fileSize && <span>{fmtBytes(f.fileSize)}</span>}
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> {fmtDate(f.createdAt)}
                    </span>
                    {f.signedAt && (
                      <span className="flex items-center gap-1 text-green-600 font-medium">
                        <PenLine size={10} /> {f.signerName} ({f.signerRole}) · {fmtDate(f.signedAt)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Download — authenticated (see docs/security/SECRET_INCIDENT_REMEDIATION.md P1):
                      a plain <a href> can't attach the JWT bearer token, so this
                      fetches through the API and opens a blob URL instead. */}
                  <button
                    type="button"
                    onClick={() => openAuthenticatedFile(`/files/contracts/${f.id}`, { download: f.fileName })}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    title={t('documents.download')}>
                    <Download size={14} />
                  </button>

                  {/* Sign */}
                  {canEdit && !f.signedAt && (
                    <button onClick={() => setSignFile(f)}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"
                      title={t('documents.sign')}>
                      <PenLine size={14} />
                    </button>
                  )}

                  {/* Verify QR */}
                  {f.verifyCode && (
                    <button onClick={() => setVerifyCode(f.verifyCode)}
                      className="p-1.5 rounded-lg hover:bg-green-50 text-green-500 hover:text-green-700"
                      title={t('documents.verifyBtn')}>
                      <ShieldCheck size={14} />
                    </button>
                  )}

                  {/* Delete */}
                  {canEdit && <button onClick={() => setDeleteFile(f)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500"
                    title={t('documents.delete')}>
                    <Trash2 size={14} />
                  </button>}
                </div>
              </div>

              {/* Signature details row */}
              {f.sha256Hash && (
                <div className="mt-2 pt-2 border-t border-green-100">
                  <div className="text-xs text-gray-400">SHA-256 Hash</div>
                  <div className="font-mono text-xs text-gray-500 truncate mt-0.5">{f.sha256Hash}</div>
                  {f.verifyCode && (
                    <div className="mt-1 text-xs">
                      <span className="text-gray-400">{t('documents.verifyCode')}</span>
                      <span className="font-mono font-medium text-blue-600">{f.verifyCode}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <ConfirmActionDialog
        open={!!deleteFile}
        onOpenChange={(open) => !open && setDeleteFile(null)}
        title={t('documents.deleteTitle')}
        description={t('documents.deleteDesc', { name: deleteFile?.fileName ?? '' })}
        confirmLabel={t('documents.deleteConfirm')}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteFile && deleteMutation.mutate(deleteFile.id, { onSuccess: () => setDeleteFile(null) })}
      />
      {signFile && (
        <SignFileDialog contractId={contractId} file={signFile}
          open={!!signFile} onClose={() => setSignFile(null)} />
      )}
      {verifyCode && (
        <VerifyDialog verifyCode={verifyCode} open={!!verifyCode} onClose={() => setVerifyCode(null)} />
      )}
    </div>
  );
}

// ── Contract Detail Sheet ─────────────────────────────────────────────────────

function ContractDetailSheet({ contractId, onClose }: { contractId: string | null; onClose: () => void }) {
  const { t } = useTranslation('contracts');
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const { canEdit, canChangeStatus, canReadStaffDetail, canBuildSchedule } = getContractRoleCapabilities(role);
  const [activeTab, setActiveTab] = useState('overview');
  const [terminationWorkspaceOpen, setTerminationWorkspaceOpen] = useState(false);
  const [terminationConfirm, setTerminationConfirm] = useState<'initiate' | 'complete' | 'cancel' | null>(null);
  const [confirmAmendment, setConfirmAmendment] = useState<any>(null);
  const [templateId, setTemplateId] = useState('');
  const [amendmentDialogOpen, setAmendmentDialogOpen] = useState(false);
  const [amendmentForm, setAmendmentForm] = useState({
    type: 'RENT_CHANGE',
    newRent: '', newCam: '', newRentFree: '', newEndDate: '',
    effectiveDate: '', reason: '',
  });

  const { data: c, isLoading } = useQuery({
    queryKey: ['contract-detail', contractId],
    queryFn: () => contractsApi.getContract(contractId!),
    enabled: !!contractId,
  });

  const { data: readinessData } = useQuery({
    queryKey: ['contract-activation-readiness', contractId],
    queryFn: () => contractsApi.getActivationReadiness(contractId!),
    enabled: !!contractId && canReadStaffDetail,
  });
  const readiness: any = readinessData?.data ?? readinessData;

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => contractsApi.updateStatus(contractId!, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract-detail', contractId] });
      qc.invalidateQueries({ queryKey: ['contract-events', contractId] });
      qc.invalidateQueries({ queryKey: ['contract-activation-readiness', contractId] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['unit-detail'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      qc.invalidateQueries({ queryKey: ['floor-map'] });
      toast({ title: t('workflow.updateSuccess') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ['contract-billing-schedule', contractId],
    queryFn: () => billingApi.getSchedule(contractId!),
    enabled: !!contractId && canReadStaffDetail,
  });
  const scheduleEntries: any[] = scheduleData?.data ?? scheduleData ?? [];

  const buildScheduleMutation = useMutation({
    mutationFn: () => billingApi.buildSchedule(contractId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract-billing-schedule', contractId] });
      toast({ title: t('billingTab.rebuildSuccess') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const { data: events } = useQuery({
    queryKey: ['contract-events', contractId],
    queryFn: () => contractsApi.getEvents(contractId!),
    enabled: !!contractId && canReadStaffDetail,
  });

  const { data: amendments } = useQuery({
    queryKey: ['contract-amendments', contractId],
    queryFn: () => contractsApi.listAmendments(contractId!),
    enabled: !!contractId && canReadStaffDetail,
  });

  const { data: templates } = useQuery({
    queryKey: ['contract-templates'],
    queryFn: contractsApi.listTemplates,
    enabled: !!contractId && canReadStaffDetail,
  });

  const { data: termination } = useQuery({
    queryKey: ['contract-termination', contractId],
    queryFn: () => terminationApi.get(contractId!),
    enabled: !!contractId && canReadStaffDetail,
  });

  const [termForm, setTermForm] = useState({ reason: '', effectiveDate: '', noticePeriodDays: '60', depositRefund: '', penaltyAmount: '' });

  const detail: any = c?.data ?? c;
  const term: any = termination?.data ?? termination;

  const invalidateTermination = () => {
    qc.invalidateQueries({ queryKey: ['contract-termination', contractId] });
    qc.invalidateQueries({ queryKey: ['contract-detail', contractId] });
    qc.invalidateQueries({ queryKey: ['contracts'] });
    qc.invalidateQueries({ queryKey: ['units'] });
    qc.invalidateQueries({ queryKey: ['unit-detail'] });
    qc.invalidateQueries({ queryKey: ['occupancy'] });
    qc.invalidateQueries({ queryKey: ['floor-map'] });
  };

  const initiateTerminationMutation = useMutation({
    mutationFn: () => terminationApi.initiate(contractId!, {
      initiatedBy: 'THISO',
      reason: termForm.reason,
      effectiveDate: termForm.effectiveDate,
      noticePeriodDays: +termForm.noticePeriodDays || 60,
      depositRefund: termForm.depositRefund ? +termForm.depositRefund : undefined,
      penaltyAmount: termForm.penaltyAmount ? +termForm.penaltyAmount : undefined,
    }),
    onSuccess: () => { invalidateTermination(); toast({ title: t('termination.initiateSuccess') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const updateChecklistMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => terminationApi.update(contractId!, data),
    onSuccess: () => { invalidateTermination(); toast({ title: t('termination.updateSuccess') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const completeTerminationMutation = useMutation({
    mutationFn: () => terminationApi.complete(contractId!),
    onSuccess: () => { invalidateTermination(); toast({ title: t('termination.completeSuccess') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const cancelTerminationMutation = useMutation({
    mutationFn: () => terminationApi.cancel(contractId!),
    onSuccess: () => { invalidateTermination(); toast({ title: t('termination.cancelSuccess') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const renderMutation = useMutation({
    mutationFn: () => contractsApi.renderTemplate(contractId!, templateId),
    onSuccess: () => toast({ title: t('template.renderSuccess') }),
  });

  const createAmendmentMutation = useMutation({
    mutationFn: () => {
      const changes: Record<string, unknown> = {};
      if (amendmentForm.type === 'RENT_CHANGE') changes.rent = +amendmentForm.newRent;
      else if (amendmentForm.type === 'CAM_CHANGE') changes.cam = +amendmentForm.newCam;
      else if (amendmentForm.type === 'RENT_FREE_CHANGE') changes.rentFree = +amendmentForm.newRentFree;
      else if (amendmentForm.type === 'TERM_EXTENSION' || amendmentForm.type === 'RENEWAL') changes.endDate = amendmentForm.newEndDate;

      return contractsApi.createAmendment(contractId!, {
        type: amendmentForm.type,
        effectiveDate: amendmentForm.effectiveDate ? new Date(amendmentForm.effectiveDate).toISOString() : new Date().toISOString(),
        changes,
        reason: amendmentForm.reason || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract-amendments', contractId] });
      toast({ title: t('amendments.createSuccess') });
      setAmendmentDialogOpen(false);
      setAmendmentForm({ type: 'RENT_CHANGE', newRent: '', newCam: '', newRentFree: '', newEndDate: '', effectiveDate: '', reason: '' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const submitAmendmentMutation = useMutation({
    mutationFn: (amendmentId: string) => contractsApi.submitAmendment(contractId!, amendmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract-amendments', contractId] });
      toast({ title: t('amendments.submitSuccess') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const approveAmendmentMutation = useMutation({
    mutationFn: (amendmentId: string) => contractsApi.approveAmendment(contractId!, amendmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract-amendments', contractId] });
      qc.invalidateQueries({ queryKey: ['contract-detail', contractId] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: t('amendments.approveSuccess') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common:messages.error'), variant: 'destructive' }),
  });

  const st = detail ? STATUS_MAP[detail.status] ?? STATUS_MAP.DRAFT : null;
  const days = detail?.endDate ? daysUntil(detail.endDate) : null;
  const monthlyRent = detail ? detail.rent + (detail.cam ?? 0) : 0;
  const availableTransitions = detail ? CONTRACT_UI_TRANSITIONS[detail.status] ?? [] : [];
  const primaryNextStatus = detail ? ({
    DRAFT: 'ACTIVE',
    PENDING_LEGAL: 'PENDING_SIGNATURE',
    PENDING_SIGNATURE: 'ACTIVE',
  } as Record<string, string>)[detail.status] : undefined;
  const primaryBlocked = primaryNextStatus === 'ACTIVE' && readiness && !readiness.ready;
  const canOpenTermination = canChangeStatus && !!detail && ['ACTIVE', 'EXPIRING', 'TERMINATING'].includes(detail.status);

  useEffect(() => {
    setActiveTab('overview');
    setTerminationWorkspaceOpen(false);
  }, [contractId]);

  return (
    <Sheet open={!!contractId} onClose={onClose}
      className="w-full max-w-[720px] sm:w-[min(92vw,720px)]"
      title={detail ? (
        <span className="block min-w-0 max-w-full">
          <span className="block truncate font-mono text-base font-semibold">{detail.contractNumber}</span>
          <span className="mt-0.5 block truncate text-base font-semibold text-foreground">{detail.tenant?.brandName}</span>
          <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
            {detail.unit?.code}{detail.unit?.floor?.name ? ` · ${detail.unit.floor.name}` : ''} · {t('status.' + detail.status)} · {t(`type.${detail.type}`, { defaultValue: detail.type })}
          </span>
          <span className="mt-2 block text-lg font-semibold tabular-nums text-foreground">
            {formatMoneyWithCode(detail.rent, detail.currencyCode ?? 'VND')}{t('sheet.fields.perMonthSuffix')}
          </span>
          <span className="mt-0.5 block text-xs font-normal tabular-nums text-muted-foreground">
            {fmtDate(detail.startDate)} → {fmtDate(detail.endDate)}{days !== null && days <= 90 ? ` · ${t('sheet.daysLeft', { count: days })}` : ''}
          </span>
        </span>
      ) : t('sheet.defaultTitle')}>
      {isLoading && (
        <div className="px-6 pt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
        </div>
      )}
      {detail && (
        <div className="min-w-0 max-w-full pb-8">
          <section className="min-w-0 border-b border-border px-4 py-3 sm:px-6">
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                {canChangeStatus && primaryNextStatus && (
                  <Button size="sm" disabled={updateStatusMutation.isPending || primaryBlocked}
                    onClick={() => updateStatusMutation.mutate(primaryNextStatus)}>
                    {t(`workflow.moveTo.${primaryNextStatus}`)}
                  </Button>
                )}
                {canOpenTermination && (
                  <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => { setTerminationWorkspaceOpen(true); setActiveTab('termination'); }}>
                    <LogOut size={14} className="mr-1.5" /> {t('termination.workspaceAction')}
                  </Button>
                )}
            </div>
            {primaryBlocked && <div className="mt-2 text-xs text-amber-700">{t('workflow.notReadyForActive')}</div>}
            <div className="mt-3 grid min-w-0 divide-y divide-border border-y border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="flex min-w-0 items-center gap-2 py-2.5 sm:pr-4">
                {detail.fitoutProject ? <CheckCircle2 size={14} className="shrink-0 text-emerald-600" /> : <Clock size={14} className="shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">{t('handoff.fitout')}</div>
                  <div className="truncate text-xs text-muted-foreground">{detail.fitoutProject ? t('handoff.fitoutStarted') : t('handoff.fitoutNotStarted')}</div>
                </div>
                {detail.fitoutProject && <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => navigate(`/fitout?projectId=${detail.fitoutProject.id}`)}>
                  {t('handoff.viewFitout')}
                </Button>}
              </div>
              <div className="flex min-w-0 items-center gap-2 py-2.5 sm:pl-4">
                {detail.billingSchedule?.length > 0 ? <CheckCircle2 size={14} className="shrink-0 text-emerald-600" /> : <Clock size={14} className="shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">{t('handoff.billing')}</div>
                  <div className="truncate text-xs text-muted-foreground">{detail.billingSchedule?.length > 0 ? t('handoff.billingScheduled') : t('handoff.billingNotScheduled')}</div>
                </div>
                {canReadStaffDetail && <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => setActiveTab('financial')}>
                  {t('handoff.viewBilling')}
                </Button>}
              </div>
            </div>
          </section>
          <div className="min-w-0 max-w-full px-4 pt-3 sm:px-6">
          <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); if (value !== 'termination') setTerminationWorkspaceOpen(false); }}>
            {!terminationWorkspaceOpen && <div className="mb-4 min-w-0">
            <TabsList className="flex h-auto w-full min-w-0 flex-wrap justify-start gap-1">
              <TabsTrigger value="overview">{t('sheet.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="financial" className="gap-1.5">
                <DollarSign size={13} /> {t('sheet.tabs.financial')}
              </TabsTrigger>
              {canReadStaffDetail && <TabsTrigger value="documents" className="gap-1.5">
                <FileText size={13} /> {t('sheet.tabs.documents')}
                {detail.files?.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs px-1.5 rounded-full">{detail.files.length}</span>
                )}
              </TabsTrigger>}
              {canReadStaffDetail && <TabsTrigger value="amendments">{t('sheet.tabs.amendments')}</TabsTrigger>}
              {canReadStaffDetail && <TabsTrigger value="activity">{t('sheet.tabs.activity')}</TabsTrigger>}
            </TabsList>
            </div>}

            {/* ── Tab: Chi tiết ── */}
            <TabsContent value="overview" className="space-y-4">
              {/* Quy trình xử lý — chuyển trạng thái thủ công, hiện điều kiện còn thiếu để kích hoạt */}
              {canChangeStatus && (availableTransitions.length > 1 || primaryBlocked) && (
                <div className="space-y-2 border-y border-border py-2.5">
                  <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <CheckCircle2 size={13} /> {t('workflow.label')}
                  </div>
                  {readiness && !readiness.ready && CONTRACT_UI_TRANSITIONS[detail.status].includes('ACTIVE') && (
                    <div className="text-xs text-amber-800 bg-amber-100 rounded-lg p-2.5">
                      <div className="font-medium mb-1">{t('workflow.notReadyForActive')}</div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {readiness.missing.map((m: string, i: number) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {availableTransitions.filter((nextStatus) => nextStatus !== primaryNextStatus).map((nextStatus) => {
                      const blockedByReadiness = nextStatus === 'ACTIVE' && readiness && !readiness.ready;
                      return (
                        <Button
                          key={nextStatus}
                          size="sm"
                          variant="outline"
                          disabled={updateStatusMutation.isPending || blockedByReadiness}
                          onClick={() => updateStatusMutation.mutate(nextStatus)}
                        >
                          {t(`workflow.moveTo.${nextStatus}`)}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              <section aria-labelledby="contract-key-facts">
                <div id="contract-key-facts" className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('sheet.sections.keyFacts')}
                </div>
                <div className="grid border-y border-border sm:grid-cols-2 sm:divide-x sm:divide-border">
                  <div className="sm:pr-4">
                    <KeyFact label={t('sheet.fields.tenant')} value={detail.tenant?.brandName} />
                    <KeyFact label={t('sheet.fields.company')} value={detail.tenant?.companyName} />
                    <KeyFact label={t('sheet.fields.unit')} value={
                      <span>{detail.unit?.code}{detail.unit?.floor?.name ? ` · ${detail.unit.floor.name}` : ''}{detail.unit?.zone?.name ? ` · ${detail.unit.zone.name}` : ''}</span>
                    } />
                  </div>
                  <div className="sm:pl-4">
                    <KeyFact label={t('sheet.fields.startDate')} value={fmtDate(detail.startDate)} />
                    <KeyFact label={t('sheet.fields.endDate')} value={
                      <span className={days !== null && days <= 30 ? 'text-red-700' : ''}>{fmtDate(detail.endDate)}{days !== null && days <= 90 ? ` · ${t('sheet.daysLeft', { count: days })}` : ''}</span>
                    } />
                    <KeyFact label={t('sheet.fields.duration')} value={detail.term ? t('sheet.fields.durationMonths', { count: detail.term }) : '—'} />
                  </div>
                </div>
              </section>

              {/* Source */}
              {detail.proposal && (
                <section className="space-y-2 border-y border-border py-3">
                  <div className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    <Link2 size={11} /> {t('sheet.source.label')}
                  </div>
                  {detail.proposal.booking && (
                    <button className="group flex min-w-0 w-full items-center justify-between gap-3 text-sm hover:text-gray-700"
                      onClick={() => { onClose(); navigate(`/bookings?id=${detail.proposal.booking.id}`); }}>
                      <div className="min-w-0 text-left">
                        <span className="text-xs text-gray-500 font-medium">{t('sheet.source.booking')}</span>
                        <span className="font-medium text-gray-900">{detail.proposal.booking.bookingNumber}</span>
                      </div>
                      <ArrowRight size={12} className="text-blue-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  )}
                  <button className="group flex min-w-0 w-full items-center justify-between gap-3 text-sm hover:text-gray-700"
                    onClick={() => { onClose(); navigate(`/proposals?id=${detail.proposal.id}`); }}>
                    <div className="min-w-0 text-left">
                      <span className="text-xs text-gray-500 font-medium">{t('sheet.source.proposal')}</span>
                      <span className="font-medium text-gray-900">{detail.proposal.proposalNumber}</span>
                    </div>
                    <ArrowRight size={12} className="text-blue-400 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                  {detail.proposal.lead && (
                    <button className="group flex min-w-0 w-full items-center justify-between gap-3 text-sm hover:text-gray-700"
                      onClick={() => { onClose(); navigate(`/crm?leadId=${detail.proposal.lead.id}`); }}>
                      <div className="min-w-0 text-left">
                        <span className="text-xs text-gray-500 font-medium">{t('sheet.source.lead')}</span>
                        <span className="font-medium text-gray-900">{detail.proposal.lead.brandName}</span>
                        <span className="text-xs text-gray-500 ml-1">({detail.proposal.lead.contactName})</span>
                      </div>
                      <ArrowRight size={12} className="text-blue-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  )}
                </section>
              )}

            </TabsContent>

            {/* ── Tab: Tài liệu ── */}
            <TabsContent value="documents" className="space-y-5">
              <DocumentsTab contractId={contractId!} canEdit={canEdit} />
              {canEdit && <section className="border-t border-border pt-4">
                <div className="mb-1 text-sm font-semibold">{t('template.utilityTitle')}</div>
                <p className="mb-3 text-xs text-muted-foreground">{t('template.utilityDescription')}</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                    value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    <option value="">{t('template.select')}</option>
                    {(templates?.data ?? templates ?? []).map((tmpl: any) => (
                      <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" disabled={!templateId || renderMutation.isPending} onClick={() => renderMutation.mutate()}>
                    {t('template.preview')}
                  </Button>
                </div>
              </section>}
            </TabsContent>

            {/* ── Tab: Timeline ── */}
            <TabsContent value="activity">
              <div className="mb-3">
                <div className="text-sm font-semibold">{t('activity.title')}</div>
                <div className="text-xs text-muted-foreground">{t('activity.description')}</div>
              </div>
              <div className="divide-y divide-border border-y border-border">
                {(events?.data ?? events ?? []).map((e: any) => (
                  <div key={e.id} className="py-3 text-sm">
                    <div className="flex items-center gap-2 font-medium"><History size={14} className="text-muted-foreground" />{e.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString('vi-VN')}{e.user?.fullName ? ` · ${e.user.fullName}` : ''}</div>
                    {e.beforeValue && e.afterValue && (
                      <div className="mt-2 break-all border-l-2 border-border pl-2 font-mono text-xs text-muted-foreground">
                        {e.beforeValue} → {e.afterValue}
                      </div>
                    )}
                  </div>
                ))}
                {(events?.data ?? events ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('activity.empty')}</p>}
              </div>
            </TabsContent>

            {/* ── Tab: Phụ lục ── */}
            <TabsContent value="amendments">
              {canEdit && <Button size="sm" className="mb-3" onClick={() => setAmendmentDialogOpen(true)}>
                <GitBranch size={14} className="mr-1" /> {t('amendments.createBtn')}
              </Button>}
              {(amendments?.data ?? amendments ?? []).length === 0 && (
                <p className="text-sm text-gray-400">{t('amendments.noAmendments')}</p>
              )}
              {(amendments?.data ?? amendments ?? []).map((a: any) => (
                <div key={a.id} className="mb-2 flex items-start justify-between gap-3 border-y border-border py-3 text-sm">
                  <div>
                    <div className="font-medium">{a.amendmentNumber} — {t(`amendments.type.${a.type}`, a.type)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <ERPStatusBadge tone={a.status === 'APPLIED' ? 'success' : a.status === 'SUBMITTED' ? 'warning' : 'neutral'}>
                        {t(`amendments.status.${a.status}`, { defaultValue: a.status })}
                      </ERPStatusBadge>
                      <span className="text-xs text-muted-foreground">{t('amendments.effectiveDate')}: {fmtDate(a.effectiveDate)}</span>
                    </div>
                    {a.reason && <div className="mt-1 text-xs text-muted-foreground">{a.reason}</div>}
                    {a.changes && <div className="mt-2 border-l-2 border-blue-200 pl-2">
                      {Object.entries(a.changes as Record<string, unknown>).map(([key, value]) => (
                        <div key={key} className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
                          <span className="text-muted-foreground">{t(`amendments.fields.${key}`, key)}</span>
                          <span className="text-right font-medium tabular-nums">{amendmentValue(value, detail.currencyCode ?? 'VND')}</span>
                        </div>
                      ))}
                    </div>}
                  </div>
                  {canEdit && a.status === 'DRAFT' && (
                    <Button size="sm" variant="outline" disabled={submitAmendmentMutation.isPending}
                      onClick={() => submitAmendmentMutation.mutate(a.id)}>
                      {t('amendments.submitBtn')}
                    </Button>
                  )}
                  {canChangeStatus && a.status === 'SUBMITTED' && (
                    <Button size="sm" disabled={approveAmendmentMutation.isPending}
                      onClick={() => setConfirmAmendment(a)}>
                      {t('amendments.approveBtn')}
                    </Button>
                  )}
                </div>
              ))}
            </TabsContent>

            {/* ── Tab: Template ── */}
            {/* ── Tab: Thu tiền theo kỳ ── */}
            <TabsContent value="financial" className="space-y-4">
              <section aria-labelledby="contract-financial-terms">
                <div id="contract-financial-terms" className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('financialTerms.title')}
                </div>
                <div className="grid border-y border-border sm:grid-cols-2 sm:divide-x sm:divide-border">
                  <div className="sm:pr-4">
                    <KeyFact label={t('financialTerms.rent')} value={<span><ERPAmount amount={detail.rent ?? 0} currencyCode={detail.currencyCode ?? 'VND'} /> <span className="font-mono text-xs text-muted-foreground">{detail.currencyCode ?? 'VND'}</span></span>} />
                    <KeyFact label={t('financialTerms.cam')} value={<span><ERPAmount amount={detail.cam ?? 0} currencyCode={detail.currencyCode ?? 'VND'} /> <span className="font-mono text-xs text-muted-foreground">{detail.currencyCode ?? 'VND'}</span></span>} />
                    <KeyFact label={t('financialTerms.deposit')} value={<span><ERPAmount amount={detail.deposit ?? 0} currencyCode={detail.currencyCode ?? 'VND'} /> <span className="font-mono text-xs text-muted-foreground">{detail.currencyCode ?? 'VND'}</span></span>} />
                  </div>
                  <div className="sm:pl-4">
                    <KeyFact label={t('financialTerms.fitoutDeposit')} value={<span><ERPAmount amount={detail.depositFitout ?? 0} currencyCode={detail.currencyCode ?? 'VND'} /> <span className="font-mono text-xs text-muted-foreground">{detail.currencyCode ?? 'VND'}</span></span>} />
                    <KeyFact label={t('financialTerms.fitoutFee')} value={<span><ERPAmount amount={detail.fitoutFee ?? 0} currencyCode={detail.currencyCode ?? 'VND'} /> <span className="font-mono text-xs text-muted-foreground">{detail.currencyCode ?? 'VND'}</span></span>} />
                    <KeyFact label={t('financialTerms.currency')} value={<span className="font-mono">{detail.currencyCode ?? 'VND'}</span>} />
                  </div>
                </div>
              </section>
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-gray-500 max-w-md">{t('billingTab.notActiveHint')}</p>
                {canBuildSchedule && <Button size="sm" variant="outline" disabled={buildScheduleMutation.isPending}
                  onClick={() => buildScheduleMutation.mutate()}>
                  <Calendar size={14} className="mr-1" /> {t('billingTab.rebuild')}
                </Button>}
              </div>

              {scheduleLoading ? (
                <Skeleton className="h-40" />
              ) : scheduleEntries.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">{t('billingTab.noSchedule')}</p>
              ) : (() => {
                const totalScheduled = scheduleEntries.reduce((s, e) => s + e.subtotal, 0);
                const totalCollected = scheduleEntries.reduce((s, e) => s + (e.invoice?.collectedAmount ?? 0), 0);
                const collectionRate = totalScheduled > 0 ? (totalCollected / totalScheduled) * 100 : 0;
                return (
                  <>
                    <div className="grid grid-cols-2 border-y border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
                      <div className="px-3 py-2.5 first:pl-0">
                        <div className="text-[11px] text-gray-500">{t('billingTab.summary.totalScheduled')}</div>
                        <div className="text-base font-semibold text-gray-900">{fmtCurrency(totalScheduled, detail.currencyCode)}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{t('billingTab.summary.periodCount', { count: scheduleEntries.length })}</div>
                      </div>
                      <div className="px-3 py-2.5">
                        <div className="text-[11px] text-muted-foreground">{t('billingTab.summary.collected')}</div>
                        <div className="text-base font-semibold text-emerald-700">{fmtCurrency(totalCollected, detail.currencyCode)}</div>
                      </div>
                      <div className="px-3 py-2.5">
                        <div className="text-[11px] text-muted-foreground">{t('billingTab.summary.remaining')}</div>
                        <div className="text-base font-semibold text-amber-700">{fmtCurrency(Math.max(0, totalScheduled - totalCollected), detail.currencyCode)}</div>
                      </div>
                      <div className="px-3 py-2.5 last:pr-0">
                        <div className="text-[11px] text-muted-foreground">{t('billingTab.summary.collectionRate')}</div>
                        <div className="text-base font-semibold text-foreground">{collectionRate.toFixed(1)}%</div>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border">
                      <table className="min-w-[680px] w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-3 py-2">{t('billingTab.table.period')}</th>
                            <th className="text-right px-3 py-2">{t('billingTab.table.total')}</th>
                            <th className="text-left px-3 py-2">{t('billingTab.table.dueDate')}</th>
                            <th className="text-left px-3 py-2">{t('billingTab.table.periodStatus')}</th>
                            <th className="text-left px-3 py-2">{t('billingTab.table.invoice')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {scheduleEntries.map((e: any) => (
                            <tr key={e.id}>
                              <td className="px-3 py-2 font-medium text-gray-800">{e.period}</td>
                              <td className="px-3 py-2 text-right">{fmtCurrency(e.subtotal, detail.currencyCode)}</td>
                              <td className="px-3 py-2 text-gray-600">{fmtDate(e.dueDate)}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className={`${BILLING_ENTRY_STATUS_COLOR[e.status] ?? ''} text-xs`}>
                                  {t(`billingTab.entryStatus.${e.status}`, e.status as string)}
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                {e.invoice ? (
                                  <button
                                    className="flex flex-wrap items-center gap-1.5 text-left hover:underline"
                                    onClick={() => { onClose(); navigate(`/billing?invoiceId=${e.invoice.id}`); }}
                                    title={t('billingTab.viewInvoice')}
                                  >
                                    <span className="font-mono text-xs text-blue-700">{e.invoice.invoiceNumber}</span>
                                    <Badge className={`${INVOICE_STATUS_COLOR[e.invoice.status] ?? ''} border-0 text-[10px]`}>
                                      {t(`billing:status.${e.invoice.status}`, e.invoice.status as string)}
                                    </Badge>
                                    <span className="text-[11px] text-gray-400">
                                      {t('billingTab.table.collectedOfTotal', {
                                        collected: fmtCurrency(e.invoice.collectedAmount, detail.currencyCode),
                                        total: fmtCurrency(e.invoice.totalAmount, detail.currencyCode),
                                      })}
                                    </span>
                                  </button>
                                ) : (
                                  <span className="text-gray-400 text-xs">{t('billingTab.noInvoiceYet')}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </TabsContent>

            {/* ── Tab: Chấm dứt hợp đồng ── */}
            <TabsContent value="termination" className="space-y-4">
              <div className="border-b border-red-200 bg-red-50/70 pb-3">
                <Button variant="ghost" size="sm" className="mb-2 h-7 px-1 text-muted-foreground" onClick={() => { setTerminationWorkspaceOpen(false); setActiveTab('overview'); }}>
                  <ArrowLeft size={14} className="mr-1" /> {t('termination.backToContract')}
                </Button>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-red-800">{t('termination.workspaceTitle')}</div>
                    <div className="text-xs text-red-700">{detail.contractNumber} · {detail.currencyCode ?? 'VND'}</div>
                  </div>
                  <ERPStatusBadge tone={st?.tone ?? 'neutral'}>{t('status.' + detail.status)}</ERPStatusBadge>
                </div>
              </div>
              {!term || term.status === 'CANCELLED' ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">{t('termination.noRequest')}</p>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t('termination.reasonLabel')}</label>
                    <Textarea rows={2} value={termForm.reason} onChange={(e) => setTermForm((f) => ({ ...f, reason: e.target.value }))} placeholder={t('termination.reasonPlaceholder')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">{t('termination.effectiveDateLabel')}</label>
                      <Input type="date" value={termForm.effectiveDate} onChange={(e) => setTermForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">{t('termination.noticePeriodLabel')}</label>
                      <Input type="number" value={termForm.noticePeriodDays} onChange={(e) => setTermForm((f) => ({ ...f, noticePeriodDays: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">{t('termination.depositRefundLabel')}</label>
                      <Input type="number" value={termForm.depositRefund} onChange={(e) => setTermForm((f) => ({ ...f, depositRefund: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">{t('termination.penaltyLabel')}</label>
                      <Input type="number" value={termForm.penaltyAmount} onChange={(e) => setTermForm((f) => ({ ...f, penaltyAmount: e.target.value }))} />
                    </div>
                  </div>
                  <Button
                    className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white"
                    disabled={!termForm.reason || !termForm.effectiveDate || initiateTerminationMutation.isPending}
                    onClick={() => setTerminationConfirm('initiate')}
                  >
                    <LogOut size={14} /> {t('termination.initiateBtn')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`border-0 ${term.status === 'COMPLETED' ? 'bg-gray-200 text-gray-600' : 'bg-orange-100 text-orange-700'}`}>
                      {t('termination.statuses.' + term.status, { defaultValue: term.status })}
                    </Badge>
                    <span className="text-xs text-gray-500">{t('termination.effectiveFrom', { date: fmtDate(term.effectiveDate) })}</span>
                  </div>
                  <SheetSection label={t('sheet.sections.terminationInfo')}>
                    <SheetRow label={t('sheet.fields.reason')} value={term.reason} icon={AlertTriangle} />
                    <SheetRow label={t('sheet.fields.initiatedBy')} value={term.initiatedBy === 'THISO' ? t('sheet.fields.initiatedByThiso') : t('sheet.fields.initiatedByTenant')} icon={User} />
                    <SheetRow label={t('sheet.fields.noticePeriod')} value={t('sheet.fields.noticePeriodDays', { count: term.noticePeriodDays })} icon={Clock} />
                    {term.depositRefund != null && <SheetRow label={t('sheet.fields.depositRefund')} value={fmtCurrency(term.depositRefund, detail.currencyCode)} icon={DollarSign} />}
                    {term.penaltyAmount != null && <SheetRow label={t('sheet.fields.penalty')} value={fmtCurrency(term.penaltyAmount, detail.currencyCode)} icon={DollarSign} />}
                  </SheetSection>

                  {term.status !== 'COMPLETED' && (
                    <>
                      <div>
                        <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2 uppercase">{t('termination.checklist.title')}</div>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={term.accessCardReturn} onChange={(e) => updateChecklistMutation.mutate({ accessCardReturn: e.target.checked })} />
                            {t('termination.checklist.accessCard')}
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={term.signageRemoved} onChange={(e) => updateChecklistMutation.mutate({ signageRemoved: e.target.checked })} />
                            {t('termination.checklist.signage')}
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={term.keysReturned} onChange={(e) => updateChecklistMutation.mutate({ keysReturned: e.target.checked })} />
                            {t('termination.checklist.keys')}
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 gap-2 bg-red-600 hover:bg-red-700 text-white"
                          disabled={!term.accessCardReturn || !term.signageRemoved || !term.keysReturned || completeTerminationMutation.isPending}
                          onClick={() => setTerminationConfirm('complete')}
                        >
                          <CheckCircle2 size={14} /> {t('termination.completeBtn')}
                        </Button>
                        <Button
                          variant="outline"
                          className="text-gray-500"
                          disabled={cancelTerminationMutation.isPending}
                          onClick={() => setTerminationConfirm('cancel')}
                        >
                          {t('termination.cancelBtn')}
                        </Button>
                      </div>
                    </>
                  )}
                  {term.status === 'COMPLETED' && (
                    <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                      <CheckCircle2 size={16} /> {t('termination.completedAt', { date: fmtDate(term.completedAt) })}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
        </div>
      )}

      <ConfirmActionDialog
        open={terminationConfirm !== null}
        onOpenChange={(open) => !open && setTerminationConfirm(null)}
        title={t(`termination.confirm.${terminationConfirm}.title`)}
        description={t(`termination.confirm.${terminationConfirm}.description`)}
        confirmLabel={t(`termination.confirm.${terminationConfirm}.action`)}
        destructive
        loading={initiateTerminationMutation.isPending || completeTerminationMutation.isPending || cancelTerminationMutation.isPending}
        onConfirm={() => {
          if (terminationConfirm === 'initiate') initiateTerminationMutation.mutate();
          if (terminationConfirm === 'complete') completeTerminationMutation.mutate();
          if (terminationConfirm === 'cancel') cancelTerminationMutation.mutate();
          setTerminationConfirm(null);
        }}
      />

      <ConfirmActionDialog
        open={Boolean(confirmAmendment)}
        onOpenChange={(open) => !open && setConfirmAmendment(null)}
        title={t('amendments.confirm.title')}
        description={t('amendments.confirm.description', { number: confirmAmendment?.amendmentNumber })}
        confirmLabel={t('amendments.approveBtn')}
        loading={approveAmendmentMutation.isPending}
        onConfirm={() => {
          if (confirmAmendment) approveAmendmentMutation.mutate(confirmAmendment.id);
          setConfirmAmendment(null);
        }}
      />

      <Dialog open={amendmentDialogOpen} onOpenChange={setAmendmentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('amendments.dialogTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">{t('amendments.typeLabel')}</label>
              <Select value={amendmentForm.type} onValueChange={(v) => setAmendmentForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['RENT_CHANGE', 'CAM_CHANGE', 'RENT_FREE_CHANGE', 'TERM_EXTENSION', 'RENEWAL', 'OTHER'].map((tp) => (
                    <SelectItem key={tp} value={tp}>{t(`amendments.type.${tp}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {amendmentForm.type === 'RENT_CHANGE' && (
              <div>
                <label className="text-sm text-gray-600 mb-1 block">{t('amendments.newRentLabel', { currency: detail?.currencyCode ?? 'VND' })}</label>
                <Input type="number" value={amendmentForm.newRent}
                  onChange={(e) => setAmendmentForm((f) => ({ ...f, newRent: e.target.value }))} />
              </div>
            )}
            {amendmentForm.type === 'CAM_CHANGE' && (
              <div>
                <label className="text-sm text-gray-600 mb-1 block">{t('amendments.newCamLabel', { currency: detail?.currencyCode ?? 'VND' })}</label>
                <Input type="number" value={amendmentForm.newCam}
                  onChange={(e) => setAmendmentForm((f) => ({ ...f, newCam: e.target.value }))} />
              </div>
            )}
            {amendmentForm.type === 'RENT_FREE_CHANGE' && (
              <div>
                <label className="text-sm text-gray-600 mb-1 block">{t('amendments.newRentFreeLabel')}</label>
                <Input type="number" value={amendmentForm.newRentFree}
                  onChange={(e) => setAmendmentForm((f) => ({ ...f, newRentFree: e.target.value }))} />
              </div>
            )}
            {(amendmentForm.type === 'TERM_EXTENSION' || amendmentForm.type === 'RENEWAL') && (
              <div>
                <label className="text-sm text-gray-600 mb-1 block">{t('amendments.newEndDateLabel')}</label>
                <Input type="date" value={amendmentForm.newEndDate}
                  onChange={(e) => setAmendmentForm((f) => ({ ...f, newEndDate: e.target.value }))} />
              </div>
            )}

            <div>
              <label className="text-sm text-gray-600 mb-1 block">{t('amendments.effectiveDateLabel')}</label>
              <Input type="date" value={amendmentForm.effectiveDate}
                onChange={(e) => setAmendmentForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">{t('amendments.reasonLabel')}</label>
              <Textarea value={amendmentForm.reason} placeholder={t('amendments.reasonPlaceholder')}
                onChange={(e) => setAmendmentForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAmendmentDialogOpen(false)}>{t('amendments.cancel')}</Button>
            <Button disabled={createAmendmentMutation.isPending} onClick={() => createAmendmentMutation.mutate()}>
              {t('amendments.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ContractsPage() {
  const { t } = useTranslation('contracts');
  const { selectedMallId } = useMallStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const expiringDays = searchParams.get('expiring') ? +searchParams.get('expiring')! : 90;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [leaseTermType, setLeaseTermType] = useState('');
  const [type, setType] = useState('');
  const [floorId, setFloorId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showExpiring, setShowExpiring] = useState(searchParams.has('expiring'));
  const [selectedContractId, setSelectedContractId] = useState<string | null>(searchParams.get('id'));
  const [page, setPage] = useState(1);

  const hasFilter = !!(search || status || leaseTermType || type || floorId || unitId || dateFrom || dateTo);
  const filterCount = [status, leaseTermType, type, floorId, unitId, dateFrom || dateTo].filter(Boolean).length;

  const { data: floorsResponse } = useQuery({
    queryKey: ['contract-filter-floors', selectedMallId],
    queryFn: () => spacesApi.listFloors(selectedMallId || undefined),
  });
  const floors: any[] = floorsResponse?.data ?? floorsResponse ?? [];
  const { data: unitsResponse } = useQuery({
    queryKey: ['contract-filter-units', selectedMallId, floorId],
    queryFn: () => spacesApi.listUnits({ mallId: selectedMallId || undefined, floorId: floorId || undefined, page: 1, limit: 500 }),
  });
  const units: any[] = unitsResponse?.data ?? unitsResponse ?? [];

  useEffect(() => { setPage(1); setSelectedContractId(null); }, [search, status, leaseTermType, type, floorId, unitId, dateFrom, dateTo, selectedMallId]);

  function clearFilters() {
    setSearch(''); setStatus(''); setLeaseTermType(''); setType(''); setFloorId(''); setUnitId(''); setDateFrom(''); setDateTo('');
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contracts', { search, status, leaseTermType, type, floorId, unitId, dateFrom, dateTo, page, selectedMallId }],
    queryFn: () => contractsApi.listContracts({
      search: search || undefined,
      status: status || undefined,
      leaseTermType: leaseTermType || undefined,
      type: type || undefined,
      floorId: floorId || undefined,
      unitId: unitId || undefined,
      startDateFrom: dateFrom || undefined,
      startDateTo: dateTo || undefined,
      page,
      limit: 25,
      mallId: selectedMallId ?? undefined,
    }),
    enabled: !showExpiring,
  });

  const { data: expiringData, isLoading: loadingExpiring, isError: expiringError, refetch: refetchExpiring } = useQuery({
    queryKey: ['contracts-expiring', selectedMallId, expiringDays, leaseTermType],
    queryFn: () => contractsApi.expiring(selectedMallId ?? undefined, expiringDays, leaseTermType || undefined),
    enabled: showExpiring,
  });

  const contracts: Contract[] = showExpiring
    ? (expiringData?.data ?? expiringData ?? [])
    : (data?.data ?? []);
  const totalPages: number = data?.totalPages ?? 1;
  const total: number = data?.total ?? 0;
  const contractSummary = data?.summary ?? { total: 0, byStatus: {} };

  return (
    <div className="min-w-0">
      <PageHeader
        className="mb-5"
        title={t('title')}
        description={t('subtitle')}
        actions={(
          <Button variant={showExpiring ? 'default' : 'outline'} className="gap-2"
            onClick={() => setShowExpiring(!showExpiring)}>
            <AlertTriangle size={16} />
            {showExpiring ? t('actions.showAll') : t('actions.showExpiring')}
          </Button>
        )}
      />

      <div className="mb-3 flex w-fit gap-1 rounded-lg border bg-muted/40 p-1">
        {[['', 'Tất cả loại thuê'], ['LONG', 'Cho thuê dài hạn'], ['SHORT', 'Cho thuê ngắn hạn']].map(([key, label]) => (
          <button key={key || 'ALL'} onClick={() => { setLeaseTermType(key); setPage(1); }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${leaseTermType === key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {!showExpiring && <div className="mb-3 flex flex-wrap divide-x divide-border border-y border-border">
        {[
          ['', 'Tất cả hợp đồng', contractSummary.total || 0, 'text-slate-700'],
          ['PRE_ACTIVE', 'Đang chuẩn bị', (contractSummary.byStatus?.DRAFT || 0) + (contractSummary.byStatus?.PENDING_LEGAL || 0) + (contractSummary.byStatus?.PENDING_SIGNATURE || 0), 'text-amber-700'],
          ['ACTIVE', 'Đang hiệu lực', contractSummary.byStatus?.ACTIVE || 0, 'text-emerald-700'],
          ['EXPIRING', 'Sắp hết hạn', contractSummary.byStatus?.EXPIRING || 0, 'text-amber-700'],
          ['ENDED', 'Đã kết thúc', (contractSummary.byStatus?.EXPIRED || 0) + (contractSummary.byStatus?.TERMINATING || 0) + (contractSummary.byStatus?.TERMINATED || 0), 'text-red-700'],
        ].map(([key, label, count, color]) => <button key={String(key)} onClick={() => { setStatus(String(key)); setPage(1); }}
          className={`min-w-[140px] flex-1 bg-card px-3 py-1.5 text-left transition hover:bg-muted/50 ${color} ${status === key ? 'shadow-[inset_0_-2px_0_0_currentColor]' : ''}`}>
          <div className="text-[10px] font-medium text-muted-foreground">{label}</div><div className="text-base font-semibold tabular-nums">{count}</div>
        </button>)}
      </div>}

      {!showExpiring && (
        <ERPToolbar className="mb-4">
        <div className="flex min-w-full items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <SlidersHorizontal size={16} className="text-blue-600" /> Tìm kiếm và bộ lọc
            {filterCount > 0 && <Badge className="border-0 bg-blue-100 text-blue-700">{filterCount} bộ lọc</Badge>}
          </div>
          <span className="text-xs text-gray-500">{total} hợp đồng</span>
        </div>
        <div className="flex min-w-full flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder={t('filters.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t('filters.typeLabel')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('filters.allTypes')}</SelectItem>
              {TYPE_KEYS.map((k) => (
                <SelectItem key={k} value={k}>{t('type.' + k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={floorId || 'ALL'} onValueChange={(value) => { setFloorId(value === 'ALL' ? '' : value); setUnitId(''); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Tầng" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả tầng</SelectItem>
              {floors.map((floor) => <SelectItem key={floor.id} value={floor.id}>{floor.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={unitId || 'ALL'} onValueChange={(value) => setUnitId(value === 'ALL' ? '' : value)}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Mặt bằng" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả mặt bằng</SelectItem>
              {units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.code}{unit.name ? ` — ${unit.name}` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t('filters.statusLabel')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('filters.allStatuses')}</SelectItem>
              {Object.keys(STATUS_MAP).map((k) => (
                <SelectItem key={k} value={k}>{t('status.' + k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
            placeholder={t('filters.datePlaceholder')}
          />
          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-gray-500 h-9">
              <X size={14} /> {t('filters.clearFilters')}
            </Button>
          )}
        </div>
        </ERPToolbar>
      )}

      {(showExpiring ? expiringError : isError) ? (
        <AsyncState isLoading={false} isError
          onRetry={showExpiring ? refetchExpiring : refetch}
          errorTitle={t('errorLoad')}>
          <div />
        </AsyncState>
      ) : (isLoading || loadingExpiring) ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('table.contractNo')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Thời gian tạo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('table.tenant')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('table.unit')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('table.type')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">{t('table.monthlyRent')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('common:labels.currency')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('table.startDate')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('table.endDate')}</th>
                {showExpiring && <th className="text-right px-4 py-3 font-medium text-gray-600">{t('table.remaining')}</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('table.status')}</th>
                <th className="px-4 py-3 text-gray-400 text-xs">{t('table.documents')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contracts.map((c: any) => {
                const st = STATUS_MAP[c.status] ?? STATUS_MAP.DRAFT;
                const days = daysUntil(c.endDate);
                const fileCount = c.files?.length ?? 0;
                const hasSignedFile = c.files?.some((f: any) => f.signedAt);
                const isNew = isRecentlyCreated(c.createdAt);
                return (
                  <tr key={c.id}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedContractId === c.id ? 'bg-blue-50/70' : showExpiring && days <= 30 ? 'bg-red-50' : isNew ? 'bg-sky-50/40' : ''}`}
                    onClick={() => setSelectedContractId(c.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2"><span className="font-mono text-xs font-semibold">{c.contractNumber}</span>
                      {isNew && <Badge className="gap-1 border-0 bg-blue-600 px-1.5 py-0 text-[10px] text-white"><Sparkles size={10} /> Mới</Badge>}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className={`flex items-center gap-1 text-xs ${isNew ? 'font-medium text-blue-700' : 'text-gray-600'}`}><Clock size={13} />{createdAge(c.createdAt)}</div>
                      <div className="mt-0.5 text-[11px] text-gray-400">{new Date(c.createdAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td className="px-4 py-3 font-medium">{c.tenant?.brandName}</td>
                    <td className="px-4 py-3"><div className="font-medium text-gray-800">{c.unit?.code}</div><div className="text-xs text-gray-400">{c.unit?.floor?.name ?? 'Chưa xác định tầng'}</div></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1"><Badge variant="outline" className="text-xs">{t(`type.${c.type}`, { defaultValue: c.type })}</Badge><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.unit?.leaseTermType === 'SHORT' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{c.unit?.leaseTermType === 'SHORT' ? 'Ngắn hạn' : 'Dài hạn'}</span></div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <ERPAmount amount={c.rent} currencyCode={c.currencyCode ?? 'VND'} strong />
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">{c.currencyCode ?? 'VND'}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(c.startDate).toLocaleDateString('vi-VN')}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(c.endDate).toLocaleDateString('vi-VN')}</td>
                    {showExpiring && (
                      <td className={`px-4 py-3 text-right font-medium ${days <= 30 ? 'text-red-600' : days <= 90 ? 'text-orange-500' : 'text-gray-500'}`}>
                        {t('table.daysRemaining', { count: days })}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <ERPStatusBadge tone={st.tone}>{t('status.' + c.status)}</ERPStatusBadge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {fileCount > 0 ? (
                        <span className={`flex items-center justify-center gap-1 text-xs ${hasSignedFile ? 'text-green-600' : 'text-gray-500'}`}>
                          {hasSignedFile ? <ShieldCheck size={13} /> : <FileText size={13} />}
                          {fileCount}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {contracts.length === 0 && (
            <div className="text-center py-12 text-gray-400 space-y-3">
              <File size={40} className="mx-auto mb-2 opacity-20" />
              <p className="font-medium text-gray-600">
                {hasFilter ? t('emptyFiltered.title') : t('empty')}
              </p>
              <p className="text-sm">
                {hasFilter ? t('emptyFiltered.subtitle') : t('emptyNoData.subtitle')}
              </p>
              {hasFilter ? (
                <Button variant="outline" size="sm" onClick={clearFilters} className="gap-1.5">
                  <X size={14} /> {t('filters.clearFilters')}
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => navigate('/proposals')}>
                  {t('emptyNoData.cta')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {!showExpiring && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>{t('total', { count: total })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('pagination.prev')}</Button>
            <span className="px-2 py-1">{t('pagination.page', { current: page, total: totalPages })}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('pagination.next')}</Button>
          </div>
        </div>
      )}

      <ContractDetailSheet contractId={selectedContractId} onClose={() => setSelectedContractId(null)} />
    </div>
  );
}
