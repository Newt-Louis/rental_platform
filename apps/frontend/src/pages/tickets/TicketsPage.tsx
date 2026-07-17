import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ticketsApi, tenantsApi, spacesApi, usersApi, maintenanceApi } from '@/api';
import { useAuthStore } from '@/store/auth.store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import { Search, Ticket, Plus, Send, Building2, Calendar, CheckCircle2, User, ImagePlus, ClipboardList, Wrench, Power } from 'lucide-react';
import type { Ticket as TicketType } from '@/types';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  NEW: { label: 'Mới', color: 'bg-gray-100 text-gray-700' },
  ASSIGNED: { label: 'Đã giao', color: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { label: 'Đang xử lý', color: 'bg-yellow-100 text-yellow-700' },
  WAITING_TENANT: { label: 'Chờ KH', color: 'bg-purple-100 text-purple-700' },
  RESOLVED: { label: 'Đã giải quyết', color: 'bg-green-100 text-green-700' },
  CLOSED: { label: 'Đóng', color: 'bg-gray-200 text-gray-600' },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Thấp', color: 'bg-gray-100 text-gray-600' },
  MEDIUM: { label: 'Trung bình', color: 'bg-gray-100 text-gray-700' },
  HIGH: { label: 'Cao', color: 'bg-orange-100 text-orange-700' },
  URGENT: { label: 'Khẩn cấp', color: 'bg-red-100 text-red-700' },
};

