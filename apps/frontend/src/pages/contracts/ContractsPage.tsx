import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { contractsApi, terminationApi } from '@/api';
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
import {
  Search, File, AlertTriangle, Building2, Calendar, DollarSign, User, FileText, History, GitBranch,
  ArrowRight, Link2, Upload, Trash2, Download, PenLine, ShieldCheck, QrCode,
  CheckCircle2, Clock, ExternalLink, X, Loader2, AlertCircle, LogOut,
} from 'lucide-react';
import type { Contract } from '@/types';

// ── Status maps ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT:             { label: 'Draft',          color: 'bg-gray-100 text-gray-700' },
  PENDING_LEGAL:     { label: 'Chờ Legal',      color: 'bg-blue-100 text-blue-700' },
  PENDING_SIGNATURE: { label: 'Chờ ký',         color: 'bg-yellow-100 text-yellow-700' },
  ACTIVE:            { label: 'Hiệu lực',        color: 'bg-green-100 text-green-700' },
  EXPIRING:          { label: 'Sắp hết hạn',    color: 'bg-orange-100 text-orange-700' },
  EXPIRED:           { label: 'Hết hạn',         color: 'bg-red-100 text-red-700' },
  TERMINATING:       { label: 'Đang chấm dứt',   color: 'bg-orange-100 text-orange-700' },
  TERMINATED:        { label: 'Đã chấm dứt',    color: 'bg-gray-200 text-gray-600' },
};

const TYPE_MAP: Record<string, string> = {
  LOI:              'LOI',
  LEASE_AGREEMENT:  'Hợp đồng thuê',
  APPENDIX:         'Phụ lục',
  RENEWAL:          'Gia hạn',
  TERMINATION:      'Chấm dứt HĐ',
};

