import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalsApi, bookingApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle, XCircle, CheckSquare, DollarSign, AlertTriangle, Building2 } from 'lucide-react';

function fmt(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', notation: 'compact' }).format(n);
}

function fmtPrice(n: number | null | undefined) {
  if (!n) return '—';
  return new Intl.NumberFormat('vi-VN').format(n);
}

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<'proposals' | 'prices'>('proposals');
  const [rejectDialog, setRejectDialog] = useState<{ id: string; type: 'proposal' | 'price' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Proposal approvals
  const { data, isLoading } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: approvalsApi.pending,
    refetchInterval: 30_000,
  });

  // Booking price approvals
  const { data: priceApprovalsData, isLoading: loadingPriceApprovals } = useQuery({
    queryKey: ['pending-price-approvals'],
    queryFn: () => bookingApi.getPendingPriceApproval({ limit: 50 }),
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      approvalsApi.approve(id, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] });
      toast({ title: 'Đã phê duyệt thành công' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      approvalsApi.reject(id, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] });
      toast({ title: 'Đã từ chối', variant: 'destructive' });
      setRejectDialog(null);
      setRejectReason('');
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  // Price approval mutations
  const approvePriceMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      bookingApi.approvePrice(id, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-price-approvals'] });
      toast({ title: 'Đã phê duyệt giá đề xuất' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const rejectPriceMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      bookingApi.rejectPrice(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-price-approvals'] });
      toast({ title: 'Đã từ chối giá đề xuất', variant: 'destructive' });
      setRejectDialog(null);
      setRejectReason('');
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const steps = data?.data ?? data ?? [];
  const priceApprovals = priceApprovalsData?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Phê duyệt</h1>
          <p className="text-sm text-gray-500 mt-1">Các yêu cầu phê duyệt đang chờ xử lý</p>
        </div>
        <div className="flex gap-2">
          <Badge className="bg-blue-100 text-gray-700 border-0 text-sm px-3 py-1">
            {steps.length} deal
          </Badge>
          <Badge className="bg-amber-100 text-amber-700 border-0 text-sm px-3 py-1">
            {priceApprovals.length} giá
          </Badge>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setView('proposals')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            view === 'proposals' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
          }`}
        >
          <CheckSquare size={14} className="inline mr-1.5" />
          Proposal ({steps.length})
        </button>
        <button
          onClick={() => setView('prices')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            view === 'prices' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
          }`}
        >
          <DollarSign size={14} className="inline mr-1.5" />
          Giá Booking ({priceApprovals.length})
        </button>
      </div>

      {/* Proposal Approvals */}
      {view === 'proposals' && (
        <>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="pt-4"><Skeleton className="h-32" /></CardContent></Card>
              ))}
            </div>
          ) : steps.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <CheckSquare size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Không có gì cần duyệt</p>
              <p className="text-sm mt-1">Các deal chờ duyệt sẽ hiện ở đây</p>
            </div>
          ) : (
            <div className="space-y-4">
              {steps.map((step: any) => {
                const proposal = step.workflow?.proposal;
                return (
                  <Card key={step.id} className="border-l-4 border-l-yellow-400">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{step.stepName}</CardTitle>
                          <p className="text-sm text-gray-500 mt-0.5">
                            Yêu cầu vai trò: <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">{step.approverRole}</Badge>
                          </p>
                        </div>
                        <Badge className="bg-yellow-100 text-yellow-700 border-0">Bước {step.stepOrder}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {proposal && (
                        <div className="bg-gray-50 rounded-lg p-4 mb-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <p className="text-gray-400 text-xs">Proposal</p>
                              <p className="font-mono font-medium text-xs">{proposal.proposalNumber}</p>
                            </div>
                            <div>
                              <p className="text-gray-400 text-xs">Khách thuê</p>
                              <p className="font-medium">{proposal.tenant?.brandName ?? '-'}</p>
                            </div>
                            <div>
                              <p className="text-gray-400 text-xs">Mặt bằng</p>
                              <p className="font-medium">{proposal.unit?.code} - {proposal.unit?.floor?.name}</p>
                            </div>
                            <div>
                              <p className="text-gray-400 text-xs">Thuê/tháng</p>
                              <p className="font-medium text-gray-700">{fmt(proposal.monthlyRent)}</p>
                            </div>
                            <div>
                              <p className="text-gray-400 text-xs">Diện tích</p>
                              <p className="font-medium">{proposal.area} m²</p>
                            </div>
                            <div>
                              <p className="text-gray-400 text-xs">Thời hạn</p>
                              <p className="font-medium">{proposal.term} tháng</p>
                            </div>
                            <div>
                              <p className="text-gray-400 text-xs">Discount</p>
                              <p className={`font-medium ${proposal.discount > 0 ? 'text-red-600' : ''}`}>
                                {proposal.discount}%
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-400 text-xs">Giá trị HĐ</p>
                              <p className="font-bold text-green-600">{fmt(proposal.totalContractValue)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => setRejectDialog({ id: step.id, type: 'proposal' })}
                          disabled={rejectMutation.isPending}
                        >
                          <XCircle size={16} /> Từ chối
                        </Button>
                        <Button
                          className="gap-2 bg-green-600 hover:bg-green-700"
                          onClick={() => approveMutation.mutate({ id: step.id })}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle size={16} /> Phê duyệt
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Price Approvals */}
      {view === 'prices' && (
        <>
          {loadingPriceApprovals ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="pt-4"><Skeleton className="h-32" /></CardContent></Card>
              ))}
            </div>
          ) : priceApprovals.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <DollarSign size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Không có giá cần duyệt</p>
              <p className="text-sm mt-1">Các booking với giá đề xuất thấp hơn sàn sẽ hiện ở đây</p>
            </div>
          ) : (
            <div className="space-y-4">
              {priceApprovals.map((booking: any) => {
                const unit = booking.unit;
                const categoryPricing = booking.categoryPricing;
                const deviationColor = 
                  (booking.priceDeviationPercent ?? 0) > 10 ? 'text-red-600' :
                  (booking.priceDeviationPercent ?? 0) > 5 ? 'text-orange-600' :
                  'text-yellow-600';

                return (
                  <Card key={booking.id} className="border-l-4 border-l-amber-400">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <DollarSign size={16} className="text-amber-500" />
                            Phê duyệt giá — {booking.bookingNumber}
                          </CardTitle>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {booking.lead?.brandName ?? booking.customer?.companyName ?? '—'}
                          </p>
                        </div>
                        <Badge className={`border-0 ${deviationColor} bg-opacity-20`}>
                          -{booking.priceDeviationPercent?.toFixed(1)}%
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Unit Info */}
                      <div className="bg-gray-50 rounded-lg p-3 mb-4">
                        <div className="flex items-center gap-2 mb-2 text-sm">
                          <Building2 size={14} className="text-gray-400" />
                          <span className="font-medium">{unit?.code}</span>
                          <span className="text-gray-400">·</span>
                          <span>{unit?.mall?.name}</span>
                          <span className="text-gray-400">·</span>
                          <span>{unit?.floor?.name}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          Ngành hàng: <span className="font-medium text-gray-700">{unit?.category ?? unit?.categoryRef?.name}</span>
                        </div>
                      </div>

                      {/* Price Comparison */}
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-700 mb-1">Giá sàn</p>
                          <p className="font-bold text-gray-700">{fmtPrice(categoryPricing?.minRentPerSqm)}</p>
                          <p className="text-xs text-gray-500">₫/m²</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-red-600 mb-1">Đề xuất</p>
                          <p className="font-bold text-red-700">{fmtPrice(booking.proposedRentPerSqm)}</p>
                          <p className="text-xs text-red-500">₫/m²</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-green-600 mb-1">Giá trần</p>
                          <p className="font-bold text-green-700">{fmtPrice(categoryPricing?.maxRentPerSqm)}</p>
                          <p className="text-xs text-green-500">₫/m²</p>
                        </div>
                      </div>

                      {/* Warning */}
                      <div className={`p-3 rounded-lg text-sm mb-4 flex items-start gap-2 ${
                        (booking.priceDeviationPercent ?? 0) > 10 ? 'bg-red-50 text-red-700' :
                        (booking.priceDeviationPercent ?? 0) > 5 ? 'bg-orange-50 text-orange-700' :
                        'bg-yellow-50 text-yellow-700'
                      }`}>
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <div>
                          Giá đề xuất thấp hơn giá sàn <strong>{booking.priceDeviationPercent?.toFixed(1)}%</strong>
                          {booking.notes && <p className="mt-1 text-xs opacity-80">Ghi chú: {booking.notes}</p>}
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => setRejectDialog({ id: booking.id, type: 'price' })}
                          disabled={rejectPriceMutation.isPending}
                        >
                          <XCircle size={16} /> Từ chối
                        </Button>
                        <Button
                          className="gap-2 bg-green-600 hover:bg-green-700"
                          onClick={() => approvePriceMutation.mutate({ id: booking.id })}
                          disabled={approvePriceMutation.isPending}
                        >
                          <CheckCircle size={16} /> Phê duyệt giá
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => { setRejectDialog(null); setRejectReason(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle size={18} className="text-red-500" />
              Từ chối {rejectDialog?.type === 'price' ? 'giá đề xuất' : 'phê duyệt'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-gray-600 mb-3">Vui lòng nhập lý do từ chối:</p>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Lý do từ chối..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialog(null); setRejectReason(''); }}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectDialog?.type === 'price') {
                  rejectPriceMutation.mutate({ id: rejectDialog.id, reason: rejectReason || 'Không phê duyệt' });
                } else if (rejectDialog?.type === 'proposal') {
                  rejectMutation.mutate({ id: rejectDialog.id, comment: rejectReason || 'Không phê duyệt' });
                }
              }}
              disabled={rejectMutation.isPending || rejectPriceMutation.isPending}
            >
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
