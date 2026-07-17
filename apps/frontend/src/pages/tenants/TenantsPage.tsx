import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { tenantsApi } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  Search, Building2, Phone, Mail, FileText, Receipt, Ticket,
  Plus, Edit2, Globe, Shield, MapPin, Hash, User, X,
  TrendingUp, CheckCircle, Clock, XCircle, AlertCircle,
  ChevronRight, CalendarDays, Banknote, MoreHorizontal,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string; emoji: string }> = {
  FB:            { label: 'F&B',           color: 'bg-orange-100 text-orange-700 border-orange-200', emoji: '🍜' },
  FASHION:       { label: 'Thời trang',    color: 'bg-pink-100 text-pink-700 border-pink-200',       emoji: '👗' },
  ENTERTAINMENT: { label: 'Giải trí',      color: 'bg-purple-100 text-purple-700 border-purple-200', emoji: '🎮' },
  SERVICES:      { label: 'Dịch vụ',       color: 'bg-blue-100 text-blue-700 border-blue-200',       emoji: '⚙️' },
  EDUCATION:     { label: 'Giáo dục',      color: 'bg-green-100 text-green-700 border-green-200',    emoji: '📚' },
  HEALTH:        { label: 'Sức khoẻ',      color: 'bg-red-100 text-red-700 border-red-200',          emoji: '🏥' },
  RETAIL:        { label: 'Bán lẻ',        color: 'bg-yellow-100 text-yellow-700 border-yellow-200', emoji: '🛍️' },
};

const CONTRACT_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  ACTIVE:           { label: 'Hiệu lực',     color: 'text-green-700', dot: 'bg-green-500'  },
  EXPIRING:         { label: 'Sắp HH',       color: 'text-orange-600', dot: 'bg-orange-400' },
  PENDING_SIGNATURE:{ label: 'Chờ ký',       color: 'text-blue-600',  dot: 'bg-blue-400'   },
  DRAFT:            { label: 'Draft',         color: 'text-gray-500',  dot: 'bg-gray-300'   },
  TERMINATED:       { label: 'Đã chấm dứt',  color: 'text-red-500',   dot: 'bg-red-400'    },
  EXPIRED:          { label: 'Hết hạn',       color: 'text-red-400',   dot: 'bg-red-300'    },
};

const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  PAID:           { label: 'Đã TT',      color: 'bg-green-100 text-green-700' },
  OVERDUE:        { label: 'Quá hạn',    color: 'bg-red-100 text-red-700' },
  ISSUED:         { label: 'Đã gửi',     color: 'bg-blue-100 text-blue-700' },
  PARTIALLY_PAID: { label: 'Một phần',   color: 'bg-amber-100 text-amber-700' },
  DRAFT:          { label: 'Nháp',       color: 'bg-gray-100 text-gray-600' },
};

function fmtMoney(n?: number | null) {
  if (!n) return '—';
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', style: 'currency', currency: 'VND' }).format(n);
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
  isPortalUser: false,
};

