import { useDeferredValue, useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, spacesApi, tenantsApi, brandingApi, mallAccessApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import { useForm } from 'react-hook-form';
import {
  Users, Building2, Layers, Shield, Settings, Plus, Pencil, Trash2,
  KeyRound, Lock, Unlock, ChevronDown, ChevronRight, MapPin, X,
  CheckCircle, XCircle, AlertTriangle, RefreshCw, Mail, Phone, Briefcase,
  SquareStack, Info, GitBranch, ExternalLink,
} from 'lucide-react';
import { ApprovalPolicyTab } from './ApprovalPolicyTab';
import { CategoriesTab } from './CategoriesTab';
import { MallAccessTab } from './MallAccessTab';
import { getMallAccessDisplay, MALL_ACCESS_ROLES } from './mallAccessDisplay';
import { accountStatusTranslationKey, adminRoleTranslationKey } from './adminPresentation';
import { SystemTab as OperationalSystemTab } from './SystemTab';
import { ROUTE_PERMISSIONS, NAV_GROUPS } from '@/lib/permissions';
import { ERPToolbar } from '@/components/erp';
import { PageHeader } from '@/components/ui/page-header';
import type { User } from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_MAP: Record<string, { label: string; color: string; desc: string }> = {
  ADMIN:             { label: 'Super Admin',       color: 'bg-red-100 text-red-700',     desc: 'Toàn quyền truy cập và cấu hình hệ thống' },
  CEO:               { label: 'CEO',               color: 'bg-pink-100 text-pink-700',   desc: 'Xem báo cáo tổng hợp, phê duyệt cấp cao' },
  MALL_DIRECTOR:     { label: 'Mall Director',     color: 'bg-purple-100 text-purple-700', desc: 'Quản lý toàn bộ hoạt động của mall' },
  LEASING_MANAGER:   { label: 'Leasing Manager',   color: 'bg-blue-100 text-gray-700',   desc: 'Quản lý leasing team, duyệt proposal' },
  LEASING_EXECUTIVE: { label: 'Leasing Executive', color: 'bg-gray-50 text-gray-700',    desc: 'Chăm sóc khách hàng, tạo proposal' },
  FINANCE:           { label: 'Finance',           color: 'bg-green-100 text-green-700', desc: 'Quản lý hóa đơn, công nợ, báo cáo tài chính' },
  LEGAL:             { label: 'Legal',             color: 'bg-yellow-100 text-yellow-700', desc: 'Soạn thảo và kiểm tra hợp đồng' },
  OPERATION:         { label: 'Operation',         color: 'bg-orange-100 text-orange-700', desc: 'Vận hành mall, xử lý ticket kỹ thuật' },
  TENANT:            { label: 'Tenant Portal',     color: 'bg-gray-100 text-gray-700',   desc: 'Khách thuê xem thông tin hợp đồng và gửi yêu cầu' },
};

// Lấy trực tiếp từ ROUTE_PERMISSIONS (nguồn chân lý dùng để gác cổng route thật) — không còn là
// bản sao hardcode thứ 3 dễ lệch khỏi thực tế như trước. Nhãn hiển thị lấy từ NAV_GROUPS.
const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((item) => [item.module, item.label])),
);
const PERMISSIONS: { module: string; label: string; roles: string[] }[] = Object.entries(ROUTE_PERMISSIONS).map(
  ([module, roles]) => ({ module, label: MODULE_LABELS[module] ?? module, roles }),
);

const ROLE_KEYS = Object.keys(ROLE_MAP);

// ─── Shared helpers ───────────────────────────────────────────────────────────