const TICKET_TYPES = [
  { value: 'ELECTRICAL', label: 'Điện' },
  { value: 'WATER', label: 'Nước' },
  { value: 'HVAC', label: 'Điều hòa / thông gió' },
  { value: 'CLEANING', label: 'Vệ sinh' },
  { value: 'SECURITY', label: 'An ninh' },
  { value: 'PARKING', label: 'Bãi đỗ xe' },
  { value: 'INTERNET', label: 'Internet / mạng' },
  { value: 'DELIVERY', label: 'Giao hàng / logistics' },
  { value: 'MARKETING_EVENT', label: 'Marketing / sự kiện' },
  { value: 'OTHER', label: 'Khác' },
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
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: { tenantId: '', unitId: '', type: '', priority: 'MEDIUM', subject: '', description: '' },
  });
  const selectedTenantId = watch('tenantId');

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
      toast({ title: 'Đã tạo phiếu kiểm tra' });
      reset();
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi tạo phiếu', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo phiếu kiểm tra hiện trường</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Khách thuê *</label>
            <Select onValueChange={(v) => { setValue('tenantId', v); setValue('unitId', ''); }}>
              <SelectTrigger className={errors.tenantId ? 'border-red-400' : ''}>
                <SelectValue placeholder="Chọn khách thuê..." />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.brandName} — {t.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register('tenantId', { required: true })} />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Mặt bằng *</label>
            <Select onValueChange={(v) => setValue('unitId', v)} disabled={!selectedTenantId}>
              <SelectTrigger className={errors.unitId ? 'border-red-400' : ''}>
                <SelectValue placeholder={selectedTenantId ? 'Chọn mặt bằng...' : 'Chọn khách thuê trước'} />
              </SelectTrigger>
              <SelectContent>
                {units.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.code} — {u.floor?.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register('unitId', { required: true })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Loại *</label>
              <Select onValueChange={(v) => setValue('type', v)}>
                <SelectTrigger className={errors.type ? 'border-red-400' : ''}>
                  <SelectValue placeholder="Loại..." />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <input type="hidden" {...register('type', { required: true })} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Mức độ ưu tiên</label>
              <Select defaultValue="MEDIUM" onValueChange={(v) => setValue('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Tiêu đề *</label>
            <Input {...register('subject', { required: true })} placeholder="Mô tả ngắn gọn phát hiện..." className={errors.subject ? 'border-red-400' : ''} />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Chi tiết kiểm tra</label>
            <Textarea {...register('description')} placeholder="Mô tả chi tiết những gì phát hiện được khi kiểm tra hiện trường..." rows={3} />
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              <Send size={14} /> Tạo phiếu &amp; gửi cho khách thuê
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Staff Ticket Detail Sheet ────────────────────────────────────────────────

function StaffTicketDetailSheet({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
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
    onSuccess: () => { invalidateAll(); toast({ title: 'Đã phân công xử lý' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi phân công', variant: 'destructive' }),
  });

  const transitionMutation = useMutation({
    mutationFn: (status: string) => ticketsApi.transitionStatus(ticketId!, status),
    onSuccess: () => { invalidateAll(); toast({ title: 'Đã chuyển trạng thái' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi chuyển trạng thái', variant: 'destructive' }),
  });

  const commentMutation = useMutation({
    mutationFn: () => ticketsApi.addComment(ticketId!, comment.trim(), isInternal),
    onSuccess: () => {
      invalidateAll();
      setComment('');
      setIsInternal(false);
      toast({ title: 'Đã thêm bình luận' });
    },
    onError: () => toast({ title: 'Lỗi thêm bình luận', variant: 'destructive' }),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (file: File) => ticketsApi.uploadPhoto(ticketId!, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-photos', ticketId] });
      toast({ title: 'Đã tải ảnh lên' });
    },
    onError: () => toast({ title: 'Lỗi tải ảnh lên', variant: 'destructive' }),
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
            {statusInfo && <Badge className={`${statusInfo.color} border-0`}>{statusInfo.label}</Badge>}
            {priorityInfo && <Badge className={`${priorityInfo.color} border-0`}>{priorityInfo.label}</Badge>}
            <Badge variant="outline" className="text-xs">{t.source === 'STAFF_INSPECTION' ? 'Phiếu kiểm tra' : 'Yêu cầu từ KH'}</Badge>
          </div>

          <SheetSection label="CHI TIẾT">
            <SheetRow label="Khách thuê" value={t.tenant?.brandName} icon={Building2} />
            <SheetRow label="Mặt bằng" value={t.unit?.code} icon={Building2} />
            <SheetRow label="Loại" value={TICKET_TYPES.find((x) => x.value === t.type)?.label ?? t.type} icon={Ticket} />
            <SheetRow label="Người tạo" value={t.createdBy?.fullName} icon={User} />
            <SheetRow label="Ngày tạo" value={fmtDate(t.createdAt)} icon={Calendar} />
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
                    → {STATUS_MAP[s]?.label ?? s}
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
                  <a key={p.id} href={`/uploads/${p.filePath}`} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-gray-100 border">
                    <img src={`/uploads/${p.filePath}`} alt={p.fileName} className="w-full h-full object-cover" />
                  </a>
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
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm({
    defaultValues: { mallId: '', title: '', description: '', frequency: 'MONTHLY', nextDueDate: '', estimatedHours: '' },
  });

  const { data: mallsData } = useQuery({
    queryKey: ['malls-lite'],
    queryFn: () => spacesApi.listMalls(),
    enabled: open,
  });
  const malls: any[] = mallsData?.data ?? mallsData ?? [];

  const mutation = useMutation({
    mutationFn: (data: any) => maintenanceApi.create({ ...data, estimatedHours: data.estimatedHours ? +data.estimatedHours : undefined }),
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
            <Select onValueChange={(v) => setValue('mallId', v)}>
              <SelectTrigger className={errors.mallId ? 'border-red-400' : ''}><SelectValue placeholder="Chọn mall..." /></SelectTrigger>
              <SelectContent>
                {malls.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <input type="hidden" {...register('mallId', { required: true })} />
          </div>
          <div>
            <Label>Tiêu đề *</Label>
            <Input {...register('title', { required: true })} placeholder="VD: Bảo trì thang máy khu A" className={errors.title ? 'border-red-400' : ''} />
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
              <Input type="date" {...register('nextDueDate', { required: true })} />
            </div>
            <div>
              <Label>Số giờ ước tính</Label>
              <Input type="number" {...register('estimatedHours')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending}>Tạo lịch</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['maintenance-schedules'],
    queryFn: () => maintenanceApi.list(),
  });
  const schedules: any[] = data?.data ?? [];

  const executeMutation = useMutation({
    mutationFn: (id: string) => maintenanceApi.execute(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-schedules'] });
      toast({ title: 'Đã ghi nhận thực hiện — hạn tiếp theo đã cập nhật' });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => maintenanceApi.update(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-schedules'] }),
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Wrench size={15} /> Tạo lịch bảo trì
        </Button>
      </div>
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Lần cuối thực hiện</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schedules.map((s) => {
                const overdue = new Date(s.nextDueDate) < new Date();
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
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {s.lastExecutedAt ? new Date(s.lastExecutedAt).toLocaleDateString('vi-VN') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} border-0 text-xs`}>
                        {s.isActive ? 'Đang hoạt động' : 'Tạm dừng'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => executeMutation.mutate(s.id)} disabled={executeMutation.isPending}>
                          <CheckCircle2 size={12} /> Đã thực hiện
                        </Button>
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
    </div>
  );
}

export default function TicketsPage() {
  const { user } = useAuthStore();
  const isStaff = user?.role !== 'TENANT';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tickets', { search, status, priority }],
    queryFn: () => ticketsApi.listTickets({
      search: search || undefined,
      status: status || undefined,
      priority: priority || undefined,
    }),
  });

  const tickets: TicketType[] = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operation Tickets</h1>
          <p className="text-sm text-gray-500 mt-1">Yêu cầu vận hành, hỗ trợ và phiếu kiểm tra hiện trường</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <ClipboardList size={15} /> Tạo phiếu kiểm tra
        </Button>
      </div>

      <Tabs defaultValue="tickets">
        {isStaff && (
          <TabsList className="mb-4">
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="maintenance" className="gap-1.5"><Wrench size={13} /> Bảo trì định kỳ</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="tickets">

      {/* Status quick filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {Object.entries(STATUS_MAP).map(([key, val]) => (
          <button
            key={key}
            onClick={() => setStatus(status === key ? '' : key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium
              ${status === key ? 'border-blue-500 bg-gray-100 text-gray-700' : `${val.color} border-transparent`}`}
          >
            {val.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
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
            {Object.entries(PRIORITY_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
        <div className="bg-white rounded-lg border overflow-hidden">
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
                      <Badge variant="outline" className="text-xs">{t.type}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${pr?.color} border-0 text-xs`}>{pr?.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${st?.color} border-0 text-xs`}>{st?.label}</Badge>
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
                {search || status || priority ? 'Không có ticket phù hợp bộ lọc' : 'Chưa có ticket nào'}
              </p>
              <p className="mt-1 text-sm">
                {search || status || priority ? 'Hãy thay đổi từ khóa hoặc bộ lọc.' : 'Tạo phiếu đầu tiên để bắt đầu theo dõi xử lý.'}
              </p>
              {search || status || priority ? (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { setSearch(''); setStatus(''); setPriority(''); }}>Xóa bộ lọc</Button>
              ) : (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowCreate(true)}>Tạo phiếu kiểm tra</Button>
              )}
            </div>
          )}
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