function TenantFormDialog({ open, onClose, tenant }: { open: boolean; onClose: () => void; tenant?: any }) {
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

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => tenant
      ? tenantsApi.updateTenant(tenant.id, form)
      : tenantsApi.createTenant(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      if (tenant) qc.invalidateQueries({ queryKey: ['tenant', tenant.id] });
      toast({ title: tenant ? 'Đã cập nhật khách thuê' : 'Đã tạo khách thuê mới' });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tenant ? 'Chỉnh sửa khách thuê' : 'Thêm khách thuê mới'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Thương hiệu *</label>
              <Input value={form.brandName} onChange={(e) => set('brandName', e.target.value)} placeholder="VD: Highlands Coffee" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tên công ty</label>
              <Input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Công ty TNHH..." />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Mã số thuế</label>
              <Input value={form.taxCode} onChange={(e) => set('taxCode', e.target.value)} placeholder="0123456789" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ngành</label>
              <select className="w-full border rounded-md h-9 px-2 text-sm" value={form.category}
                onChange={(e) => set('category', e.target.value)}>
                <option value="">-- Chọn ngành --</option>
                {Object.entries(CATEGORY_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.emoji} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Người liên hệ</label>
              <Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email liên hệ</label>
              <Input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Điện thoại</label>
              <Input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Địa chỉ</label>
              <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
          </div>
          <div className="border-t pt-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
              <input type="checkbox" checked={form.isPortalUser} onChange={(e) => set('isPortalUser', e.target.checked)} />
              Khách thuê có quyền truy cập Tenant Portal
            </label>
            {form.isPortalUser && (
              <p className="text-xs text-gray-500 mt-2">
                Để cấp đăng nhập thật, vào <strong>Quản trị → Tài khoản</strong>, tạo tài khoản vai trò "Khách thuê" và liên kết với khách thuê này.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Hủy</Button>
            <Button disabled={!form.brandName || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Đang lưu...' : (tenant ? 'Cập nhật' : 'Tạo khách thuê')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Tenant Detail Panel ───────────────────────────────────────────────────────

function TenantDetailPanel({ tenantId, onEdit, onClose }: {
  tenantId: string; onEdit: () => void; onClose: () => void;
}) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => tenantsApi.getTenant(tenantId),
    enabled: !!tenantId,
  });

  const t = data;
  const contracts: any[] = t?.contracts ?? [];
  const invoices: any[] = t?.invoices ?? [];
  const tickets: any[] = t?.tickets ?? [];
  const units: any[] = t?.occupiedUnits ?? [];

  const activeContract = contracts.find((c: any) => c.status === 'ACTIVE' || c.status === 'EXPIRING');
  const overdueInvoices = invoices.filter((i: any) => i.status === 'OVERDUE');
  const monthlyRent = activeContract ? (activeContract.rent ?? 0) + (activeContract.cam ?? 0) : 0;

  const catMeta = t?.category ? CATEGORY_META[t.category] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
              {t?.brandName?.[0] ?? '?'}
            </div>
            <div>
              {isLoading ? <Skeleton className="h-6 w-40 mb-1" /> : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-gray-900">{t?.brandName}</h2>
                  {catMeta && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${catMeta.color}`}>
                      {catMeta.emoji} {catMeta.label}
                    </span>
                  )}
                  {t?.isPortalUser && (
                    <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <Globe size={10} /> Portal
                    </span>
                  )}
                </div>
              )}
              {isLoading ? <Skeleton className="h-4 w-56" /> : (
                <p className="text-sm text-gray-500 mt-0.5">{t?.companyName ?? '—'}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5 h-8">
              <Edit2 size={12} /> Sửa
            </Button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X size={16} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-gray-800">{t?._count?.contracts ?? contracts.length}</div>
            <div className="text-xs text-gray-400 mt-0.5">Hợp đồng</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-blue-700">{fmtMoney(monthlyRent)}</div>
            <div className="text-xs text-gray-400 mt-0.5">Thuê/tháng</div>
          </div>
          <div className={`border rounded-xl p-3 text-center ${overdueInvoices.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
            <div className={`text-lg font-bold ${overdueInvoices.length > 0 ? 'text-red-600' : 'text-gray-800'}`}>
              {overdueInvoices.length}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">Quá hạn</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-gray-800">{units.length}</div>
            <div className="text-xs text-gray-400 mt-0.5">Mặt bằng</div>
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
              <TabsTrigger value="info">Thông tin</TabsTrigger>
              <TabsTrigger value="contracts">HĐ ({contracts.length})</TabsTrigger>
              <TabsTrigger value="invoices">HĐon ({invoices.length})</TabsTrigger>
              <TabsTrigger value="tickets">YC ({tickets.length})</TabsTrigger>
              <TabsTrigger value="portal">Portal</TabsTrigger>
            </TabsList>

            {/* Tab: Thông tin */}
            <TabsContent value="info" className="space-y-4">
              <div className="space-y-2.5">
                {t?.contactName && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <User size={13} className="text-gray-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Người liên hệ</div>
                      <div className="text-sm font-medium text-gray-800">{t.contactName}</div>
                    </div>
                  </div>
                )}
                {t?.contactPhone && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <Phone size={13} className="text-blue-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Điện thoại</div>
                      <a href={`tel:${t.contactPhone}`} className="text-sm font-medium text-blue-600 hover:underline">{t.contactPhone}</a>
                    </div>
                  </div>
                )}
                {t?.contactEmail && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <Mail size={13} className="text-blue-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Email</div>
                      <a href={`mailto:${t.contactEmail}`} className="text-sm font-medium text-blue-600 hover:underline">{t.contactEmail}</a>
                    </div>
                  </div>
                )}
                {t?.taxCode && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <Hash size={13} className="text-gray-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Mã số thuế</div>
                      <div className="text-sm font-medium text-gray-800 font-mono">{t.taxCode}</div>
                    </div>
                  </div>
                )}
                {t?.address && (
                  <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin size={13} className="text-gray-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Địa chỉ</div>
                      <div className="text-sm text-gray-700">{t.address}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mặt bằng đang thuê */}
              {units.length > 0 && (
                <div className="border-t pt-4">
                  <div className="text-xs font-bold tracking-wider text-gray-400 mb-2 uppercase">Mặt bằng đang thuê</div>
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
                  <p className="text-sm">Chưa có hợp đồng</p>
                </div>
              ) : contracts.map((c: any) => {
                const cs = CONTRACT_STATUS[c.status] ?? { label: c.status, color: 'text-gray-500', dot: 'bg-gray-300' };
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
                            {cs.label}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-gray-800 mt-0.5">{c.unit?.code}</div>
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <CalendarDays size={10} />
                          {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
                          {days !== null && days <= 90 && days > 0 && (
                            <span className={`ml-1 font-medium ${days <= 30 ? 'text-red-500' : 'text-orange-500'}`}>
                              (còn {days}n)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-gray-800">
                          {new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(c.rent)}đ
                        </div>
                        <div className="text-xs text-gray-400">/tháng</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" size="sm" className="w-full gap-1.5 mt-2 text-xs h-8"
                onClick={() => navigate('/contracts')}>
                <ChevronRight size={12} /> Xem toàn bộ hợp đồng
              </Button>
            </TabsContent>

            {/* Tab: Hóa đơn */}
            <TabsContent value="invoices" className="space-y-2">
              {invoices.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Receipt size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Chưa có hóa đơn</p>
                </div>
              ) : invoices.slice(0, 10).map((inv: any) => {
                const is = INVOICE_STATUS[inv.status] ?? { label: inv.status, color: 'bg-gray-100 text-gray-600' };
                return (
                  <div key={inv.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">{inv.invoiceNumber}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${is.color}`}>{is.label}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <Clock size={10} /> {inv.period} · Hạn {fmtDate(inv.dueDate)}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-gray-800">
                      {new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(inv.totalAmount)}đ
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" size="sm" className="w-full gap-1.5 mt-2 text-xs h-8"
                onClick={() => navigate('/billing')}>
                <ChevronRight size={12} /> Xem toàn bộ hóa đơn
              </Button>
            </TabsContent>

            {/* Tab: Tickets */}
            <TabsContent value="tickets" className="space-y-2">
              {tickets.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Ticket size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Chưa có yêu cầu hỗ trợ</p>
                </div>
              ) : tickets.map((tk: any) => (
                <div key={tk.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                  <div>
                    <div className="font-mono text-xs text-gray-500">{tk.ticketNumber}</div>
                    <div className="text-sm text-gray-700 mt-0.5">{tk.subject ?? tk.title}</div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{tk.status}</Badge>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full gap-1.5 mt-2 text-xs h-8"
                onClick={() => navigate('/tickets')}>
                <ChevronRight size={12} /> Xem toàn bộ tickets
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
                    <div className="text-sm font-semibold text-gray-800">Tenant Portal</div>
                    <div className="text-xs text-gray-400">Quyền truy cập hệ thống</div>
                  </div>
                  <div className="ml-auto">
                    {t?.isPortalUser
                      ? <Badge className="bg-green-100 text-green-700 border-0 gap-1"><CheckCircle size={10} />Đã cấp</Badge>
                      : <Badge variant="outline" className="text-gray-400 gap-1"><XCircle size={10} />Chưa cấp</Badge>
                    }
                  </div>
                </div>
                {t?.isPortalUser ? (
                  <p className="text-xs text-gray-500 border-t pt-3">
                    Để cấp đăng nhập, vào <strong>Quản trị → Tài khoản</strong>, tạo tài khoản vai trò "Khách thuê" và liên kết với khách thuê này.
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 border-t pt-3">
                    Bật quyền Portal trong phần Chỉnh sửa, sau đó tạo tài khoản đăng nhập trong Quản trị → Tài khoản.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

// ── Tenant Card ───────────────────────────────────────────────────────────────

function TenantCard({ t, selected, onSelect, onEdit }: {
  t: any; selected: boolean; onSelect: () => void; onEdit: (e: React.MouseEvent) => void;
}) {
  const catMeta = t.category ? CATEGORY_META[t.category] : null;
  const activeContract = t.contracts?.find((c: any) => c.status === 'ACTIVE' || c.status === 'EXPIRING');
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
          selected ? 'bg-blue-600' : 'bg-gradient-to-br from-gray-400 to-gray-600'
        }`}>
          {t.brandName?.[0] ?? '?'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm truncate">{t.brandName}</span>
            {catMeta && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full border ${catMeta.color}`}>
                {catMeta.emoji}
              </span>
            )}
            {t.isPortalUser && <Globe size={11} className="text-blue-400 shrink-0" />}
          </div>

          {t.companyName && (
            <div className="text-xs text-gray-400 mt-0.5 truncate">{t.companyName}</div>
          )}

          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
            <span className="flex items-center gap-0.5">
              <FileText size={10} /> {t._count?.contracts ?? 0} HĐ
            </span>
            <span className="flex items-center gap-0.5">
              <Receipt size={10} /> {t._count?.invoices ?? 0} HĐon
            </span>
            {cs && activeContract && (
              <span className={`flex items-center gap-1 font-medium ${cs.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cs.dot}`} />
                {cs.label}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Edit2 size={12} className="text-gray-400" />
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTenant, setEditTenant] = useState<any>(null);

  useEffect(() => { setPage(1); }, [search, category]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tenants', search, category, page],
    queryFn: () => tenantsApi.listTenants({ search: search || undefined, category: category || undefined, page, limit: 25 }),
  });

  const tenants: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = data?.totalPages ?? 1;

  const openEdit = useCallback((t: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditTenant(t);
    setShowForm(true);
  }, []);
  const closeForm = useCallback(() => { setShowForm(false); setEditTenant(null); }, []);

  const selectedTenant = tenants.find((t) => t.id === selectedId);

  // Stats
  const activeCount = tenants.filter((t) => t.contracts?.some((c: any) => c.status === 'ACTIVE')).length;

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
              <h1 className="text-xl font-bold text-gray-900">Khách thuê</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {total} khách · {activeCount} đang thuê
              </p>
            </div>
            <Button size="sm" className="gap-1.5 h-8 text-xs shrink-0"
              onClick={() => { setEditTenant(null); setShowForm(true); }}>
              <Plus size={13} /> Thêm mới
            </Button>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm thương hiệu, công ty..."
                className="pl-8 h-8 text-sm" />
            </div>
            <select className="border rounded-lg h-8 px-2 text-xs min-w-24 bg-white"
              value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Tất cả</option>
              {Object.entries(CATEGORY_META).map(([k, v]) => (
                <option key={k} value={k}>{v.emoji} {v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
          ) : isError ? (
            <div role="alert" className="text-center py-16 px-4">
              <Building2 size={40} className="mx-auto mb-2 text-red-300" />
              <p className="text-sm font-medium text-red-700">Không thể tải danh sách khách thuê</p>
              <p className="mt-1 text-xs text-red-600">Vui lòng kiểm tra kết nối và thử lại.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>Thử lại</Button>
            </div>
          ) : tenants.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Building2 size={40} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium text-gray-600">{search || category ? 'Không có khách thuê phù hợp' : 'Chưa có khách thuê nào'}</p>
              <p className="mt-1 text-xs">{search || category ? 'Thử thay đổi từ khóa hoặc ngành hàng.' : 'Thêm khách thuê đầu tiên để quản lý hồ sơ và hợp đồng.'}</p>
              {search || category ? (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { setSearch(''); setCategory(''); setPage(1); }}>Xóa bộ lọc</Button>
              ) : (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { setEditTenant(null); setShowForm(true); }}>Thêm khách thuê</Button>
              )}
            </div>
          ) : tenants.map((t) => (
            <TenantCard key={t.id} t={t}
              selected={selectedId === t.id}
              onSelect={() => setSelectedId(t.id === selectedId ? null : t.id)}
              onEdit={(e) => openEdit(t, e)} />
          ))}
        </div>
        {totalPages > 1 && (
          <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>{total} khách thuê</span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Trước</Button>
              <span className="px-1">Trang {page} / {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sau</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Detail panel ── */}
      {selectedId && (
        <div className="flex-1 overflow-hidden bg-white">
          <TenantDetailPanel
            tenantId={selectedId}
            onEdit={() => { const t = tenants.find((x) => x.id === selectedId); if (t) openEdit(t); }}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      {/* Empty state when nothing selected */}
      {!selectedId && !isLoading && tenants.length > 0 && (
        <div className="hidden lg:flex flex-1 items-center justify-center text-gray-300 bg-gray-50/50">
          <div className="text-center">
            <Building2 size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Chọn khách thuê để xem chi tiết</p>
          </div>
        </div>
      )}

      <TenantFormDialog key={editTenant?.id ?? 'new'} open={showForm} onClose={closeForm} tenant={editTenant} />
    </div>
  );
}
