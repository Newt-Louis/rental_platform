import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { spacesApi, bookingApi, proposalsApi, slotsApi, categoriesApi } from '@/api';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { FloorPlanEditor } from '@/components/FloorPlanEditor';
import { SlotSummaryBadge } from '@/components/SlotSummaryBadge';
import { useToast } from '@/components/ui/use-toast';
import {
  Building2, User, Mail, Phone, FileText, Trash2,
  BookmarkPlus, TrendingUp, Users,
  Calendar, Image, LayoutList, Scissors, GitMerge, Save,
} from 'lucide-react';
import type { Unit, UnitSlotSummary } from '@/types';
import {
  STATUS_CONFIG, STATUS_ICONS, CATEGORIES, mediaUrl, fmtDate,
} from '@/pages/spaces/spaces.constants';
import { UnitMediaTab } from './tabs/UnitMediaTab';
import { SalesPipelineTab } from './tabs/SalesPipelineTab';
import { CreateBookingDialog } from './dialogs/CreateBookingDialog';
import { ConvertBookingDialog } from './dialogs/ConvertBookingDialog';
import { UnitFormFields } from './dialogs/UnitFormFields';
import { UNIT_FORM_DEFAULT_VALUES, seedUnitFormValues, buildUnitFormPayload } from './dialogs/unitFormHelpers';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { ReasonActionDialog } from '@/components/ui/reason-action-dialog';
import { useAuthStore } from '@/store/auth.store';