function daysUntil(date: string) {
  return Math.floor((new Date(date).getTime() - Date.now()) / 86400000);
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtBytes(b?: number | null) {
  if (!b) return '';
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

// ── Sign File Dialog ──────────────────────────────────────────────────────────

function SignFileDialog({ contractId, file, open, onClose }: {
  contractId: string; file: any; open: boolean; onClose: () => void;
}) {
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
      toast({ title: 'Đã ký điện tử thành công' });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine size={16} className="text-blue-600" /> Ký điện tử tài liệu
          </DialogTitle>
          {file && <p className="text-sm text-gray-500 mt-1">{file.fileName}</p>}
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            Hệ thống sẽ tạo mã hash SHA-256 từ tài liệu + thông tin người ký + thời gian, tạo mã xác thực độc lập.
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            <strong>Lưu ý:</strong> đây là xác thực toàn vẹn nội bộ (hash), không phải chữ ký số có giá trị pháp lý theo Nghị định 130/2018. Dùng cho biên bản/phụ lục nội bộ; hợp đồng cần giá trị pháp lý cao nên ký qua nhà cung cấp chữ ký số hợp pháp.
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Tên người ký *</label>
            <Input value={form.signerName}
              onChange={(e) => setForm(p => ({ ...p, signerName: e.target.value }))}
              placeholder="Nguyễn Văn A" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Vai trò</label>
            <Select value={form.signerRole} onValueChange={(v) => setForm(p => ({ ...p, signerRole: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TENANT">Khách thuê</SelectItem>
                <SelectItem value="LANDLORD">Chủ đầu tư (BQL)</SelectItem>
                <SelectItem value="LEGAL">Pháp chế</SelectItem>
                <SelectItem value="CEO">Tổng giám đốc</SelectItem>
                <SelectItem value="WITNESS">Người chứng kiến</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button disabled={!form.signerName || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            <PenLine size={13} />
            {mutation.isPending ? 'Đang ký...' : 'Xác nhận ký'}
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
  const { data, isLoading } = useQuery({
    queryKey: ['verify-signature', verifyCode],
    queryFn: () => contractsApi.verifyFile(verifyCode),
    enabled: open && !!verifyCode,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-green-600" /> Xác thực chữ ký điện tử
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
        ) : data?.valid ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
              <CheckCircle2 size={18} className="text-green-600 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-green-800">Tài liệu hợp lệ</div>
                <div className="text-xs text-green-600">Chữ ký điện tử đã được xác thực</div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-gray-500">Tài liệu</span>
                <span className="font-medium text-right max-w-48 truncate">{data.fileName}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-gray-500">Số HĐ</span>
                <span className="font-medium font-mono">{data.contractNumber}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-gray-500">Người ký</span>
                <span className="font-medium">{data.signerName}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-gray-500">Vai trò</span>
                <span className="font-medium">{data.signerRole}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-gray-500">Thời gian ký</span>
                <span className="font-medium">{fmtDate(data.signedAt)}</span>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">SHA-256 Hash</div>
                <div className="font-mono text-xs bg-gray-50 border rounded p-2 break-all text-gray-600">{data.sha256Hash}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <div className="text-sm text-red-700">{data?.message ?? 'Mã xác thực không hợp lệ'}</div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────

function DocumentsTab({ contractId }: { contractId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [signFile, setSignFile] = useState<any>(null);
  const [verifyCode, setVerifyCode] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['contract-files', contractId],
    queryFn: () => contractsApi.listFiles(contractId),
    enabled: !!contractId,
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => contractsApi.deleteFile(contractId, fileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract-files', contractId] });
      toast({ title: 'Đã xóa tài liệu' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const handleUpload = useCallback(async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      await contractsApi.uploadFile(contractId, file);
      qc.invalidateQueries({ queryKey: ['contract-files', contractId] });
      toast({ title: `Đã upload: ${file.name}` });
    } catch (e: any) {
      toast({ title: e?.response?.data?.message ?? 'Upload thất bại', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [contractId, qc, toast]);

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
      <div
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
            <p className="text-sm text-blue-600 font-medium">Đang tải lên...</p>
          </div>
        ) : (
          <>
            <Upload size={28} className={`mx-auto mb-2 ${dragging ? 'text-blue-500' : 'text-gray-300'}`} />
            <p className="text-sm font-medium text-gray-600">Kéo & thả hoặc bấm để chọn file</p>
            <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, DOCX, XLSX · Tối đa 30 MB</p>
          </>
        )}
      </div>

      {/* File list */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : (files as any[]).length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <FileText size={32} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm">Chưa có tài liệu nào — upload bản scan hợp đồng</p>
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
                        title="Xác thực toàn vẹn nội bộ (hash) — không phải chữ ký số có giá trị pháp lý"
                        className="flex items-center gap-1 text-xs bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full">
                        <ShieldCheck size={10} /> Đã ký (nội bộ)
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
                  {/* Download */}
                  <a href={f.filePath?.startsWith('http') ? f.filePath : f.filePath}
                    target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    title="Tải xuống">
                    <Download size={14} />
                  </a>

                  {/* Sign */}
                  {!f.signedAt && (
                    <button onClick={() => setSignFile(f)}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"
                      title="Ký điện tử">
                      <PenLine size={14} />
                    </button>
                  )}

                  {/* Verify QR */}
                  {f.verifyCode && (
                    <button onClick={() => setVerifyCode(f.verifyCode)}
                      className="p-1.5 rounded-lg hover:bg-green-50 text-green-500 hover:text-green-700"
                      title="Xác thực chữ ký">
                      <ShieldCheck size={14} />
                    </button>
                  )}

                  {/* Delete */}
                  <button onClick={() => {
                    if (confirm(`Xóa file "${f.fileName}"?`)) deleteMutation.mutate(f.id);
                  }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500"
                    title="Xóa">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Signature details row */}
              {f.sha256Hash && (
                <div className="mt-2 pt-2 border-t border-green-100">
                  <div className="text-xs text-gray-400">SHA-256 Hash</div>
                  <div className="font-mono text-xs text-gray-500 truncate mt-0.5">{f.sha256Hash}</div>
                  {f.verifyCode && (
                    <div className="mt-1 text-xs">
                      <span className="text-gray-400">Mã xác thực: </span>
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
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [templateId, setTemplateId] = useState('');

  const { data: c, isLoading } = useQuery({
    queryKey: ['contract-detail', contractId],
    queryFn: () => contractsApi.getContract(contractId!),
    enabled: !!contractId,
  });

  const { data: events } = useQuery({
    queryKey: ['contract-events', contractId],
    queryFn: () => contractsApi.getEvents(contractId!),
    enabled: !!contractId,
  });

  const { data: amendments } = useQuery({
    queryKey: ['contract-amendments', contractId],
    queryFn: () => contractsApi.listAmendments(contractId!),
    enabled: !!contractId,
  });

  const { data: templates } = useQuery({
    queryKey: ['contract-templates'],
    queryFn: contractsApi.listTemplates,
    enabled: !!contractId,
  });

  const { data: termination } = useQuery({
    queryKey: ['contract-termination', contractId],
    queryFn: () => terminationApi.get(contractId!),
    enabled: !!contractId,
  });

  const [termForm, setTermForm] = useState({ reason: '', effectiveDate: '', noticePeriodDays: '60', depositRefund: '', penaltyAmount: '' });

  const detail: any = c?.data ?? c;
  const term: any = termination?.data ?? termination;

  const invalidateTermination = () => {
    qc.invalidateQueries({ queryKey: ['contract-termination', contractId] });
    qc.invalidateQueries({ queryKey: ['contract-detail', contractId] });
    qc.invalidateQueries({ queryKey: ['contracts'] });
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
    onSuccess: () => { invalidateTermination(); toast({ title: 'Đã khởi tạo quy trình chấm dứt hợp đồng' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const updateChecklistMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => terminationApi.update(contractId!, data),
    onSuccess: () => { invalidateTermination(); toast({ title: 'Đã cập nhật' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const completeTerminationMutation = useMutation({
    mutationFn: () => terminationApi.complete(contractId!),
    onSuccess: () => { invalidateTermination(); toast({ title: 'Đã hoàn tất chấm dứt hợp đồng — mặt bằng chuyển về trống' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const cancelTerminationMutation = useMutation({
    mutationFn: () => terminationApi.cancel(contractId!),
    onSuccess: () => { invalidateTermination(); toast({ title: 'Đã hủy quy trình chấm dứt' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const renderMutation = useMutation({
    mutationFn: () => contractsApi.renderTemplate(contractId!, templateId),
    onSuccess: () => toast({ title: 'Đã render template' }),
  });

  const createAmendmentMutation = useMutation({
    mutationFn: () => contractsApi.createAmendment(contractId!, {
      type: 'RENT_CHANGE',
      effectiveDate: new Date().toISOString(),
      changes: { rent: (detail?.rent ?? 0) * 1.05 },
      reason: 'Điều chỉnh tiền thuê +5%',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract-amendments', contractId] });
      toast({ title: 'Đã tạo amendment draft' });
    },
  });

  const st = detail ? STATUS_MAP[detail.status] ?? STATUS_MAP.DRAFT : null;
  const days = detail?.endDate ? daysUntil(detail.endDate) : null;
  const monthlyRent = detail ? detail.rent + (detail.cam ?? 0) + (detail.serviceCharge ?? 0) : 0;

  return (
    <Sheet open={!!contractId} onClose={onClose}
      title={detail?.contractNumber ?? 'Hợp đồng'}
      subtitle={detail?.tenant?.brandName}>
      {isLoading && (
        <div className="px-6 pt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
        </div>
      )}
      {detail && (
        <div className="px-6 pb-8 pt-4">
          <Tabs defaultValue="detail">
            <TabsList className="mb-4">
              <TabsTrigger value="detail">Chi tiết</TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5">
                <FileText size={13} /> Tài liệu
                {detail.files?.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs px-1.5 rounded-full">{detail.files.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="events">Timeline</TabsTrigger>
              <TabsTrigger value="amendments">Phụ lục</TabsTrigger>
              <TabsTrigger value="template">Template</TabsTrigger>
              <TabsTrigger value="termination" className="gap-1.5">
                <LogOut size={13} /> Chấm dứt
                {term && term.status !== 'CANCELLED' && (
                  <span className="bg-orange-100 text-orange-700 text-xs px-1.5 rounded-full">•</span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Tab: Chi tiết ── */}
            <TabsContent value="detail" className="space-y-4">
              {/* Status */}
              <div className="flex items-center gap-2 flex-wrap">
                {st && <Badge className={`${st.color} border-0 px-3 py-1 text-sm font-medium`}>{st.label}</Badge>}
                {detail.type && <Badge variant="outline">{detail.type}</Badge>}
                {days !== null && days <= 90 && (
                  <Badge className={`${days <= 30 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'} border-0`}>
                    Còn {days} ngày
                  </Badge>
                )}
              </div>

              {/* Source */}
              {detail.proposal && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                  <div className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    <Link2 size={11} /> NGUỒN GỐC
                  </div>
                  <button className="flex items-center justify-between w-full text-sm hover:text-gray-700 group"
                    onClick={() => { onClose(); navigate('/proposals'); }}>
                    <div>
                      <span className="text-xs text-gray-500 font-medium">Đề xuất: </span>
                      <span className="font-medium text-gray-900">{detail.proposal.proposalNumber}</span>
                    </div>
                    <ArrowRight size={12} className="text-blue-400 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                  {detail.proposal.lead && (
                    <button className="flex items-center justify-between w-full text-sm hover:text-gray-700 group"
                      onClick={() => { onClose(); navigate('/crm'); }}>
                      <div>
                        <span className="text-xs text-gray-500 font-medium">Lead: </span>
                        <span className="font-medium text-gray-900">{detail.proposal.lead.brandName}</span>
                        <span className="text-xs text-gray-500 ml-1">({detail.proposal.lead.contactName})</span>
                      </div>
                      <ArrowRight size={12} className="text-blue-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  )}
                </div>
              )}

              <SheetSection label="CÁC BÊN" className="bg-gray-50">
                <SheetRow label="Khách thuê"
                  value={
                    <button className="text-gray-700 hover:underline flex items-center gap-1"
                      onClick={() => { onClose(); navigate('/tenants'); }}>
                      {detail.tenant?.brandName} <ArrowRight size={11} />
                    </button>
                  } icon={User} />
                <SheetRow label="Công ty" value={detail.tenant?.companyName} icon={Building2} />
                <SheetRow label="Mặt bằng" value={detail.unit?.code} icon={Building2} />
              </SheetSection>

              <SheetSection label="ĐIỀU KHOẢN TÀI CHÍNH" className="bg-green-50">
                <SheetRow label="Tiền thuê"
                  value={`${new Intl.NumberFormat('vi-VN').format(detail.rent)} ₫/tháng`} icon={DollarSign} />
                {detail.cam > 0 && (
                  <SheetRow label="Phí CAM"
                    value={`${new Intl.NumberFormat('vi-VN').format(detail.cam)} ₫/tháng`} icon={DollarSign} />
                )}
                {detail.serviceCharge > 0 && (
                  <SheetRow label="Phí dịch vụ"
                    value={`${new Intl.NumberFormat('vi-VN').format(detail.serviceCharge)} ₫/tháng`} icon={DollarSign} />
                )}
                <SheetRow label="Tổng / tháng"
                  value={<span className="text-green-700 font-bold">{new Intl.NumberFormat('vi-VN').format(monthlyRent)} ₫</span>}
                  icon={DollarSign} />
                {detail.deposit > 0 && (
                  <SheetRow label="Tiền đặt cọc"
                    value={`${new Intl.NumberFormat('vi-VN').format(detail.deposit)} ₫`} icon={DollarSign} />
                )}
              </SheetSection>

              <SheetSection label="THỜI HẠN HỢP ĐỒNG" className="bg-gray-50">
                <SheetRow label="Ngày bắt đầu" value={fmtDate(detail.startDate)} icon={Calendar} />
                <SheetRow label="Ngày kết thúc" value={fmtDate(detail.endDate)} icon={Calendar} />
                <SheetRow label="Ngày ký" value={fmtDate(detail.signedDate)} icon={Calendar} />
                <SheetRow label="Thời hạn"
                  value={detail.durationMonths ? `${detail.durationMonths} tháng` : null} icon={Calendar} />
              </SheetSection>
            </TabsContent>

            {/* ── Tab: Tài liệu ── */}
            <TabsContent value="documents">
              <DocumentsTab contractId={contractId!} />
            </TabsContent>

            {/* ── Tab: Timeline ── */}
            <TabsContent value="events">
              <div className="space-y-2">
                {(events?.data ?? events ?? []).map((e: any) => (
                  <div key={e.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                    <div className="flex items-center gap-2 font-medium"><History size={14} />{e.title}</div>
                    <div className="text-xs text-gray-500 mt-1">{new Date(e.createdAt).toLocaleString('vi-VN')}</div>
                    {e.beforeValue && e.afterValue && (
                      <div className="text-xs mt-2 font-mono bg-white p-2 rounded border">
                        {e.beforeValue} → {e.afterValue}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ── Tab: Phụ lục ── */}
            <TabsContent value="amendments">
              <Button size="sm" className="mb-3" onClick={() => createAmendmentMutation.mutate()}>
                <GitBranch size={14} className="mr-1" /> Tạo phụ lục (rent +5%)
              </Button>
              {(amendments?.data ?? amendments ?? []).map((a: any) => (
                <div key={a.id} className="p-3 border rounded-lg mb-2 text-sm">
                  <div className="font-medium">{a.amendmentNumber} — {a.type}</div>
                  <Badge variant="outline" className="mt-1">{a.status}</Badge>
                </div>
              ))}
            </TabsContent>

            {/* ── Tab: Template ── */}
            <TabsContent value="template">
              <select className="border rounded px-2 py-1 text-sm w-full mb-2"
                value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Chọn template...</option>
                {(templates?.data ?? templates ?? []).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <Button size="sm" disabled={!templateId} onClick={() => renderMutation.mutate()}>
                Render hợp đồng
              </Button>
            </TabsContent>

            {/* ── Tab: Chấm dứt hợp đồng ── */}
            <TabsContent value="termination" className="space-y-4">
              {!term || term.status === 'CANCELLED' ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">Chưa có yêu cầu chấm dứt hợp đồng nào cho hợp đồng này.</p>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Lý do chấm dứt *</label>
                    <Textarea rows={2} value={termForm.reason} onChange={(e) => setTermForm((f) => ({ ...f, reason: e.target.value }))} placeholder="VD: Khách thuê ngừng kinh doanh, vi phạm hợp đồng..." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Ngày hiệu lực *</label>
                      <Input type="date" value={termForm.effectiveDate} onChange={(e) => setTermForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Số ngày báo trước</label>
                      <Input type="number" value={termForm.noticePeriodDays} onChange={(e) => setTermForm((f) => ({ ...f, noticePeriodDays: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Hoàn cọc (nếu có)</label>
                      <Input type="number" value={termForm.depositRefund} onChange={(e) => setTermForm((f) => ({ ...f, depositRefund: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Phạt vi phạm (nếu có)</label>
                      <Input type="number" value={termForm.penaltyAmount} onChange={(e) => setTermForm((f) => ({ ...f, penaltyAmount: e.target.value }))} />
                    </div>
                  </div>
                  <Button
                    className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white"
                    disabled={!termForm.reason || !termForm.effectiveDate || initiateTerminationMutation.isPending}
                    onClick={() => initiateTerminationMutation.mutate()}
                  >
                    <LogOut size={14} /> Khởi tạo chấm dứt hợp đồng
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`border-0 ${term.status === 'COMPLETED' ? 'bg-gray-200 text-gray-600' : 'bg-orange-100 text-orange-700'}`}>
                      {term.status === 'INITIATED' ? 'Đã khởi tạo' : term.status === 'IN_PROGRESS' ? 'Đang xử lý' : term.status === 'COMPLETED' ? 'Đã hoàn tất' : term.status}
                    </Badge>
                    <span className="text-xs text-gray-500">Hiệu lực từ {fmtDate(term.effectiveDate)}</span>
                  </div>
                  <SheetSection label="THÔNG TIN CHẤM DỨT">
                    <SheetRow label="Lý do" value={term.reason} icon={AlertTriangle} />
                    <SheetRow label="Khởi tạo bởi" value={term.initiatedBy === 'THISO' ? 'THISO (BQL)' : 'Khách thuê'} icon={User} />
                    <SheetRow label="Báo trước" value={`${term.noticePeriodDays} ngày`} icon={Clock} />
                    {term.depositRefund != null && <SheetRow label="Hoàn cọc" value={term.depositRefund.toLocaleString('vi-VN') + ' đ'} icon={DollarSign} />}
                    {term.penaltyAmount != null && <SheetRow label="Phạt vi phạm" value={term.penaltyAmount.toLocaleString('vi-VN') + ' đ'} icon={DollarSign} />}
                  </SheetSection>

                  {term.status !== 'COMPLETED' && (
                    <>
                      <div>
                        <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2 uppercase">Checklist bàn giao</div>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={term.accessCardReturn} onChange={(e) => updateChecklistMutation.mutate({ accessCardReturn: e.target.checked })} />
                            Đã thu hồi thẻ ra vào
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={term.signageRemoved} onChange={(e) => updateChecklistMutation.mutate({ signageRemoved: e.target.checked })} />
                            Đã tháo dỡ biển hiệu
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={term.keysReturned} onChange={(e) => updateChecklistMutation.mutate({ keysReturned: e.target.checked })} />
                            Đã bàn giao chìa khóa
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 gap-2 bg-red-600 hover:bg-red-700 text-white"
                          disabled={!term.accessCardReturn || !term.signageRemoved || !term.keysReturned || completeTerminationMutation.isPending}
                          onClick={() => completeTerminationMutation.mutate()}
                        >
                          <CheckCircle2 size={14} /> Hoàn tất chấm dứt
                        </Button>
                        <Button
                          variant="outline"
                          className="text-gray-500"
                          disabled={cancelTerminationMutation.isPending}
                          onClick={() => cancelTerminationMutation.mutate()}
                        >
                          Hủy quy trình
                        </Button>
                      </div>
                    </>
                  )}
                  {term.status === 'COMPLETED' && (
                    <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                      <CheckCircle2 size={16} /> Hoàn tất ngày {fmtDate(term.completedAt)} — mặt bằng đã chuyển về trống
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Sheet>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ContractsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showExpiring, setShowExpiring] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const hasFilter = !!(search || status || type || dateFrom || dateTo);

  useEffect(() => { setPage(1); }, [search, status, type, dateFrom, dateTo]);

  function clearFilters() {
    setSearch(''); setStatus(''); setType(''); setDateFrom(''); setDateTo('');
  }

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', { search, status, type, dateFrom, dateTo, page }],
    queryFn: () => contractsApi.listContracts({
      search: search || undefined,
      status: status || undefined,
      type: type || undefined,
      startDateFrom: dateFrom || undefined,
      startDateTo: dateTo || undefined,
      page,
      limit: 25,
    }),
    enabled: !showExpiring,
  });

  const { data: expiringData, isLoading: loadingExpiring } = useQuery({
    queryKey: ['contracts-expiring'],
    queryFn: contractsApi.expiring,
    enabled: showExpiring,
  });

  const contracts: Contract[] = showExpiring
    ? (expiringData?.data ?? expiringData ?? [])
    : (data?.data ?? []);
  const totalPages: number = data?.totalPages ?? 1;
  const total: number = data?.total ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hợp đồng</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý hợp đồng cho thuê — upload scan & ký điện tử</p>
        </div>
        <Button variant={showExpiring ? 'default' : 'outline'} className="gap-2"
          onClick={() => setShowExpiring(!showExpiring)}>
          <AlertTriangle size={16} />
          {showExpiring ? 'Tất cả HĐ' : 'Sắp hết hạn'}
        </Button>
      </div>

      {!showExpiring && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Số HĐ / khách thuê / mặt bằng..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Loại HĐ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tất cả loại</SelectItem>
              {Object.entries(TYPE_MAP).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tất cả TT</SelectItem>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
            placeholder="Ngày bắt đầu HĐ"
          />
          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-gray-500 h-9">
              <X size={14} /> Xóa lọc
            </Button>
          )}
        </div>
      )}

      {(isLoading || loadingExpiring) ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Số HĐ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Khách thuê</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Mặt bằng</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Loại</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Thuê/tháng</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Bắt đầu</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Kết thúc</th>
                {showExpiring && <th className="text-right px-4 py-3 font-medium text-gray-600">Còn lại</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 text-gray-400 text-xs">Tài liệu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contracts.map((c: any) => {
                const st = STATUS_MAP[c.status] ?? STATUS_MAP.DRAFT;
                const days = daysUntil(c.endDate);
                const fileCount = c.files?.length ?? 0;
                const hasSignedFile = c.files?.some((f: any) => f.signedAt);
                return (
                  <tr key={c.id}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${showExpiring && days <= 30 ? 'bg-red-50' : ''}`}
                    onClick={() => setSelectedContractId(c.id)}>
                    <td className="px-4 py-3 font-mono text-xs">{c.contractNumber}</td>
                    <td className="px-4 py-3 font-medium">{c.tenant?.brandName}</td>
                    <td className="px-4 py-3 text-gray-500">{c.unit?.code}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{c.type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(c.rent)} VNĐ
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(c.startDate).toLocaleDateString('vi-VN')}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(c.endDate).toLocaleDateString('vi-VN')}</td>
                    {showExpiring && (
                      <td className={`px-4 py-3 text-right font-medium ${days <= 30 ? 'text-red-600' : days <= 90 ? 'text-orange-500' : 'text-gray-500'}`}>
                        {days} ngày
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Badge className={`${st.color} border-0 text-xs`}>{st.label}</Badge>
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
            <div className="text-center py-12 text-gray-400">
              <File size={40} className="mx-auto mb-2 opacity-20" />
              <p>Không có hợp đồng nào</p>
            </div>
          )}
        </div>
      )}

      {!showExpiring && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>{total} hợp đồng</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Trước</Button>
            <span className="px-2 py-1">Trang {page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sau</Button>
          </div>
        </div>
      )}

      <ContractDetailSheet contractId={selectedContractId} onClose={() => setSelectedContractId(null)} />
    </div>
  );
}