function ConfirmDialog({ open, title, message, onConfirm, onCancel, loading }: {
  open: boolean; title: string; message: string;
  onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  const { t } = useTranslation('admin');
  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle size={18} className="text-red-500" />{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-gray-600">{message}</p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onCancel}>{t('confirm.cancel')}</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? <RefreshCw size={14} className="animate-spin mr-1" /> : null} {t('confirm.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab 1: Users ─────────────────────────────────────────────────────────────

function UserDialog({ open, user, onClose }: { open: boolean; user?: User | null; onClose: () => void }) {
  const isEdit = !!user;
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const { register, handleSubmit, reset, watch } = useForm();
  const selectedRole = watch('role', user?.role ?? ROLE_KEYS[4]); // default LEASING_EXECUTIVE
  const [selectedMallIds, setSelectedMallIds] = useState<string[]>([]);
  const [mallRole, setMallRole] = useState('LEASING_EXECUTIVE');
  const [addMallId, setAddMallId] = useState('');
  const [addMallRole, setAddMallRole] = useState('LEASING_EXECUTIVE');

  const needsMallAccess = MALL_ACCESS_ROLES.includes(selectedRole);

  useEffect(() => {
    if (open) {
      reset(user ? {
        fullName: user.fullName,
        phone: (user as any).phone ?? '',
        department: (user as any).department ?? '',
        role: user.role,
        tenantId: (user as any).tenantId ?? '',
      } : { role: ROLE_KEYS[4] });
      setSelectedMallIds([]);
      setMallRole('LEASING_EXECUTIVE');
      setAddMallId('');
    }
  }, [open, user?.id]);

  const { data: tenantsData } = useQuery({
    queryKey: ['tenants-lite'],
    queryFn: () => tenantsApi.listTenants({ limit: 200 }),
    enabled: selectedRole === 'TENANT',
  });
  const tenants: any[] = tenantsData?.data ?? tenantsData ?? [];

  const { data: mallsData } = useQuery({
    queryKey: ['malls'],
    queryFn: spacesApi.listMalls,
    enabled: needsMallAccess,
  });
  const malls: any[] = mallsData?.data ?? mallsData ?? [];

  const { data: userMallsData, refetch: refetchUserMalls } = useQuery({
    queryKey: ['user-mall-access', user?.id],
    queryFn: () => mallAccessApi.listForUser(user!.id),
    enabled: isEdit && !!user?.id && needsMallAccess,
  });
  const userMalls: any[] = Array.isArray(userMallsData) ? userMallsData : userMallsData?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEdit) return usersApi.updateUser(user!.id, data);
      const newUser = await usersApi.createUser(data);
      const userId = newUser?.data?.id ?? newUser?.id;
      if (userId && selectedMallIds.length > 0) {
        await Promise.allSettled(
          selectedMallIds.map((mallId) => mallAccessApi.grant({ userId, mallId, role: mallRole })),
        );
      }
      return newUser;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['mall-access'] });
      toast({ title: isEdit ? t('users.toast.updated') : t('users.toast.created') });
      reset(); setSelectedMallIds([]); onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('commonError'), variant: 'destructive' }),
  });

  const grantMutation = useMutation({
    mutationFn: ({ mallId, role }: { mallId: string; role: string }) => mallAccessApi.grant({ userId: user!.id, mallId, role }),
    onSuccess: () => { refetchUserMalls(); qc.invalidateQueries({ queryKey: ['mall-access'] }); setAddMallId(''); toast({ title: t('mallAccess.toast.granted') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('commonError'), variant: 'destructive' }),
  });

  const revokeMutation = useMutation({
    mutationFn: (mallId: string) => mallAccessApi.revoke(user!.id, mallId),
    onSuccess: () => { refetchUserMalls(); qc.invalidateQueries({ queryKey: ['mall-access'] }); toast({ title: t('mallAccess.toast.revoked') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('commonError'), variant: 'destructive' }),
  });

  const roleInfo = user ? ROLE_MAP[user.role] : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {isEdit ? (
                <>
                  {user!.fullName}
                  {roleInfo && <Badge className={`${roleInfo.color} border-0 text-xs font-normal`}>{t(adminRoleTranslationKey(user!.role))}</Badge>}
                  <Badge className={`border-0 text-xs font-normal ${user!.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {user!.isActive ? t('users.active') : t('users.locked')}
                  </Badge>
                </>
              ) : t('users.createNew')}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('users.fields.fullNameRequired')}</Label>
                <Input {...register('fullName', { required: true })} placeholder="Nguyễn Văn A" className="mt-1" />
              </div>
              <div>
                <Label>Email{!isEdit && ' *'}</Label>
                {isEdit
                  ? <Input value={user!.email} disabled className="mt-1 bg-gray-50 text-gray-500" />
                  : <Input {...register('email', { required: true })} type="email" placeholder="user@thiso.com" className="mt-1" />}
              </div>
              {!isEdit && (
                <div>
                  <Label>{t('users.fields.password')}</Label>
                  <Input {...register('password', { required: true, minLength: 8 })} type="password" placeholder={t('users.fields.passwordPlaceholder')} className="mt-1" />
                </div>
              )}
              <div>
                <Label>{t('users.fields.role')}</Label>
                <select {...register('role')} className="mt-1 w-full border rounded-md px-3 py-2 text-sm">
                  {ROLE_KEYS.map((k) => <option key={k} value={k}>{t(adminRoleTranslationKey(k))}</option>)}
                </select>
              </div>
              <div>
                <Label>{t('users.fields.phone')}</Label>
                <Input {...register('phone')} placeholder="0901234567" className="mt-1" />
              </div>
              <div>
                <Label>{t('users.fields.department')}</Label>
                <Input {...register('department')} placeholder="Leasing" className="mt-1" />
              </div>
              {selectedRole === 'TENANT' && (
                <div className="col-span-2">
                  <Label>{t('users.linkedTenant')}</Label>
                  <select {...register('tenantId')} className="mt-1 w-full border rounded-md px-3 py-2 text-sm">
                    <option value="">{t('users.noLinked')}</option>
                    {tenants.map((ten) => <option key={ten.id} value={ten.id}>{ten.brandName ?? ten.companyName}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Mall access */}
            {needsMallAccess && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                    <Building2 size={12} /> {t('users.mallScope.label')}
                  </Label>
                  {!isEdit && (
                    <select value={mallRole} onChange={(e) => setMallRole(e.target.value)} className="border rounded px-2 py-1 text-xs bg-white">
                      {MALL_ACCESS_ROLES.map((r) => <option key={r} value={r}>{t(adminRoleTranslationKey(r))}</option>)}
                    </select>
                  )}
                </div>

                {!isEdit ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {malls.map((m) => {
                        const selected = selectedMallIds.includes(m.id);
                        return (
                          <button key={m.id} type="button"
                            onClick={() => setSelectedMallIds((prev) => prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id])}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${selected ? 'border-blue-400 bg-blue-100 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}>
                            <Building2 size={11} />{m.name}
                          </button>
                        );
                      })}
                      {malls.length === 0 && <span className="text-xs text-gray-400">{t('users.mallScope.noMalls')}</span>}
                    </div>
                    {selectedMallIds.length > 0 && (
                      <p className="text-xs text-blue-600">{t('users.mallScope.assignmentSummary', { role: t(adminRoleTranslationKey(mallRole)), count: selectedMallIds.length })}</p>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2 min-h-[28px]">
                      {userMalls.map((m: any) => {
                        const mallId = m.mallId ?? m.mall?.id ?? m.id;
                        return (
                          <div key={mallId} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-300 bg-blue-100 text-blue-700 text-xs font-medium">
                            <Building2 size={11} />{m.mall?.name ?? m.name}
                            <span className="text-blue-500 text-[10px]">· {t(adminRoleTranslationKey(m.role))}</span>
                            <button type="button" onClick={() => revokeMutation.mutate(mallId)} disabled={revokeMutation.isPending} className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors">
                              <X size={11} />
                            </button>
                          </div>
                        );
                      })}
                      {userMalls.length === 0 && <span className="text-xs text-gray-400 py-1">{t('users.mallScope.unassigned')}</span>}
                    </div>
                    <div className="flex gap-2 items-center">
                      <select value={addMallId} onChange={(e) => setAddMallId(e.target.value)} className="flex-1 border rounded px-2 py-1.5 text-xs bg-white">
                        <option value="">{t('users.mallScope.addMall')}</option>
                        {malls.filter((m) => !userMalls.some((um: any) => (um.mallId ?? um.mall?.id) === m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <select value={addMallRole} onChange={(e) => setAddMallRole(e.target.value)} className="w-36 border rounded px-2 py-1.5 text-xs bg-white">
                        {MALL_ACCESS_ROLES.map((r) => <option key={r} value={r}>{t(adminRoleTranslationKey(r))}</option>)}
                      </select>
                      <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0"
                        disabled={!addMallId || grantMutation.isPending}
                        onClick={() => grantMutation.mutate({ mallId: addMallId, role: addMallRole })}>
                        <Plus size={11} /> {t('users.mallScope.add')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>{t('confirm.cancel')}</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending
                  ? (isEdit ? t('users.saving') : t('users.creating'))
                  : (isEdit ? t('users.saveChanges') : t('users.create'))}
              </Button>
            </div>
          </form>

        </DialogContent>
      </Dialog>
    </>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const { register, handleSubmit, reset } = useForm();

  const mutation = useMutation({
    mutationFn: (d: any) => usersApi.resetPassword(user!.id, d.newPassword),
    onSuccess: () => { toast({ title: t('users.toast.passwordReset') }); reset(); onClose(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('commonError'), variant: 'destructive' }),
  });

  return (
    <Dialog open={!!user} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound size={16} /> {t('users.resetPasswordBtn')}
          </DialogTitle>
        </DialogHeader>
        {user && <p className="text-sm text-gray-500 -mt-1">{t('users.accountLabel')}: <strong>{user.fullName}</strong></p>}
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-3 mt-1">
          <Input {...register('newPassword', { required: true, minLength: 8 })} type="password" placeholder={t('users.newPasswordPlaceholder')} />
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>{t('confirm.cancel')}</Button>
            <Button type="submit" disabled={mutation.isPending}>{t('users.resetBtn')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MallAccessCell({ user }: { user: User }) {
  const { t } = useTranslation('admin');
  const display = getMallAccessDisplay(user);

  if (display.kind === 'global') {
    return <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">{t('users.mallScope.global')}</Badge>;
  }
  if (display.kind === 'not-applicable') {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  if (display.kind === 'unassigned') {
    return <span className="text-amber-700 text-xs font-medium">{t('users.mallScope.unassigned')}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {display.malls.map((m) => (
        <span key={m.id} className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-blue-100 bg-blue-50 text-blue-700 text-xs">
          <Building2 size={10} />{m.name}
        </span>
      ))}
    </div>
  );
}

function UsersTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation('admin');

  const toggleMutation = useMutation({
    mutationFn: (u: User) => usersApi.updateUser(u.id, { isActive: !u.isActive }),
    onSuccess: (_, u) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setTogglingId(null);
      toast({ title: u.isActive ? t('users.toast.locked') : t('users.toast.unlocked') });
    },
    onError: (e: any) => { setTogglingId(null); toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => usersApi.deleteUser(confirmDeleteUser!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast({ title: t('users.toast.deleted') }); setConfirmDeleteUser(null); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  useEffect(() => setPage(1), [deferredSearch, roleFilter, statusFilter]);
  const queryParams = {
    page,
    limit: 20,
    ...(deferredSearch ? { search: deferredSearch } : {}),
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(statusFilter ? { isActive: statusFilter === 'active' } : {}),
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['users', queryParams],
    queryFn: () => usersApi.listUsers(queryParams),
  });
  const { data: stats } = useQuery({ queryKey: ['users', 'stats'], queryFn: usersApi.getStats });
  const users: User[] = data?.data ?? [];
  const totalPages = Number(data?.totalPages ?? 1);

  return (
    <div>
      <ERPToolbar className="mb-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Users size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input placeholder={t('users.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9" />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-9 rounded-md border bg-white px-3 text-sm">
            <option value="">{t('users.allRoles')}</option>
            {ROLE_KEYS.map((k) => <option key={k} value={k}>{t(adminRoleTranslationKey(k))}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border bg-white px-3 text-sm">
            <option value="">{t('users.allStatuses')}</option>
            <option value="active">{t('users.statusActive')}</option>
            <option value="locked">{t('users.statusLocked')}</option>
          </select>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
          <Plus size={15} /> {t('users.create')}
        </Button>
      </ERPToolbar>

      {/* Stats row */}
      <div className="mb-3 grid grid-cols-2 border-y border-slate-200 bg-white lg:grid-cols-4">
        {[
          { label: t('users.stats.total'), value: stats?.total ?? '—', valueClass: 'text-slate-900' },
          { label: t('users.stats.active'), value: stats?.active ?? '—', valueClass: 'text-emerald-700' },
          { label: t('users.stats.locked'), value: stats?.locked ?? '—', valueClass: 'text-red-700' },
          { label: t('users.stats.roles'), value: Object.keys(ROLE_MAP).length, valueClass: 'text-indigo-700' },
        ].map((s, i) => (
          <div key={i} className="border-b border-slate-100 px-4 py-2.5 last:border-r-0 odd:border-r lg:border-b-0 lg:border-r">
            <div className={`text-xl font-semibold tabular-nums ${s.valueClass}`}>{s.value}</div>
            <div className="mt-0.5 text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="mb-3 text-sm text-red-700">{t('users.loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>{t('users.retry')}</Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('users.table.fullName')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('users.table.email')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('users.table.department')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('users.table.role')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('users.table.mallAccess')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('users.table.status')}</th>
                <th className="px-4 py-3 w-36" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const roleInfo = ROLE_MAP[u.role] ?? { label: u.role, color: 'bg-gray-100 text-gray-700' };
                return (
                  <tr key={u.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => setSelectedUser(u)}>
                    <td className="px-4 py-3 font-medium">{u.fullName}</td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{(u as any).department ?? '—'}</td>
                    <td className="px-4 py-2.5"><Badge className={`${roleInfo.color} border-0 text-xs`}>{t(adminRoleTranslationKey(u.role))}</Badge></td>
                    <td className="px-4 py-3"><MallAccessCell user={u} /></td>
                    <td className="px-4 py-3">
                      <Badge className={u.isActive ? 'bg-green-100 text-green-700 border-0 text-xs' : 'bg-gray-100 text-gray-500 border-0 text-xs'}>
                        {t(accountStatusTranslationKey(u.isActive))}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Chỉnh sửa thông tin" onClick={(e) => { e.stopPropagation(); setSelectedUser(u); }}>
                          <Pencil size={13} className="text-gray-400" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Đặt lại mật khẩu" onClick={(e) => { e.stopPropagation(); setResetPwdUser(u); }}>
                          <KeyRound size={13} className="text-gray-400" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          title={u.isActive ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                          disabled={togglingId === u.id}
                          onClick={(e) => { e.stopPropagation(); setTogglingId(u.id); toggleMutation.mutate(u); }}>
                          {togglingId === u.id
                            ? <RefreshCw size={13} className="animate-spin text-gray-400" />
                            : u.isActive ? <Lock size={13} className="text-orange-400" /> : <Unlock size={13} className="text-green-500" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Xóa tài khoản"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteUser(u); }}>
                          <Trash2 size={13} className="text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Users size={36} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">{t('users.noResults')}</p>
            </div>
          )}
        </div>
      )}

      {!isLoading && !isError && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>{t('users.pagination', { total: data?.total ?? 0, page, totalPages })}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t('users.prev')}</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>{t('users.next')}</Button>
          </div>
        </div>
      )}

      <ResetPasswordDialog user={resetPwdUser} onClose={() => setResetPwdUser(null)} />
      <ConfirmDialog
        open={!!confirmDeleteUser}
        title={t('users.confirmDelete')}
        message={t('users.confirmDeleteMessage', { name: confirmDeleteUser?.fullName })}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmDeleteUser(null)}
        loading={deleteMutation.isPending}
      />
      <UserDialog
        open={showCreate || !!selectedUser}
        user={selectedUser}
        onClose={() => { setShowCreate(false); setSelectedUser(null); }}
      />
    </div>
  );
}

// ─── Tab 2: Malls ─────────────────────────────────────────────────────────────

const LEVEL_SORT: Record<string, number> = { B5: -5, B4: -4, B3: -3, B2: -2, B1: -1, GF: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5, L6: 6, L7: 7, RF: 9 };

const FLOOR_TEMPLATES = [
  { label: 'Mall lớn', floors: [
    { level: 'B2', name: 'Tầng Hầm 2' }, { level: 'B1', name: 'Tầng Hầm 1' },
    { level: 'GF', name: 'Tầng Trệt' }, { level: 'L1', name: 'Tầng 1' },
    { level: 'L2', name: 'Tầng 2' }, { level: 'L3', name: 'Tầng 3' }, { level: 'L4', name: 'Tầng 4' },
  ]},
  { label: 'Mall vừa', floors: [
    { level: 'B1', name: 'Tầng Hầm 1' }, { level: 'GF', name: 'Tầng Trệt' },
    { level: 'L1', name: 'Tầng 1' }, { level: 'L2', name: 'Tầng 2' }, { level: 'L3', name: 'Tầng 3' },
  ]},
  { label: 'Mall nhỏ', floors: [
    { level: 'GF', name: 'Tầng Trệt' }, { level: 'L1', name: 'Tầng 1' }, { level: 'L2', name: 'Tầng 2' },
  ]},
];

interface FloorInput { id: string; level: string; name: string; sortOrder: number; zones: ZoneInput[]; }
interface ZoneInput { id: string; name: string; code: string; }

const uid = () => Math.random().toString(36).slice(2, 9);

function MallCreateWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [mallData, setMallData] = useState<any>(null);
  const [floors, setFloors] = useState<FloorInput[]>([]);
  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    if (open) { reset(); setStep(1); setMallData(null); setFloors([]); }
  }, [open]);

  const setupMutation = useMutation({
    mutationFn: (data: any) => spacesApi.setupMall(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['malls'] });
      toast({ title: 'Đã tạo Mall thành công!' });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const onStep1Submit = (data: any) => {
    setMallData({ ...data, totalArea: data.totalArea ? Number(data.totalArea) : undefined });
    setStep(2);
  };

  const addFloor = () => setFloors(prev => [...prev, { id: uid(), level: '', name: '', sortOrder: 0, zones: [] }]);

  const applyTemplate = (t: typeof FLOOR_TEMPLATES[0]) => {
    setFloors(t.floors.map(f => ({ id: uid(), level: f.level, name: f.name, sortOrder: LEVEL_SORT[f.level] ?? 0, zones: [] })));
  };

  const updateFloor = (id: string, field: keyof Omit<FloorInput, 'zones'>, value: string) => {
    setFloors(prev => prev.map(f => f.id === id
      ? { ...f, [field]: value, ...(field === 'level' ? { sortOrder: LEVEL_SORT[value] ?? 0 } : {}) }
      : f
    ));
  };

  const removeFloor = (id: string) => setFloors(prev => prev.filter(f => f.id !== id));

  const addZone = (floorId: string) => setFloors(prev => prev.map(f =>
    f.id === floorId ? { ...f, zones: [...f.zones, { id: uid(), name: '', code: '' }] } : f
  ));

  const updateZone = (floorId: string, zoneId: string, field: keyof ZoneInput, value: string) => {
    setFloors(prev => prev.map(f =>
      f.id === floorId ? { ...f, zones: f.zones.map(z => z.id === zoneId ? { ...z, [field]: value } : z) } : f
    ));
  };

  const removeZone = (floorId: string, zoneId: string) => {
    setFloors(prev => prev.map(f =>
      f.id === floorId ? { ...f, zones: f.zones.filter(z => z.id !== zoneId) } : f
    ));
  };

  const handleCreate = () => {
    setupMutation.mutate({
      mall: mallData,
      floors: floors
        .filter(f => f.level.trim() && f.name.trim())
        .map(({ id: _id, zones, ...f }) => ({
          ...f,
          zones: zones.filter(z => z.name.trim()).map(({ id: _zid, ...z }) => ({ ...z, code: z.code || undefined })),
        })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo Mall mới</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-4">
          {['Thông tin cơ bản', 'Cấu trúc tầng'].map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-gray-200" />}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                step > i + 1 ? 'bg-green-500 text-white' : step === i + 1 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${step === i + 1 ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{label}</span>
            </div>
          ))}
        </div>

        {/* ── Step 1: Mall info ── */}
        {step === 1 && (
          <form onSubmit={handleSubmit(onStep1Submit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tên Mall *</Label>
                <Input {...register('name', { required: true })} placeholder="THISO Mall Sala" className="mt-1" />
              </div>
              <div>
                <Label>Mã Mall *</Label>
                <Input {...register('code', { required: true })} placeholder="THISO-SALA" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Địa chỉ</Label>
                <Input {...register('address')} placeholder="10 Mai Chi Tho, An Loi Dong, Quận 2" className="mt-1" />
              </div>
              <div>
                <Label>Thành phố</Label>
                <Input {...register('city')} placeholder="Hồ Chí Minh" className="mt-1" />
              </div>
              <div>
                <Label>Tổng diện tích (m²)</Label>
                <Input {...register('totalArea')} type="number" placeholder="45000" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Mô tả</Label>
                <Input {...register('description')} placeholder="Mô tả ngắn về mall..." className="mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
              <Button type="submit">Tiếp theo →</Button>
            </div>
          </form>
        )}

        {/* ── Step 2: Floors & zones ── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Quick templates */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Thêm nhanh theo chuẩn</p>
              <div className="flex flex-wrap gap-2">
                {FLOOR_TEMPLATES.map(t => (
                  <Button key={t.label} type="button" variant="outline" size="sm" onClick={() => applyTemplate(t)}>
                    {t.label} ({t.floors.length} tầng)
                  </Button>
                ))}
              </div>
            </div>

            {/* Floor list */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
              {floors.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
                  <Layers size={28} className="mx-auto mb-2 opacity-30" />
                  Chưa có tầng nào. Chọn mẫu nhanh hoặc thêm thủ công bên dưới.
                </div>
              )}
              {floors.map((floor, fi) => (
                <div key={floor.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 p-2.5 bg-gray-50 border-b border-gray-100">
                    <span className="w-5 h-5 bg-gray-200 rounded text-[10px] flex items-center justify-center font-bold text-gray-500 shrink-0">{fi + 1}</span>
                    <Input
                      value={floor.level}
                      onChange={e => updateFloor(floor.id, 'level', e.target.value)}
                      placeholder="GF"
                      className="w-16 h-7 text-xs font-mono"
                    />
                    <Input
                      value={floor.name}
                      onChange={e => updateFloor(floor.id, 'name', e.target.value)}
                      placeholder="Tên tầng (VD: Tầng Trệt)"
                      className="flex-1 h-7 text-xs"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeFloor(floor.id)} className="h-7 w-7 p-0 shrink-0 hover:bg-red-50">
                      <Trash2 size={12} className="text-red-400" />
                    </Button>
                  </div>
                  <div className="px-3 py-2 space-y-1.5 bg-white">
                    {floor.zones.map(zone => (
                      <div key={zone.id} className="flex items-center gap-1.5">
                        <SquareStack size={11} className="text-gray-300 shrink-0 ml-1" />
                        <Input
                          value={zone.name}
                          onChange={e => updateZone(floor.id, zone.id, 'name', e.target.value)}
                          placeholder="Tên khu vực (VD: Khu A)"
                          className="flex-1 h-6 text-xs"
                        />
                        <Input
                          value={zone.code}
                          onChange={e => updateZone(floor.id, zone.id, 'code', e.target.value)}
                          placeholder="Mã"
                          className="w-20 h-6 text-xs font-mono"
                        />
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeZone(floor.id, zone.id)} className="h-6 w-6 p-0">
                          <Trash2 size={10} className="text-red-300" />
                        </Button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addZone(floor.id)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 py-0.5 pl-1 transition-colors"
                    >
                      <Plus size={11} /> Thêm khu vực
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" onClick={addFloor} className="w-full gap-2 border-dashed text-gray-500 h-9">
              <Plus size={14} /> Thêm tầng
            </Button>

            <div className="flex justify-between gap-2 pt-2 border-t border-gray-100">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>← Quay lại</Button>
              <Button type="button" onClick={handleCreate} disabled={setupMutation.isPending}>
                {setupMutation.isPending ? 'Đang tạo...' : `Tạo Mall${floors.filter(f => f.level && f.name).length > 0 ? ` + ${floors.filter(f => f.level && f.name).length} tầng` : ''}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MallFormDialog({ open, mall, onClose }: { open: boolean; mall?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    if (open) reset(mall ? { name: mall.name, code: mall.code, address: mall.address, city: mall.city, totalArea: mall.totalArea, description: mall.description } : { name: '', code: '', address: '', city: '', totalArea: '', description: '' });
  }, [open, mall]);

  const mutation = useMutation({
    mutationFn: (data: any) => {
      const payload = { ...data, totalArea: data.totalArea ? Number(data.totalArea) : undefined };
      return mall ? spacesApi.updateMall(mall.id, payload) : spacesApi.createMall(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['malls'] });
      toast({ title: mall ? 'Đã cập nhật Mall' : 'Đã tạo Mall mới' });
      reset();
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{mall ? 'Chỉnh sửa Mall' : 'Tạo Mall mới'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Tên Mall *</Label><Input {...register('name', { required: true })} placeholder="THISO Mall Sala" className="mt-1" /></div>
            <div><Label>Mã Mall *</Label><Input {...register('code', { required: true })} placeholder="THISO-SALA" className="mt-1" /></div>
            <div className="col-span-2"><Label>Địa chỉ</Label><Input {...register('address')} placeholder="10 Mai Chi Tho..." className="mt-1" /></div>
            <div><Label>Thành phố</Label><Input {...register('city')} placeholder="Hồ Chí Minh" className="mt-1" /></div>
            <div><Label>Tổng diện tích (m²)</Label><Input {...register('totalArea')} type="number" placeholder="45000" className="mt-1" /></div>
            <div className="col-span-2"><Label>Mô tả</Label><Input {...register('description')} placeholder="Mô tả ngắn về mall..." className="mt-1" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending}>{mall ? 'Lưu' : 'Tạo Mall'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MallsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editMall, setEditMall] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const { data, isLoading } = useQuery({ queryKey: ['malls'], queryFn: spacesApi.listMalls });
  const malls: any[] = data?.data ?? data ?? [];

  const deleteMutation = useMutation({
    mutationFn: () => spacesApi.deleteMall(confirmDelete.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['malls'] }); toast({ title: 'Đã xóa Mall' }); setConfirmDelete(null); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  return (
    <div>
      <div className="flex justify-end mb-5">
        <Button onClick={() => setShowCreate(true)} className="gap-2"><Plus size={15} /> Thêm Mall</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {malls.map((m) => (
            <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-200 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2.5 rounded-xl">
                    <Building2 size={18} className="text-gray-700" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{m.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{m.code}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditMall(m)}>
                    <Pencil size={13} className="text-gray-400" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setConfirmDelete(m)}>
                    <Trash2 size={13} className="text-red-400" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="font-bold text-gray-900">{m._count?.units ?? 0}</div>
                  <div className="text-xs text-gray-500">Lô</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="font-bold text-gray-900">{m._count?.floors ?? 0}</div>
                  <div className="text-xs text-gray-500">Tầng</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="font-bold text-gray-900">{m.totalArea ? `${(m.totalArea / 1000).toFixed(0)}k` : '—'}</div>
                  <div className="text-xs text-gray-500">m²</div>
                </div>
              </div>
              {m.address && (
                <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-400">
                  <MapPin size={12} />{m.address}
                  {m.city && `, ${m.city}`}
                </div>
              )}
            </div>
          ))}
          {malls.length === 0 && (
            <div className="col-span-2 text-center py-16 text-gray-400">
              <Building2 size={40} className="mx-auto mb-2 opacity-20" />
              <p>Chưa có Mall nào. Tạo Mall đầu tiên!</p>
            </div>
          )}
        </div>
      )}

      <MallCreateWizard open={showCreate} onClose={() => setShowCreate(false)} />
      <MallFormDialog open={!!editMall} mall={editMall} onClose={() => setEditMall(null)} />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Xóa Mall"
        message={`Xóa Mall "${confirmDelete?.name}"? Dữ liệu liên quan (tầng, zone, lô) sẽ không bị xóa nhưng sẽ không hiển thị.`}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmDelete(null)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ─── Tab 3: Space Structure ───────────────────────────────────────────────────

function ZoneRow({ zone, onEdit, onDelete }: { zone: any; onEdit: () => void; onDelete: () => void }) {
  const unitCount = zone._count?.units ?? 0;
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 ml-6 rounded-lg hover:bg-gray-50 group">
      <SquareStack size={12} className="text-blue-400 shrink-0" />
      <span className="text-sm text-gray-700 flex-1">{zone.name}</span>
      {zone.code && <span className="text-xs text-gray-400 font-mono">{zone.code}</span>}
      <span className={`text-xs px-1.5 py-0.5 rounded-full ${unitCount > 0 ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
        {unitCount} mặt bằng
      </span>
      <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEdit}><Pencil size={11} className="text-gray-400" /></Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={onDelete}
          disabled={unitCount > 0}
          title={unitCount > 0 ? `Không thể xoá: còn ${unitCount} mặt bằng đang hoạt động` : undefined}
        >
          <Trash2 size={11} className={unitCount > 0 ? 'text-gray-200' : 'text-red-400'} />
        </Button>
      </div>
    </div>
  );
}

function FloorSection({ floor, mallId, zones, onZoneChange }: {
  floor: any; mallId: string; zones: any[]; onZoneChange: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { setSelectedMall } = useMallStore();
  const floorUnitCount = floor._count?.units ?? 0;
  const [expanded, setExpanded] = useState(true);
  const [showAddZone, setShowAddZone] = useState(false);
  const [editZone, setEditZone] = useState<any>(null);
  const [confirmDeleteZone, setConfirmDeleteZone] = useState<any>(null);
  const [showEditFloor, setShowEditFloor] = useState(false);
  const [confirmDeleteFloor, setConfirmDeleteFloor] = useState(false);
  const { register, handleSubmit, reset } = useForm();
  const editFloorForm = useForm();

  useEffect(() => {
    if (showEditFloor) {
      editFloorForm.reset({ name: floor.name, level: floor.level, sortOrder: floor.sortOrder });
    }
  }, [showEditFloor, floor.id]);

  const floorZones = zones.filter((z) => z.floor?.id === floor.id);

  const createZoneMutation = useMutation({
    mutationFn: (d: any) => spacesApi.createZone({ mallId, floorId: floor.id, ...d }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zones', mallId] }); toast({ title: 'Đã tạo khu vực' }); setShowAddZone(false); reset(); onZoneChange(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const updateZoneMutation = useMutation({
    mutationFn: (d: any) => spacesApi.updateZone(editZone.id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zones', mallId] }); toast({ title: 'Đã cập nhật khu vực' }); setEditZone(null); reset(); onZoneChange(); },
  });

  const deleteZoneMutation = useMutation({
    mutationFn: () => spacesApi.deleteZone(confirmDeleteZone.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zones', mallId] }); toast({ title: 'Đã xóa khu vực' }); setConfirmDeleteZone(null); onZoneChange(); },
  });

  const updateFloorMutation = useMutation({
    mutationFn: (d: any) => spacesApi.updateFloor(floor.id, { ...d, sortOrder: Number(d.sortOrder) || 0 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['floors', mallId] }); toast({ title: 'Đã cập nhật tầng' }); setShowEditFloor(false); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi cập nhật tầng', variant: 'destructive' }),
  });

  const deleteFloorMutation = useMutation({
    mutationFn: () => spacesApi.deleteFloor(floor.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['floors', mallId] }); toast({ title: 'Đã xóa tầng' }); setConfirmDeleteFloor(false); },
  });

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden mb-2">
      {/* Floor header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 flex-1 text-left">
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          <span className="text-xs font-bold px-2 py-0.5 bg-slate-700 text-white rounded">{floor.level}</span>
          <span className="text-sm font-medium text-gray-800">{floor.name}</span>
          <span className="text-xs text-gray-400">({floorZones.length} khu vực)</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${floorUnitCount > 0 ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
            {floorUnitCount} mặt bằng
          </span>
        </button>
        <div className="flex gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-gray-500"
            title="Xem và quản lý mặt bằng của tầng này trong Spaces"
            onClick={() => {
              setSelectedMall(mallId);
              navigate(`/spaces?floor=${floor.id}`);
            }}
          >
            <ExternalLink size={11} /> Xem trong Spaces
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setShowAddZone(true)}>
            <Plus size={11} /> Zone
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setShowEditFloor(true)}>
            <Pencil size={11} className="text-gray-400" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setConfirmDeleteFloor(true)}
            disabled={floorUnitCount > 0}
            title={floorUnitCount > 0 ? `Không thể xoá: còn ${floorUnitCount} mặt bằng đang hoạt động` : undefined}
          >
            <Trash2 size={11} className={floorUnitCount > 0 ? 'text-gray-200' : 'text-red-400'} />
          </Button>
        </div>
      </div>

      {/* Zones */}
      {expanded && (
        <div className="py-1">
          {floorZones.length === 0 && (
            <div className="text-xs text-gray-400 px-9 py-2">Chưa có khu vực nào</div>
          )}
          {floorZones.map((zone) => (
            <ZoneRow
              key={zone.id}
              zone={zone}
              onEdit={() => setEditZone(zone)}
              onDelete={() => setConfirmDeleteZone(zone)}
            />
          ))}

          {(showAddZone || editZone) && (
            <form
              onSubmit={handleSubmit((d) => editZone ? updateZoneMutation.mutate(d) : createZoneMutation.mutate(d))}
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 mx-2 rounded-lg mt-1"
            >
              <Input {...register('name', { required: true })} defaultValue={editZone?.name} placeholder="Tên khu vực" className="h-7 text-xs" />
              <Input {...register('code')} defaultValue={editZone?.code} placeholder="Mã (tùy chọn)" className="h-7 text-xs w-28" />
              <Button size="sm" type="submit" className="h-7 text-xs px-3" disabled={createZoneMutation.isPending || updateZoneMutation.isPending}>
                {editZone ? 'Lưu' : 'Thêm'}
              </Button>
              <Button size="sm" type="button" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setShowAddZone(false); setEditZone(null); reset(); }}>
                Hủy
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Dialogs */}
      {showEditFloor && (
        <Dialog open onOpenChange={() => setShowEditFloor(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Chỉnh sửa tầng</DialogTitle></DialogHeader>
            <form onSubmit={editFloorForm.handleSubmit((d) => updateFloorMutation.mutate(d))} className="space-y-3">
              <div><Label>Tên tầng</Label><Input {...editFloorForm.register('name')} className="mt-1" /></div>
              <div><Label>Ký hiệu tầng</Label><Input {...editFloorForm.register('level')} placeholder="GF / L1 / B1" className="mt-1" /></div>
              <div><Label>Thứ tự sắp xếp</Label><Input {...editFloorForm.register('sortOrder')} type="number" className="mt-1" /></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowEditFloor(false)}>Hủy</Button>
                <Button type="submit" disabled={updateFloorMutation.isPending}>Lưu</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
      <ConfirmDialog open={confirmDeleteFloor} title="Xóa tầng" message={`Xóa tầng "${floor.name}"?`} onConfirm={() => deleteFloorMutation.mutate()} onCancel={() => setConfirmDeleteFloor(false)} loading={deleteFloorMutation.isPending} />
      <ConfirmDialog open={!!confirmDeleteZone} title="Xóa khu vực" message={`Xóa khu vực "${confirmDeleteZone?.name}"?`} onConfirm={() => deleteZoneMutation.mutate()} onCancel={() => setConfirmDeleteZone(null)} loading={deleteZoneMutation.isPending} />
    </div>
  );
}

function SpaceStructureTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const selectedMallId = useMallStore((state) => state.selectedMallId) || '';
  const selectedMallName = useMallStore((state) => state.selectedMallName);
  const openMallContextModal = useMallStore((state) => state.openMallContextModal);
  const [showAddFloor, setShowAddFloor] = useState(false);
  const { register, handleSubmit, reset } = useForm();

  const { data: floorsData } = useQuery({
    queryKey: ['floors', selectedMallId],
    queryFn: () => spacesApi.listFloors(selectedMallId),
    enabled: !!selectedMallId,
  });
  const floors: any[] = floorsData?.data ?? floorsData ?? [];

  const { data: zonesData, refetch: refetchZones } = useQuery({
    queryKey: ['zones', selectedMallId],
    queryFn: () => spacesApi.listZones({ mallId: selectedMallId }),
    enabled: !!selectedMallId,
  });
  const zones: any[] = zonesData?.data ?? zonesData ?? [];

  const createFloorMutation = useMutation({
    mutationFn: (d: any) => spacesApi.createFloor({ mallId: selectedMallId, ...d, sortOrder: Number(d.sortOrder) || 0 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['floors', selectedMallId] }); toast({ title: 'Đã tạo tầng' }); setShowAddFloor(false); reset(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const sortedFloors = [...floors].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <Label className="shrink-0 text-sm">Mall hiện tại:</Label>
        <div className="rounded-lg border bg-gray-50 px-3 py-2 text-sm">{selectedMallName}</div>
        <Button
          onClick={() => selectedMallId ? setShowAddFloor(true) : openMallContextModal()}
          className="gap-2 ml-auto"
        ><Plus size={15} /> Thêm tầng</Button>
      </div>

      {/* Add floor form */}
      {showAddFloor && (
        <form onSubmit={handleSubmit((d) => createFloorMutation.mutate(d))} className="flex items-end gap-3 mb-4 p-4 bg-gray-50 rounded-xl">
          <div className="flex-1"><Label className="text-xs">Tên tầng</Label><Input {...register('name', { required: true })} placeholder="Tầng Trệt" className="mt-1" /></div>
          <div className="w-24"><Label className="text-xs">Ký hiệu</Label><Input {...register('level', { required: true })} placeholder="GF" className="mt-1" /></div>
          <div className="w-24"><Label className="text-xs">Thứ tự</Label><Input {...register('sortOrder')} type="number" placeholder="0" className="mt-1" /></div>
          <Button type="submit" disabled={createFloorMutation.isPending}>Thêm</Button>
          <Button type="button" variant="outline" onClick={() => { setShowAddFloor(false); reset(); }}>Hủy</Button>
        </form>
      )}

      {/* Floor tree */}
      {sortedFloors.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Layers size={40} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm">{selectedMallId ? 'Chưa có tầng nào. Thêm tầng đầu tiên!' : 'Chọn Mall để xem cấu trúc'}</p>
        </div>
      ) : (
        sortedFloors.map((floor) => (
          <FloorSection key={floor.id} floor={floor} mallId={selectedMallId} zones={zones} onZoneChange={() => refetchZones()} />
        ))
      )}
    </div>
  );
}

// ─── Tab 4: Permissions Matrix ────────────────────────────────────────────────

function PermissionsTab() {
  const { t } = useTranslation('admin');
  const roles = ROLE_KEYS;
  return (
    <div>
      <div className="mb-3 flex items-start gap-2 border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <Info size={14} className="shrink-0" />
        {t('readOnlyNote')}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left px-3 py-2.5 bg-gray-50 border-b border-r font-medium text-gray-600 sticky left-0 z-10 min-w-36">{t('permissions.feature')}</th>
              {roles.map((role) => {
                const r = ROLE_MAP[role];
                return (
                  <th key={role} className="px-2 py-2.5 bg-gray-50 border-b border-r font-medium text-center min-w-20">
                    <div className={`text-xs px-1.5 py-0.5 rounded-full ${r.color} whitespace-nowrap`}>{t(adminRoleTranslationKey(role))}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((perm, i) => (
              <tr key={perm.module} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="px-3 py-2 border-b border-r font-medium text-gray-700 sticky left-0 bg-inherit">{perm.label}</td>
                {roles.map((role) => {
                  const hasAccess = perm.roles.includes(role);
                  return (
                    <td key={role} className="px-2 py-2 border-b border-r text-center">
                      {hasAccess
                        ? <CheckCircle size={15} className="text-green-500 mx-auto" />
                        : <XCircle size={15} className="text-gray-200 mx-auto" />
                      }
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role descriptions */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        {ROLE_KEYS.map((k) => {
          const r = ROLE_MAP[k];
          return (
            <div key={k} className="flex items-start gap-2.5 p-3 bg-white border border-gray-100 rounded-xl">
              <Badge className={`${r.color} border-0 shrink-0 mt-0.5`}>{t(adminRoleTranslationKey(k))}</Badge>
              <p className="text-xs text-gray-500">{t(`users.roleDescriptions.${k}`, { defaultValue: r.desc })}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Branding: logo + ảnh nền màn hình đăng nhập ──────────────────────────────

function BrandingCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const { data: branding } = useQuery({ queryKey: ['branding-settings'], queryFn: brandingApi.getSettings });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['branding-settings'] });

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return brandingApi.uploadLogo(fd);
    },
    onSuccess: () => { invalidate(); toast({ title: 'Đã cập nhật logo' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi upload logo', variant: 'destructive' }),
  });

  const uploadBgMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return brandingApi.uploadBackground(fd);
    },
    onSuccess: () => { invalidate(); toast({ title: 'Đã cập nhật ảnh nền' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi upload ảnh nền', variant: 'destructive' }),
  });

  const removeLogoMutation = useMutation({
    mutationFn: brandingApi.removeLogo,
    onSuccess: () => { invalidate(); toast({ title: 'Đã xoá logo' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể xoá logo', variant: 'destructive' }),
  });

  const removeBgMutation = useMutation({
    mutationFn: brandingApi.removeBackground,
    onSuccess: () => { invalidate(); toast({ title: 'Đã xoá ảnh nền' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Không thể xoá ảnh nền', variant: 'destructive' }),
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="font-semibold text-gray-900 text-sm mb-1">Thương hiệu</h3>
      <p className="text-xs text-gray-500 mb-3">Logo và ảnh nền hiển thị ở màn hình đăng nhập</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-gray-500 mb-2">Logo công ty</div>
          <div className="h-24 bg-gray-900 rounded-lg flex items-center justify-center mb-2 overflow-hidden">
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="Logo" className="max-h-20 max-w-full object-contain" />
            ) : (
              <span className="text-xs text-gray-500">Chưa có logo — dùng mặc định THISO</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => logoInputRef.current?.click()} disabled={uploadLogoMutation.isPending}>
              Upload
            </Button>
            {branding?.logoUrl && (
              <Button size="sm" variant="outline" className="text-red-600" onClick={() => removeLogoMutation.mutate()}>
                Xoá
              </Button>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadLogoMutation.mutate(file);
              e.target.value = '';
            }}
          />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-2">Ảnh nền màn hình đăng nhập</div>
          <div
            className="h-24 bg-gray-900 rounded-lg flex items-center justify-center mb-2 overflow-hidden bg-cover bg-center"
            style={branding?.backgroundUrl ? { backgroundImage: `url(${branding.backgroundUrl})` } : undefined}
          >
            {!branding?.backgroundUrl && <span className="text-xs text-gray-500">Chưa có ảnh nền</span>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => bgInputRef.current?.click()} disabled={uploadBgMutation.isPending}>
              Upload
            </Button>
            {branding?.backgroundUrl && (
              <Button size="sm" variant="outline" className="text-red-600" onClick={() => removeBgMutation.mutate()}>
                Xoá
              </Button>
            )}
          </div>
          <input
            ref={bgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadBgMutation.mutate(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main AdminPage ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'users',       labelKey: 'tabs.users',       icon: Users },
  { id: 'malls',       labelKey: 'tabs.malls',       icon: Building2 },
  { id: 'mall-access', labelKey: 'tabs.mallAccess',  icon: Shield },
  { id: 'structure',   labelKey: 'tabs.structure',   icon: Layers },
  { id: 'categories',  labelKey: 'tabs.categories',  icon: SquareStack },
  { id: 'permissions', labelKey: 'tabs.permissions', icon: Shield },
  { id: 'approval',    labelKey: 'tabs.approval',    icon: GitBranch },
  { id: 'system',      labelKey: 'tabs.system',      icon: Settings },
];

const TAB_GROUPS = [
  { labelKey: 'tabGroups.userAccess', ids: ['users', 'mall-access', 'permissions'] },
  { labelKey: 'tabGroups.orgMall', ids: ['malls', 'structure'] },
  { labelKey: 'tabGroups.categories', ids: ['categories'] },
  { labelKey: 'tabGroups.process', ids: ['approval'] },
  { labelKey: 'tabGroups.platform', ids: ['system'] },
];

export default function AdminPage() {
  const { t } = useTranslation('admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('section');
  const activeTab = TABS.some((tab) => tab.id === requestedSection) ? requestedSection! : 'users';
  const selectTab = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        className="mb-4 border-b border-slate-200 pb-4"
        eyebrow={t('erpControlCenter')}
        title={t('systemConfig')}
        description={t('systemConfigDesc')}
        actions={<Badge variant="outline" className="hidden gap-1.5 text-xs sm:inline-flex"><Shield size={12} /> {t('superAdmin')}</Badge>}
      />

      {/* Mobile select */}
      <label htmlFor="admin-section" className="sr-only">Chọn khu vực cấu hình</label>
      <select
        id="admin-section"
        value={activeTab}
        onChange={(event) => selectTab(event.target.value)}
        className="mb-4 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm sm:hidden"
      >
        {TABS.map((tab) => <option key={tab.id} value={tab.id}>{t(tab.labelKey)}</option>)}
      </select>

      {/* Sidebar + content */}
      <div className="flex min-h-0 flex-1 gap-5 overflow-hidden">
        {/* Sidebar */}
        <nav className="hidden w-52 shrink-0 flex-col overflow-y-auto border-r border-slate-200 pr-3 sm:flex">
          {TAB_GROUPS.map((group) => (
            <div key={group.labelKey} className="mb-4">
              <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t(group.labelKey)}</div>
              <div className="flex flex-col gap-0.5">
                {TABS.filter((tab) => group.ids.includes(tab.id)).map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => selectTab(tab.id)}
                      aria-current={activeTab === tab.id ? 'page' : undefined}
                      className={`flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm font-medium transition-all text-left ${
                        activeTab === tab.id
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                      }`}
                    >
                      <Icon size={15} />
                      <span>{t(tab.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <div className="mb-3 border-b border-slate-200 pb-3">
            <p className="text-sm font-semibold text-slate-900">{t(TABS.find((tab) => tab.id === activeTab)?.labelKey ?? '')}</p>
            <p className="mt-0.5 text-xs text-slate-600">{t(`tabDescriptions.${activeTab}`)}</p>
          </div>

          <div className="flex-1 overflow-auto">
            {activeTab === 'users'       && <UsersTab />}
            {activeTab === 'malls'       && <MallsTab />}
            {activeTab === 'mall-access' && <MallAccessTab />}
            {activeTab === 'structure'   && <SpaceStructureTab />}
            {activeTab === 'categories'  && <CategoriesTab />}
            {activeTab === 'permissions' && <PermissionsTab />}
            {activeTab === 'approval'    && <ApprovalPolicyTab />}
            {activeTab === 'system'      && <div className="space-y-5"><BrandingCard /><OperationalSystemTab /></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
