import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { bookingApi, crmApi, customersApi, categoriesApi, contractsApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BookmarkPlus, DollarSign, AlertTriangle, CheckCircle, BadgeCheck,
} from 'lucide-react';
import type { Unit } from '@/types';

export function CreateBookingDialog({ unitId, unitCode, unit, open, onClose }: {
  unitId: string; unitCode: string; unit?: Unit; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm({
    defaultValues: {
      sourceType: 'lead',
      leadId: '', customerId: '',
      requestedArea: '', requestedTerm: '36', expectedRent: '',
      proposedRentPerSqm: '', proposedCamPerSqm: '',
      holdDays: '30', notes: '',
    },
  });

  const sourceType = watch('sourceType');
  const proposedRent = watch('proposedRentPerSqm');
  const selectedCustomerId = watch('customerId');
  const priceAutofilledRef = useRef(false);

  // Mỗi lần mở dialog: reset form, tự điền diện tích đề xuất = full diện tích NLA của mặt bằng
  // (mặc định đề xuất thuê trọn mặt bằng — người dùng vẫn có thể sửa nếu chỉ thuê một phần).
  useEffect(() => {
    if (open) {
      priceAutofilledRef.current = false;
      reset({
        sourceType: 'lead',
        leadId: '', customerId: '',
        requestedArea: unit?.areaNLA ? String(unit.areaNLA) : '',
        requestedTerm: '36', expectedRent: '',
        proposedRentPerSqm: '', proposedCamPerSqm: '',
        holdDays: '30', notes: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit?.id]);

  const {
    data: leadsData,
    isLoading: leadsLoading,
    isError: leadsError,
    refetch: refetchLeads,
  } = useQuery({
    queryKey: ['booking-eligible-leads'],
    queryFn: () => crmApi.listLeads({ limit: 200, statuses: 'NEW,CONTACTED,QUALIFIED' }),
    enabled: open,
    staleTime: 15_000,
  });
  const { data: customersData } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => customersApi.listCustomers({ limit: 200 }),
    enabled: open,
  });

  // Get category pricing for this unit
  const { data: pricingData } = useQuery({
    queryKey: ['category-pricing-lookup', unit?.mall?.id, unit?.categoryId, unit?.floor?.id, unit?.zone?.id],
    queryFn: () => categoriesApi.lookupPricing({
      mallId: unit!.mall!.id,
      categoryId: unit!.categoryId!,
      floorId: unit?.floor?.id,
      zoneId: unit?.zone?.id,
    }),
    enabled: open && !!unit?.mall?.id && !!unit?.categoryId,
  });

  // Validate proposed price when it changes
  const { data: priceValidation } = useQuery({
    queryKey: ['price-validation', unit?.mall?.id, unit?.categoryId, proposedRent],
    queryFn: () => categoriesApi.validatePrice({
      mallId: unit!.mall!.id,
      categoryId: unit!.categoryId!,
      floorId: unit?.floor?.id,
      zoneId: unit?.zone?.id,
      proposedRentPerSqm: Number(proposedRent),
    }),
    enabled: open && !!unit?.mall?.id && !!unit?.categoryId && !!proposedRent && Number(proposedRent) > 0,
  });

  const categoryPricing = pricingData?.pricing;

  // Khi tra được giá ngành hàng (master data) lần đầu trong phiên mở dialog này: tự điền giá đề xuất
  // theo suggestedRent/camPerSqm đã đăng ký — không ghi đè nếu người dùng đã tự sửa sau đó.
  useEffect(() => {
    if (open && !priceAutofilledRef.current && categoryPricing) {
      if (categoryPricing.suggestedRent) {
        setValue('expectedRent', String(categoryPricing.suggestedRent));
        setValue('proposedRentPerSqm', String(categoryPricing.suggestedRent));
      }
      if (categoryPricing.camPerSqm) {
        setValue('proposedCamPerSqm', String(categoryPricing.camPerSqm));
      }
      priceAutofilledRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, categoryPricing]);

  // GAP #14 — Khách hiện hữu: check if selected customer has active contracts
  const { data: activeContractsData } = useQuery({
    queryKey: ['customer-active-contracts', selectedCustomerId],
    queryFn: () => contractsApi.listContracts({ customerId: selectedCustomerId, status: 'ACTIVE', limit: 1 }),
    enabled: open && sourceType === 'customer' && !!selectedCustomerId,
    staleTime: 30_000,
  });
  const isExistingTenant = (activeContractsData?.total ?? activeContractsData?.data?.length ?? 0) > 0;

  const leads: any[] = leadsData?.data ?? [];
  const customers: any[] = customersData?.data ?? [];

  const mutation = useMutation({
    mutationFn: (data: any) => bookingApi.create({
      unitId,
      leadId: data.sourceType === 'lead' && data.leadId ? data.leadId : undefined,
      customerId: data.sourceType === 'customer' && data.customerId ? data.customerId : undefined,
      requestedArea: data.requestedArea ? Number(data.requestedArea) : undefined,
      requestedTerm: data.requestedTerm ? Number(data.requestedTerm) : undefined,
      expectedRent: data.expectedRent ? Number(data.expectedRent) : undefined,
      proposedRentPerSqm: data.proposedRentPerSqm ? Number(data.proposedRentPerSqm) : undefined,
      proposedCamPerSqm: data.proposedCamPerSqm ? Number(data.proposedCamPerSqm) : undefined,
      holdDays: Number(data.holdDays),
      notes: data.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-detail'] });
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'Đã tạo booking thành công' });
      reset();
      onClose();
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? 'Lỗi tạo booking',
      variant: 'destructive',
    }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus size={18} className="text-amber-500" />
            Tạo booking — {unitCode}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 pt-1">

          {/* Nguồn khách */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Loại khách hàng</label>
            <div className="flex gap-2">
              {[{ v: 'lead', label: 'Lead (CRM)' }, { v: 'customer', label: 'Customer' }].map(({ v, label }) => (
                <button
                  key={v} type="button"
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    sourceType === v
                      ? 'border-amber-400 bg-amber-50 text-amber-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                  onClick={() => {
                    setValue('sourceType', v);
                    if (v === 'lead') setValue('customerId', '');
                    if (v === 'customer') setValue('leadId', '');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Chọn Lead */}
          {sourceType === 'lead' && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Lead *</label>
              <Select value={watch('leadId')} onValueChange={(v) => setValue('leadId', v, { shouldValidate: true })}>
                <SelectTrigger className={errors.leadId ? 'border-red-400' : ''}>
                  <SelectValue placeholder="Chọn lead..." />
                </SelectTrigger>
                <SelectContent>
                  {leadsLoading && <div className="px-3 py-2 text-sm text-gray-500">Đang tải danh sách Lead...</div>}
                  {leadsError && (
                    <div className="space-y-2 px-3 py-2 text-sm text-red-600">
                      <p>Không thể tải danh sách Lead.</p>
                      <Button type="button" size="sm" variant="outline" onClick={() => refetchLeads()}>Thử lại</Button>
                    </div>
                  )}
                  {!leadsLoading && !leadsError && leads.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500">Chưa có Lead mới, đang liên hệ hoặc đã đủ điều kiện.</div>
                  )}
                  {leads.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.brandName} — {l.contactName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="hidden"
                {...register('leadId', {
                  validate: (value) => sourceType !== 'lead' || !!value || 'Vui lòng chọn Lead',
                })}
              />
              <p className="mt-1 text-xs text-gray-500">Hiển thị Lead mới, đang liên hệ và đã đủ điều kiện.</p>
              {errors.leadId && <p className="mt-1 text-xs text-red-600">{String(errors.leadId.message)}</p>}
            </div>
          )}

          {/* Chọn Customer */}
          {sourceType === 'customer' && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Customer *</label>
              <Select value={watch('customerId')} onValueChange={(v) => setValue('customerId', v, { shouldValidate: true })}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn customer..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.customerCode} — {c.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="hidden"
                {...register('customerId', {
                  validate: (value) => sourceType !== 'customer' || !!value || 'Vui lòng chọn Customer',
                })}
              />
              {errors.customerId && <p className="mt-1 text-xs text-red-600">{String(errors.customerId.message)}</p>}
              {/* GAP #14 — Khách hiện hữu badge */}
              {isExistingTenant && (
                <div className="flex items-center gap-1.5 mt-1.5 px-2.5 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                  <BadgeCheck size={13} className="text-green-600 shrink-0" />
                  <span className="font-medium">Khách hiện hữu</span>
                  <span className="text-green-500">— đang có hợp đồng hiện hành</span>
                </div>
              )}
            </div>
          )}

          {/* Thông số yêu cầu */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Diện tích (m²)</label>
              <Input {...register('requestedArea')} type="number" placeholder="120" />
              {unit?.areaNLA != null && (
                <p className="text-xs text-gray-400 mt-1">Gợi ý: trọn diện tích NLA ({unit.areaNLA.toLocaleString('vi-VN')} m²) — có thể sửa nếu thuê một phần</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Thời hạn (tháng)</label>
              <Input {...register('requestedTerm')} type="number" placeholder="36" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Giá kỳ vọng (₫/m²)</label>
              <Input {...register('expectedRent')} type="number" placeholder="650000" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Giữ slot (ngày) *</label>
              <Input {...register('holdDays', { required: true })} type="number" min={1} />
            </div>
          </div>

          {/* Category Pricing Info */}
          {categoryPricing && (
            <div className="bg-gray-50 p-3 rounded-lg text-sm">
              <div className="text-blue-800 font-medium mb-1 flex items-center gap-1">
                <DollarSign size={14} />
                Giá ngành hàng: {unit?.category ?? (unit as any)?.categoryRef?.name}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Sàn:</span>
                  <span className="ml-1 font-medium">{categoryPricing.minRentPerSqm?.toLocaleString()} ₫</span>
                </div>
                <div>
                  <span className="text-gray-500">Trần:</span>
                  <span className="ml-1 font-medium">{categoryPricing.maxRentPerSqm?.toLocaleString()} ₫</span>
                </div>
                {categoryPricing.suggestedRent && (
                  <div>
                    <span className="text-gray-500">Đề xuất:</span>
                    <span className="ml-1 font-medium">{categoryPricing.suggestedRent?.toLocaleString()} ₫</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Proposed Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Giá sale đề xuất (₫/m²)</label>
              <Input {...register('proposedRentPerSqm')} type="number" placeholder="550000" />
              {categoryPricing?.suggestedRent != null && (
                <p className="text-xs text-gray-400 mt-1">Gợi ý theo ngành hàng: {categoryPricing.suggestedRent.toLocaleString('vi-VN')} ₫</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">CAM đề xuất (₫/m²)</label>
              <Input {...register('proposedCamPerSqm')} type="number" placeholder="80000" />
              {categoryPricing?.camPerSqm != null && (
                <p className="text-xs text-gray-400 mt-1">Gợi ý theo ngành hàng: {categoryPricing.camPerSqm.toLocaleString('vi-VN')} ₫</p>
              )}
            </div>
          </div>

          {/* Price Validation Warning */}
          {priceValidation && !priceValidation.isValid && (
            <div className={`p-3 rounded-lg text-sm ${
              priceValidation.approvalLevel === 'CEO' ? 'bg-red-50 text-red-700 border border-red-200' :
              priceValidation.approvalLevel === 'DIRECTOR' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
              'bg-yellow-50 text-yellow-700 border border-yellow-200'
            }`}>
              <div className="font-medium flex items-center gap-1">
                <AlertTriangle size={14} />
                Giá cần phê duyệt
              </div>
              <p className="mt-1">{priceValidation.message}</p>
              <div className="mt-1 text-xs opacity-80">
                Chênh lệch: {priceValidation.deviationPercent?.toFixed(1)}% so với giá sàn
              </div>
            </div>
          )}

          {priceValidation?.isValid && proposedRent && Number(proposedRent) > 0 && (
            <div className="p-3 rounded-lg text-sm bg-green-50 text-green-700 border border-green-200">
              <div className="flex items-center gap-1">
                <CheckCircle size={14} />
                <span className="font-medium">Giá đề xuất hợp lệ</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú</label>
            <Textarea {...register('notes')} placeholder="Khách đã site visit, có tiềm năng cao..." rows={2} />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending} className="bg-amber-500 hover:bg-amber-600 text-white gap-2">
              <BookmarkPlus size={15} />
              {mutation.isPending ? 'Đang tạo...' : 'Tạo Booking'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
