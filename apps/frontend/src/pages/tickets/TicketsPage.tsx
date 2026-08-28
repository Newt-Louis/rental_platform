import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ticketsApi, tenantsApi, spacesApi, usersApi, maintenanceApi } from '@/api';
import { useAuthStore } from '@/store/auth.store';
import { useMallStore } from '@/store/mall.store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthenticatedImage } from '@/components/ui/authenticated-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { PageHeader } from '@/components/ui/page-header';
import { ERPToolbar } from '@/components/erp';
import { useToast } from '@/components/ui/use-toast';
import { Search, Ticket, Plus, Send, Building2, Calendar, CheckCircle2, User, ImagePlus, ClipboardList, Wrench, Power, AlertTriangle, Clock3, Inbox, UserRoundCheck, Play, UploadCloud, BellRing, ListChecks, History } from 'lucide-react';
import type { Ticket as TicketType } from '@/types';
import { useSearchParams } from 'react-router-dom';
import { roleTranslationKey } from '@/lib/erpEnumPresentation';

const STATUS_MAP: Record<string, { color: string }> = {
  NEW: { color: 'bg-gray-100 text-gray-700' },
  ASSIGNED: { color: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { color: 'bg-yellow-100 text-yellow-700' },
  WAITING_TENANT: { color: 'bg-purple-100 text-purple-700' },
  RESOLVED: { color: 'bg-green-100 text-green-700' },
  CLOSED: { color: 'bg-gray-200 text-gray-600' },
};

const PRIORITY_MAP: Record<string, { color: string }> = {
  LOW: { color: 'bg-gray-100 text-gray-600' },
  MEDIUM: { color: 'bg-gray-100 text-gray-700' },
  HIGH: { color: 'bg-orange-100 text-orange-700' },
  URGENT: { color: 'bg-red-100 text-red-700' },
};

const TICKET_TYPES = [
  { value: 'ELECTRICAL' },
  { value: 'WATER' },
  { value: 'HVAC' },
  { value: 'CLEANING' },
  { value: 'SECURITY' },
  { value: 'PARKING' },
  { value: 'INTERNET' },
  { value: 'DELIVERY' },
  { value: 'MARKETING_EVENT' },
  { value: 'OTHER' },
];

// Bảng chuyển trạng thái hợp lệ cho nhân viên (khớp state machine backend).
const STAFF_TRANSITIONS: Record<string, string[]> = {
  NEW: ['ASSIGNED', 'IN_PROGRESS'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_TENANT', 'RESOLVED'],
  WAITING_TENANT: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS'],
};

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Create Inspection Ticket Dialog ─────────────────────────────────────────

function CreateInspectionTicketDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation(['tickets', 'common']);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: { tenantId: '', unitId: '', type: '', priority: 'MEDIUM', subject: '', description: '' },
  });
  const selectedTenantId = watch('tenantId');
  const selectedUnitId = watch('unitId');
  const selectedType = watch('type');
  const selectedPriority = watch('priority');

  const { data: tenantsData } = useQuery({
    queryKey: ['tenants-all'],
    queryFn: () => tenantsApi.listTenants({ limit: 200 }),
    enabled: open,
  });
  const { data: unitsData } = useQuery({
    queryKey: ['units-by-tenant', selectedTenantId],
    queryFn: () => spacesApi.listUnits({ tenantId: selectedTenantId, limit: 500 }),
    enabled: open && !!selectedTenantId,
  });

  const tenants: any[] = tenantsData?.data ?? [];
  const units: any[] = unitsData?.data ?? [];

  const mutation = useMutation({
    mutationFn: (data: any) => ticketsApi.createTicket(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      toast({ title: t('createSuccess') });
      reset();
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('errors.create'), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('inspection.createTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">{t('inspection.tenantLabel')}</label>
            <Select value={selectedTenantId || undefined} onValueChange={(v) => { setValue('tenantId', v, { shouldValidate: true }); setValue('unitId', '', { shouldValidate: true }); }}>
              <SelectTrigger className={errors.tenantId ? 'border-red-400' : ''}>
                <SelectValue placeholder={t('inspection.tenantPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tn: any) => (
                  <SelectItem key={tn.id} value={tn.id}>{tn.brandName} — {tn.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register('tenantId', { required: t('inspection.tenantRequired') })} />
            {errors.tenantId && <p className="mt-1 text-xs font-medium text-red-600">{String(errors.tenantId.message)}</p>}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">{t('inspection.unitLabel')}</label>
            <Select value={selectedUnitId || undefined} onValueChange={(v) => setValue('unitId', v, { shouldValidate: true })} disabled={!selectedTenantId}>
              <SelectTrigger className={errors.unitId ? 'border-red-400' : ''}>
                <SelectValue placeholder={selectedTenantId ? t('inspection.unitPlaceholder') : t('inspection.unitDisabled')} />
              </SelectTrigger>
              <SelectContent>
                {units.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.code} — {u.floor?.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register('unitId', { required: t('inspection.unitRequired') })} />
            {errors.unitId && <p className="mt-1 text-xs font-medium text-red-600">{String(errors.unitId.message)}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">{t('inspection.typeLabel')}</label>
              <Select value={selectedType || undefined} onValueChange={(v) => setValue('type', v, { shouldValidate: true })}>
                <SelectTrigger className={errors.type ? 'border-red-400' : ''}>
                  <SelectValue placeholder={t('inspection.typePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map((tt) => <SelectItem key={tt.value} value={tt.value}>{t('types.' + tt.value)}</SelectItem>)}
                </SelectContent>
              </Select>
              <input type="hidden" {...register('type', { required: t('inspection.typeRequired') })} />
              {errors.type && <p className="mt-1 text-xs font-medium text-red-600">{String(errors.type.message)}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">{t('inspection.priorityLabel')}</label>
              <Select value={selectedPriority} onValueChange={(v) => setValue('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_MAP).map(([k]) => <SelectItem key={k} value={k}>{t('priority.' + k)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">{t('inspection.subjectLabel')}</label>
            <Input {...register('subject', { required: true })} placeholder={t('inspection.subjectPlaceholder')} className={errors.subject ? 'border-red-400' : ''} />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">{t('inspection.descLabel')}</label>
            <Textarea {...register('description')} placeholder={t('inspection.descPlaceholder')} rows={3} />
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>{t('common:actions.cancel')}</Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              <Send size={14} /> {t('inspection.submitBtn')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Staff Ticket Detail Sheet ────────────────────────────────────────────────

function StaffTicketDetailSheet({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
  const { t: tl } = useTranslation('tickets');
  const qc = useQueryClient();
  const { toast } = useToast();
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket-detail', ticketId],
    queryFn: () => ticketsApi.getTicket(ticketId!),
    enabled: !!ticketId,
  });

  const { data: photosData } = useQuery({
    queryKey: ['ticket-photos', ticketId],
    queryFn: () => ticketsApi.listPhotos(ticketId!),
    enabled: !!ticketId,
  });
  const photos: any[] = photosData ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['staff-users'],
    queryFn: () => usersApi.listUsers({ limit: 200 }),
  });
  const staffUsers: any[] = (usersData?.data ?? usersData ?? []).filter((u: any) => u.role !== 'TENANT');

  const t: any = ticket?.data ?? ticket;
  const comments: any[] = t?.comments ?? [];
  const statusInfo = t ? STATUS_MAP[t.status] : null;
  const priorityInfo = t ? PRIORITY_MAP[t.priority] : null;
  const allowedTransitions = t ? (STAFF_TRANSITIONS[t.status] ?? []) : [];

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
    qc.invalidateQueries({ queryKey: ['tickets'] });
  };

  const assignMutation = useMutation({
    mutationFn: (userId: string) => ticketsApi.assignTicket(ticketId!, userId),
    onSuccess: () => { invalidateAll(); toast({ title: tl('assignSuccess') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? tl('errors.assign'), variant: 'destructive' }),
  });

  const transitionMutation = useMutation({
    mutationFn: (status: string) => ticketsApi.transitionStatus(ticketId!, status),
    onSuccess: () => { invalidateAll(); toast({ title: tl('updateSuccess') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? tl('errors.transition'), variant: 'destructive' }),
  });

  const commentMutation = useMutation({
    mutationFn: () => ticketsApi.addComment(ticketId!, comment.trim(), isInternal),
    onSuccess: () => {
      invalidateAll();
      setComment('');
      setIsInternal(false);
      toast({ title: tl('commentSuccess') });
    },
    onError: () => toast({ title: tl('errors.comment'), variant: 'destructive' }),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (file: File) => ticketsApi.uploadPhoto(ticketId!, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-photos', ticketId] });
      toast({ title: tl('photoSuccess') });
    },
    onError: () => toast({ title: tl('errors.photo'), variant: 'destructive' }),
  });

  return (
    <Sheet open={!!ticketId} onClose={onClose} title={t?.subject ?? 'Đang tải...'} subtitle={t?.ticketNumber}>
      {isLoading ? (
        <div className="px-6 pt-4 space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : t && (
        <div className="px-6 pb-8 space-y-4 pt-4">
          <div className="flex items-center gap-2">
            {statusInfo && <Badge className={`${statusInfo.color} border-0`}>{tl('status.' + t.status)}</Badge>}
            {priorityInfo && <Badge className={`${priorityInfo.color} border-0`}>{tl('priority.' + t.priority)}</Badge>}
            <Badge variant="outline" className="text-xs">{t.source === 'STAFF_INSPECTION' ? tl('source.STAFF_INSPECTION') : tl('source.TENANT_REQUEST')}</Badge>
          </div>

          <SheetSection label={tl('sheet.sectionDetail')}>
            <SheetRow label={tl('fields.tenant')} value={t.tenant?.brandName} icon={Building2} />
            <SheetRow label={tl('fields.unit')} value={t.unit?.code} icon={Building2} />
            <SheetRow label={tl('fields.type')} value={tl('types.' + t.type)} icon={Ticket} />
            <SheetRow label={tl('fields.creator')} value={t.createdBy?.fullName} icon={User} />
            <SheetRow label={tl('fields.createdAt')} value={fmtDate(t.createdAt)} icon={Calendar} />
            {t.resolvedAt && <SheetRow label="Ngày giải quyết" value={fmtDate(t.resolvedAt)} icon={CheckCircle2} />}
          </SheetSection>

          {t.description && (
            <div>
              <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2">MÔ TẢ</div>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">{t.description}</p>
            </div>
          )}

          {/* Assign */}
          <div>
            <Label className="text-xs">Phân công xử lý</Label>
            <select
              defaultValue={t.assignedToId ?? ''}
              onChange={(e) => e.target.value && assignMutation.mutate(e.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">— Chưa phân công —</option>
              {staffUsers.map((u: any) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </div>

          {/* Status transitions */}
          {allowedTransitions.length > 0 && (
            <div>
              <Label className="text-xs">Chuyển trạng thái</Label>
              <div className="flex gap-2 flex-wrap mt-1">
                {allowedTransitions.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="outline"
                    disabled={transitionMutation.isPending}
                    onClick={() => transitionMutation.mutate(s)}
                  >
                    → {tl('status.' + s)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Photos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold tracking-wider text-gray-400">HÌNH ẢNH ({photos.length})</div>
              <label className="text-xs text-blue-600 hover:underline cursor-pointer flex items-center gap-1">
                <ImagePlus size={13} /> Thêm ảnh
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadPhotoMutation.mutate(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p: any) => (
                  <div key={p.id} className="aspect-square rounded-lg overflow-hidden bg-gray-100 border">
                    <AuthenticatedImage src={`/files/documents/${p.id}`} alt={p.fileName} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments */}
          <div>
            <div className="text-xs font-semibold tracking-wider text-gray-400 mb-3">BÌNH LUẬN ({comments.length})</div>
            {comments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-lg">Chưa có bình luận</p>
            ) : (
              <div className="space-y-2 mb-3">
                {comments.map((c: any) => (
                  <div key={c.id} className={`rounded-lg p-3 ${c.isInternal ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                        {c.user?.fullName ?? 'Unknown'}
                        {c.isInternal && <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] px-1.5">Nội bộ</Badge>}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDate(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{c.content}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 mt-3">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Thêm bình luận..."
                rows={2}
                className="text-sm resize-none"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                  Ghi chú nội bộ (khách thuê không thấy)
                </label>
                <Button
                  size="sm"
                  onClick={() => comment.trim() && commentMutation.mutate()}
                  disabled={!comment.trim() || commentMutation.isPending}
                  className="gap-2"
                >
                  <Send size={14} /> Gửi
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ─── Maintenance Schedule Tab ─────────────────────────────────────────────────

const FREQUENCY_MAP: Record<string, string> = {
  DAILY: 'Hàng ngày', WEEKLY: 'Hàng tuần', MONTHLY: 'Hàng tháng',
  QUARTERLY: 'Hàng quý', ANNUALLY: 'Hàng năm',
};

function CreateMaintenanceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { selectedMallId, selectedMallName } = useMallStore();
  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm({
    defaultValues: { mallId: '', title: '', description: '', frequency: 'MONTHLY', nextDueDate: '', estimatedHours: '', assignedToId: '', reminderDays: '3', checklistText: '' },
  });

  useEffect(() => {
    if (open && selectedMallId) setValue('mallId', selectedMallId, { shouldValidate: true });
  }, [open, selectedMallId, setValue]);

  const { data: usersData } = useQuery({ queryKey: ['maintenance-assignees'], queryFn: () => usersApi.listUsers({ limit: 200 }), enabled: open });
  const staff: any[] = (usersData?.data ?? usersData ?? []).filter((user: any) => user.isActive && user.role !== 'TENANT');

  const mutation = useMutation({
    mutationFn: (data: any) => maintenanceApi.create({ ...data, title: data.title.trim(), description: data.description?.trim() || undefined, estimatedHours: data.estimatedHours ? +data.estimatedHours : undefined, reminderDays: +(data.reminderDays || 3), checklist: data.checklistText.split('\n').map((item: string) => item.trim()).filter(Boolean), checklistText: undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-schedules'] });
      toast({ title: 'Đã tạo lịch bảo trì định kỳ' });
      reset();
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Tạo lịch bảo trì định kỳ</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div>
            <Label>Mall *</Label>
            <div className="mt-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">{selectedMallName}</div>
            <input type="hidden" {...register('mallId', { required: 'Vui lòng chọn trung tâm thương mại' })} />
            {errors.mallId && <p className="mt-1 text-xs font-medium text-red-600">{String(errors.mallId.message)}</p>}
          </div>
          <div>
            <Label>Tiêu đề *</Label>
            <Input {...register('title', { required: 'Vui lòng nhập tên kế hoạch', validate: (value) => value.trim().length >= 3 || 'Tên kế hoạch cần ít nhất 3 ký tự' })} placeholder="VD: Bảo trì thang máy khu A" className={errors.title ? 'border-red-400' : ''} />
            {errors.title && <p className="mt-1 text-xs font-medium text-red-600">{String(errors.title.message)}</p>}
          </div>
          <div>
            <Label>Mô tả</Label>
            <Textarea {...register('description')} rows={2} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Tần suất</Label>
              <Select defaultValue="MONTHLY" onValueChange={(v) => setValue('frequency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ngày đến hạn đầu *</Label>
              <Input type="date" min={new Date().toISOString().slice(0, 10)} {...register('nextDueDate', { required: 'Vui lòng chọn ngày đến hạn' })} className={errors.nextDueDate ? 'border-red-400' : ''} />
              {errors.nextDueDate && <p className="mt-1 text-xs font-medium text-red-600">{String(errors.nextDueDate.message)}</p>}
            </div>
            <div>
              <Label>Số giờ ước tính</Label>
              <Input type="number" {...register('estimatedHours')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Người chịu trách nhiệm *</Label>
              <Select onValueChange={(v) => setValue('assignedToId', v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder="Chọn nhân viên..." /></SelectTrigger>
                <SelectContent>{staff.map((user: any) => <SelectItem key={user.id} value={user.id}>{user.fullName} · <span>{t(roleTranslationKey(user.role))}</span></SelectItem>)}</SelectContent>
              </Select>
              <input type="hidden" {...register('assignedToId', { required: 'Vui lòng chọn người chịu trách nhiệm' })} />
              {errors.assignedToId && <p className="mt-1 text-xs font-medium text-red-600">{String(errors.assignedToId.message)}</p>}
            </div>
            <div><Label>Nhắc trước (ngày)</Label><Input type="number" min="0" max="30" {...register('reminderDays')} /></div>
          </div>
          <div><Label>Checklist thực hiện</Label><Textarea {...register('checklistText')} rows={4} placeholder={'Mỗi dòng là một hạng mục\nKiểm tra nguồn điện\nVệ sinh thiết bị\nChạy thử an toàn'} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending} className="min-w-32 bg-blue-700 font-semibold text-white shadow-sm hover:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-600">{mutation.isPending ? 'Đang tạo...' : 'Tạo kế hoạch'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompleteMaintenanceDialog({ schedule, onClose }: { schedule: any | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const checklist: string[] = Array.isArray(schedule?.checklist) ? schedule.checklist : [];
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const missingChecklist = checklist.filter((item) => !checked[item]).length;
  const cannotCompleteReason = files.length === 0
    ? 'Cần tải lên ít nhất 1 ảnh hoặc tài liệu bằng chứng.'
    : missingChecklist > 0
      ? `Cần xác nhận thêm ${missingChecklist} mục checklist.`
      : '';
  useEffect(() => { setNotes(''); setFiles([]); setChecked({}); }, [schedule?.id]);
  const mutation = useMutation({
    mutationFn: () => maintenanceApi.complete(schedule.id, { notes, evidence: files, checklistResult: Object.fromEntries(checklist.map((item) => [item, !!checked[item]])) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance-schedules'] }); toast({ title: 'Đã hoàn tất và lưu bằng chứng thực hiện' }); onClose(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể hoàn tất bảo trì', variant: 'destructive' }),
  });
  return <Dialog open={!!schedule} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Hoàn tất · {schedule?.title}</DialogTitle></DialogHeader><div className="space-y-4">
    {checklist.length > 0 && <div><Label>Checklist công việc</Label><div className="mt-2 space-y-2 rounded-xl border p-3">{checklist.map((item) => <label key={item} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={!!checked[item]} onChange={(e) => setChecked((current) => ({ ...current, [item]: e.target.checked }))} />{item}</label>)}</div></div>}
    <div><Label>Ghi chú kết quả</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tình trạng thiết bị, số đo, vấn đề phát hiện..." /></div>
    <div><Label>Ảnh / tài liệu bằng chứng *</Label><label className="mt-2 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 p-5 text-center text-sm text-blue-700"><UploadCloud size={24} className="mb-2" /><span>{files.length ? `${files.length} tệp đã chọn` : 'Chọn ảnh hoặc tài liệu hiện trường'}</span><input type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label></div>
    {cannotCompleteReason && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"><AlertTriangle size={15} className="mr-2 inline" />{cannotCompleteReason}</div>}
  </div><DialogFooter><Button variant="outline" onClick={onClose}>Hủy</Button><Button disabled={!!cannotCompleteReason || mutation.isPending} onClick={() => mutation.mutate()} title={cannotCompleteReason || 'Hoàn thành kỳ bảo trì'} className="min-w-48 gap-2 bg-emerald-700 font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-600"><CheckCircle2 size={15} /> {mutation.isPending ? 'Đang lưu...' : 'Hoàn thành & lưu bằng chứng'}</Button></DialogFooter></DialogContent></Dialog>;
}

function MaintenanceTab() {
  const { t } = useTranslation('tickets');
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [completing, setCompleting] = useState<any | null>(null);
  const { selectedMallId, openMallContextModal } = useMallStore();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['maintenance-schedules', selectedMallId],
    queryFn: () => maintenanceApi.list(selectedMallId ?? undefined),
  });
  const schedules: any[] = data?.data ?? [];
  const now = Date.now();
  const overdueCount = schedules.filter((s) => s.isActive && new Date(s.nextDueDate).getTime() < now).length;
  const dueSoonCount = schedules.filter((s) => { const due = new Date(s.nextDueDate).getTime(); return s.isActive && due >= now && due <= now + 7 * 86400000; }).length;
  const inProgressCount = schedules.filter((s) => s.executions?.some((e: any) => e.status === 'IN_PROGRESS')).length;
  const completedCount = schedules.reduce((sum, s) => sum + (s.executions?.filter((e: any) => e.status === 'COMPLETED').length ?? 0), 0);

  const executeMutation = useMutation({
    mutationFn: (id: string) => maintenanceApi.start(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-schedules'] });
      toast({ title: 'Đã bắt đầu công việc bảo trì' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể bắt đầu kế hoạch', variant: 'destructive' }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => maintenanceApi.update(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-schedules'] }),
  });
  const reminderMutation = useMutation({
    mutationFn: maintenanceApi.sendReminders,
    onSuccess: (result: any) => toast({ title: `Đã gửi ${result?.sent ?? 0} nhắc việc bảo trì` }),
  });

  return (
    <div>
      <div className="mb-3 flex flex-col justify-between gap-3 border-y bg-card px-4 py-3 lg:flex-row lg:items-center"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('maintenance.title')}</p><h3 className="text-lg font-semibold">{overdueCount ? `${overdueCount} kế hoạch đang quá hạn` : 'Mọi kế hoạch đang trong hạn'}</h3><p className="text-sm text-muted-foreground">Lập lịch · giao việc · nhắc hạn · checklist · evidence hiện trường.</p></div><div className="flex gap-2"><Button variant="outline" className="gap-2" onClick={() => reminderMutation.mutate()}><BellRing size={14} /> Gửi nhắc việc</Button><Button onClick={() => selectedMallId ? setShowCreate(true) : openMallContextModal()} className="gap-2"><Plus size={15} /> Lập kế hoạch</Button></div></div>
      <div className="mb-4 grid grid-cols-2 border-y bg-card xl:grid-cols-4">{[
        ['Quá hạn', overdueCount, AlertTriangle],
        ['Đến hạn trong 7 ngày', dueSoonCount, Clock3],
        ['Đang thực hiện', inProgressCount, Play],
        ['Lần hoàn tất gần đây', completedCount, CheckCircle2],
      ].map(([label, value, Icon]: any) => <div key={label} className="border-b px-4 py-2.5 even:border-l xl:border-b-0 xl:border-l xl:first:border-l-0"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon size={14} />{label}</div><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>)}</div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}</div>
      ) : isError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <Ticket size={36} className="mx-auto mb-3 text-red-400" />
          <p className="font-medium text-red-700">Không thể tải lịch bảo trì</p>
          <p className="mt-1 text-sm text-red-600">Kiểm tra kết nối và thử tải lại dữ liệu.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>Thử lại</Button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tiêu đề</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Mall</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tần suất</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Đến hạn kế tiếp</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Người phụ trách</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Kỳ hiện tại</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schedules.map((s) => {
                const overdue = new Date(s.nextDueDate) < new Date();
                const currentExecution = s.executions?.find((execution: any) => ['PLANNED', 'IN_PROGRESS'].includes(execution.status));
                const lastCompleted = s.executions?.find((execution: any) => execution.status === 'COMPLETED');
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{s.title}</td>
                    <td className="px-4 py-3 text-gray-500">{s.mall?.name}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{FREQUENCY_MAP[s.frequency] ?? s.frequency}</Badge></td>
                    <td className="px-4 py-3">
                      <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
                        {new Date(s.nextDueDate).toLocaleDateString('vi-VN')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">{s.assignedTo?.fullName ?? 'Chưa phân công'}</div><div className="text-xs text-gray-400">Nhắc trước {s.reminderDays ?? 3} ngày</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`border-0 text-xs ${currentExecution?.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' : overdue ? 'bg-red-100 text-red-700' : s.isActive ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{!s.isActive ? 'Tạm dừng' : currentExecution?.status === 'IN_PROGRESS' ? 'Đang thực hiện' : overdue ? 'Quá hạn' : 'Đã lên kế hoạch'}</Badge>
                      {lastCompleted && <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400"><History size={11} /> {new Date(lastCompleted.completedAt).toLocaleDateString('vi-VN')} · {lastCompleted.evidenceUrls?.length ?? 0} evidence</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        {currentExecution?.status === 'IN_PROGRESS' ? <Button size="sm" className="h-8 gap-1 bg-emerald-700 px-3 font-semibold text-white shadow-sm hover:bg-emerald-800" onClick={() => setCompleting(s)}><CheckCircle2 size={13} /> Hoàn tất</Button> : <Button size="sm" variant="outline" className="h-8 gap-1 border-blue-300 px-3 font-semibold text-blue-800 hover:bg-blue-50" onClick={() => executeMutation.mutate(s.id)} disabled={executeMutation.isPending || !s.isActive}><Play size={13} /> Bắt đầu</Button>}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400"
                          title={s.isActive ? 'Tạm dừng' : 'Kích hoạt lại'}
                          onClick={() => toggleActiveMutation.mutate({ id: s.id, isActive: !s.isActive })}>
                          <Power size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {schedules.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Wrench size={40} className="mx-auto mb-2 opacity-30" />
              <p>Chưa có lịch bảo trì định kỳ nào</p>
            </div>
          )}
        </div>
      )}
      <CreateMaintenanceDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <CompleteMaintenanceDialog schedule={completing} onClose={() => setCompleting(null)} />
    </div>
  );
}

export default function TicketsPage() {
  const { t: tl } = useTranslation('tickets');
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const isStaff = user?.role !== 'TENANT';
  const { selectedMallId } = useMallStore();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [priority, setPriority] = useState('');
  const [queue, setQueue] = useState(searchParams.get('queue') ?? 'open');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(searchParams.get('id'));
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tickets', { search, status, priority, queue, page, selectedMallId }],
    queryFn: () => ticketsApi.listTickets({
      search: search || undefined,
      status: status || undefined,
      priority: priority || undefined,
      queue: queue || undefined,
      mallId: selectedMallId ?? undefined,
      page,
      limit: 25,
    }),
  });
  const { data: statsData } = useQuery({
    queryKey: ['ticket-stats', selectedMallId],
    queryFn: () => ticketsApi.getStats(selectedMallId ?? undefined),
  });

  const tickets: TicketType[] = data?.data ?? [];
  const stats = statsData?.data ?? statsData ?? {};
  const byStatus = Object.fromEntries((stats.byStatus ?? []).map((row: any) => [row.status, row._count]));
  const openCount = (stats.total ?? 0) - (byStatus.CLOSED ?? 0) - (byStatus.RESOLVED ?? 0);
  const urgentCount = (stats.byPriority ?? []).find((row: any) => row.priority === 'URGENT')?._count ?? 0;
  const unassignedCount = stats.unassigned ?? 0;
  const overdueCount = stats.overdue ?? 0;
  const totalPages = data?.totalPages ?? 1;

  useEffect(() => setPage(1), [search, status, priority, queue, selectedMallId]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader eyebrow={tl('page.eyebrow')} title={tl('page.title')} description={tl('page.subtitle')} actions={<Button onClick={() => setShowCreate(true)} className="gap-2"><ClipboardList size={15} /> {tl('page.createInspection')}</Button>} />

      <section className="flex flex-col justify-between gap-3 border-y bg-card px-4 py-3 lg:flex-row lg:items-center">
        <div><h2 className="text-lg font-semibold">{overdueCount ? tl('page.queueOverdue', { count: overdueCount }) : tl('page.queueHealthy')}</h2><p className="text-sm text-muted-foreground">{tl('page.queueHint')}</p></div>
        <Button variant="outline" className="gap-2" onClick={() => setShowCreate(true)}><Plus size={15} /> {tl('page.createInspection')}</Button>
      </section>

      <div className="grid grid-cols-2 border-y bg-card xl:grid-cols-5">
        {[
          { label: tl('page.open'), value: openCount, icon: Inbox, action: () => { setQueue('open'); setStatus(''); setPriority(''); } },
          { label: tl('page.new'), value: byStatus.NEW ?? 0, icon: Ticket, action: () => { setQueue(''); setStatus('NEW'); } },
          { label: tl('page.unassigned'), value: unassignedCount, icon: UserRoundCheck, action: () => { setQueue('unassigned'); setStatus(''); setPriority(''); } },
          { label: tl('page.overdue'), value: overdueCount, icon: Clock3, action: () => { setQueue('overdue'); setStatus(''); setPriority(''); } },
          { label: tl('page.urgent'), value: urgentCount, icon: AlertTriangle, action: () => { setQueue(''); setPriority('URGENT'); setStatus(''); } },
        ].map(({ label, value, icon: Icon, action }) => <button key={label} onClick={() => { action(); setPage(1); }} className="flex items-center justify-between border-b px-4 py-2.5 text-left hover:bg-muted/40 even:border-l xl:border-b-0 xl:border-l xl:first:border-l-0"><span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon size={14} />{label}</span><span className="text-lg font-semibold tabular-nums">{value}</span></button>)}
      </div>

      <Tabs defaultValue={searchParams.get('tab') === 'maintenance' ? 'maintenance' : 'tickets'}>
        {isStaff && (
          <TabsList className="mb-4">
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="maintenance" className="gap-1.5"><Wrench size={13} /> {tl('tabs.maintenance')}</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="tickets">

      {/* Status quick filter */}
      <ERPToolbar className="mb-4">
        {Object.entries(STATUS_MAP).map(([key, val]) => (
          <button
            key={key}
            onClick={() => setStatus(status === key ? '' : key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium
              ${status === key ? 'border-blue-500 bg-gray-100 text-gray-700' : `${val.color} border-transparent`}`}
          >
            {tl('status.' + key)}
          </button>
        ))}

      <div className="flex min-w-64 flex-1 gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Tìm ticket..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Ưu tiên" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            {Object.entries(PRIORITY_MAP).map(([k]) => (
              <SelectItem key={k} value={k}>{tl('priority.' + k)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      </ERPToolbar>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <Ticket size={36} className="mx-auto mb-3 text-red-400" />
          <p className="font-medium text-red-700">Không thể tải danh sách ticket</p>
          <p className="mt-1 text-sm text-red-600">Kiểm tra kết nối và thử tải lại dữ liệu.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>Thử lại</Button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ticket #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Chủ đề</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Khách thuê</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Loại</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ưu tiên</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phụ trách</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ngày tạo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tickets.map((t) => {
                const st = STATUS_MAP[t.status];
                const pr = PRIORITY_MAP[t.priority];
                return (
                  <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedTicketId(t.id)}>
                    <td className="px-4 py-3 font-mono text-xs">{t.ticketNumber}</td>
                    <td className="px-4 py-3 font-medium max-w-48 truncate">{t.subject}</td>
                    <td className="px-4 py-3 text-gray-500">{t.tenant?.brandName}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{tl('types.' + t.type, { defaultValue: tl('common:unknownValue') })}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${pr?.color} border-0 text-xs`}>{tl('priority.' + t.priority)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${st?.color} border-0 text-xs`}>{tl('status.' + t.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{t.assignedTo?.fullName ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(t.createdAt).toLocaleDateString('vi-VN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tickets.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Ticket size={40} className="mx-auto mb-2 opacity-30" />
              <p className="font-medium text-gray-600">
                {search || status || priority ? tl('page.noMatch') : tl('page.empty')}
              </p>
              <p className="mt-1 text-sm">
                {search || status || priority ? tl('page.adjustFilters') : tl('page.emptyHint')}
              </p>
              {search || status || priority ? (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { setSearch(''); setStatus(''); setPriority(''); }}>{tl('page.clearFilters')}</Button>
              ) : (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowCreate(true)}>{tl('page.createInspection')}</Button>
              )}
            </div>
          )}
          {totalPages > 1 && <div className="flex min-w-[760px] items-center justify-between border-t px-4 py-3 text-xs text-gray-500"><span>Trang {page} / {totalPages} · {data?.total ?? 0} phiếu</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Sau</Button></div></div>}
        </div>
      )}
        </TabsContent>
        {isStaff && (
          <TabsContent value="maintenance">
            <MaintenanceTab />
          </TabsContent>
        )}
      </Tabs>

      <CreateInspectionTicketDialog open={showCreate} onClose={() => setShowCreate(false)} />
      <StaffTicketDetailSheet ticketId={selectedTicketId} onClose={() => setSelectedTicketId(null)} />
    </div>
  );
}
