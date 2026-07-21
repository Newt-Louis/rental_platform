import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { crmApi, customersApi, usersApi, categoriesApi, followUpApi } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/spaces/dialogs/ConfirmDialog';
import { PageHeader } from '@/components/ui/page-header';
import { useAuthStore } from '@/store/auth.store';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Search, Users, Mail, Phone, Calendar, Building2, Tag, TrendingUp,
  ChevronRight, Star, Activity, FileText, UserCheck, Ban, Clock, PhoneCall,
  MailIcon, MapPin, Globe, Hash, Briefcase, MessageSquare, CheckCircle,
  ArrowRight, Link2, AlertCircle, LayoutList, Kanban, Bell, Target,
  Flame, AlertTriangle, DollarSign, Filter, X, GripVertical,
  Trash2, UserPlus, BarChart3, CheckSquare, Square, RefreshCw, Zap,
  BookmarkCheck, GitBranch, Pencil,
} from 'lucide-react';
import { LeadEditDialog } from '@/components/crm';
import { useMallStore } from '@/store/mall.store';
import { DealTimelineSheet } from '@/components/DealTimeline';
import type { Lead, Customer, CustomerActivity, ActivityType, LeadStatus, LeadPriority } from '@/types';

// ─── Màu sắc & nhãn thống nhất ────────────────────────────────────────────────

const LEAD_STAGES = [
  { key: 'NEW',          label: 'Mới tiếp cận', short: 'Mới',      color: 'bg-slate-100 text-slate-700',  bar: 'bg-slate-400' },
  { key: 'CONTACTED',   label: 'Đã liên hệ',  short: 'Liên hệ',   color: 'bg-blue-100 text-gray-700',    bar: 'bg-blue-400' },
  { key: 'QUALIFIED',   label: 'Tiềm năng',   short: 'Tiềm năng', color: 'bg-purple-100 text-purple-700',bar: 'bg-purple-400' },
  { key: 'PROPOSAL',    label: 'Đề xuất',     short: 'Đề xuất',   color: 'bg-yellow-100 text-yellow-700',bar: 'bg-yellow-400' },
  { key: 'NEGOTIATION', label: 'Đàm phán',    short: 'Đàm phán',  color: 'bg-orange-100 text-orange-700',bar: 'bg-orange-400' },
  { key: 'WON',         label: 'Ký hợp đồng', short: 'WON',       color: 'bg-green-100 text-green-700',  bar: 'bg-green-500' },
  { key: 'LOST',        label: 'Thất bại',    short: 'LOST',      color: 'bg-red-100 text-red-700',      bar: 'bg-red-400' },
];

const ACTIVE_STAGES = LEAD_STAGES.filter((s) => !['WON', 'LOST'].includes(s.key));

const LEAD_PRIORITIES = {
  HOT:  { label: 'Hot',  color: 'bg-red-500 text-white',    border: 'border-l-red-500' },
  WARM: { label: 'Warm', color: 'bg-orange-400 text-white', border: 'border-l-orange-400' },
  COLD: { label: 'Cold', color: 'bg-gray-400 text-white',   border: 'border-l-gray-400' },
};

const NEXT_STAGE: Record<string, string> = {
  NEW: 'CONTACTED', CONTACTED: 'QUALIFIED', QUALIFIED: 'PROPOSAL',
  PROPOSAL: 'NEGOTIATION', NEGOTIATION: 'WON',
};

const CUSTOMER_STATUSES = [
  { key: 'PROSPECT',    label: 'Tiềm năng',  color: 'bg-blue-100 text-gray-700',    icon: Star },
  { key: 'NEGOTIATING', label: 'Đàm phán',   color: 'bg-orange-100 text-orange-700', icon: Activity },
  { key: 'ACTIVE',      label: 'Đang thuê',  color: 'bg-green-100 text-green-700',   icon: CheckCircle },
  { key: 'INACTIVE',    label: 'Không HĐ',   color: 'bg-gray-100 text-gray-600',     icon: Clock },
  { key: 'BLACKLISTED', label: 'Blacklist',  color: 'bg-red-100 text-red-700',       icon: Ban },
];

const ACTIVITY_TYPES: { key: ActivityType; label: string; icon: React.ElementType }[] = [
  { key: 'CALL',          label: 'Gọi điện',     icon: PhoneCall },
  { key: 'EMAIL',         label: 'Email',         icon: MailIcon },
  { key: 'MEETING',       label: 'Họp mặt',      icon: Users },
  { key: 'SITE_VISIT',    label: 'Tham quan MB',  icon: MapPin },
  { key: 'PROPOSAL_SENT', label: 'Gửi đề xuất',  icon: FileText },
  { key: 'NOTE',          label: 'Ghi chú',       icon: MessageSquare },
  { key: 'OTHER',         label: 'Khác',          icon: Activity },
];

// Lead stage → Customer status label (for showing sync effect in UI)
const LEAD_TO_CUSTOMER_LABEL: Record<string, string> = {
  NEW: 'Tiềm năng', CONTACTED: 'Tiềm năng', QUALIFIED: 'Tiềm năng',
  PROPOSAL: 'Đàm phán', NEGOTIATION: 'Đàm phán',
  WON: 'Đang thuê', LOST: 'Không hợp tác',
};
// Customer status → Lead stage label (for showing sync effect in UI)
const CUSTOMER_TO_LEAD_LABEL: Record<string, string> = {
  PROSPECT: 'Tiềm năng', NEGOTIATING: 'Đàm phán',
  ACTIVE: 'Ký hợp đồng', INACTIVE: 'Thất bại',
};

const SOURCE_LABELS: Record<string, string> = {
  BROKER: 'Môi giới', WEBSITE: 'Website', REFERRAL: 'Giới thiệu',
  WALK_IN: 'Trực tiếp', EXISTING_TENANT: 'KH hiện tại',
};

const formatCompactValue = (value: number): string => {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + 'B';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1_000) return (value / 1_000).toFixed(0) + 'K';
  return value.toString();
};