export function UnitDetailSheet({
  unit, onClose, onEdit, onDelete,
}: {
  unit: Unit | null;
  onClose: () => void;
  onEdit: (unit: any) => void;
  onDelete: (unit: any) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canManageSpaces = ['ADMIN', 'MALL_DIRECTOR', 'LEASING_MANAGER'].includes(user?.role ?? '');
  const canManageSales = ['ADMIN', 'MALL_DIRECTOR', 'LEASING_MANAGER', 'LEASING_EXECUTIVE'].includes(user?.role ?? '');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'sales' | 'media' | 'slots'>('info');
  const [convertBooking, setConvertBooking] = useState<any | null>(null);
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);
  const [splitConfirmOpen, setSplitConfirmOpen] = useState(false);

  const {
    register: editRegister, handleSubmit: handleEditSubmit, watch: editWatch,
    setValue: editSetValue, reset: editReset, formState: { errors: editErrors },
  } = useForm({
    defaultValues: UNIT_FORM_DEFAULT_VALUES,
  });

  const submitProposalMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.submitProposal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      toast({ title: 'Đã gửi phê duyệt' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const convertProposalMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.convertProposal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['units'] });
      toast({ title: 'Đã chuyển thành hợp đồng' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['unit-detail', unit?.id],
    queryFn: () => spacesApi.getUnit(unit!.id),
    enabled: !!unit?.id,
  });

  const { data: slotSummary } = useQuery<UnitSlotSummary | null>({
    queryKey: ['slot-summary', unit?.id],
    queryFn: async () => {
      const summaries = await slotsApi.getSummaries([unit!.id]);
      return summaries[unit!.id] ?? null;
    },
    enabled: !!unit?.id,
  });

  const { data: floorsData } = useQuery({
    queryKey: ['floors', unit?.mallId],
    queryFn: () => spacesApi.listFloors(unit!.mallId),
    enabled: !!unit?.mallId,
  });
  const { data: zonesData } = useQuery({
    queryKey: ['zones', unit?.mallId],
    queryFn: () => spacesApi.listZones({ mallId: unit!.mallId }),
    enabled: !!unit?.mallId,
  });
  const { data: categoryOptions } = useQuery({
    queryKey: ['category-options'],
    queryFn: categoriesApi.getOptions,
    staleTime: 300_000,
    enabled: !!unit,
  });

  const cancelBookingMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      bookingApi.cancel(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'Đã hủy booking' });
      setCancelBookingId(null);
    },
    onError: () => toast({ title: 'Lỗi hủy booking', variant: 'destructive' }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => spacesApi.updateUnitWithHistory(detail?.id ?? unit!.id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'Đã cập nhật trạng thái' });
    },
    onError: () => toast({ title: 'Lỗi cập nhật trạng thái', variant: 'destructive' }),
  });

  const updateInfoMutation = useMutation({
    mutationFn: (data: any) => {
      const payload = buildUnitFormPayload(data, unit!.mallId);
      return spacesApi.updateUnit(detail?.id ?? unit!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      qc.invalidateQueries({ queryKey: ['floor-map'] });
      toast({ title: 'Đã cập nhật mặt bằng' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const splitMutation = useMutation({
    mutationFn: () => spacesApi.splitUnit((detail as any)?.id ?? unit!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'Đã tách sảnh thành công' });
      setSplitConfirmOpen(false);
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi tách sảnh', variant: 'destructive' }),
  });

  const d: any = detail ?? unit;
  const cfg = d ? STATUS_CONFIG[d.status] : null;

  useEffect(() => {
    if (d) {
      editReset(seedUnitFormValues(d));
    }
  }, [d]);

  const floors: any[] = (floorsData?.data ?? floorsData ?? []).slice().sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  const allZones: any[] = zonesData?.data ?? zonesData ?? [];
  const editFloorId = editWatch('floorId');
  const zones = editFloorId ? allZones.filter((z: any) => z.floorId === editFloorId) : allZones;
  const categoryNames: string[] = useMemo(() => {
    const fromApi = (categoryOptions as any[])?.map((c: any) => c.name).filter(Boolean) ?? [];
    return fromApi.length > 0 ? fromApi : CATEGORIES;
  }, [categoryOptions]);

  return (
    <Sheet
      open={!!unit}
      onClose={onClose}
      title={d?.name ? `${d.code} — ${d.name}` : (d?.code ?? '')}
      subtitle={`${d?.floor?.name ?? ''}${d?.zone?.name ? ' · ' + d.zone.name : ''}`}
      className="w-full sm:w-[720px]"
    >
      {d && (
        <div className="px-3 sm:px-6 pb-8 space-y-4 pt-4">
          {/* Status + category */}
          <div className="flex items-center gap-2 flex-wrap">
            {cfg && (
              <Badge className={`${cfg.color} border px-3 py-1 text-sm font-medium`}>{cfg.label}</Badge>
            )}
            {d.category && <Badge variant="outline" className="text-sm">{d.category}</Badge>}
            {d.mall?.name && <Badge variant="outline" className="text-xs text-gray-500">{d.mall.name}</Badge>}
          </div>

          {/* Tab switcher */}
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {([
              ['info', 'Thông tin', LayoutList],
              ['sales', 'Bán hàng', TrendingUp],
              ['media', 'Media', Image],
              ['slots', 'Booking Slot', BookmarkPlus],
            ] as const).map(([tab, label, Icon]) => {
              const hasBadge = tab === 'sales' && (
                (d.bookings?.filter((b: any) => ['ACTIVE', 'PENDING'].includes(b.status)).length ?? 0) +
                (d.proposals?.filter((p: any) => ['DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED'].includes(p.status)).length ?? 0)
              ) > 0;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex-shrink-0 ${
                    activeTab === tab
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon size={14} /> {label}
                  {hasBadge && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 absolute top-1.5 right-1.5" />}
                </button>
              );
            })}
          </div>

          {/* Media tab */}
          {activeTab === 'media' && <UnitMediaTab unitId={d.id} />}

          {/* Slots tab */}
          {activeTab === 'slots' && (
            <FloorPlanEditor
              unitId={d.id}
              unitStatus={d.status}
              floorPlanUrl={mediaUrl(d.media?.find((m: any) => m.type === 'FLOOR_PLAN')?.fileUrl)}
              unitArea={d.areaNLA}
            />
          )}

          {/* Sales Pipeline tab */}
          {activeTab === 'sales' && detailLoading && (
            <div className="space-y-3 pt-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}
          {activeTab === 'sales' && !detailLoading && (
            <SalesPipelineTab
              unit={d}
              onCreateBooking={() => setBookingOpen(true)}
              onConvertBooking={(b) => setConvertBooking(b)}
              onCancelBooking={(id) => setCancelBookingId(id)}
              onSubmitProposal={(id) => submitProposalMutation.mutate(id)}
              onConvertProposal={(id) => convertProposalMutation.mutate(id)}
              onNavigateProposals={() => { navigate('/proposals'); onClose(); }}
              cancelLoading={cancelBookingMutation.isPending}
              submitLoading={submitProposalMutation.isPending}
              convertLoading={convertProposalMutation.isPending}
              canManageSales={canManageSales}
            />
          )}

          {/* Info tab content */}
          {activeTab === 'info' && (<>

          {/* Slot booking summary on main unit */}
          {slotSummary && slotSummary.totalSlots > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold tracking-wider text-gray-700">BOOKING SLOT (Ô NHỎ)</span>
                <button
                  onClick={() => setActiveTab('slots')}
                  className="text-xs text-gray-700 hover:underline"
                >
                  Xem chi tiết →
                </button>
              </div>
              <SlotSummaryBadge summary={slotSummary} />
            </div>
          )}

          {/* Change status */}
          {canManageSpaces && <div>
            <label className="text-xs font-semibold tracking-wider text-gray-400 block mb-1.5">ĐỔI TRẠNG THÁI</label>
            <Select
              value={d.status}
              onValueChange={(v) => statusMutation.mutate(v)}
              disabled={statusMutation.isPending}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>}

          {/* Space info — always editable */}
          <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
            <div className="text-xs font-semibold tracking-wider text-gray-400 mb-3">THÔNG TIN MẶT BẰNG</div>
            <form
              id="unit-info-edit-form"
              onSubmit={handleEditSubmit((data) => updateInfoMutation.mutate(data))}
            >
              <UnitFormFields
                register={editRegister}
                watch={editWatch}
                setValue={editSetValue}
                errors={editErrors}
                floors={floors}
                zones={zones}
                categoryNames={categoryNames}
              />
            </form>
          </div>

          {/* GAP #2 — Sảnh gộp info + Tách sảnh */}
          {d.isCombined && (
            <SheetSection label="THÔNG TIN SẢNH GỘP" className="bg-violet-50">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-violet-700">
                  <GitMerge size={14} />
                  <span>Sảnh này được gộp từ {Array.isArray(d.mergedFromIds) ? d.mergedFromIds.length : '?'} sảnh nguồn</span>
                </div>
                {canManageSpaces && <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-violet-300 text-violet-700 hover:bg-violet-100"
                  disabled={splitMutation.isPending || d.status === 'OCCUPIED' || d.status === 'CONTRACTED' || d.status === 'UNDER_FITOUT'}
                  onClick={() => setSplitConfirmOpen(true)}
                >
                  <Scissors size={12} />
                  {splitMutation.isPending ? 'Đang tách...' : 'Tách sảnh'}
                </Button>}
              </div>
              {(d.status === 'OCCUPIED' || d.status === 'CONTRACTED' || d.status === 'UNDER_FITOUT') && (
                <p className="text-xs text-violet-500 px-3 pb-2">Không thể tách khi sảnh đang được sử dụng.</p>
              )}
            </SheetSection>
          )}

          {/* Tenant */}
          {d.tenant && (
            <SheetSection label="KHÁCH THUÊ HIỆN TẠI" className="bg-green-50">
              <SheetRow label="Thương hiệu"  value={d.tenant.brandName}    icon={User} />
              <SheetRow label="Công ty"      value={d.tenant.companyName}  icon={Building2} />
              <SheetRow label="Liên hệ"      value={d.tenant.contactName}  icon={User} />
              <SheetRow label="Email"         value={d.tenant.contactEmail} icon={Mail} />
              <SheetRow label="Điện thoại"   value={d.tenant.contactPhone} icon={Phone} />
            </SheetSection>
          )}

          {/* Lease dates */}
          {(d.leaseStartDate || d.leaseEndDate) && (
            <SheetSection label="THỜI HẠN THUÊ" className="bg-gray-50">
              <SheetRow label="Ngày bắt đầu"  value={fmtDate(d.leaseStartDate)} icon={Calendar} />
              <SheetRow label="Ngày kết thúc" value={fmtDate(d.leaseEndDate)}   icon={Calendar} />
            </SheetSection>
          )}

          {/* Active contracts */}
          {Array.isArray(d.contracts) && d.contracts.length > 0 && (
            <div>
              <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2">HỢP ĐỒNG HIỆN TẠI</div>
              <div className="space-y-2">
                {d.contracts.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-gray-400" />
                      <span className="text-sm font-mono font-medium">{c.contractNumber}</span>
                    </div>
                    <Badge className="text-xs bg-green-100 text-green-700 border-0">{c.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sales pipeline summary on info tab */}
          {(() => {
            const activeBookings = (d.bookings ?? []).filter((b: any) => ['ACTIVE','PENDING'].includes(b.status));
            const activeProposals = (d.proposals ?? []).filter((p: any) => !['CONVERTED'].includes(p.status));
            if (activeBookings.length === 0 && activeProposals.length === 0) return null;
            return (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                    <TrendingUp size={12} /> PIPELINE BÁN HÀNG
                  </span>
                  <button
                    className="text-xs text-amber-700 hover:underline font-medium"
                    onClick={() => setActiveTab('sales')}
                  >
                    Xem chi tiết →
                  </button>
                </div>
                <div className="flex gap-3 text-xs flex-wrap">
                  {activeBookings.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-700">
                      <Users size={11} /> {activeBookings.length} booking đang chờ
                    </span>
                  )}
                  {activeProposals.length > 0 && (
                    <span className="flex items-center gap-1 text-gray-700">
                      <FileText size={11} /> {activeProposals.length} đề xuất
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          {(canManageSpaces || canManageSales) && <div className="flex gap-2 pt-2 border-t border-gray-100">
            {canManageSales && (d.status === 'VACANT' || d.status === 'BOOKING') && (
              <Button
                className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => { setBookingOpen(true); }}
              >
                <BookmarkPlus size={14} /> Tạo Booking
              </Button>
            )}
            {canManageSpaces && <Button
              type="submit"
              form="unit-info-edit-form"
              className="flex-1 gap-2"
              disabled={updateInfoMutation.isPending}
            >
              <Save size={14} /> {updateInfoMutation.isPending ? 'Đang lưu...' : 'Lưu'}
            </Button>}
            {canManageSpaces && <Button
              variant="outline"
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => { onDelete(d); }}
            >
              <Trash2 size={14} /> Xóa
            </Button>}
          </div>}
          </>)}

          {/* Booking Dialog — đặt ngoài khối activeTab === 'info' vì "Tạo Booking" ở tab Bán hàng
              (SalesPipelineTab) cũng mở dialog này; trước đây bị lồng trong info nên bấm từ tab
              khác không thấy popup cho tới khi quay lại tab Thông tin. */}
          <CreateBookingDialog
            unitId={d.id}
            unitCode={d.code}
            unit={d}
            open={bookingOpen}
            onClose={() => setBookingOpen(false)}
          />

          {/* Convert Booking → Proposal */}
          <ConvertBookingDialog
            booking={convertBooking}
            onClose={() => setConvertBooking(null)}
          />

          <ReasonActionDialog
            open={!!cancelBookingId}
            onOpenChange={(nextOpen) => !nextOpen && setCancelBookingId(null)}
            title="Hủy booking?"
            description="Booking sẽ rời hàng đợi và lý do được lưu vào lịch sử để các bộ phận liên quan tra cứu."
            confirmLabel="Hủy booking"
            loading={cancelBookingMutation.isPending}
            minLength={5}
            onConfirm={(reason) => {
              if (cancelBookingId) cancelBookingMutation.mutate({ id: cancelBookingId, reason });
            }}
          />

          <ConfirmActionDialog
            open={splitConfirmOpen}
            onOpenChange={setSplitConfirmOpen}
            title={`Tách sảnh ${d.code}?`}
            description="Hệ thống sẽ khôi phục các mặt bằng nguồn và ngừng sử dụng sảnh gộp. Hãy kiểm tra trạng thái khai thác trước khi tiếp tục."
            confirmLabel="Tách sảnh"
            loading={splitMutation.isPending}
            onConfirm={() => splitMutation.mutate()}
          />
        </div>
      )}
    </Sheet>
  );
}
