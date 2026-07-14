import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Selecto from 'react-selecto';
import { useDragSelect, DRAG_SELECT_CLASS } from '@/hooks/useDragSelect';
import { BulkSelectionBar } from '@/components/BulkSelectionBar';
import { approvalsApi, bookingApi } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  CheckCircle, XCircle, CheckSquare, Square, DollarSign, AlertTriangle,
  Building2, Loader2, History, ChevronLeft, ChevronRight,
} from 'lucide-react';

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
  const [view, setView] = useState<'proposals' | 'prices' | 'history'>('proposals');
  const [proposalPage, setProposalPage] = useState(1);
  const [pricePage, setPricePage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyStatus, setHistoryStatus] = useState<'ALL' | 'APPROVED' | 'REJECTED'>('ALL');

  // ── Selection state ──
  const [selectedProposalIds, setSelectedProposalIds] = useState<Set<string>>(new Set());
  const [selectedPriceIds, setSelectedPriceIds] = useState<Set<string>>(new Set());

  // ── Drag select hooks ──
  const { gridRef: proposalGridRef, selectoRef: proposalSelectoRef, selectoProps: proposalSelectoProps } = useDragSelect({
    onSelect: (ids) => setSelectedProposalIds(new Set(ids)),
    onClear: () => setSelectedProposalIds(new Set()),
    idAttribute: 'data-step-id',
    selectFromInside: true,
  });
  const { gridRef: priceGridRef, selectoRef: priceSelectoRef, selectoProps: priceSelectoProps } = useDragSelect({
    onSelect: (ids) => setSelectedPriceIds(new Set(ids)),
    onClear: () => setSelectedPriceIds(new Set()),
    idAttribute: 'data-price-id',
    selectFromInside: true,
  });

  // ── Reject dialog ──
  const [rejectDialog, setRejectDialog] = useState<{ ids: string[]; type: 'proposal' | 'price'; bulk?: boolean } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // ── Queries ──
  const { data, isLoading } = useQuery({
    queryKey: ['pending-approvals', proposalPage],
    queryFn: () => approvalsApi.pending({ page: proposalPage, limit: 15 }),
    refetchInterval: 30_000,
  });
  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ['approvals-history', historyPage, historyStatus],
    queryFn: () => approvalsApi.history({
      page: historyPage,
      limit: 25,
      status: historyStatus === 'ALL' ? undefined : historyStatus,
    }),
    enabled: view === 'history',
  });

  const { data: priceApprovalsData, isLoading: loadingPriceApprovals } = useQuery({
    queryKey: ['pending-price-approvals', pricePage],
    queryFn: () => bookingApi.getPendingPriceApproval({ page: pricePage, limit: 25 }),
    refetchInterval: 30_000,
  });

  const steps: any[] = data?.data ?? [];
  const proposalTotalPages: number = data?.totalPages ?? 1;
  const proposalTotal: number = data?.total ?? 0;
  const priceApprovals: any[] = priceApprovalsData?.data ?? [];
  const priceTotalPages: number = priceApprovalsData?.totalPages ?? 1;
  const priceTotal: number = priceApprovalsData?.total ?? 0;
  const historySteps: any[] = historyData?.data ?? [];
  const historyTotalPages: number = historyData?.totalPages ?? 1;
  const historyTotal: number = historyData?.total ?? 0;

  // ── Mutations — single ──
  const approveMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => approvalsApi.approve(id, comment),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pending-approvals'] }); toast({ title: 'Đã phê duyệt thành công' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => approvalsApi.reject(id, comment),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pending-approvals'] }); toast({ title: 'Đã từ chối', variant: 'destructive' }); closeRejectDialog(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });
  const approvePriceMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => bookingApi.approvePrice(id, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pending-price-approvals'] }); toast({ title: 'Đã phê duyệt giá' }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });
  const rejectPriceMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => bookingApi.rejectPrice(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pending-price-approvals'] }); toast({ title: 'Đã từ chối giá', variant: 'destructive' }); closeRejectDialog(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  // ── Bulk mutations ──
  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Approve sequentially to satisfy the "earlier step must be approved first" constraint.
      let ok = 0, fail = 0;
      for (const id of ids) {
        try { await approvalsApi.approve(id); ok++; }
        catch { fail++; }
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] });
      setSelectedProposalIds(new Set());
      if (fail > 0) toast({ title: `Đã duyệt ${ok}, ${fail} lỗi`, variant: 'destructive' });
      else toast({ title: `Đã phê duyệt ${ok} bước` });
    },
    onError: () => toast({ title: 'Lỗi phê duyệt', variant: 'destructive' }),
  });
  const bulkRejectMutation = useMutation({
    mutationFn: async ({ ids, comment }: { ids: string[]; comment: string }) => {
      let ok = 0, fail = 0;
      for (const id of ids) {
        try { await approvalsApi.reject(id, comment); ok++; }
        catch { fail++; }
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] });
      setSelectedProposalIds(new Set());
      closeRejectDialog();
      if (fail > 0) toast({ title: `Đã từ chối ${ok}, ${fail} lỗi`, variant: 'destructive' });
      else toast({ title: `Đã từ chối ${ok} bước`, variant: 'destructive' });
    },
    onError: () => toast({ title: 'Lỗi từ chối', variant: 'destructive' }),
  });
  const bulkApprovePriceMutation = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.allSettled(ids.map((id) => bookingApi.approvePrice(id))).then((results) => ({
        ok: results.filter((r) => r.status === 'fulfilled').length,
        fail: results.filter((r) => r.status === 'rejected').length,
      })),
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['pending-price-approvals'] });
      setSelectedPriceIds(new Set());
      if (fail > 0) toast({ title: `Đã duyệt ${ok}, ${fail} lỗi`, variant: 'destructive' });
      else toast({ title: `Đã phê duyệt giá ${ok} booking` });
    },
    onError: () => toast({ title: 'Lỗi phê duyệt giá', variant: 'destructive' }),
  });
  const bulkRejectPriceMutation = useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason: string }) =>
      Promise.allSettled(ids.map((id) => bookingApi.rejectPrice(id, reason))).then((results) => ({
        ok: results.filter((r) => r.status === 'fulfilled').length,
        fail: results.filter((r) => r.status === 'rejected').length,
      })),
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['pending-price-approvals'] });
      setSelectedPriceIds(new Set());
      closeRejectDialog();
      if (fail > 0) toast({ title: `Đã từ chối ${ok}, ${fail} lỗi`, variant: 'destructive' });
      else toast({ title: `Đã từ chối giá ${ok} booking`, variant: 'destructive' });
    },
    onError: () => toast({ title: 'Lỗi từ chối giá', variant: 'destructive' }),
  });

  function closeRejectDialog() { setRejectDialog(null); setRejectReason(''); }

  function handleRejectConfirm() {
    if (!rejectDialog) return;
    const reason = rejectReason || 'Không phê duyệt';
    if (rejectDialog.type === 'price') {
      if (rejectDialog.bulk) bulkRejectPriceMutation.mutate({ ids: rejectDialog.ids, reason });
      else rejectPriceMutation.mutate({ id: rejectDialog.ids[0], reason });
    } else {
      if (rejectDialog.bulk) bulkRejectMutation.mutate({ ids: rejectDialog.ids, comment: reason });
      else rejectMutation.mutate({ id: rejectDialog.ids[0], comment: reason });
    }
  }

  const anyPending = approveMutation.isPending || rejectMutation.isPending
    || approvePriceMutation.isPending || rejectPriceMutation.isPending
    || bulkApproveMutation.isPending || bulkRejectMutation.isPending
    || bulkApprovePriceMutation.isPending || bulkRejectPriceMutation.isPending;

  return (
    <div>
      {/* ── Bulk bar — Proposals ── */}
      <BulkSelectionBar
        selectedCount={view === 'proposals' ? selectedProposalIds.size : 0}
        totalCount={steps.length}
        onSelectAll={() => setSelectedProposalIds(new Set(steps.map((s: any) => s.id)))}
        onClear={() => setSelectedProposalIds(new Set())}
      >
        <Button size="sm" variant="ghost" className="text-green-400 gap-1.5 shrink-0"
          disabled={bulkApproveMutation.isPending}
          onClick={() => bulkApproveMutation.mutate(Array.from(selectedProposalIds))}>
          {bulkApproveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          Phê duyệt tất cả
        </Button>
        <Button size="sm" variant="ghost" className="text-red-400 gap-1.5 shrink-0"
          onClick={() => setRejectDialog({ ids: Array.from(selectedProposalIds), type: 'proposal', bulk: true })}>
          <XCircle size={14} /> Từ chối tất cả
        </Button>
      </BulkSelectionBar>

      {/* ── Bulk bar — Prices ── */}
      <BulkSelectionBar
        selectedCount={view === 'prices' ? selectedPriceIds.size : 0}
        totalCount={priceApprovals.length}
        onSelectAll={() => setSelectedPriceIds(new Set(priceApprovals.map((b: any) => b.id)))}
        onClear={() => setSelectedPriceIds(new Set())}
      >
        <Button size="sm" variant="ghost" className="text-green-400 gap-1.5 shrink-0"
          disabled={bulkApprovePriceMutation.isPending}
          onClick={() => bulkApprovePriceMutation.mutate(Array.from(selectedPriceIds))}>
          {bulkApprovePriceMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          Phê duyệt giá
        </Button>
        <Button size="sm" variant="ghost" className="text-red-400 gap-1.5 shrink-0"
          onClick={() => setRejectDialog({ ids: Array.from(selectedPriceIds), type: 'price', bulk: true })}>
          <XCircle size={14} /> Từ chối giá
        </Button>
      </BulkSelectionBar>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Phê duyệt</h1>
          <p className="text-sm text-gray-500 mt-1">Các yêu cầu phê duyệt đang chờ xử lý</p>
        </div>
        <div className="flex gap-2">
          <Badge className="bg-blue-100 text-gray-700 border-0 text-sm px-3 py-1">{proposalTotal} deal</Badge>
          <Badge className="bg-amber-100 text-amber-700 border-0 text-sm px-3 py-1">{priceApprovals.length} giá</Badge>
        </div>
      </div>

      {/* ── Tab toggle ── */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => { setView('proposals'); setProposalPage(1); setSelectedPriceIds(new Set()); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'proposals' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
        >
          <CheckSquare size={14} className="inline mr-1.5" />
          Proposal ({proposalTotal})
        </button>
        <button
          onClick={() => { setView('prices'); setSelectedProposalIds(new Set()); setPricePage(1); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'prices' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
        >
          <DollarSign size={14} className="inline mr-1.5" />
          Giá Booking ({priceApprovals.length})
        </button>
        <button
          onClick={() => { setView('history'); setSelectedProposalIds(new Set()); setSelectedPriceIds(new Set()); setHistoryPage(1); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'history' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
        >
          <History size={14} className="inline mr-1.5" />
          Lịch sử
        </button>
      </div>

      {/* ══════════ PROPOSALS TABLE ══════════ */}
      {view === 'proposals' && (
        <>
          {isLoading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : steps.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <CheckSquare size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Không có gì cần duyệt</p>
              <p className="text-sm mt-1">Các deal chờ duyệt sẽ hiện ở đây</p>
            </div>
          ) : (
            <>
              {!rejectDialog && <Selecto ref={proposalSelectoRef} container={proposalGridRef.current} {...proposalSelectoProps} />}
              <div ref={proposalGridRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden select-none">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-blue-50/40">
                      <th className="px-3 py-3 w-8">
                        <div className="cursor-pointer" onClick={() => {
                          if (selectedProposalIds.size === steps.length) setSelectedProposalIds(new Set());
                          else setSelectedProposalIds(new Set(steps.map((s: any) => s.id)));
                        }}>
                          {selectedProposalIds.size === steps.length && steps.length > 0
                            ? <CheckSquare size={15} className="text-blue-600" />
                            : <Square size={15} className="text-gray-300" />}
                        </div>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Proposal</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Bước duyệt</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Vai trò</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Khách thuê</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Thuê/tháng</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Discount</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Giá trị HĐ</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {steps.map((step: any) => {
                      const proposal = step.workflow?.proposal;
                      const isSelected = selectedProposalIds.has(step.id);
                      return (
                        <tr key={step.id}
                          className={`${DRAG_SELECT_CLASS} transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50/60'}`}
                          data-step-id={step.id}
                        >
                          <td className="px-3 py-3 w-8" data-checkbox>
                            <div className="cursor-pointer" onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProposalIds((prev) => {
                                const next = new Set(prev);
                                next.has(step.id) ? next.delete(step.id) : next.add(step.id);
                                return next;
                              });
                            }}>
                              {isSelected
                                ? <CheckSquare size={15} className="text-blue-600" />
                                : <Square size={15} className="text-gray-300 hover:text-gray-500" />}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-gray-600">
                              {proposal?.proposalNumber ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800 text-sm">{step.stepName}</div>
                            <Badge className="bg-gray-100 text-gray-500 border-0 text-xs mt-0.5">Bước {step.stepOrder}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">{step.approverRole}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{proposal?.tenant?.brandName ?? <span className="text-gray-400">—</span>}</div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {proposal?.monthlyRent ? (
                              <span className="text-gray-700">{fmt(proposal.monthlyRent)}</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {proposal?.discount > 0 ? (
                              <span className="text-red-600 font-medium">{proposal.discount}%</span>
                            ) : (
                              <span className="text-gray-400">0%</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {proposal?.totalContractValue ? (
                              <span className="font-bold text-green-600">{fmt(proposal.totalContractValue)}</span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-40"
                                title="Từ chối"
                                disabled={anyPending}
                                onClick={(e) => { e.stopPropagation(); setRejectDialog({ ids: [step.id], type: 'proposal' }); }}
                              >
                                <XCircle size={13} /> Từ chối
                              </button>
                              <button
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 hover:border-green-300 transition-colors disabled:opacity-40"
                                title="Phê duyệt"
                                disabled={anyPending}
                                onClick={(e) => { e.stopPropagation(); approveMutation.mutate({ id: step.id }); }}
                              >
                                {approveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                Duyệt
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!isLoading && proposalTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>{proposalTotal} deal chờ duyệt</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={proposalPage === 1}
                  onClick={() => { setProposalPage(p => p - 1); setSelectedProposalIds(new Set()); }}>
                  <ChevronLeft size={14} />
                </Button>
                <span className="px-2 py-1 text-xs">Trang {proposalPage} / {proposalTotalPages}</span>
                <Button variant="outline" size="sm" disabled={proposalPage >= proposalTotalPages}
                  onClick={() => { setProposalPage(p => p + 1); setSelectedProposalIds(new Set()); }}>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════ PRICES TABLE ══════════ */}
      {view === 'prices' && (
        <>
          {loadingPriceApprovals ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : priceApprovals.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <DollarSign size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Không có giá cần duyệt</p>
              <p className="text-sm mt-1">Các booking với giá đề xuất thấp hơn sàn sẽ hiện ở đây</p>
            </div>
          ) : (
            <>
              {!rejectDialog && <Selecto ref={priceSelectoRef} container={priceGridRef.current} {...priceSelectoProps} />}
              <div ref={priceGridRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden select-none" key={pricePage}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-amber-50/40">
                      <th className="px-3 py-3 w-8">
                        <div className="cursor-pointer" onClick={() => {
                          if (selectedPriceIds.size === priceApprovals.length) setSelectedPriceIds(new Set());
                          else setSelectedPriceIds(new Set(priceApprovals.map((b: any) => b.id)));
                        }}>
                          {selectedPriceIds.size === priceApprovals.length && priceApprovals.length > 0
                            ? <CheckSquare size={15} className="text-blue-600" />
                            : <Square size={15} className="text-gray-300" />}
                        </div>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Booking #</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Unit</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Khách hàng</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Ngành hàng</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Giá sàn (₫/m²)</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Đề xuất (₫/m²)</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Giá trần (₫/m²)</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Lệch %</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {priceApprovals.map((booking: any) => {
                      const unit = booking.unit;
                      const cp = booking.categoryPricing;
                      const dev: number = booking.priceDeviationPercent ?? 0;
                      const devColor = dev > 10 ? 'text-red-600' : dev > 5 ? 'text-orange-500' : 'text-yellow-600';
                      const devBg = dev > 10 ? 'bg-red-50' : dev > 5 ? 'bg-orange-50' : 'bg-yellow-50';
                      const isSelected = selectedPriceIds.has(booking.id);
                      return (
                        <tr key={booking.id}
                          className={`${DRAG_SELECT_CLASS} transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50/60'}`}
                          data-price-id={booking.id}
                        >
                          <td className="px-3 py-3 w-8" data-checkbox>
                            <div className="cursor-pointer" onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPriceIds((prev) => {
                                const next = new Set(prev);
                                next.has(booking.id) ? next.delete(booking.id) : next.add(booking.id);
                                return next;
                              });
                            }}>
                              {isSelected
                                ? <CheckSquare size={15} className="text-blue-600" />
                                : <Square size={15} className="text-gray-300 hover:text-gray-500" />}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{booking.bookingNumber}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Building2 size={13} className="text-gray-400 shrink-0" />
                              <span className="font-medium">{unit?.code}</span>
                              {unit?.floor?.name && <span className="text-xs text-gray-400">{unit.floor.name}</span>}
                            </div>
                            {unit?.mall?.name && <div className="text-xs text-gray-400 mt-0.5 pl-5">{unit.mall.name}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{booking.lead?.brandName ?? booking.customer?.companyName ?? '—'}</div>
                            {booking.lead?.contactName && <div className="text-xs text-gray-400">{booking.lead.contactName}</div>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {unit?.category ?? unit?.categoryRef?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                            {fmtPrice(cp?.minRentPerSqm)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <span className={`font-bold ${devColor}`}>{fmtPrice(booking.proposedRentPerSqm)}</span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-green-700">
                            {fmtPrice(cp?.maxRentPerSqm)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${devBg} ${devColor}`}>
                              <AlertTriangle size={11} />
                              -{dev.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 hover:border-red-300 transition-colors disabled:opacity-40"
                                title="Từ chối giá"
                                disabled={anyPending}
                                onClick={(e) => { e.stopPropagation(); setRejectDialog({ ids: [booking.id], type: 'price' }); }}
                              >
                                <XCircle size={13} /> Từ chối
                              </button>
                              <button
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 hover:border-green-300 transition-colors disabled:opacity-40"
                                title="Phê duyệt giá"
                                disabled={anyPending}
                                onClick={(e) => { e.stopPropagation(); approvePriceMutation.mutate({ id: booking.id }); }}
                              >
                                {approvePriceMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                Duyệt
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!loadingPriceApprovals && priceTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>{priceTotal} booking chờ duyệt giá</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={pricePage === 1} onClick={() => { setPricePage(p => p - 1); setSelectedPriceIds(new Set()); }}>Trước</Button>
                <span className="px-2 py-1">Trang {pricePage} / {priceTotalPages}</span>
                <Button variant="outline" size="sm" disabled={pricePage >= priceTotalPages} onClick={() => { setPricePage(p => p + 1); setSelectedPriceIds(new Set()); }}>Sau</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════ HISTORY TAB ══════════ */}
      {view === 'history' && (
        <>
          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-4">
            {(['ALL', 'APPROVED', 'REJECTED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setHistoryStatus(s); setHistoryPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  historyStatus === s
                    ? s === 'APPROVED' ? 'bg-green-50 border-green-300 text-green-700'
                      : s === 'REJECTED' ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {s === 'ALL' ? 'Tất cả' : s === 'APPROVED' ? 'Đã duyệt' : 'Từ chối'}
              </button>
            ))}
            {!loadingHistory && (
              <span className="text-xs text-gray-400 ml-auto">{historyTotal} bản ghi</span>
            )}
          </div>

          {loadingHistory ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : historySteps.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <History size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Chưa có lịch sử</p>
              <p className="text-sm mt-1">Các quyết định duyệt/từ chối sẽ hiện ở đây</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Proposal</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Khách thuê</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Bước duyệt</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Người duyệt</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Thời gian</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Lý do / Ghi chú</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs tracking-wider">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historySteps.map((step: any) => {
                    const proposal = step.workflow?.proposal;
                    return (
                      <tr key={step.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-600">
                            {proposal?.proposalNumber ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm">{proposal?.tenant?.brandName ?? '—'}</div>
                          {proposal?.unit && (
                            <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <Building2 size={11} />
                              {proposal.unit.code}
                              {proposal.unit.floor?.name && ` · ${proposal.unit.floor.name}`}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-800">{step.stepName}</div>
                          <span className="text-xs text-gray-400">Bước {step.stepOrder}</span>
                        </td>
                        <td className="px-4 py-3">
                          {step.approver ? (
                            <div>
                              <div className="text-sm font-medium">{step.approver.fullName}</div>
                              <div className="text-xs text-gray-400">{step.approver.role}</div>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {step.decidedAt
                            ? new Date(step.decidedAt).toLocaleString('vi-VN', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          {step.comment ? (
                            <span className={`text-xs px-2 py-1 rounded ${
                              step.status === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {step.comment}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {step.status === 'APPROVED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <CheckCircle size={12} /> Đã duyệt
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              <XCircle size={12} /> Từ chối
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loadingHistory && historyTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>{historyTotal} bản ghi</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={historyPage === 1}
                  onClick={() => setHistoryPage(p => p - 1)}>
                  <ChevronLeft size={14} />
                </Button>
                <span className="px-2 py-1 text-xs">Trang {historyPage} / {historyTotalPages}</span>
                <Button variant="outline" size="sm" disabled={historyPage >= historyTotalPages}
                  onClick={() => setHistoryPage(p => p + 1)}>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Reject Dialog ── */}
      <Dialog open={!!rejectDialog} onOpenChange={() => closeRejectDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle size={18} className="text-red-500" />
              Từ chối {rejectDialog?.type === 'price' ? 'giá đề xuất' : 'phê duyệt'}
              {rejectDialog?.bulk && rejectDialog.ids.length > 1 && (
                <Badge className="bg-red-100 text-red-700 border-0 text-xs ml-1">{rejectDialog.ids.length} mục</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-gray-600 mb-3">Vui lòng nhập lý do từ chối:</p>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Lý do từ chối..."
              onKeyDown={(e) => e.key === 'Enter' && handleRejectConfirm()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRejectDialog}>Hủy</Button>
            <Button variant="destructive" onClick={handleRejectConfirm}
              disabled={rejectMutation.isPending || rejectPriceMutation.isPending || bulkRejectMutation.isPending || bulkRejectPriceMutation.isPending}>
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