const getDaysAgo = (date: string | undefined): number => {
  if (!date) return 999;
  const diff = Date.now() - new Date(date).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const getDaysInStage = (createdAt: string): number => {
  const diff = Date.now() - new Date(createdAt).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const LEAD_SOURCES = [
  { key: 'BROKER', label: 'Môi giới' },
  { key: 'WEBSITE', label: 'Website' },
  { key: 'REFERRAL', label: 'Giới thiệu' },
  { key: 'WALK_IN', label: 'Trực tiếp' },
  { key: 'EXISTING_TENANT', label: 'KH hiện tại' },
];

const LEAD_CATEGORIES = [
  'F&B - Ẩm thực',
  'Café & Trà',
  'Thời trang',
  'Giày dép & Túi xách',
  'Phụ kiện & Trang sức',
  'Làm đẹp & Spa',
  'Điện tử & Công nghệ',
  'Giải trí & Vui chơi',
  'Thể thao & Fitness',
  'Siêu thị & FMCG',
  'Cửa hàng tiện lợi',
  'Trang trí nội thất',
  'Giáo dục & Trẻ em',
  'Sức khỏe & Dược phẩm',
  'Dịch vụ tài chính',
  'Du lịch & Dịch vụ',
  'Sách & Văn phòng phẩm',
  'Thú cưng',
  'Khác',
];

const PROPOSAL_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT:        { label: 'Draft',      color: 'bg-gray-100 text-gray-600' },
  SUBMITTED:    { label: 'Chờ duyệt', color: 'bg-yellow-100 text-yellow-700' },
  UNDER_REVIEW: { label: 'Đang xem',  color: 'bg-blue-100 text-gray-700' },
  APPROVED:     { label: 'Đã duyệt',  color: 'bg-green-100 text-green-700' },
  REJECTED:     { label: 'Từ chối',   color: 'bg-red-100 text-red-700' },
  CONVERTED:    { label: 'Đã ký HĐ', color: 'bg-purple-100 text-purple-700' },
};

const BOOKING_STATUS_CFG: Record<string, { label: string; color: string }> = {
  PENDING:   { label: 'Chờ duyệt', color: 'bg-yellow-100 text-yellow-700' },
  ACTIVE:    { label: 'Đang giữ',  color: 'bg-blue-100 text-blue-700' },
  CONVERTED: { label: 'Đã chuyển', color: 'bg-purple-100 text-purple-700' },
  EXPIRED:   { label: 'Hết hạn',   color: 'bg-gray-100 text-gray-500' },
  CANCELLED: { label: 'Đã hủy',    color: 'bg-red-100 text-red-500' },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function RatingStars({ value }: { value?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={11} className={i <= (value ?? 0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'} />
      ))}
    </div>
  );
}

// ─── Unified Add Dialog ────────────────────────────────────────────────────────

export function UnifiedAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('crm');
  const qc = useQueryClient();
  const { toast } = useToast();
  const { selectedMallId } = useMallStore();
  const { user } = useAuthStore();
  const isSelfOnlyAssignee = user?.role === 'LEASING_EXECUTIVE';
  const [mode, setMode] = useState<'lead' | 'customer'>('lead');
  const [form, setForm] = useState({
    brandName: '', companyName: '', contactName: '', contactTitle: '',
    phone: '', email: '', category: '', expectedArea: '',
    source: 'WALK_IN', notes: '', website: '',
    budgetMin: '', budgetMax: '', rating: '3',
  });
  const { data: usersData } = useQuery({ queryKey: ['users-list'], queryFn: () => usersApi.listUsers({ limit: 100 }) });
  const users: any[] = usersData?.data ?? usersData ?? [];
  const { data: categoryOptions } = useQuery({ queryKey: ['category-options'], queryFn: categoriesApi.getOptions, staleTime: 300_000 });
  const categoryNames: string[] = useMemo(() => {
    const fromApi = (categoryOptions as any[])?.map((c: any) => c.name).filter(Boolean) ?? [];
    return fromApi.length > 0 ? fromApi : LEAD_CATEGORIES;
  }, [categoryOptions]);
  const [assignedToId, setAssignedToId] = useState(user?.id ?? '');

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const createLead = useMutation({
    mutationFn: () => crmApi.createLead({
      brandName: form.brandName,
      company: form.companyName || undefined,
      contactName: form.contactName,
      phone: form.phone || undefined,
      email: form.email || undefined,
      category: form.category || undefined,
      expectedArea: form.expectedArea ? +form.expectedArea : undefined,
      source: form.source as any,
      notes: form.notes || undefined,
      assignedToId: assignedToId || undefined,
      mallId: selectedMallId ?? undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-pipeline'] });
      qc.invalidateQueries({ queryKey: ['crm-stats'] });
      toast({ title: t('addDialog.leadSuccess') });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.errors?.join(', ') ?? err?.response?.data?.message ?? t('addDialog.leadError');
      toast({ title: msg, variant: 'destructive' });
    },
  });

  const createCustomer = useMutation({
    mutationFn: () => customersApi.createCustomer({
      companyName: form.companyName || form.brandName,
      brandName: form.brandName || undefined,
      contactName: form.contactName,
      contactTitle: form.contactTitle || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      preferredCategory: form.category || undefined,
      expectedArea: form.expectedArea ? +form.expectedArea : undefined,
      source: form.source as any,
      notes: form.notes || undefined,
      assignedToId: assignedToId || undefined,
      website: form.website || undefined,
      budgetMin: form.budgetMin ? +form.budgetMin : undefined,
      budgetMax: form.budgetMax ? +form.budgetMax : undefined,
      rating: form.rating ? +form.rating : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers-stats'] });
      toast({ title: t('addDialog.customerSuccess') });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.errors?.join(', ') ?? err?.response?.data?.message ?? t('addDialog.customerError');
      toast({ title: msg, variant: 'destructive' });
    },
  });

  const isPending = createLead.isPending || createCustomer.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('addDialog.title')}</DialogTitle>
        </DialogHeader>

        {/* Mode selector */}
        <div className="flex gap-2 p-1 bg-gray-100 rounded-xl mb-4">
          <button
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${mode === 'lead' ? 'bg-white shadow text-gray-700' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setMode('lead')}
          >
            <Target size={14} /> {t('addDialog.modeLead')}
          </button>
          <button
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${mode === 'customer' ? 'bg-white shadow text-gray-700' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setMode('customer')}
          >
            <Users size={14} /> {t('addDialog.modeCustomer')}
          </button>
        </div>

        <p className="text-xs text-gray-400 -mt-2 mb-3 px-1">
          {mode === 'lead' ? t('addDialog.leadDesc') : t('addDialog.customerDesc')}
        </p>

        <div className="space-y-3 text-sm">
          {/* Shared fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t('addDialog.fieldBrand')}</Label>
              <Input value={form.brandName} onChange={(e) => set('brandName', e.target.value)} placeholder={t('addDialog.fieldBrandPlaceholder')} className="mt-1 h-9" />
            </div>
            {mode === 'customer' && (
              <div>
                <Label className="text-xs">{t('addDialog.fieldCompany')}</Label>
                <Input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder={t('addDialog.fieldCompanyPlaceholder')} className="mt-1 h-9" />
              </div>
            )}
            <div>
              <Label className="text-xs">{t('addDialog.fieldContact')}</Label>
              <Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder={t('addDialog.fieldContactPlaceholder')} className="mt-1 h-9" />
            </div>
            {mode === 'customer' && (
              <div>
                <Label className="text-xs">{t('addDialog.fieldTitle')}</Label>
                <Input value={form.contactTitle} onChange={(e) => set('contactTitle', e.target.value)} placeholder={t('addDialog.fieldTitlePlaceholder')} className="mt-1 h-9" />
              </div>
            )}
            <div>
              <Label className="text-xs">{t('addDialog.fieldPhone')}</Label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0901234567" className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs">{t('addDialog.fieldEmail')}</Label>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="contact@brand.com" className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs">{t('addDialog.fieldIndustry')}</Label>
              <Select value={form.category || '_none'} onValueChange={(v) => set('category', v === '_none' ? '' : v)}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder={t('addDialog.fieldIndustryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t('addDialog.fieldIndustryNone')}</SelectItem>
                  {categoryNames.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t('addDialog.fieldArea')}</Label>
              <Input type="number" value={form.expectedArea} onChange={(e) => set('expectedArea', e.target.value)} placeholder="100" className="mt-1 h-9" />
            </div>
          </div>

          {/* Customer-only fields */}
          {mode === 'customer' && (
            <div className="grid grid-cols-3 gap-3 border-t pt-3">
              <div>
                <Label className="text-xs">{t('addDialog.fieldBudgetMin')}</Label>
                <Input type="number" step="0.1" value={form.budgetMin} onChange={(e) => set('budgetMin', e.target.value)} placeholder="0.5" className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">{t('addDialog.fieldBudgetMax')}</Label>
                <Input type="number" step="0.1" value={form.budgetMax} onChange={(e) => set('budgetMax', e.target.value)} placeholder="2.0" className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">{t('addDialog.fieldRating')}</Label>
                <select className="w-full border rounded-md h-9 px-2 text-sm mt-1" value={form.rating} onChange={(e) => set('rating', e.target.value)}>
                  {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{'★'.repeat(v)} ({v}/5)</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">{t('addDialog.fieldWebsite')}</Label>
                <Input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://..." className="mt-1 h-9" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 border-t pt-3">
            <div>
              <Label className="text-xs">{t('addDialog.fieldSource')}</Label>
              <select className="w-full border rounded-md h-9 px-2 text-sm mt-1" value={form.source} onChange={(e) => set('source', e.target.value)}>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">{t('addDialog.fieldAssignee')}</Label>
              {isSelfOnlyAssignee ? (
                <div className="mt-1 h-9 flex items-center px-3 text-sm rounded-md border border-gray-200 bg-gray-50 text-gray-600">
                  {user?.fullName}
                  <span className="ml-1 text-gray-400">({t('addDialog.fieldAssigneeSelfHint')})</span>
                </div>
              ) : (
                <select className="w-full border rounded-md h-9 px-2 text-sm mt-1" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
                  <option value="">{t('addDialog.fieldAssigneeNone')}</option>
                  {users.map((u: any) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              )}
            </div>
            <div className="col-span-2">
              <Label className="text-xs">{t('addDialog.fieldNotes')}</Label>
              <textarea
                className="w-full border rounded-md p-2 text-sm resize-none h-16 mt-1"
                placeholder={t('addDialog.fieldNotesPlaceholder')}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>{t('addDialog.cancel')}</Button>
            <Button
              disabled={!form.brandName || !form.contactName || isPending}
              onClick={() => mode === 'lead' ? createLead.mutate() : createCustomer.mutate()}
              className="gap-2"
            >
              <Plus size={14} />
              {mode === 'lead' ? t('addDialog.addToPipeline') : t('addDialog.registerCustomer')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lead Detail Sheet ─────────────────────────────────────────────────────────

function LeadDetailSheet({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { t } = useTranslation('crm');
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'profile' | 'pipeline' | 'activities'>('profile');
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [leadEditOpen, setLeadEditOpen] = useState(false);

  const { data: fullLead } = useQuery({
    queryKey: ['lead-detail', lead?.id],
    queryFn: () => crmApi.getLead(lead!.id),
    enabled: !!lead?.id,
  });

  const { data: followUpsData } = useQuery({
    queryKey: ['lead-followups', lead?.id],
    queryFn: () => followUpApi.list({ leadId: lead!.id }),
    enabled: !!lead?.id,
  });
  const [newFollowUp, setNewFollowUp] = useState({ dueDate: '', note: '' });

  const displayLead: any = fullLead ?? lead;
  const customer: any = fullLead?.customer ?? null;
  const stage = LEAD_STAGES.find((s) => s.key === displayLead?.status);
  const nextStageKey = displayLead?.status ? NEXT_STAGE[displayLead.status] : null;
  const nextStage = nextStageKey ? LEAD_STAGES.find((s) => s.key === nextStageKey) : null;
  const proposals: any[] = fullLead?.proposals ?? [];
  const bookings: any[] = fullLead?.bookings ?? [];
  const activities: any[] = customer?.activities ?? [];
  const followUps: any[] = followUpsData?.data ?? followUpsData ?? [];

  const invalidateFollowUps = () => qc.invalidateQueries({ queryKey: ['lead-followups', lead?.id] });

  const createFollowUpMutation = useMutation({
    mutationFn: () => followUpApi.create({ leadId: lead!.id, dueDate: newFollowUp.dueDate, note: newFollowUp.note }),
    onSuccess: () => {
      invalidateFollowUps();
      setNewFollowUp({ dueDate: '', note: '' });
      toast({ title: t('sheet.createFollowUp') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('addActivity.error'), variant: 'destructive' }),
  });

  const completeFollowUpMutation = useMutation({
    mutationFn: (id: string) => followUpApi.complete(id),
    onSuccess: () => { invalidateFollowUps(); toast({ title: t('sheet.completeFollowUp') }); },
  });

  const deleteFollowUpMutation = useMutation({
    mutationFn: (id: string) => followUpApi.delete(id),
    onSuccess: () => { invalidateFollowUps(); toast({ title: t('sheet.deleteFollowUp') }); },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['crm-pipeline'] });
    qc.invalidateQueries({ queryKey: ['lead-detail', lead?.id] });
    qc.invalidateQueries({ queryKey: ['crm-stats'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['customers-stats'] });
    if (customer?.id) qc.invalidateQueries({ queryKey: ['customer', customer.id] });
  };

  const advanceMutation = useMutation({
    mutationFn: (status: string) => crmApi.updateLead(lead!.id, { status }),
    onSuccess: (_, status) => {
      invalidateAll();
      const syncedTo = LEAD_TO_CUSTOMER_LABEL[status];
      toast({
        title: t('leadSheet.advanceSuccess', { label: LEAD_STAGES.find(s => s.key === status)?.label }),
        description: customer && syncedTo ? t('leadSheet.advanceSyncHint', { label: syncedTo }) : undefined,
      });
    },
  });

  const lostMutation = useMutation({
    mutationFn: () => crmApi.updateLead(lead!.id, { status: 'LOST' }),
    onSuccess: () => {
      invalidateAll();
      toast({
        title: t('sheet.markedLost'),
        description: customer ? t('leadSheet.customerLostHint') : undefined,
      });
      onClose();
    },
  });

  return (
    <>
      <Sheet open={!!lead} onClose={onClose} title={displayLead?.brandName ?? ''} subtitle={stage ? t(`lead.stages.${stage.key}`, { defaultValue: stage.label }) : undefined}>
        {displayLead && (
          <div className="px-6 pb-8 pt-3 space-y-3">

            {/* Pipeline progress bar */}
            <div className="space-y-1">
              <div className="flex gap-1">
                {ACTIVE_STAGES.map((s) => {
                  const idx = ACTIVE_STAGES.findIndex(x => x.key === displayLead.status);
                  const i = ACTIVE_STAGES.indexOf(s);
                  return (
                    <div key={s.key}
                      className={`flex-1 h-1.5 rounded-full ${s.key === displayLead.status ? s.bar : i < idx ? 'bg-green-400' : 'bg-gray-200'}`}
                      title={t(`lead.stages.${s.key}`, { defaultValue: s.label })}
                    />
                  );
                })}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {stage && <Badge className={`${stage.color} border-0 text-xs`}>{t(`lead.stages.${stage.key}`, { defaultValue: stage.label })}</Badge>}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setTimelineOpen(true)}
                >
                  <GitBranch size={13} />
                  Deal Timeline
                </Button>
                {customer && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">{customer.customerCode}</span>
                )}
                {displayLead.category && <Badge variant="outline" className="text-xs">{displayLead.category}</Badge>}
                {displayLead.source && <span className="text-xs text-gray-400">{SOURCE_LABELS[displayLead.source]}</span>}
              </div>
            </div>

            {/* 3 tabs */}
            <div className="flex border-b -mx-0">
              {([
                ['profile',    t('leadSheet.profileTab')],
                ['pipeline',   bookings.length + proposals.length > 0 ? `${t('sheet.pipelineTab')} (${bookings.length + proposals.length})` : t('sheet.pipelineTab')],
                ['activities', activities.length > 0 ? `${t('sheet.activitiesTab')} (${activities.length})` : t('sheet.activitiesTab')],
              ] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Tab: Hồ sơ ─────────────────────────────────────── */}
            {activeTab === 'profile' && (
              <div className="space-y-3">
                {/* Lead contact */}
                <SheetSection
                  label={t('leadSheet.contact')}
                  className="bg-gray-50"
                  action={
                    <button
                      onClick={() => setLeadEditOpen(true)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Pencil size={11} /> {t('leadSheet.edit')}
                    </button>
                  }
                >
                  <SheetRow label={t('leadSheet.fieldBrand')} value={displayLead.brandName} icon={Building2} />
                  <SheetRow label={t('leadSheet.fieldContact')} value={displayLead.contactName} icon={Users} />
                  {displayLead.phone && <SheetRow label={t('leadSheet.fieldPhone')} value={displayLead.phone} icon={Phone} />}
                  {displayLead.email && <SheetRow label={t('leadSheet.fieldEmail')} value={displayLead.email} icon={Mail} />}
                </SheetSection>

                {/* Customer company profile (nếu đã đăng ký) */}
                {customer && (
                  <SheetSection label={t('leadSheet.companyProfile')} className="bg-blue-50">
                    {customer.companyName && <SheetRow label={t('leadSheet.fieldCompany')} value={customer.companyName} icon={Building2} />}
                    {customer.taxCode && <SheetRow label={t('leadSheet.fieldTaxCode')} value={customer.taxCode} icon={Hash} />}
                    {customer.industry && <SheetRow label={t('leadSheet.fieldIndustry')} value={customer.industry} icon={Briefcase} />}
                    {customer.address && <SheetRow label={t('leadSheet.fieldAddress')} value={customer.address} icon={MapPin} />}
                    {customer.website && <SheetRow label={t('leadSheet.fieldWebsite')} value={customer.website} icon={Globe} />}
                    {customer.contactTitle && <SheetRow label={t('leadSheet.fieldTitle')} value={customer.contactTitle} icon={UserCheck} />}
                    {(customer.budgetMin || customer.budgetMax) && (
                      <SheetRow label={t('leadSheet.fieldBudget')} value={`${customer.budgetMin ?? 0}–${customer.budgetMax ?? '?'} tr/m²`} icon={TrendingUp} />
                    )}
                  </SheetSection>
                )}

                {/* Yêu cầu thuê */}
                <SheetSection label={t('leadSheet.rentRequirements')} className="bg-gray-50">
                  {displayLead.category && <SheetRow label={t('leadSheet.fieldCategory')} value={displayLead.category} icon={Tag} />}
                  {displayLead.expectedArea && <SheetRow label={t('leadSheet.fieldArea')} value={`${displayLead.expectedArea.toLocaleString()} m²`} icon={Building2} />}
                  {displayLead.expectedRent && <SheetRow label={t('leadSheet.fieldExpRent')} value={`${new Intl.NumberFormat('vi-VN').format(displayLead.expectedRent)} ₫/m²`} icon={TrendingUp} />}
                  <SheetRow label={t('leadSheet.fieldCreated')} value={fmtDate(displayLead.createdAt)} icon={Calendar} />
                </SheetSection>

                {/* Khách thuê sau khi WON */}
                {fullLead?.tenant && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-xs font-semibold text-emerald-700 mb-1.5 flex items-center gap-1"><Link2 size={11} /> {t('leadSheet.becameTenant')}</div>
                    <button className="flex items-center justify-between w-full text-sm group" onClick={() => { onClose(); navigate('/tenants'); }}>
                      <div>
                        <div className="font-medium">{fullLead.tenant.brandName}</div>
                        {fullLead.tenant.companyName && <div className="text-xs text-gray-500">{fullLead.tenant.companyName}</div>}
                      </div>
                      <ArrowRight size={13} className="text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                )}

                {displayLead.notes && (
                  <div className="rounded-xl bg-amber-50 p-3">
                    <div className="text-xs font-semibold text-amber-600 mb-1">{t('leadSheet.notes')}</div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{displayLead.notes}</p>
                  </div>
                )}

                {/* Pipeline advance actions */}
                {!['WON', 'LOST'].includes(displayLead.status) && (
                  <div className="space-y-2 pt-1">
                    {nextStage && (
                      <Button className="w-full flex-col h-auto py-2.5" onClick={() => advanceMutation.mutate(nextStage.key)} disabled={advanceMutation.isPending}>
                        <span className="flex items-center gap-1.5 font-medium"><ChevronRight size={14} /> {t('leadSheet.advancePipeline', { label: nextStage.label })}</span>
                        {customer && <span className="text-[10px] opacity-75 mt-0.5">{t('leadSheet.customerSyncHint', { label: LEAD_TO_CUSTOMER_LABEL[nextStage.key] })}</span>}
                      </Button>
                    )}
                    <Button variant="outline" className="w-full text-red-500 border-red-200 hover:bg-red-50" onClick={() => lostMutation.mutate()} disabled={lostMutation.isPending}>
                      {t('sheet.markLost')}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Quy trình bán hàng ─────────────────────── */}
            {activeTab === 'pipeline' && (
              <div className="space-y-4">
                {/* Flow header */}
                <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium overflow-x-auto pb-1 flex-nowrap">
                  {t('leadSheet.pipelineFlow').split('→').reduce<string[]>((acc, part, i, arr) => {
                    acc.push(part.trim());
                    if (i < arr.length - 1) acc.push('→');
                    return acc;
                  }, []).map((s, i) => (
                    <span key={i} className={s === '→' ? 'opacity-40' : 'bg-gray-100 px-2 py-0.5 rounded-full'}>{s}</span>
                  ))}
                </div>

                {/* Bookings */}
                {bookings.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                      <BookmarkCheck size={11} /> {t('leadSheet.bookingSection', { count: bookings.length })}
                    </div>
                    <div className="space-y-2">
                      {bookings.map((b: any) => {
                        const bcfg = BOOKING_STATUS_CFG[b.status] ?? BOOKING_STATUS_CFG.PENDING;
                        const dl = b.expiresAt ? Math.max(0, Math.ceil((new Date(b.expiresAt).getTime() - Date.now()) / 86400000)) : null;
                        return (
                          <div key={b.id} className={`rounded-xl border p-3 ${b.priority === 1 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${b.priority === 1 ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-600'}`}>{b.priority}</span>
                                <div>
                                  <span className="text-sm font-semibold">{b.unit?.code ?? '—'}</span>
                                  {b.unit?.name && <span className="text-xs text-gray-400 ml-1">{b.unit.name}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {dl !== null && b.status === 'ACTIVE' && (
                                  <span className={`text-xs ${dl <= 7 ? 'text-red-500' : 'text-gray-400'}`}><Clock size={10} className="inline" /> {dl}d</span>
                                )}
                                <Badge className={`text-xs border-0 ${bcfg.color}`}>{t(`bookingStatus.${b.status}`, { defaultValue: bcfg.label })}</Badge>
                              </div>
                            </div>
                            {b.proposal && (
                              <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500 pl-8">
                                <ArrowRight size={10} />
                                <span className="font-mono">{b.proposal.proposalNumber}</span>
                                <Badge className={`text-xs border-0 ${PROPOSAL_STATUS[b.proposal.status]?.color}`}>{t(`proposalStatus.${b.proposal.status}`, { defaultValue: PROPOSAL_STATUS[b.proposal.status]?.label })}</Badge>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Proposals */}
                {proposals.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold tracking-wider text-gray-400 flex items-center gap-1.5">
                        <FileText size={11} /> {t('leadSheet.proposalSection', { count: proposals.length })}
                      </span>
                      <button className="text-xs text-gray-500 hover:underline" onClick={() => { onClose(); navigate('/proposals'); }}>{t('leadSheet.manageProposals')}</button>
                    </div>
                    <div className="space-y-3">
                      {proposals.map((p: any) => {
                        const ps = PROPOSAL_STATUS[p.status] ?? PROPOSAL_STATUS.DRAFT;
                        const steps: any[] = p.approvalWorkflow?.steps ?? [];
                        return (
                          <div key={p.id} className={`rounded-xl border p-3 space-y-2 ${
                            p.status === 'APPROVED' ? 'border-green-200 bg-green-50' :
                            p.status === 'REJECTED' ? 'border-red-100 bg-red-50/40' :
                            p.status === 'CONVERTED' ? 'border-purple-100 bg-purple-50/30' :
                            p.status === 'SUBMITTED' || p.status === 'UNDER_REVIEW' ? 'border-yellow-200 bg-yellow-50/40' :
                            'border-gray-200 bg-white'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-sm font-mono font-semibold">{p.proposalNumber}</span>
                                {p.unit && <span className="text-xs text-gray-400 ml-2">{p.unit.code}</span>}
                              </div>
                              <Badge className={`text-xs border-0 ${ps.color}`}>{t(`proposalStatus.${p.status}`, { defaultValue: ps.label })}</Badge>
                            </div>
                            {(p.monthlyRent || p.totalContractValue) && (
                              <div className="grid grid-cols-2 gap-x-4 text-xs">
                                {p.monthlyRent && <div><span className="text-gray-400">{t('leadSheet.monthlyRent')} </span><span className="font-semibold">{new Intl.NumberFormat('vi-VN').format(p.monthlyRent)} ₫</span></div>}
                                {p.totalContractValue && <div><span className="text-gray-400">{t('leadSheet.contractValue')} </span><span className="font-bold text-green-700">{new Intl.NumberFormat('vi-VN').format(p.totalContractValue)} ₫</span></div>}
                                {p.term && <div><span className="text-gray-400">{t('leadSheet.term')} </span><span>{t('leadSheet.termMonths', { term: p.term })}</span></div>}
                                {p.startDate && <div><span className="text-gray-400">{t('leadSheet.startDate')} </span><span>{fmtDate(p.startDate)}</span></div>}
                              </div>
                            )}
                            {steps.length > 0 && (
                              <div className="border-t border-dashed border-gray-200 pt-2 space-y-1">
                                {steps.map((s: any) => (
                                  <div key={s.id} className="flex items-center gap-2 text-xs">
                                    {s.status === 'APPROVED' ? <CheckCircle size={11} className="text-green-500 flex-shrink-0" /> :
                                     s.status === 'REJECTED' ? <X size={11} className="text-red-500 flex-shrink-0" /> :
                                     <div className="w-3 h-3 rounded-full border-2 border-gray-300 flex-shrink-0" />}
                                    <span className="flex-1 text-gray-600">{t('leadSheet.approvalStep', { order: s.stepOrder, name: s.approver?.fullName ?? s.approverRole })}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${s.status === 'APPROVED' ? 'bg-green-100 text-green-700' : s.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                                      {s.status === 'APPROVED' ? t('leadSheet.stepApproved') : s.status === 'REJECTED' ? t('leadSheet.stepRejected') : t('leadSheet.stepPending')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {p.contract && (
                              <div className="flex items-center gap-2 text-xs bg-purple-50 border border-purple-100 rounded-lg p-2">
                                <FileText size={11} className="text-purple-500" />
                                <span className="font-mono font-medium">{p.contract.contractNumber}</span>
                                <Badge className="text-xs border-0 bg-purple-100 text-purple-700 ml-auto">{p.contract.status}</Badge>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {bookings.length === 0 && proposals.length === 0 && (
                  <div className="text-center py-10 text-gray-400 text-sm">
                    <Target size={30} className="mx-auto mb-2 opacity-20" />
                    {t('leadSheet.noBookingsProposals')}<br />
                    <span className="text-xs">{t('leadSheet.noBookingsProposalsHint')}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Hoạt động ─────────────────────────────── */}
            {activeTab === 'activities' && (
              <div className="space-y-5">
                {/* ── Nhắc hẹn theo dõi ── */}
                <div>
                  <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2 uppercase flex items-center gap-1.5">
                    <Bell size={12} /> {t('leadSheet.followUpsSection')}
                  </div>
                  <div className="space-y-2 mb-2">
                    {followUps.filter((f: any) => !f.isDone).map((f: any) => (
                      <div key={f.id} className="flex items-start justify-between gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-amber-800">{fmtDate(f.dueDate)}</div>
                          {f.note && <div className="text-xs text-amber-700 truncate">{f.note}</div>}
                          <div className="text-[11px] text-amber-500">{f.assignedTo?.fullName}</div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600 hover:bg-green-100"
                            title={t('followUpsWorkspace.complete')} onClick={() => completeFollowUpMutation.mutate(f.id)}>
                            <CheckCircle size={13} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:bg-red-100"
                            title={t('lead.delete')} onClick={() => deleteFollowUpMutation.mutate(f.id)}>
                            <X size={13} />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {followUps.filter((f: any) => !f.isDone).length === 0 && (
                      <p className="text-xs text-gray-400">{t('leadSheet.noFollowUps')}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input type="date" className="h-8 text-xs" value={newFollowUp.dueDate}
                      onChange={(e) => setNewFollowUp((f) => ({ ...f, dueDate: e.target.value }))} />
                    <Input placeholder={t('leadSheet.notePlaceholder')} className="h-8 text-xs flex-1" value={newFollowUp.note}
                      onChange={(e) => setNewFollowUp((f) => ({ ...f, note: e.target.value }))} />
                    <Button size="sm" className="h-8 shrink-0" disabled={!newFollowUp.dueDate || createFollowUpMutation.isPending}
                      onClick={() => createFollowUpMutation.mutate()}>
                      <Plus size={13} />
                    </Button>
                  </div>
                </div>

                {customer ? (
                  <>
                    <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => setShowAddActivity(true)}>
                      <Plus size={13} /> {t('leadSheet.addActivity')}
                    </Button>
                    <ActivityTimeline activities={activities} />
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    <Activity size={28} className="mx-auto mb-2 opacity-20" />
                    {t('leadSheet.noCustomerProfile')}
                    <br />
                    <span className="text-xs">{t('leadSheet.noCustomerProfileHint')}</span>
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </Sheet>

      {customer && (
        <AddActivityDialog
          customerId={customer.id}
          open={showAddActivity}
          onClose={() => {
            setShowAddActivity(false);
            qc.invalidateQueries({ queryKey: ['lead-detail', lead?.id] });
          }}
        />
      )}

      <DealTimelineSheet
        leadId={lead?.id ?? null}
        brandName={displayLead?.brandName}
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
      />

      {displayLead && (
        <LeadEditDialog
          lead={displayLead}
          open={leadEditOpen}
          onClose={() => setLeadEditOpen(false)}
          queryKeys={{
            pipeline: 'crm-pipeline',
            leadDetail: 'lead-detail',
          }}
        />
      )}
    </>
  );
}

// ─── Sortable Lead Card Component ───────────────────────────────────────────────

interface LeadCardProps {
  lead: Lead;
  onClick: () => void;
  isDragging?: boolean;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
  selectionMode?: boolean;
}

function LeadCardContent({ lead, onClick, isDragging, isSelected, onSelect, selectionMode }: LeadCardProps) {
  const priority = lead.priority ?? 'WARM';
  const priorityStyle = LEAD_PRIORITIES[priority] ?? LEAD_PRIORITIES.WARM;
  const daysAgo = getDaysAgo(lead.lastActivityAt);
  const isStale = daysAgo > 7;
  const daysInStage = getDaysInStage(lead.createdAt);
  const dealValue = lead.estimatedValue ?? (lead.expectedRent && lead.expectedArea ? lead.expectedRent * lead.expectedArea : null);

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(!isSelected);
  };

  return (
    <Card
      className={`cursor-grab active:cursor-grabbing transition-all border-l-3 ${priorityStyle.border} ${isDragging ? 'shadow-lg ring-2 ring-blue-400 opacity-90' : 'hover:shadow-md hover:-translate-y-0.5'} ${isSelected ? 'ring-2 ring-blue-500 bg-gray-50' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-2.5">
        {/* Header: Checkbox + Drag handle + Brand + Priority badge */}
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {selectionMode && (
              <div onClick={handleCheckboxClick} className="shrink-0 mr-0.5">
                <Checkbox checked={isSelected} className="h-4 w-4" />
              </div>
            )}
            <GripVertical size={12} className="shrink-0 text-gray-300" />
            <div className="font-medium text-sm leading-tight truncate">
              {lead.brandName}
            </div>
          </div>
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${priorityStyle.color}`}>
            {priority === 'HOT' && <Flame size={9} className="inline mr-0.5" />}
            {priority}
          </span>
        </div>

        {/* Contact + Assignee avatar */}
        <div className="flex items-center gap-1.5 mt-1">
          {lead.assignedTo?.avatar ? (
            <img src={lead.assignedTo.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
          ) : lead.assignedTo?.fullName ? (
            <div className="w-5 h-5 rounded-full bg-blue-100 text-gray-700 flex items-center justify-center text-[10px] font-semibold">
              {lead.assignedTo.fullName.charAt(0)}
            </div>
          ) : null}
          <span className="text-xs text-gray-500 truncate">{lead.contactName}</span>
        </div>

        {/* Category */}
        {lead.category && (
          <div className="text-[10px] text-gray-500 mt-1">{lead.category}</div>
        )}

        {/* Footer: Days + Deal value + Activity warning */}
        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">
              <Clock size={9} className="inline mr-0.5" />
              {daysInStage}d
            </span>
            {dealValue && (
              <span className="text-[10px] text-green-600 font-medium">
                <DollarSign size={9} className="inline" />
                {formatCompactValue(dealValue)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isStale && (
              <span className="text-orange-500" title={`Không có activity ${daysAgo} ngày`}>
                <AlertTriangle size={12} />
              </span>
            )}
            {(lead._count?.activities ?? 0) > 0 && (
              <span className="text-[10px] text-gray-400">
                <Activity size={9} className="inline mr-0.5" />
                {lead._count?.activities}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface SortableLeadCardProps {
  lead: Lead;
  onClick: () => void;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
  selectionMode?: boolean;
}

function SortableLeadCard({ lead, onClick, isSelected, onSelect, selectionMode }: SortableLeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { lead, type: 'lead' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCardContent
        lead={lead}
        onClick={onClick}
        isDragging={isDragging}
        isSelected={isSelected}
        onSelect={onSelect}
        selectionMode={selectionMode}
      />
    </div>
  );
}

// ─── Droppable Column Component ─────────────────────────────────────────────────

interface DroppableColumnProps {
  stage: typeof LEAD_STAGES[0];
  leads: Lead[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  onAddNew: () => void;
  onSelectLead: (lead: Lead) => void;
  isOver?: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (leadId: string, selected: boolean) => void;
}

function DroppableColumn({ stage, leads, total, hasMore, isLoading, onAddNew, onSelectLead, isOver, selectionMode, selectedIds, onToggleSelect }: DroppableColumnProps) {
  const { t } = useTranslation('crm');
  return (
    <div className="shrink-0 w-56">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${stage.color}`}>
        <span className="text-xs font-semibold">{t(`lead.stages.${stage.key}`, { defaultValue: stage.short })}</span>
        <span className="text-xs font-bold opacity-70">
          {total}{hasMore && '+'}
        </span>
      </div>
      <div className={`bg-gray-50/80 border border-t-0 border-gray-100 rounded-b-xl p-2 min-h-32 space-y-2 transition-colors ${isOver ? 'bg-gray-50 border-gray-200' : ''}`}>
        {isLoading ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : (
          <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
            {leads.length === 0 ? (
              <div className={`text-center py-6 text-xs ${isOver ? 'text-blue-400' : 'text-gray-300'}`}>
                {isOver ? t('kanban.dropHere') : t('kanban.empty')}
              </div>
            ) : (
              <>
                {leads.map((lead) => (
                  <SortableLeadCard
                    key={lead.id}
                    lead={lead}
                    onClick={() => onSelectLead(lead)}
                    selectionMode={selectionMode}
                    isSelected={selectedIds?.has(lead.id)}
                    onSelect={(selected) => onToggleSelect?.(lead.id, selected)}
                  />
                ))}
                {hasMore && (
                  <div className="text-center py-1.5 text-[10px] text-gray-400 bg-gray-100 rounded">
                    {t('kanban.more', { count: total - leads.length })}
                  </div>
                )}
              </>
            )}
          </SortableContext>
        )}
        {stage.key === 'NEW' && (
          <button onClick={onAddNew} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors flex items-center justify-center gap-1">
            <Plus size={11} /> {t('kanban.addLead')}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Filter Types ───────────────────────────────────────────────────────────────

interface PipelineFilters {
  status?: string;
  assignedTo?: string;
  category?: string;
  source?: string;
  priority?: string;
  quickFilter?: 'my-leads' | 'hot-leads' | 'stale-leads' | 'unassigned' | null;
}

// ─── Pipeline View (Kanban + List) ─────────────────────────────────────────────

function PipelineView({ onAddNew, onOpenCustomers }: { onAddNew: () => void; onOpenCustomers?: () => void }) {
  const { t } = useTranslation('crm');
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { selectedMallId } = useMallStore();

  // State
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'kanban' | 'list' | 'analytics' | 'customers'>('kanban');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [listPage, setListPage] = useState(1);
  const LIST_PAGE_SIZE = 20;
  const [activeDragLead, setActiveDragLead] = useState<Lead | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionOpen, setBulkActionOpen] = useState<'assign' | 'status' | 'priority' | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Filters from URL
  const filters: PipelineFilters = useMemo(() => ({
    status: searchParams.get('status') || undefined,
    assignedTo: searchParams.get('assignedTo') || undefined,
    category: searchParams.get('category') || undefined,
    source: searchParams.get('source') || undefined,
    priority: searchParams.get('priority') || undefined,
    quickFilter: (searchParams.get('quickFilter') as PipelineFilters['quickFilter']) || null,
  }), [searchParams]);

  const hasActiveFilters = Object.values(filters).some(v => v);

  const updateFilter = useCallback((key: keyof PipelineFilters, value: string | null) => {
    setSearchParams(prev => {
      if (value) {
        prev.set(key, value);
      } else {
        prev.delete(key);
      }
      return prev;
    });
  }, [setSearchParams]);

  const clearFilters = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // Fetch users for filter
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.listUsers(),
  });

  // Pipeline data
  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['crm-pipeline', selectedMallId],
    queryFn: () => crmApi.pipeline(100, selectedMallId ?? undefined),
  });
  const requestedLeadId = searchParams.get('leadId');
  const { data: requestedLeadData } = useQuery({
    queryKey: ['crm-lead', requestedLeadId],
    queryFn: () => crmApi.getLead(requestedLeadId!),
    enabled: !!requestedLeadId,
  });

  // Move lead mutation
  const moveMutation = useMutation({
    mutationFn: ({ id, status, position }: { id: string; status: string; position: number }) =>
      crmApi.moveLead(id, status, position),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
    },
    onError: () => {
      toast({ title: t('bulk.error'), description: t('bulk.errorMove'), variant: 'destructive' });
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
    },
  });

  // Bulk action mutation
  const bulkMutation = useMutation({
    mutationFn: ({ action, data }: { action: string; data?: Record<string, unknown> }) =>
      crmApi.bulkAction(action, Array.from(selectedIds), data),
    onSuccess: (result: any) => {
      toast({ title: t('bulk.success'), description: result.message });
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
      setSelectedIds(new Set());
      setSelectionMode(false);
      setBulkActionOpen(null);
      setConfirmBulkDelete(false);
    },
    onError: () => {
      toast({ title: t('bulk.error'), description: t('bulk.errorAction'), variant: 'destructive' });
    },
  });

  // Parse pipeline data
  const pipelineData: Record<string, { leads: Lead[]; total: number; hasMore: boolean }> = useMemo(() => {
    const raw = pipeline?.data ?? pipeline ?? {};
    const result: Record<string, { leads: Lead[]; total: number; hasMore: boolean }> = {};
    for (const key of Object.keys(raw)) {
      const val = raw[key];
      if (Array.isArray(val)) {
        result[key] = { leads: val, total: val.length, hasMore: false };
      } else if (val && typeof val === 'object' && Array.isArray(val.leads)) {
        result[key] = val;
      } else {
        result[key] = { leads: [], total: 0, hasMore: false };
      }
    }
    return result;
  }, [pipeline]);

  const currentUserId = user?.id ?? null;
  const canManageTeam = ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR'].includes(user?.role ?? '');

  // Apply filters to leads
  const filteredPipelineData = useMemo(() => {
    const result: Record<string, { leads: Lead[]; total: number; hasMore: boolean }> = {};

    for (const [status, data] of Object.entries(pipelineData)) {
      let leads = [...data.leads];
      if (filters.status && status !== filters.status) leads = [];

      // Quick filters
      if (filters.quickFilter === 'my-leads' && currentUserId) {
        leads = leads.filter(l => l.assignedTo?.id === currentUserId);
      } else if (filters.quickFilter === 'hot-leads') {
        leads = leads.filter(l => l.priority === 'HOT');
      } else if (filters.quickFilter === 'stale-leads') {
        leads = leads.filter(l => getDaysAgo(l.lastActivityAt) > 7);
      } else if (filters.quickFilter === 'unassigned') {
        leads = leads.filter(l => !l.assignedTo);
      }

      // Individual filters
      if (filters.assignedTo) {
        leads = leads.filter(l => l.assignedTo?.id === filters.assignedTo);
      }
      if (filters.category) {
        leads = leads.filter(l => l.category === filters.category);
      }
      if (filters.source) {
        leads = leads.filter(l => l.source === filters.source);
      }
      if (filters.priority) {
        leads = leads.filter(l => l.priority === filters.priority);
      }

      // Search
      if (search) {
        const s = search.toLowerCase();
        leads = leads.filter(l =>
          l.brandName?.toLowerCase().includes(s) ||
          l.contactName?.toLowerCase().includes(s)
        );
      }

      result[status] = { leads, total: leads.length, hasMore: false };
    }

    return result;
  }, [pipelineData, filters, search, currentUserId]);

  const allLeads: Lead[] = useMemo(
    () => Object.values(filteredPipelineData).flatMap(v => v.leads),
    [filteredPipelineData],
  );

  useEffect(() => {
    if (!requestedLeadId || selectedLead?.id === requestedLeadId) return;
    const match = Object.values(pipelineData)
      .flatMap((column) => column.leads)
      .find((lead) => lead.id === requestedLeadId);
    const fetched = requestedLeadData?.data ?? requestedLeadData;
    if (match) setSelectedLead(match);
    else if (fetched?.id === requestedLeadId) setSelectedLead(fetched);
  }, [pipelineData, requestedLeadId, requestedLeadData, selectedLead?.id]);

  // Reset to page 1 whenever the filtered data changes
  useEffect(() => { setListPage(1); }, [filteredPipelineData]);

  const listTotalPages = Math.ceil(allLeads.length / LIST_PAGE_SIZE);
  const pagedLeads = useMemo(
    () => allLeads.slice((listPage - 1) * LIST_PAGE_SIZE, listPage * LIST_PAGE_SIZE),
    [allLeads, listPage, LIST_PAGE_SIZE],
  );

  const totalValue = allLeads.filter((l) => l.expectedRent && l.expectedArea)
    .reduce((s, l) => s + (l.expectedRent ?? 0) * (l.expectedArea ?? 0), 0);
  const allUnfilteredLeads = useMemo(() => Object.values(pipelineData).flatMap(v => v.leads), [pipelineData]);
  const discoveryStats = {
    mine: allUnfilteredLeads.filter((lead) => lead.assignedTo?.id === currentUserId).length,
    hot: allUnfilteredLeads.filter((lead) => lead.priority === 'HOT' && !['WON', 'LOST'].includes(lead.status)).length,
    stale: allUnfilteredLeads.filter((lead) => getDaysAgo(lead.lastActivityAt) > 7 && !['WON', 'LOST'].includes(lead.status)).length,
    unassigned: allUnfilteredLeads.filter((lead) => !lead.assignedTo).length,
  };

  // Selection helpers
  const toggleSelect = useCallback((leadId: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(leadId);
      else next.delete(leadId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(allLeads.map(l => l.id)));
  }, [allLeads]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const lead = (event.active.data.current as any)?.lead as Lead;
    if (lead) setActiveDragLead(lead);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      // Check if over a column or a card
      const overData = over.data.current as any;
      if (overData?.lead) {
        setOverColumnId(overData.lead.status);
      } else {
        // Could be over a column directly
        const stageKey = LEAD_STAGES.find(s => s.key === over.id)?.key;
        setOverColumnId(stageKey || null);
      }
    } else {
      setOverColumnId(null);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragLead(null);
    setOverColumnId(null);

    if (!over) return;

    const draggedLead = (active.data.current as any)?.lead as Lead;
    if (!draggedLead) return;

    // Determine target status
    let targetStatus = draggedLead.status;
    let targetPosition = 0;

    const overData = over.data.current as any;
    if (overData?.lead) {
      // Dropped on another card
      const overLead = overData.lead as Lead;
      targetStatus = overLead.status;
      // Find position
      const columnLeads = filteredPipelineData[targetStatus]?.leads || [];
      const overIndex = columnLeads.findIndex(l => l.id === overLead.id);
      targetPosition = overIndex >= 0 ? overIndex : 0;
    } else {
      // Dropped on column header or empty area
      const stageKey = LEAD_STAGES.find(s => s.key === over.id)?.key;
      if (stageKey) {
        targetStatus = stageKey as LeadStatus;
        targetPosition = 0;
      }
    }

    // Only move if something changed
    if (draggedLead.status !== targetStatus || draggedLead.position !== targetPosition) {
      moveMutation.mutate({
        id: draggedLead.id,
        status: targetStatus,
        position: targetPosition,
      });

      toast({
        title: t('kanban.leadMoved'),
        description: `${draggedLead.brandName} → ${LEAD_STAGES.find(s => s.key === targetStatus)?.label}`,
      });
    }
  }, [filteredPipelineData, moveMutation, toast]);

  const handleDragCancel = useCallback(() => {
    setActiveDragLead(null);
    setOverColumnId(null);
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { key: 'my-leads', label: t('quickFilters.myLeads'), value: discoveryStats.mine, hint: t('quickFilters.myLeadsHint'), className: 'border-blue-100 bg-blue-50/60 text-blue-700' },
          { key: 'hot-leads', label: t('quickFilters.hotLeads'), value: discoveryStats.hot, hint: t('quickFilters.hotLeadsHint'), className: 'border-red-100 bg-red-50/60 text-red-700' },
          { key: 'stale-leads', label: t('quickFilters.staleLeads'), value: discoveryStats.stale, hint: t('quickFilters.staleLeadsHint'), className: 'border-amber-100 bg-amber-50/60 text-amber-700' },
          { key: 'unassigned', label: t('quickFilters.unassigned'), value: discoveryStats.unassigned, hint: t('quickFilters.unassignedHint'), className: 'border-gray-200 bg-gray-50 text-gray-700' },
        ].map((item) => <button key={item.label} type="button" onClick={() => item.key && updateFilter('quickFilter', filters.quickFilter === item.key ? null : item.key)} className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${item.className}`}>
          <div className="flex items-center justify-between"><span className="text-sm font-semibold">{item.label}</span><span className="text-xl font-bold">{item.value}</span></div><p className="mt-1 text-xs opacity-70">{item.hint}</p>
        </button>)}
      </div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('toolbar.search')} className="pl-8 h-9" />
        </div>
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className={hasActiveFilters ? 'border-gray-400 text-gray-900' : ''}
        >
          <Filter size={14} className="mr-1" />
          {t('toolbar.filter')} {hasActiveFilters && <Badge className="ml-1 h-5 px-1.5">{Object.values(filters).filter(Boolean).length}</Badge>}
        </Button>
        <Button
          variant={selectionMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setSelectionMode(!selectionMode); if (selectionMode) setSelectedIds(new Set()); }}
        >
          <CheckSquare size={14} className="mr-1" />
          {t('toolbar.selectMany')} {selectedIds.size > 0 && <Badge className="ml-1 h-5 px-1.5">{selectedIds.size}</Badge>}
        </Button>
        <div className="flex rounded-lg border overflow-hidden">
          <button onClick={() => setView('kanban')} className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${view === 'kanban' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Kanban size={13} /> {t('toolbar.kanban')}
          </button>
          <button onClick={() => setView('list')} className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${view === 'list' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            <LayoutList size={13} /> {t('toolbar.list')}
          </button>
          <button onClick={() => navigate('/crm-overview')} className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${view === 'analytics' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            <BarChart3 size={13} /> {t('toolbar.analytics')}
          </button>
          <button onClick={() => onOpenCustomers ? onOpenCustomers() : setView('customers')} className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${view === 'customers' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Users size={13} /> {t('toolbar.customerProfiles')}
          </button>
        </div>
        {totalValue > 0 && (
          <div className="text-xs text-gray-500 ml-auto">
            {t('toolbar.pipelineValue')} <span className="font-semibold text-gray-700">{new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(totalValue)} ₫</span>
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-3 md:bottom-6 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 bg-gray-900 text-white rounded-xl shadow-2xl px-3 md:px-6 py-3 flex items-center gap-2 md:gap-4 z-50 overflow-x-auto">
          <span className="text-sm font-medium whitespace-nowrap">{t('bulk.selected', { count: selectedIds.size })}</span>
          <div className="h-6 w-px bg-gray-700" />
          <Button size="sm" variant="ghost" className="text-white hover:bg-gray-800" onClick={selectAll}>
            <CheckSquare size={14} className="mr-1" /> {t('bulk.selectAll')}
          </Button>
          {canManageTeam && <Button size="sm" variant="ghost" className="text-white hover:bg-gray-800" onClick={() => setBulkActionOpen('assign')}>
            <UserPlus size={14} className="mr-1" /> {t('bulk.assign')}
          </Button>}
          <Button size="sm" variant="ghost" className="text-white hover:bg-gray-800" onClick={() => setBulkActionOpen('status')}>
            <ArrowRight size={14} className="mr-1" /> {t('bulk.changeStatus')}
          </Button>
          <Button size="sm" variant="ghost" className="text-white hover:bg-gray-800" onClick={() => setBulkActionOpen('priority')}>
            <Flame size={14} className="mr-1" /> {t('bulk.changePriority')}
          </Button>
          {canManageTeam && <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-900/30" onClick={() => setConfirmBulkDelete(true)}>
            <Trash2 size={14} className="mr-1" /> {t('bulk.delete')}
          </Button>}
          <div className="h-6 w-px bg-gray-700" />
          <Button size="sm" variant="ghost" className="text-gray-400 hover:bg-gray-800" onClick={clearSelection}>
            <X size={14} /><span className="sr-only">{t('bulk.selectAll')}</span>
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmBulkDelete}
        title={t('bulk.confirmDelete', { count: selectedIds.size })}
        description={t('bulk.confirmDeleteDesc')}
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={() => bulkMutation.mutate({ action: 'delete' })}
        loading={bulkMutation.isPending}
        confirmLabel={t('bulk.confirmDeleteBtn')}
        loadingLabel={t('bulk.deleting')}
      />

      {/* Bulk Action Dialogs */}
      <Dialog open={bulkActionOpen === 'assign'} onOpenChange={(open) => !open && setBulkActionOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('bulk.assignTitle', { count: selectedIds.size })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select onValueChange={(userId) => bulkMutation.mutate({ action: 'assign', data: { assignedToId: userId } })}>
              <SelectTrigger>
                <SelectValue placeholder={t('bulk.selectAssignee')} />
              </SelectTrigger>
              <SelectContent>
                {(Array.isArray(users) ? users : users?.data ?? []).map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkActionOpen === 'status'} onOpenChange={(open) => !open && setBulkActionOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('bulk.statusTitle', { count: selectedIds.size })}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {LEAD_STAGES.map((s) => (
              <Button
                key={s.key}
                variant="outline"
                className={`justify-start ${s.color}`}
                onClick={() => bulkMutation.mutate({ action: 'changeStatus', data: { status: s.key } })}
              >
                {t(`lead.stages.${s.key}`, { defaultValue: s.label })}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkActionOpen === 'priority'} onOpenChange={(open) => !open && setBulkActionOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('bulk.priorityTitle', { count: selectedIds.size })}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            {(['HOT', 'WARM', 'COLD'] as const).map((p) => (
              <Button
                key={p}
                variant="outline"
                className={`flex-1 ${LEAD_PRIORITIES[p].color}`}
                onClick={() => bulkMutation.mutate({ action: 'changePriority', data: { priority: p } })}
              >
                {p === 'HOT' && <Flame size={14} className="mr-1" />}
                {p}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gray-50 border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{t('toolbar.filterPanel')}</span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500 h-7">
                <X size={12} className="mr-1" /> {t('toolbar.clearFilter')}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Select value={filters.assignedTo || '_all'} onValueChange={(v) => updateFilter('assignedTo', v === '_all' ? null : v)}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder={t('toolbar.assignee')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">{t('toolbar.allValues')}</SelectItem>
                {(Array.isArray(users) ? users : users?.data ?? []).map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.category || '_all'} onValueChange={(v) => updateFilter('category', v === '_all' ? null : v)}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder={t('toolbar.industry')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">{t('toolbar.allValues')}</SelectItem>
                {LEAD_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.source || '_all'} onValueChange={(v) => updateFilter('source', v === '_all' ? null : v)}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue placeholder={t('toolbar.source')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">{t('toolbar.allValues')}</SelectItem>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>{t(`sources.${s.key}`, { defaultValue: s.label })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.priority || '_all'} onValueChange={(v) => updateFilter('priority', v === '_all' ? null : v)}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue placeholder={t('toolbar.priority')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">{t('toolbar.allValues')}</SelectItem>
                <SelectItem value="HOT">{t('priority.HOT')}</SelectItem>
                <SelectItem value="WARM">{t('priority.WARM')}</SelectItem>
                <SelectItem value="COLD">{t('priority.COLD')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Quick Filter Pills */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => updateFilter('quickFilter', filters.quickFilter === 'my-leads' ? null : 'my-leads')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filters.quickFilter === 'my-leads' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <Users size={11} className="inline mr-1" /> My Leads
        </button>
        <button
          onClick={() => updateFilter('quickFilter', filters.quickFilter === 'hot-leads' ? null : 'hot-leads')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filters.quickFilter === 'hot-leads' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <Flame size={11} className="inline mr-1" /> Hot Leads
        </button>
        <button
          onClick={() => updateFilter('quickFilter', filters.quickFilter === 'stale-leads' ? null : 'stale-leads')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filters.quickFilter === 'stale-leads' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <AlertTriangle size={11} className="inline mr-1" /> Stale Leads
        </button>
        {/* Stage summary chips */}
        <div className="flex-1" />
        {LEAD_STAGES.map((s) => {
          const stageData = filteredPipelineData[s.key];
          const count = stageData?.total ?? 0;
          if (!count) return null;
          return (
            <div key={s.key} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${s.color}`}>
              {t(`lead.stages.${s.key}`, { defaultValue: s.short })} <span className="font-bold">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Kanban with DnD */}
      {view === 'kanban' && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex gap-3 overflow-x-auto pb-4">
            {LEAD_STAGES.map((s) => {
              const stageData = filteredPipelineData[s.key] ?? { leads: [], total: 0, hasMore: false };
              return (
                <DroppableColumn
                  key={s.key}
                  stage={s}
                  leads={stageData.leads}
                  total={stageData.total}
                  hasMore={stageData.hasMore}
                  isLoading={isLoading}
                  onAddNew={onAddNew}
                  onSelectLead={setSelectedLead}
                  isOver={overColumnId === s.key}
                  selectionMode={selectionMode}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                />
              );
            })}
          </div>
          <DragOverlay>
            {activeDragLead ? (
              <div className="w-56">
                <LeadCardContent lead={activeDragLead} onClick={() => {}} isDragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* List */}
      {view === 'list' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('listView.colBrand')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('listView.colContact')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('listView.colIndustry')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">{t('listView.colArea')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('listView.colStage')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('listView.colSource')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('listView.colCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">{t('listView.loading')}</td></tr>
              ) : allLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <Target size={36} className="mx-auto mb-2 opacity-20" />
                    <p>{t('listView.noLeads')}</p>
                  </td>
                </tr>
              ) : pagedLeads.map((lead: any) => {
                const s = LEAD_STAGES.find((s) => s.key === lead.status);
                return (
                  <tr key={lead.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedLead(lead)}>
                      <div className="font-medium text-gray-900 hover:text-blue-600 hover:underline">{lead.brandName}</div>
                      {lead.company && <div className="text-xs text-gray-400">{lead.company}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700">{lead.contactName}</div>
                      {lead.phone && <div className="text-xs text-gray-400">{lead.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{lead.category ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">{lead.expectedArea ? `${lead.expectedArea.toLocaleString()} m²` : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${s?.bar}`} />
                        <Badge className={`${s?.color} border-0 text-xs`}>{s ? t(`lead.stages.${s.key}`, { defaultValue: s.short }) : ''}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{lead.source ? t(`sources.${lead.source}`, { defaultValue: SOURCE_LABELS[lead.source] ?? lead.source }) : '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(lead.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {listTotalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm text-gray-600">
              <span className="text-xs">
                {(listPage - 1) * LIST_PAGE_SIZE + 1}–{Math.min(listPage * LIST_PAGE_SIZE, allLeads.length)} / {allLeads.length} leads
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setListPage(p => Math.max(1, p - 1))}
                  disabled={listPage === 1}
                  className="px-2.5 py-1 rounded text-xs border bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('listView.prev')}
                </button>
                {Array.from({ length: listTotalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === listTotalPages || Math.abs(p - listPage) <= 1)
                  .reduce<(number | '...')[]>((acc, p, i, arr) => {
                    if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '...' ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setListPage(p as number)}
                        className={`px-2.5 py-1 rounded text-xs border ${listPage === p ? 'bg-gray-900 text-white border-gray-900' : 'bg-white hover:bg-gray-100'}`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setListPage(p => Math.min(listTotalPages, p + 1))}
                  disabled={listPage === listTotalPages}
                  className="px-2.5 py-1 rounded text-xs border bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('listView.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analytics View */}
      {view === 'analytics' && <PipelineAnalytics />}

      {view === 'customers' && (
        <div className="mt-2">
          <CustomersView onAddNew={onAddNew} />
        </div>
      )}

      <LeadDetailSheet lead={selectedLead} onClose={() => {
        setSelectedLead(null);
        setSearchParams((previous) => {
          const next = new URLSearchParams(previous);
          next.delete('leadId');
          return next;
        }, { replace: true });
      }} />
    </div>
  );
}

// ─── Pipeline Analytics Component ────────────────────────────────────────────────

function PipelineAnalytics() {
  const { t } = useTranslation('crm');
  const { data: stats, isLoading } = useQuery({
    queryKey: ['crm-pipeline-stats'],
    queryFn: () => crmApi.pipelineStats(),
  });

  const { data: staleLeads, isLoading: staleLoading } = useQuery({
    queryKey: ['crm-stale-leads'],
    queryFn: () => crmApi.staleLeads(14),
  });

  if (isLoading) return <div className="flex items-center justify-center py-12"><RefreshCw className="animate-spin text-gray-400" /></div>;

  const summary = stats?.summary ?? {};
  const conversionRates = stats?.conversionRates ?? {};
  const winLossBySource = stats?.winLossBySource ?? {};
  const winLossByCategory = stats?.winLossByCategory ?? {};
  const byPriority = stats?.byPriority ?? {};

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-gray-900">{summary.total ?? 0}</div>
          <div className="text-xs text-gray-500">{t('analytics.totalLeads')}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-gray-700">{summary.totalActive ?? 0}</div>
          <div className="text-xs text-gray-500">{t('analytics.active')}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-green-600">{summary.totalWon ?? 0}</div>
          <div className="text-xs text-gray-500">{t('analytics.won')}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-red-500">{summary.totalLost ?? 0}</div>
          <div className="text-xs text-gray-500">{t('analytics.lost')}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-purple-600">{(conversionRates.overallWinRate ?? 0).toFixed(1)}%</div>
          <div className="text-xs text-gray-500">{t('analytics.winRate')}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-orange-600">{summary.avgDaysToWin ?? 0}</div>
          <div className="text-xs text-gray-500">{t('analytics.avgDaysToWin')}</div>
        </div>
      </div>

      {/* This Month */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar size={16} /> {t('analytics.thisMonth')}
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-xl font-bold text-gray-700">{summary.newThisMonth ?? 0}</div>
            <div className="text-xs text-gray-600">{t('analytics.newLeads')}</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-xl font-bold text-green-600">{summary.wonThisMonth ?? 0}</div>
            <div className="text-xs text-gray-600">{t('analytics.won')}</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-xl font-bold text-red-500">{summary.lostThisMonth ?? 0}</div>
            <div className="text-xs text-gray-600">{t('analytics.lost')}</div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={16} /> {t('analytics.conversionRates')}
          </h3>
          <div className="space-y-3">
            {[
              { label: 'New → Contacted', value: conversionRates.newToContacted },
              { label: 'Contacted → Qualified', value: conversionRates.contactedToQualified },
              { label: 'Qualified → Proposal', value: conversionRates.qualifiedToProposal },
              { label: 'Proposal → Negotiation', value: conversionRates.proposalToNegotiation },
              { label: 'Negotiation → Won', value: conversionRates.negotiationToWon },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600">{item.label}</span>
                  <span className="font-medium">{(item.value ?? 0).toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gray-500 rounded-full transition-all" style={{ width: `${Math.min(item.value ?? 0, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Priority */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Flame size={16} /> {t('analytics.byPriority')}
          </h3>
          <div className="space-y-3">
            {['HOT', 'WARM', 'COLD'].map((p) => {
              const count = byPriority[p] ?? 0;
              const total = Object.values(byPriority).reduce((a: number, b: any) => a + (b || 0), 0) as number;
              const pct = total > 0 ? (count / total) * 100 : 0;
              const style = LEAD_PRIORITIES[p as keyof typeof LEAD_PRIORITIES];
              return (
                <div key={p}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={`font-medium px-2 py-0.5 rounded ${style.color}`}>
                      {p === 'HOT' && <Flame size={10} className="inline mr-1" />}
                      {p}
                    </span>
                    <span className="font-medium">{count} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${p === 'HOT' ? 'bg-red-500' : p === 'WARM' ? 'bg-orange-400' : 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Win/Loss by Source */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Target size={16} /> {t('analytics.winBySource')}
          </h3>
          <div className="space-y-2">
            {Object.entries(winLossBySource).map(([source, data]: [string, any]) => (
              <div key={source} className="flex items-center gap-3">
                <div className="w-24 text-xs text-gray-600 truncate">{t(`sources.${source}`, { defaultValue: SOURCE_LABELS[source] ?? source })}</div>
                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-green-500" style={{ width: `${data.rate}%` }} />
                  <div className="h-full bg-red-400" style={{ width: `${100 - data.rate}%` }} />
                </div>
                <div className="w-16 text-xs text-right">
                  <span className="text-green-600">{data.won}</span>
                  <span className="text-gray-400">/</span>
                  <span className="text-red-500">{data.lost}</span>
                </div>
              </div>
            ))}
            {Object.keys(winLossBySource).length === 0 && (
              <div className="text-center text-gray-400 text-sm py-4">{t('analytics.noData')}</div>
            )}
          </div>
        </div>

        {/* Win/Loss by Category */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Tag size={16} /> {t('analytics.winByCategory')}
          </h3>
          <div className="space-y-2">
            {Object.entries(winLossByCategory).map(([cat, data]: [string, any]) => (
              <div key={cat} className="flex items-center gap-3">
                <div className="w-24 text-xs text-gray-600 truncate">{cat}</div>
                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-green-500" style={{ width: `${data.rate}%` }} />
                  <div className="h-full bg-red-400" style={{ width: `${100 - data.rate}%` }} />
                </div>
                <div className="w-16 text-xs text-right">
                  <span className="text-green-600">{data.won}</span>
                  <span className="text-gray-400">/</span>
                  <span className="text-red-500">{data.lost}</span>
                </div>
              </div>
            ))}
            {Object.keys(winLossByCategory).length === 0 && (
              <div className="text-center text-gray-400 text-sm py-4">{t('analytics.noData')}</div>
            )}
          </div>
        </div>
      </div>

      {/* Stale Leads Alert */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
        <h3 className="font-semibold text-orange-800 mb-3 flex items-center gap-2">
          <AlertTriangle size={16} /> {t('analytics.staleAlert')}
        </h3>
        {staleLoading ? (
          <div className="text-center py-4"><RefreshCw className="animate-spin text-orange-400 mx-auto" /></div>
        ) : (staleLeads?.length ?? 0) === 0 ? (
          <div className="text-center text-orange-600 text-sm py-4">{t('analytics.noStaleLeads')}</div>
        ) : (
          <div className="space-y-2">
            {(staleLeads ?? []).slice(0, 10).map((lead: any) => {
              const daysAgo = getDaysAgo(lead.lastActivityAt || lead.createdAt);
              return (
                <div key={lead.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-orange-100">
                  <div>
                    <div className="font-medium text-sm text-gray-900">{lead.brandName}</div>
                    <div className="text-xs text-gray-500">{lead.contactName} · {lead.assignedTo?.fullName ?? 'Unassigned'}</div>
                  </div>
                  <Badge variant="outline" className="text-orange-600 border-orange-300">
                    <Clock size={10} className="mr-1" /> {daysAgo} ngày
                  </Badge>
                </div>
              );
            })}
            {(staleLeads?.length ?? 0) > 10 && (
              <div className="text-center text-xs text-orange-600 pt-2">
                {t('analytics.moreLeads', { count: staleLeads.length - 10 })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Customer Detail Sheet ─────────────────────────────────────────────────────

function ActivityTimeline({ activities }: { activities: CustomerActivity[] }) {
  const { t } = useTranslation('crm');
  if (!activities?.length) return (
    <div className="text-center py-8 text-gray-400 text-sm">
      <Activity size={28} className="mx-auto mb-2 opacity-20" />
      {t('leadSheet.noActivities')}
    </div>
  );
  return (
    <div className="space-y-3">
      {activities.map((act) => {
        const typeInfo = ACTIVITY_TYPES.find((item) => item.key === act.type) ?? ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];
        const Icon = typeInfo.icon;
        return (
          <div key={act.id} className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
              <Icon size={13} className="text-gray-700" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-medium text-gray-700">{t(`activityTypes.${typeInfo.key}`, { defaultValue: typeInfo.label })}</span>
                {act.subject && <span className="text-xs text-gray-400">— {act.subject}</span>}
              </div>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{act.note}</p>
              {act.outcome && <div className="mt-1 text-xs text-green-600 flex items-center gap-1"><CheckCircle size={10} />{act.outcome}</div>}
              <div className="text-xs text-gray-400 mt-1">{act.createdBy?.fullName} · {fmtDateTime(act.createdAt)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddActivityDialog({ customerId, open, onClose }: { customerId: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation('crm');
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ type: 'CALL', subject: '', note: '', outcome: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => customersApi.addActivity(customerId, form as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
      toast({ title: t('addActivity.success') });
      onClose();
    },
    onError: () => toast({ title: t('addActivity.error'), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('addActivity.title')}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label className="text-xs">{t('addActivity.type')}</Label>
            <select className="w-full border rounded-md h-9 px-2 mt-1 text-sm" value={form.type} onChange={(e) => set('type', e.target.value)}>
              {ACTIVITY_TYPES.map((act) => <option key={act.key} value={act.key}>{t(`activityTypes.${act.key}`, { defaultValue: act.label })}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">{t('addActivity.subject')}</Label>
            <Input value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder={t('addActivity.subjectPlaceholder')} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs">{t('addActivity.content')}</Label>
            <textarea className="w-full border rounded-md p-2 text-sm resize-none h-20 mt-1" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder={t('addActivity.contentPlaceholder')} />
          </div>
          <div>
            <Label className="text-xs">{t('addActivity.result')}</Label>
            <Input value={form.outcome} onChange={(e) => set('outcome', e.target.value)} placeholder={t('addActivity.resultPlaceholder')} className="mt-1 h-9" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>{t('addActivity.cancel')}</Button>
            <Button disabled={!form.note || mutation.isPending} onClick={() => mutation.mutate()}>{t('addActivity.save')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetailSheet({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const { t } = useTranslation('crm');
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [detailTab, setDetailTab] = useState<'overview' | 'activities' | 'leads'>('overview');
  const [showActivity, setShowActivity] = useState(false);
  const [showInactiveReason, setShowInactiveReason] = useState(false);
  const [inactiveReason, setInactiveReason] = useState('');

  const { data: raw, isLoading } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => customersApi.getCustomer(customerId!),
    enabled: !!customerId,
    select: (r) => r?.data ?? r,
  });

  const customer: Customer | undefined = raw;
  const statusInfo = CUSTOMER_STATUSES.find((s) => s.key === customer?.status);
  const nextStatusKey = customer?.status === 'PROSPECT' ? 'NEGOTIATING' : customer?.status === 'NEGOTIATING' ? 'ACTIVE' : null;
  const nextStatusInfo = nextStatusKey ? CUSTOMER_STATUSES.find((s) => s.key === nextStatusKey) : null;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['customer', customerId] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['customers-stats'] });
    qc.invalidateQueries({ queryKey: ['crm-pipeline'] });
    qc.invalidateQueries({ queryKey: ['crm-stats'] });
    // Invalidate all linked lead detail caches
    (customer?.leads ?? []).forEach((l: any) =>
      qc.invalidateQueries({ queryKey: ['lead-detail', l.id] }),
    );
  };

  const advanceMutation = useMutation({
    mutationFn: (status: string) => customersApi.updateCustomer(customer!.id, { status }),
    onSuccess: (_, status) => {
      invalidateAll();
      const leadsCount = customer?.leads?.length ?? 0;
      const syncLabel = CUSTOMER_TO_LEAD_LABEL[status];
      const statusLabel = CUSTOMER_STATUSES.find((s) => s.key === status)?.label;
      toast({
        title: t('customerDetail.advanceStatus', { label: statusLabel }),
        description: leadsCount > 0 && syncLabel ? t('customerDetail.leadsSyncHint', { count: leadsCount, label: syncLabel }) : undefined,
      });
    },
  });

  const inactiveMutation = useMutation({
    mutationFn: () => customersApi.updateCustomer(customer!.id, { status: 'INACTIVE', lostReason: inactiveReason }),
    onSuccess: () => {
      invalidateAll();
      const leadsCount = customer?.leads?.filter((l: any) => !['WON', 'LOST'].includes(l.status)).length ?? 0;
      toast({
        title: t('customerDetail.endCoopSuccess'),
        description: leadsCount > 0 ? t('customerDetail.endCoopLeads', { count: leadsCount }) : undefined,
      });
      setShowInactiveReason(false);
    },
  });

  return (
    <>
      <Sheet open={!!customerId} onClose={onClose} title={customer?.companyName ?? ''} subtitle={customer?.customerCode}>
        {isLoading ? (
          <div className="px-6 pt-6 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : customer ? (
          <div className="px-6 pb-8 pt-4 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono bg-gray-50 text-gray-700 px-2 py-0.5 rounded-full border border-gray-200 font-semibold">{customer.customerCode}</span>
              {statusInfo && <Badge className={`${statusInfo.color} border-0`}>{statusInfo.label}</Badge>}
              <RatingStars value={customer.rating} />
              {customer.source && <span className="text-xs text-gray-400">{SOURCE_LABELS[customer.source]}</span>}
            </div>

            {/* Inline tabs */}
            <div className="flex border-b">
              {([
                ['overview', t('customerDetail.overview')],
                ['activities', t('customerDetail.activities', { count: customer.activities?.length ?? 0 })],
                ['leads', t('customerDetail.leads', { count: customer.leads?.length ?? 0 })],
              ] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setDetailTab(tab)} className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${detailTab === tab ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Overview */}
            {detailTab === 'overview' && (
              <div className="space-y-3">
                <SheetSection label={t('customerDetail.colCompany')} className="bg-gray-50">
                  <SheetRow label={t('customerDetail.fieldCompany')} value={customer.companyName} icon={Building2} />
                  {customer.brandName && <SheetRow label={t('customerDetail.fieldBrand')} value={customer.brandName} icon={Tag} />}
                  {customer.taxCode && <SheetRow label={t('customerDetail.fieldTaxCode')} value={customer.taxCode} icon={Hash} />}
                  {customer.industry && <SheetRow label={t('customerDetail.fieldIndustry')} value={customer.industry} icon={Briefcase} />}
                  {customer.address && <SheetRow label={t('customerDetail.fieldAddress')} value={customer.address} icon={MapPin} />}
                  {customer.website && <SheetRow label={t('customerDetail.fieldWebsite')} value={customer.website} icon={Globe} />}
                </SheetSection>

                <SheetSection label={t('customerDetail.colContact')} className="bg-gray-50">
                  <SheetRow label={t('customerDetail.fieldFullName')} value={customer.contactName} icon={Users} />
                  {customer.contactTitle && <SheetRow label={t('customerDetail.fieldTitle')} value={customer.contactTitle} icon={Briefcase} />}
                  {customer.phone && <SheetRow label={t('customerDetail.fieldPhone')} value={customer.phone} icon={Phone} />}
                  {customer.email && <SheetRow label={t('customerDetail.fieldEmail')} value={customer.email} icon={Mail} />}
                </SheetSection>

                <SheetSection label={t('customerDetail.colRent')} className="bg-purple-50">
                  {customer.preferredCategory && <SheetRow label={t('customerDetail.fieldCategory')} value={customer.preferredCategory} icon={Tag} />}
                  {customer.expectedArea && <SheetRow label={t('customerDetail.fieldArea')} value={`${customer.expectedArea.toLocaleString()} m²`} icon={Building2} />}
                  {(customer.budgetMin || customer.budgetMax) && <SheetRow label={t('customerDetail.fieldBudget')} value={`${customer.budgetMin ?? 0}–${customer.budgetMax ?? '?'} tr/m²`} icon={TrendingUp} />}
                </SheetSection>

                {customer.assignedTo && (
                  <SheetSection label={t('customerDetail.colAssignee')} className="bg-green-50">
                    <SheetRow label={t('customerDetail.fieldStaff')} value={customer.assignedTo.fullName} icon={UserCheck} />
                    <SheetRow label={t('customerDetail.fieldEmail')} value={customer.assignedTo.email} icon={Mail} />
                  </SheetSection>
                )}

                {/* Linked tenant */}
                {customer.tenant && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-xs font-semibold text-emerald-700 mb-1 flex items-center gap-1"><Link2 size={11} /> {t('leadSheet.becameTenant')}</div>
                    <button className="flex items-center justify-between w-full group" onClick={() => { onClose(); navigate('/tenants'); }}>
                      <div>
                        <div className="text-sm font-medium">{customer.tenant.brandName}</div>
                        {customer.tenant.companyName && <div className="text-xs text-gray-500">{customer.tenant.companyName}</div>}
                      </div>
                      <ArrowRight size={13} className="text-emerald-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
                    </button>
                  </div>
                )}

                {customer.notes && (
                  <div className="rounded-xl bg-amber-50 p-3">
                    <div className="text-xs font-semibold text-amber-600 mb-1">{t('customerDetail.notes')}</div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
                  </div>
                )}

                {customer.lostAt && customer.lostReason && (
                  <div className="rounded-xl bg-red-50 p-3">
                    <div className="text-xs font-semibold text-red-600 mb-1">{t('customerDetail.lostReason')}</div>
                    <p className="text-sm text-red-700">{customer.lostReason}</p>
                    <p className="text-xs text-red-400 mt-1">{fmtDate(customer.lostAt)}</p>
                  </div>
                )}

                {!['INACTIVE', 'BLACKLISTED'].includes(customer.status) && (
                  <div className="space-y-2">
                    {nextStatusInfo && (() => {
                      const leadsCount = (customer.leads ?? []).length;
                      const leadSyncLabel = CUSTOMER_TO_LEAD_LABEL[nextStatusKey!];
                      return (
                        <Button className="w-full flex-col h-auto py-2.5" onClick={() => advanceMutation.mutate(nextStatusKey!)} disabled={advanceMutation.isPending}>
                          <span className="flex items-center gap-1.5 font-medium">
                            <ChevronRight size={14} /> {t('customerDetail.advanceStatus', { label: nextStatusInfo.label })}
                          </span>
                          {leadsCount > 0 && (
                            <span className="text-[10px] opacity-75 mt-0.5">
                              {t('customerDetail.leadsSyncHint', { count: leadsCount, label: leadSyncLabel })}
                            </span>
                          )}
                        </Button>
                      );
                    })()}
                    <Button variant="outline" className="w-full flex-col h-auto py-2 text-orange-500 border-orange-200 hover:bg-orange-50" onClick={() => setShowInactiveReason(true)}>
                      <span>{t('customerDetail.endCooperation')}</span>
                      {(customer.leads ?? []).filter((l: any) => !['WON', 'LOST'].includes(l.status)).length > 0 && (
                        <span className="text-[10px] opacity-60 mt-0.5">
                          {t('customerDetail.endCoopHint', { count: (customer.leads ?? []).filter((l: any) => !['WON', 'LOST'].includes(l.status)).length })}
                        </span>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {detailTab === 'activities' && (
              <div className="space-y-3">
                <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => setShowActivity(true)}>
                  <Plus size={13} /> {t('customerDetail.addActivity')}
                </Button>
                <ActivityTimeline activities={customer.activities ?? []} />
              </div>
            )}

            {detailTab === 'leads' && (
              <div className="space-y-2">
                {(customer.leads ?? []).length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm"><Target size={28} className="mx-auto mb-2 opacity-20" />{t('customerDetail.noLinkedLeads')}</div>
                ) : (customer.leads ?? []).map((lead: any) => {
                  const s = LEAD_STAGES.find((s) => s.key === lead.status);
                  return (
                    <div key={lead.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <div className="text-sm font-medium">{lead.brandName}</div>
                        <div className="text-xs text-gray-500">{lead.contactName}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${s?.bar}`} />
                        <Badge className={`${s?.color} border-0 text-xs`}>{s ? t(`lead.stages.${s.key}`, { defaultValue: s.short }) : ''}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        ) : null}
      </Sheet>

      {/* Dialogs */}
      {customer && <AddActivityDialog customerId={customer.id} open={showActivity} onClose={() => setShowActivity(false)} />}
      <Dialog open={showInactiveReason} onOpenChange={setShowInactiveReason}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('customerDetail.endCoopTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <textarea className="w-full border rounded-md p-2 text-sm h-24 resize-none" placeholder={t('customerDetail.endCoopPlaceholder')} value={inactiveReason} onChange={(e) => setInactiveReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowInactiveReason(false)}>{t('customerDetail.cancel')}</Button>
              <Button variant="destructive" disabled={!inactiveReason.trim() || inactiveMutation.isPending} onClick={() => inactiveMutation.mutate()}>{t('customerDetail.confirm')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Customers View ────────────────────────────────────────────────────────────

function CustomersView({ onAddNew }: { onAddNew: () => void }) {
  const { t } = useTranslation('crm');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: statsData } = useQuery({
    queryKey: ['customers-stats'],
    queryFn: customersApi.stats,
    select: (r) => r?.data ?? r,
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ['customers', search, statusFilter],
    queryFn: () => customersApi.listCustomers({ search: search || undefined, status: statusFilter || undefined, limit: 60 }),
    select: (r) => r?.data ?? r,
  });

  const stats: { status: string; count: number }[] = statsData?.byStatus ?? [];
  const customers: Customer[] = listData?.data ?? listData ?? [];

  return (
    <div className="flex gap-4 h-full">
      <div className="flex-1 space-y-3 min-w-0">
        {/* Status filter bar */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setStatusFilter('')} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!statusFilter ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {t('customersView.all')} <span className="font-bold ml-1">{statsData?.total ?? 0}</span>
          </button>
          {CUSTOMER_STATUSES.map((s) => {
            const count = stats.find((x) => x.status === s.key)?.count ?? 0;
            const Icon = s.icon;
            return (
              <button key={s.key} onClick={() => setStatusFilter(s.key === statusFilter ? '' : s.key)} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${statusFilter === s.key ? `${s.color} border-current` : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                <Icon size={11} />{t(`customerStatuses.${s.key}`, { defaultValue: s.label })} <span className="font-bold">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search + add */}
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('customersView.searchPlaceholder')} className="pl-8 h-9" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('customersView.colCode')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('customersView.colCompany')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('customersView.colContact')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('customersView.colIndustry')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">{t('customersView.colArea')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('customersView.colStatus')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('customersView.colRating')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('customersView.colLeads')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('customersView.colCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">{t('customersView.loading')}</td></tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    <Users size={36} className="mx-auto mb-2 opacity-20" />
                    <p>{t('customersView.noCustomers')}</p>
                    <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={onAddNew}><Plus size={13} />{t('customersView.registerNew')}</Button>
                  </td>
                </tr>
              ) : customers.map((c) => {
                const s = CUSTOMER_STATUSES.find((x) => x.key === c.status);
                const Icon = s?.icon ?? Users;
                const leadCount = (c.leads ?? []).length;
                return (
                  <tr key={c.id} className={`border-b cursor-pointer transition-colors hover:bg-gray-50 ${selectedId === c.id ? 'bg-gray-50' : ''}`} onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-50 px-2 py-0.5 rounded">{c.customerCode}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{c.companyName}</div>
                      {c.brandName && <div className="text-xs text-gray-400">{c.brandName}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-gray-700 text-sm">{c.contactName}</div>
                      {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{c.preferredCategory ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-500">{c.expectedArea ? `${c.expectedArea.toLocaleString()} m²` : '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${s?.color}`}>
                        <Icon size={10} />{s ? t(`customerStatuses.${s.key}`, { defaultValue: s.label }) : ''}
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><RatingStars value={c.rating} /></td>
                    <td className="px-4 py-2.5">
                      {leadCount > 0 ? (
                        <span className="text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded-full font-medium">{t('customersView.leadCount', { count: leadCount })}</span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{fmtDate(c.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CustomerDetailSheet customerId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

// ─── Follow-ups View ───────────────────────────────────────────────────────────

function FollowUpsView() {
  const { t } = useTranslation('crm');
  const { data, isLoading } = useQuery({
    queryKey: ['follow-ups'],
    queryFn: () => (crmApi as any).listFollowUps ? (crmApi as any).listFollowUps({ isDone: false, daysAhead: 7 }) : Promise.resolve([]),
    select: (r: any) => r?.data ?? r ?? [],
  });

  const followUps: any[] = Array.isArray(data) ? data : [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdue = followUps.filter((f) => new Date(f.scheduledAt) < today);
  const todayItems = followUps.filter((f) => {
    const d = new Date(f.scheduledAt);
    return d >= today && d < new Date(today.getTime() + 86400000);
  });
  const upcoming = followUps.filter((f) => new Date(f.scheduledAt) >= new Date(today.getTime() + 86400000));

  const renderList = (items: any[], emptyMsg: string) => (
    items.length === 0 ? (
      <p className="text-sm text-gray-400 text-center py-4">{emptyMsg}</p>
    ) : items.map((f) => (
      <div key={f.id} className="flex items-start gap-3 p-3 bg-white border rounded-xl">
        <div className="shrink-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center mt-0.5">
          <Bell size={14} className="text-gray-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900">{f.lead?.brandName ?? f.note}</div>
          {f.note && f.lead && <div className="text-xs text-gray-500 mt-0.5">{f.note}</div>}
          <div className="text-xs text-gray-400 mt-1">{fmtDate(f.scheduledAt)}</div>
        </div>
      </div>
    ))
  );

  if (isLoading) return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

  return (
    <div className="max-w-2xl space-y-6">
      {overdue.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-red-600 mb-3">
            <AlertCircle size={14} /> {t('followUpsWorkspace.overdue')} ({overdue.length})
          </div>
          <div className="space-y-2">{renderList(overdue, '')}</div>
        </div>
      )}
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
          <Clock size={14} /> {t('followUpsWorkspace.today')} ({todayItems.length})
        </div>
        {renderList(todayItems, t('followUpsWorkspace.noTasks'))}
      </div>
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-3">
          <Calendar size={14} /> {t('followUpsWorkspace.upcoming')} ({upcoming.length})
        </div>
        {renderList(upcoming, t('followUpsWorkspace.noTasks'))}
      </div>
    </div>
  );
}

// ─── Main CRM Page ─────────────────────────────────────────────────────────────

function LegacyCrmPage() {
  const { t } = useTranslation('crm');
  const [activeTab, setActiveTab] = useState('pipeline');
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        className="mb-5 shrink-0"
        eyebrow={t('pipeline.eyebrow')}
        title={t('pipeline.title')}
        description={t('pipeline.description')}
        actions={<Button onClick={() => setShowAdd(true)} className="w-full gap-2 sm:w-auto"><Plus size={15} /> {t('pipeline.addBtn')}</Button>}
      />
      <div className="hidden">
        <div>
          <h1 className="text-xl font-bold text-gray-900">CRM — Sales & Marketing</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('pipeline.description')}</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2 shrink-0">
          <Plus size={15} /> {t('pipeline.addBtn')}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="mb-4 overflow-x-auto pb-1 shrink-0">
        <TabsList className="w-max min-w-full justify-start bg-gray-100 p-1 rounded-xl">
          <TabsTrigger value="pipeline" className="gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Target size={14} /> {t('pipeline.tabPipeline')}
          </TabsTrigger>
          <TabsTrigger value="followups" className="gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Bell size={14} /> {t('pipeline.tabFollowUps')}
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="pipeline" className="flex-1 overflow-y-auto pb-4 mt-0">
          <PipelineView onAddNew={() => setShowAdd(true)} />
        </TabsContent>

        <TabsContent value="followups" className="flex-1 overflow-y-auto pb-4 mt-0">
          <FollowUpsView />
        </TabsContent>
      </Tabs>

      <UnifiedAddDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}

function FollowUpsWorkspace() {
  const { t } = useTranslation('crm');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['follow-ups', 'open', 7],
    queryFn: () => followUpApi.list({ isDone: 'false', daysAhead: 7 }),
    select: (response: any) => response?.data ?? response ?? [],
  });
  const completeMutation = useMutation({
    mutationFn: (id: string) => followUpApi.complete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-ups'] });
      toast({ title: t('followUpsWorkspace.completeSuccess') });
    },
    onError: () => toast({ title: t('followUpsWorkspace.completeError'), variant: 'destructive' }),
  });

  const items: any[] = Array.isArray(data) ? data : [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const groups = [
    { key: 'overdue', label: t('followUpsWorkspace.overdue'), tone: 'text-red-700', items: items.filter((item) => new Date(item.dueDate) < today) },
    { key: 'today', label: t('followUpsWorkspace.today'), tone: 'text-amber-700', items: items.filter((item) => new Date(item.dueDate) >= today && new Date(item.dueDate) < tomorrow) },
    { key: 'upcoming', label: t('followUpsWorkspace.upcoming'), tone: 'text-gray-700', items: items.filter((item) => new Date(item.dueDate) >= tomorrow) },
  ];

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)}</div>;
  if (isError) return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <p className="font-medium text-red-700">{t('followUpsWorkspace.loadError')}</p>
      <p className="mt-1 text-sm text-red-600">{t('followUpsWorkspace.loadErrorHint')}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>{t('followUpsWorkspace.retry')}</Button>
    </div>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {groups.map((group) => (
        <section key={group.key} className="rounded-xl border bg-white p-4" aria-labelledby={`follow-up-${group.key}`}>
          <h2 id={`follow-up-${group.key}`} className={`mb-3 flex items-center justify-between text-sm font-semibold ${group.tone}`}>
            {group.label}<Badge variant="outline">{group.items.length}</Badge>
          </h2>
          {group.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">{t('followUpsWorkspace.noTasks')}</p>
          ) : (
            <div className="space-y-2">
              {group.items.map((item: any) => {
                const leadStage = item.lead?.status ? LEAD_STAGES.find((s) => s.key === item.lead.status) : null;
                return (
                <article key={item.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-left text-sm font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                      onClick={() => item.lead?.id && navigate(`/crm?leadId=${item.lead.id}`)}
                    >{item.lead?.brandName ?? item.customer?.companyName ?? 'Follow-up'}</button>
                    {leadStage && <Badge className={`${leadStage.color} border-0 text-[10px] shrink-0`}>{leadStage.short}</Badge>}
                  </div>
                  {item.note && <p className="mt-1 text-xs text-gray-600">{item.note}</p>}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-400">{t('followUpsWorkspace.dueDate', { date: fmtDate(item.dueDate) })}</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={completeMutation.isPending} onClick={() => completeMutation.mutate(item.id)}>
                      <CheckCircle size={12} className="mr-1" /> {t('followUpsWorkspace.complete')}
                    </Button>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export default function CrmPage() {
  const { t } = useTranslation('crm');
  const [searchParams] = useSearchParams();
  const requestedSection = searchParams.get('section');
  const [activeTab, setActiveTab] = useState(
    requestedSection === 'followups' || requestedSection === 'customers' ? requestedSection : 'leads',
  );
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        className="mb-5 shrink-0"
        eyebrow={t('page.eyebrow')}
        title={t('page.title')}
        description={t('page.description')}
        actions={<Button onClick={() => setShowAdd(true)} className="w-full gap-2 sm:w-auto"><Plus size={15} /> {t('page.createBtn')}</Button>}
      />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="mb-4 shrink-0 overflow-x-auto pb-1">
          <TabsList className="w-max min-w-full justify-start rounded-xl bg-gray-100 p-1">
            <TabsTrigger value="leads" className="gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"><Target size={14} /> {t('page.tabLeads')}</TabsTrigger>
            <TabsTrigger value="followups" className="gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"><Bell size={14} /> {t('page.tabFollowUps')}</TabsTrigger>
            <TabsTrigger value="customers" className="gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"><Users size={14} /> {t('page.tabCustomers')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="leads" className="mt-0 flex-1 overflow-y-auto pb-4">
          <PipelineView onAddNew={() => setShowAdd(true)} onOpenCustomers={() => setActiveTab('customers')} />
        </TabsContent>
        <TabsContent value="followups" className="mt-0 flex-1 overflow-y-auto pb-4"><FollowUpsWorkspace /></TabsContent>
        <TabsContent value="customers" className="mt-0 flex-1 overflow-y-auto pb-4"><CustomersView onAddNew={() => setShowAdd(true)} /></TabsContent>
      </Tabs>
      <UnifiedAddDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}
