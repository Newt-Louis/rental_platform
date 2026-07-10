import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { spacesApi, bookingApi, crmApi, customersApi, categoriesApi, slotsApi, proposalsApi, contractsApi } from '@/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMallStore } from '@/store/mall.store';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetSection, SheetRow } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FloorPlan } from '@/components/FloorPlan';
import { FloorPlanEditor } from '@/components/FloorPlanEditor';
import { MallMapViewer } from '@/components/MallMapViewer';
import { MallMapEditor } from '@/components/MallMapEditor';
import { SlotSummaryBadge } from '@/components/SlotSummaryBadge';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/components/ui/use-toast';
import {
  Building2, Search, LayoutGrid, Map, Calendar, DollarSign,
  User, Mail, Phone, FileText, Plus, Pencil, Trash2, AlertTriangle, Layers,
  BookmarkPlus, Clock, ChevronUp, ChevronDown, X, Users, ArrowRight,
  Image, Upload, Star, LayoutList, BarChart3, Filter, CheckSquare, Square,
  Columns, RefreshCw, TrendingUp, AlertCircle, SlidersHorizontal, CheckCircle, Lock,
  GitMerge, Scissors, BadgeCheck,
} from 'lucide-react';
import type { Unit, UnitMedia, UnitSlotSummary } from '@/types';
import {
  STATUS_CONFIG, STATUS_ICONS, SPACE_TYPE_OPTIONS, TIER_OPTIONS,
  LEASE_TERM_OPTIONS, CATEGORIES, API_ORIGIN, mediaUrl, fmtDate, fmtMoney,
} from './spaces.constants';
import { useSpacesFilters } from '@/hooks/useSpacesFilters';
import { useSpacesStore } from '@/store/spaces.store';
import { ConfirmDialog } from '@/components/spaces/dialogs/ConfirmDialog';
import { CreateEditUnitDialog } from '@/components/spaces/dialogs/CreateEditUnitDialog';
import { CreateEditFloorDialog } from '@/components/spaces/dialogs/CreateEditFloorDialog';
import { CreateBookingDialog } from '@/components/spaces/dialogs/CreateBookingDialog';
import { ConvertBookingDialog } from '@/components/spaces/dialogs/ConvertBookingDialog';
import { MergeUnitsDialog } from '@/components/spaces/dialogs/MergeUnitsDialog';
import { BulkStatusDialog, BulkCategoryDialog, BulkRentDialog } from '@/components/spaces/dialogs/BulkDialogs';
import { UnitCard } from '@/components/spaces/UnitCard';
import { SpacesAlerts } from '@/components/spaces/SpacesAlerts';
import { AnalyticsView } from '@/components/spaces/AnalyticsView';

// Local constant used by SalesPipelineTab (stays in this file)
const BOOKING_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ACTIVE:    { label: 'Đang giữ',  color: 'bg-amber-100 text-amber-700' },
  PENDING:   { label: 'Chờ',       color: 'bg-blue-100 text-gray-700' },
  EXPIRED:   { label: 'Hết hạn',   color: 'bg-gray-100 text-gray-500' },
  CANCELLED: { label: 'Đã hủy',    color: 'bg-red-100 text-red-600' },
  CONVERTED: { label: 'Đã convert',color: 'bg-green-100 text-green-700' },
};

// ─── Unit Media Tab ───────────────────────────────────────────────────────────

const MEDIA_TYPE_LABELS: Record<string, string> = {
  PHOTO: 'áº¢nh',
  FLOOR_PLAN: 'Floor Plan',
  VIDEO: 'Video',
  RENDER_3D: '3D Render',
  BROCHURE: 'Brochure',
  SITE_MAP: 'SÆ¡ Ä‘á»“',
};

function UnitMediaTab({ unitId }: { unitId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mediaType, setMediaType] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useState<HTMLInputElement | null>(null);

  const { data: mediaList = [], isLoading } = useQuery<UnitMedia[]>({
    queryKey: ['unit-media', unitId, mediaType],
    queryFn: () => spacesApi.listUnitMedia(unitId, mediaType || undefined),
    enabled: !!unitId,
  });

  const deleteMutation = useMutation({
    mutationFn: (mediaId: string) => spacesApi.deleteUnitMedia(unitId, mediaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-media', unitId] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unitId] });
      toast({ title: 'ÄÃ£ xÃ³a media' });
    },
    onError: () => toast({ title: 'Lá»—i xÃ³a media', variant: 'destructive' }),
  });

  const setCoverMutation = useMutation({
    mutationFn: (mediaId: string) => spacesApi.updateUnitMedia(unitId, mediaId, { isCover: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-media', unitId] });
      toast({ title: 'ÄÃ£ Ä‘áº·t áº£nh bÃ¬a' });
    },
    onError: () => toast({ title: 'Lá»—i', variant: 'destructive' }),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const ext = file.name.split('.').pop()?.toLowerCase();
      const typeByExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext ?? '') ? 'PHOTO'
        : ['pdf'].includes(ext ?? '') ? 'BROCHURE'
        : ['mp4', 'mov', 'avi'].includes(ext ?? '') ? 'VIDEO'
        : 'PHOTO';
      const type = mediaType || typeByExt;
      fd.append('type', type);
      await spacesApi.uploadUnitMedia(unitId, fd);
      qc.invalidateQueries({ queryKey: ['unit-media', unitId] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unitId] });
      toast({ title: 'ÄÃ£ táº£i lÃªn thÃ nh cÃ´ng' });
    } catch {
      toast({ title: 'Lá»—i táº£i lÃªn', variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {['', ...Object.keys(MEDIA_TYPE_LABELS)].map((t) => (
            <button
              key={t}
              onClick={() => setMediaType(t)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                mediaType === t
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t === '' ? 'Táº¥t cáº£' : MEDIA_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium cursor-pointer hover:bg-gray-800 transition-colors">
          <Upload size={12} />
          {uploading ? 'Äang táº£i...' : 'ThÃªm'}
          <input
            type="file"
            className="hidden"
            accept="image/*,video/*,application/pdf"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : mediaList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
          <Image size={32} className="opacity-30" />
          <p className="text-sm">ChÆ°a cÃ³ tÃ i liá»‡u nÃ o</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {mediaList.map((m) => (
            <div
              key={m.id}
              className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${
                m.isCover ? 'border-amber-400' : 'border-transparent hover:border-gray-200'
              }`}
            >
              {m.type === 'PHOTO' || m.type === 'RENDER_3D' || m.type === 'FLOOR_PLAN' || m.type === 'SITE_MAP' ? (
                <img
                  src={mediaUrl(m.fileUrl)}
                  alt={m.caption ?? m.fileName}
                  className="w-full aspect-square object-cover bg-gray-100"
                />
              ) : (
                <div className="w-full aspect-square bg-gray-100 flex flex-col items-center justify-center text-gray-400 gap-1">
                  <FileText size={24} />
                  <span className="text-xs text-center px-1 leading-tight">{MEDIA_TYPE_LABELS[m.type] ?? m.type}</span>
                </div>
              )}
              {m.isCover && (
                <div className="absolute top-1 left-1 bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Cover</div>
              )}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!m.isCover && (m.type === 'PHOTO' || m.type === 'RENDER_3D') && (
                  <button
                    className="w-5 h-5 rounded bg-amber-400 text-white flex items-center justify-center hover:bg-amber-500"
                    title="Äáº·t lÃ m áº£nh bÃ¬a"
                    onClick={() => setCoverMutation.mutate(m.id)}
                  >
                    <Star size={10} />
                  </button>
                )}
                <button
                  className="w-5 h-5 rounded bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                  title="XÃ³a"
                  onClick={() => deleteMutation.mutate(m.id)}
                >
                  <X size={10} />
                </button>
              </div>
              {m.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 truncate">
                  {m.caption}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Sales Pipeline Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PROP_STATUS_CFG: Record<string, { label: string; color: string }> = {
  DRAFT:        { label: 'Draft',      color: 'bg-gray-100 text-gray-600' },
  SUBMITTED:    { label: 'Chá» duyá»‡t', color: 'bg-yellow-100 text-yellow-700' },
  UNDER_REVIEW: { label: 'Äang xem',  color: 'bg-blue-100 text-blue-700' },
  APPROVED:     { label: 'ÄÃ£ duyá»‡t',  color: 'bg-green-100 text-green-700' },
  REJECTED:     { label: 'Tá»« chá»‘i',   color: 'bg-red-100 text-red-700' },
  CONVERTED:    { label: 'ÄÃ£ kÃ½ HÄ', color: 'bg-purple-100 text-purple-700' },
};

function SalesPipelineTab({
  unit, onCreateBooking, onConvertBooking, onCancelBooking,
  onSubmitProposal, onConvertProposal, onNavigateProposals,
  cancelLoading, submitLoading, convertLoading,
}: {
  unit: any;
  onCreateBooking: () => void;
  onConvertBooking: (b: any) => void;
  onCancelBooking: (id: string) => void;
  onSubmitProposal: (id: string) => void;
  onConvertProposal: (id: string) => void;
  onNavigateProposals: () => void;
  cancelLoading: boolean;
  submitLoading: boolean;
  convertLoading: boolean;
}) {
  const bookings: any[] = unit.bookings ?? [];
  const proposals: any[] = unit.proposals ?? [];

  const activeBookings = bookings.filter((b) => ['ACTIVE','PENDING'].includes(b.status));
  const historyBookings = bookings.filter((b) => !['ACTIVE','PENDING'].includes(b.status));

  // Máº·t báº±ng Ä‘Ã£ cÃ³ khÃ¡ch thuÃª chÃ­nh thá»©c â€” khÃ´ng cho táº¡o booking má»›i chá»“ng lÃªn (khá»›p cháº·n á»Ÿ backend)
  const isCommitted = ['OCCUPIED', 'CONTRACTED', 'UNDER_FITOUT'].includes(unit.status);

  const fmtVND = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'â€”';

  return (
    <div className="space-y-5">

      {/* Cáº£nh bÃ¡o khi máº·t báº±ng Ä‘Ã£ cÃ³ khÃ¡ch thuÃª chÃ­nh thá»©c â€” khÃ´ng thá»ƒ táº¡o booking má»›i */}
      {isCommitted && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 flex items-start gap-2 text-xs text-gray-500">
          <Lock size={13} className="mt-0.5 shrink-0" />
          <span>Máº·t báº±ng Ä‘ang á»Ÿ tráº¡ng thÃ¡i "{STATUS_CONFIG[unit.status]?.label ?? unit.status}" â€” Ä‘Ã£ cÃ³ khÃ¡ch thuÃª chÃ­nh thá»©c nÃªn khÃ´ng thá»ƒ táº¡o booking má»›i cho khÃ¡ch khÃ¡c.</span>
        </div>
      )}

      {/* CTA khi trá»‘ng */}
      {bookings.length === 0 && proposals.length === 0 && !isCommitted && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center space-y-2">
          <p className="text-sm text-amber-700 font-medium">Máº·t báº±ng chÆ°a cÃ³ khÃ¡ch â€” táº¡o booking Ä‘á»ƒ báº¯t Ä‘áº§u</p>
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white gap-2" onClick={onCreateBooking}>
            <BookmarkPlus size={14} /> Táº¡o Booking
          </Button>
        </div>
      )}

      {/* Active bookings */}
      {activeBookings.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold tracking-wider text-gray-400 flex items-center gap-1.5">
              <Users size={11} /> HÃ€NG Äá»¢I BOOKING ({activeBookings.length})
            </span>
            {!isCommitted && (
              <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={onCreateBooking}>
                <Plus size={10} /> ThÃªm
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {activeBookings.map((b: any) => {
              const bcfg = BOOKING_STATUS_CONFIG[b.status] ?? BOOKING_STATUS_CONFIG.PENDING;
              const name = b.lead?.brandName ?? b.customer?.companyName ?? 'â€”';
              const contact = b.lead?.contactName ?? b.customer?.brandName ?? '';
              const dl = b.expiresAt
                ? Math.max(0, Math.ceil((new Date(b.expiresAt).getTime() - Date.now()) / 86400000))
                : null;
              return (
                <div key={b.id} className={`rounded-xl border p-3 ${
                  b.priority === 1 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        b.priority === 1 ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>{b.priority}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{name}</div>
                        {contact && <div className="text-xs text-gray-400 truncate">{contact}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {dl !== null && b.status === 'ACTIVE' && (
                        <span className={`text-xs flex items-center gap-0.5 font-medium ${dl <= 7 ? 'text-red-500' : 'text-gray-400'}`}>
                          <Clock size={10} /> {dl}d
                        </span>
                      )}
                      <Badge className={`text-xs border-0 ${bcfg.color}`}>{bcfg.label}</Badge>
                    </div>
                  </div>

                  {/* Booking details */}
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-500">
                    {b.requestedArea && <span>DT: {b.requestedArea.toLocaleString()} mÂ²</span>}
                    {b.requestedTerm && <span>Háº¡n: {b.requestedTerm} th</span>}
                    {b.expectedRent && <span>Ká»³ vá»ng: {fmtVND(b.expectedRent)} â‚«/mÂ²</span>}
                    {b.proposedRentPerSqm && <span>Äá» xuáº¥t: {fmtVND(b.proposedRentPerSqm)} â‚«/mÂ²</span>}
                    {b.assignedTo && <span className="col-span-2">Sale: {b.assignedTo.fullName}</span>}
                  </div>

                  {/* Linked proposal */}
                  {b.proposal && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <FileText size={11} className="text-gray-400" />
                      <span className="font-mono">{b.proposal.proposalNumber}</span>
                      <Badge className={`text-xs border-0 ${PROP_STATUS_CFG[b.proposal.status]?.color}`}>
                        {PROP_STATUS_CFG[b.proposal.status]?.label}
                      </Badge>
                      <button className="text-gray-400 hover:text-gray-700 ml-auto" onClick={onNavigateProposals}>
                        Xem â†’
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    {b.status === 'ACTIVE' && !b.proposal && (
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1 text-green-700 border-green-200 hover:bg-green-50"
                        onClick={() => onConvertBooking(b)}>
                        <ArrowRight size={10} /> Láº­p Ä‘á» xuáº¥t
                      </Button>
                    )}
                    {['ACTIVE','PENDING'].includes(b.status) && (
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                        disabled={cancelLoading} onClick={() => onCancelBooking(b.id)}>
                        <X size={10} /> Há»§y
                      </Button>
                    )}
                  </div>
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
              <FileText size={11} /> Äá»€ XUáº¤T ({proposals.length})
            </span>
            <button className="text-xs text-gray-500 hover:underline" onClick={onNavigateProposals}>
              Quáº£n lÃ½ â†’
            </button>
          </div>
          <div className="space-y-3">
            {proposals.map((pr: any) => {
              const ps = PROP_STATUS_CFG[pr.status] ?? PROP_STATUS_CFG.DRAFT;
              const clientName = pr.tenant?.brandName ?? pr.lead?.brandName ?? 'â€”';
              const steps: any[] = pr.approvalWorkflow?.steps ?? [];

              return (
                <div key={pr.id} className={`rounded-xl border p-3 space-y-3 ${
                  pr.status === 'APPROVED' ? 'border-green-200 bg-green-50' :
                  pr.status === 'REJECTED' ? 'border-red-100 bg-red-50/40' :
                  pr.status === 'CONVERTED' ? 'border-purple-100 bg-purple-50/30' :
                  pr.status === 'SUBMITTED' || pr.status === 'UNDER_REVIEW' ? 'border-yellow-200 bg-yellow-50/40' :
                  'border-gray-200 bg-white'
                }`}>
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-sm font-mono font-semibold">{pr.proposalNumber}</span>
                      <span className="text-xs text-gray-500 ml-2">{clientName}</span>
                    </div>
                    <Badge className={`text-xs border-0 flex-shrink-0 ${ps.color}`}>{ps.label}</Badge>
                  </div>

                  {/* Financial summary */}
                  {(() => {
                    const totalMonthly = (pr.monthlyRent ?? 0)
                      + (pr.monthlyCAM ?? 0)
                      + ((pr.area ?? 0) * (pr.serviceFeeSqm ?? 0))
                      + ((pr.area ?? 0) * (pr.businessSupportFeeSqm ?? 0));
                    return (
                      <div className="space-y-1 text-xs">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <div>
                            <span className="text-gray-400">Diá»‡n tÃ­ch: </span>
                            <span className="font-medium">{pr.area?.toLocaleString()} mÂ²</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Thá»i háº¡n: </span>
                            <span className="font-medium">{pr.term} thÃ¡ng</span>
                          </div>
                          <div>
                            <span className="text-gray-400">GiÃ¡ thuÃª/mÂ²: </span>
                            <span className="font-medium">{fmtVND(pr.rentPerSqm)} â‚«</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Tiá»n thuÃª/thÃ¡ng: </span>
                            <span className="font-medium">{fmtVND(pr.monthlyRent)} â‚«</span>
                          </div>
                          {(pr.monthlyCAM ?? 0) > 0 && (
                            <div>
                              <span className="text-gray-400">PhÃ­ DVPT/thÃ¡ng: </span>
                              <span className="font-medium">{fmtVND(pr.monthlyCAM)} â‚«</span>
                            </div>
                          )}
                          {(pr.serviceFeeSqm ?? 0) > 0 && (
                            <div>
                              <span className="text-gray-400">PhÃ­ DV/thÃ¡ng: </span>
                              <span className="font-medium">{fmtVND((pr.area ?? 0) * pr.serviceFeeSqm)} â‚«</span>
                            </div>
                          )}
                          {(pr.businessSupportFeeSqm ?? 0) > 0 && (
                            <div>
                              <span className="text-gray-400">PhÃ­ HT KD/thÃ¡ng: </span>
                              <span className="font-medium">{fmtVND((pr.area ?? 0) * pr.businessSupportFeeSqm)} â‚«</span>
                            </div>
                          )}
                          {pr.discount > 0 && (
                            <div>
                              <span className="text-gray-400">Chiáº¿t kháº¥u: </span>
                              <span className="text-red-600 font-medium">{pr.discount}%</span>
                            </div>
                          )}
                          {pr.rentFree > 0 && (
                            <div>
                              <span className="text-gray-400">Rent-free: </span>
                              <span className="font-medium">{pr.rentFree} thÃ¡ng</span>
                            </div>
                          )}
                        </div>
                        {/* Total monthly highlight */}
                        <div className="flex items-center justify-between bg-gray-50 rounded px-2 py-1 mt-1">
                          <span className="text-gray-500">Tá»•ng pháº£i tráº£/thÃ¡ng:</span>
                          <span className="font-bold text-gray-900">{fmtVND(totalMonthly)} â‚«</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Tá»•ng giÃ¡ trá»‹ HÄ:</span>
                          <span className="font-bold text-green-700">{fmtVND(pr.totalContractValue)} â‚«</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 text-gray-400">
                          <span>Báº¯t Ä‘áº§u: {fmtDate(pr.startDate)}</span>
                          <span>Káº¿t thÃºc: {fmtDate(pr.endDate)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Approval steps */}
                  {steps.length > 0 && (
                    <div className="border-t border-dashed border-gray-200 pt-2">
                      <div className="text-xs text-gray-400 mb-1.5 font-medium">QUY TRÃŒNH PHÃŠ DUYá»†T</div>
                      <div className="space-y-1">
                        {steps.map((s: any) => (
                          <div key={s.id} className="flex items-center gap-2 text-xs">
                            {s.status === 'APPROVED' ? (
                              <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                            ) : s.status === 'REJECTED' ? (
                              <X size={12} className="text-red-500 flex-shrink-0" />
                            ) : (
                              <div className="w-3 h-3 rounded-full border-2 border-gray-300 flex-shrink-0" />
                            )}
                            <span className={`flex-1 ${s.status === 'PENDING' ? 'text-gray-500' : 'text-gray-700'}`}>
                              BÆ°á»›c {s.stepOrder}: {s.approver?.fullName ?? s.approverRole}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              s.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                              s.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {s.status === 'APPROVED' ? 'Duyá»‡t' : s.status === 'REJECTED' ? 'Tá»« chá»‘i' : 'Chá»'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contract link */}
                  {pr.contract && (
                    <div className="flex items-center gap-2 text-xs bg-purple-50 border border-purple-100 rounded-lg p-2">
                      <FileText size={12} className="text-purple-500" />
                      <span className="font-mono font-medium">{pr.contract.contractNumber}</span>
                      <Badge className="text-xs border-0 bg-purple-100 text-purple-700 ml-auto">{pr.contract.status}</Badge>
                    </div>
                  )}

                  {/* Quick actions */}
                  <div className="flex gap-1.5 flex-wrap">
                    {pr.status === 'DRAFT' && (
                      <Button size="sm" className="h-7 text-xs px-2 gap-1 bg-gray-900 hover:bg-gray-800 text-white"
                        disabled={submitLoading} onClick={() => onSubmitProposal(pr.id)}>
                        <ArrowRight size={11} /> Gá»­i phÃª duyá»‡t
                      </Button>
                    )}
                    {pr.status === 'APPROVED' && !pr.contract && (
                      <Button size="sm" className="h-7 text-xs px-2 gap-1 bg-green-600 hover:bg-green-700 text-white"
                        disabled={convertLoading} onClick={() => onConvertProposal(pr.id)}>
                        <CheckCircle size={11} /> KÃ½ Há»£p Ä‘á»“ng
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-gray-500"
                      onClick={onNavigateProposals}>
                      Chi tiáº¿t â†’
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Booking history */}
      {historyBookings.length > 0 && (
        <div>
          <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2">Lá»ŠCH Sá»¬ BOOKING</div>
          <div className="space-y-1">
            {historyBookings.map((b: any) => {
              const bcfg = BOOKING_STATUS_CONFIG[b.status] ?? BOOKING_STATUS_CONFIG.EXPIRED;
              const name = b.lead?.brandName ?? b.customer?.companyName ?? 'â€”';
              return (
                <div key={b.id} className="flex items-center justify-between py-1.5 px-2 text-xs text-gray-500 border border-gray-100 rounded-lg bg-gray-50">
                  <span className="font-medium text-gray-700">{name}</span>
                  <Badge className={`text-xs border-0 ${bcfg.color}`}>{bcfg.label}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Unit Detail Sheet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function UnitDetailSheet({
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
  const [bookingOpen, setBookingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'sales' | 'media' | 'slots'>('info');
  const [convertBooking, setConvertBooking] = useState<any | null>(null);

  const submitProposalMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.submitProposal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      toast({ title: 'ÄÃ£ gá»­i phÃª duyá»‡t' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lá»—i', variant: 'destructive' }),
  });

  const convertProposalMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.convertProposal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['units'] });
      toast({ title: 'ÄÃ£ chuyá»ƒn thÃ nh há»£p Ä‘á»“ng' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lá»—i', variant: 'destructive' }),
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

  const cancelBookingMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      bookingApi.cancel(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'ÄÃ£ há»§y booking' });
    },
    onError: () => toast({ title: 'Lá»—i há»§y booking', variant: 'destructive' }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => spacesApi.updateUnitWithHistory(detail?.id ?? unit!.id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'ÄÃ£ cáº­p nháº­t tráº¡ng thÃ¡i' });
    },
    onError: () => toast({ title: 'Lá»—i cáº­p nháº­t tráº¡ng thÃ¡i', variant: 'destructive' }),
  });

  const splitMutation = useMutation({
    mutationFn: () => spacesApi.splitUnit((detail as any)?.id ?? unit!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['unit-detail', unit?.id] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'ÄÃ£ tÃ¡ch sáº£nh thÃ nh cÃ´ng' });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lá»—i tÃ¡ch sáº£nh', variant: 'destructive' }),
  });

  const d: any = detail ?? unit;
  const cfg = d ? STATUS_CONFIG[d.status] : null;
  const monthlyEst = d ? ((d.baseRentPerSqm ?? 0) + (d.camPerSqm ?? 0)) * d.areaNLA : 0;

  return (
    <Sheet
      open={!!unit}
      onClose={onClose}
      title={d?.code ?? ''}
      subtitle={`${d?.floor?.name ?? ''}${d?.zone?.name ? ' Â· ' + d.zone.name : ''}`}
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
              ['info', 'ThÃ´ng tin', LayoutList],
              ['sales', 'BÃ¡n hÃ ng', TrendingUp],
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
              onCancelBooking={(id) => cancelBookingMutation.mutate({ id, reason: 'Há»§y tá»« UI' })}
              onSubmitProposal={(id) => submitProposalMutation.mutate(id)}
              onConvertProposal={(id) => convertProposalMutation.mutate(id)}
              onNavigateProposals={() => { navigate('/proposals'); onClose(); }}
              cancelLoading={cancelBookingMutation.isPending}
              submitLoading={submitProposalMutation.isPending}
              convertLoading={convertProposalMutation.isPending}
            />
          )}

          {/* Info tab content */}
          {activeTab === 'info' && (<>

          {/* Slot booking summary on main unit */}
          {slotSummary && slotSummary.totalSlots > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold tracking-wider text-gray-700">BOOKING SLOT (Ã” NHá»Ž)</span>
                <button
                  onClick={() => setActiveTab('slots')}
                  className="text-xs text-gray-700 hover:underline"
                >
                  Xem chi tiáº¿t â†’
                </button>
              </div>
              <SlotSummaryBadge summary={slotSummary} />
            </div>
          )}

          {/* Change status */}
          <div>
            <label className="text-xs font-semibold tracking-wider text-gray-400 block mb-1.5">Äá»”I TRáº NG THÃI</label>
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
          </div>

          {/* Space info */}
          <SheetSection label="THÃ”NG TIN Máº¶T Báº°NG" className="bg-gray-50">
            <SheetRow label="Diá»‡n tÃ­ch GFA"      value={`${d.areaGFA?.toLocaleString()} mÂ²`}  icon={Building2} />
            <SheetRow label="Diá»‡n tÃ­ch NLA"      value={`${d.areaNLA?.toLocaleString()} mÂ²`}  icon={Building2} />
            <SheetRow label="GiÃ¡ thuÃª cÆ¡ báº£n"    value={d.baseRentPerSqm ? fmtMoney(d.baseRentPerSqm) : 'â€”'} icon={DollarSign} />
            <SheetRow label="PhÃ­ CAM"            value={d.camPerSqm ? fmtMoney(d.camPerSqm) : 'â€”'} icon={DollarSign} />
            {monthlyEst > 0 && (
              <SheetRow
                label="Æ¯á»›c tÃ­nh / thÃ¡ng"
                value={<span className="text-gray-700 font-semibold">{new Intl.NumberFormat('vi-VN').format(monthlyEst)} â‚«</span>}
                icon={DollarSign}
              />
            )}
            {d.spaceType && (
              <SheetRow label="Loáº¡i sáº£nh" value={SPACE_TYPE_OPTIONS.find(o => o.value === d.spaceType)?.label ?? d.spaceType} icon={Building2} />
            )}
            {d.tier && (
              <SheetRow label="Tier" value={TIER_OPTIONS.find(o => o.value === d.tier)?.label ?? d.tier} icon={Star} />
            )}
            {d.leaseTermType && (
              <SheetRow label="HÃ¬nh thá»©c thuÃª" value={LEASE_TERM_OPTIONS.find(o => o.value === d.leaseTermType)?.label ?? d.leaseTermType} icon={Clock} />
            )}
            {d.isFlexibleArea && (
              <SheetRow
                label="Diá»‡n tÃ­ch linh Ä‘á»™ng"
                value={`${d.minFlexArea?.toLocaleString() ?? '?'} â€“ ${d.maxFlexArea?.toLocaleString() ?? '?'} mÂ²`}
                icon={SlidersHorizontal}
              />
            )}
          </SheetSection>

          {/* GAP #2 â€” Sáº£nh gá»™p info + TÃ¡ch sáº£nh */}
          {d.isCombined && (
            <SheetSection label="THÃ”NG TIN Sáº¢NH Gá»˜P" className="bg-violet-50">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-violet-700">
                  <GitMerge size={14} />
                  <span>Sáº£nh nÃ y Ä‘Æ°á»£c gá»™p tá»« {Array.isArray(d.mergedFromIds) ? d.mergedFromIds.length : '?'} sáº£nh nguá»“n</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-violet-300 text-violet-700 hover:bg-violet-100"
                  disabled={splitMutation.isPending || d.status === 'OCCUPIED' || d.status === 'CONTRACTED' || d.status === 'UNDER_FITOUT'}
                  onClick={() => splitMutation.mutate()}
                >
                  <Scissors size={12} />
                  {splitMutation.isPending ? 'Äang tÃ¡ch...' : 'TÃ¡ch sáº£nh'}
                </Button>
              </div>
              {(d.status === 'OCCUPIED' || d.status === 'CONTRACTED' || d.status === 'UNDER_FITOUT') && (
                <p className="text-xs text-violet-500 px-3 pb-2">KhÃ´ng thá»ƒ tÃ¡ch khi sáº£nh Ä‘ang Ä‘Æ°á»£c sá»­ dá»¥ng.</p>
              )}
            </SheetSection>
          )}

          {/* Tenant */}
          {d.tenant && (
            <SheetSection label="KHÃCH THUÃŠ HIá»†N Táº I" className="bg-green-50">
              <SheetRow label="ThÆ°Æ¡ng hiá»‡u"  value={d.tenant.brandName}    icon={User} />
              <SheetRow label="CÃ´ng ty"      value={d.tenant.companyName}  icon={Building2} />
              <SheetRow label="LiÃªn há»‡"      value={d.tenant.contactName}  icon={User} />
              <SheetRow label="Email"         value={d.tenant.contactEmail} icon={Mail} />
              <SheetRow label="Äiá»‡n thoáº¡i"   value={d.tenant.contactPhone} icon={Phone} />
            </SheetSection>
          )}

          {/* Lease dates */}
          {(d.leaseStartDate || d.leaseEndDate) && (
            <SheetSection label="THá»œI Háº N THUÃŠ" className="bg-gray-50">
              <SheetRow label="NgÃ y báº¯t Ä‘áº§u"  value={fmtDate(d.leaseStartDate)} icon={Calendar} />
              <SheetRow label="NgÃ y káº¿t thÃºc" value={fmtDate(d.leaseEndDate)}   icon={Calendar} />
            </SheetSection>
          )}

          {/* Active contracts */}
          {Array.isArray(d.contracts) && d.contracts.length > 0 && (
            <div>
              <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2">Há»¢P Äá»’NG HIá»†N Táº I</div>
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
                    <TrendingUp size={12} /> PIPELINE BÃN HÃ€NG
                  </span>
                  <button
                    className="text-xs text-amber-700 hover:underline font-medium"
                    onClick={() => setActiveTab('sales')}
                  >
                    Xem chi tiáº¿t â†’
                  </button>
                </div>
                <div className="flex gap-3 text-xs flex-wrap">
                  {activeBookings.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-700">
                      <Users size={11} /> {activeBookings.length} booking Ä‘ang chá»
                    </span>
                  )}
                  {activeProposals.length > 0 && (
                    <span className="flex items-center gap-1 text-gray-700">
                      <FileText size={11} /> {activeProposals.length} Ä‘á» xuáº¥t
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            {(d.status === 'VACANT' || d.status === 'BOOKING') && (
              <Button
                className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => { setBookingOpen(true); }}
              >
                <BookmarkPlus size={14} /> Táº¡o Booking
              </Button>
            )}
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => { onEdit(d); }}
            >
              <Pencil size={14} /> Sá»­a
            </Button>
            <Button
              variant="outline"
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => { onDelete(d); }}
            >
              <Trash2 size={14} /> XÃ³a
            </Button>
          </div>
          </>)}

          {/* Booking Dialog â€” Ä‘áº·t ngoÃ i khá»‘i activeTab === 'info' vÃ¬ "Táº¡o Booking" á»Ÿ tab BÃ¡n hÃ ng
              (SalesPipelineTab) cÅ©ng má»Ÿ dialog nÃ y; trÆ°á»›c Ä‘Ã¢y bá»‹ lá»“ng trong info nÃªn báº¥m tá»« tab
              khÃ¡c khÃ´ng tháº¥y popup cho tá»›i khi quay láº¡i tab ThÃ´ng tin. */}
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
        </div>
      )}
    </Sheet>
  );
}


function CompareModal({ 
  unitIds, 
  open, 
  onClose 
}: { 
  unitIds: string[]; 
  open: boolean; 
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['compare-units', unitIds],
    queryFn: () => spacesApi.compareUnits(unitIds),
    enabled: open && unitIds.length >= 2,
  });

  const units = data?.units ?? [];
  const summary = data?.summary;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns size={18} className="text-gray-500" />
            So sÃ¡nh {unitIds.length} máº·t báº±ng
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="py-10 text-center text-gray-400">Äang táº£i...</div>
        ) : units.length > 0 && (
          <div className="space-y-4">
            {/* Summary */}
            {summary && (
              <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-xs text-gray-500">GiÃ¡ thuÃª TB</div>
                  <div className="font-semibold">{Number(summary.avgRent).toLocaleString()} â‚«/mÂ²</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Diá»‡n tÃ­ch TB</div>
                  <div className="font-semibold">{Number(summary.avgArea).toLocaleString()} mÂ²</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Range giÃ¡</div>
                  <div className="font-semibold text-sm">{summary.minRent.toLocaleString()} - {summary.maxRent.toLocaleString()}</div>
                </div>
              </div>
            )}

            {/* Comparison table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Thuá»™c tÃ­nh</th>
                    {units.map((u: any) => (
                      <th key={u.id} className="text-left py-2 px-3 font-semibold">
                        {u.code}
                        {u.media?.[0]?.fileUrl && (
                          <img src={mediaUrl(u.media[0].fileUrl)} alt="" className="w-20 h-14 object-cover rounded mt-1" />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Tráº¡ng thÃ¡i</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">
                        <Badge className={STATUS_CONFIG[u.status]?.color}>{STATUS_CONFIG[u.status]?.label}</Badge>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Diá»‡n tÃ­ch NLA</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-medium">
                        {u.areaNLA.toLocaleString()} mÂ²
                        <span className={`ml-1 text-xs ${Number(u.areaVsAvg) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({u.areaVsAvg > 0 ? '+' : ''}{u.areaVsAvg}%)
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">GiÃ¡ thuÃª/mÂ²</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-medium">
                        {u.baseRentPerSqm.toLocaleString()} â‚«
                        <span className={`ml-1 text-xs ${Number(u.rentVsAvg) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({u.rentVsAvg > 0 ? '+' : ''}{u.rentVsAvg}%)
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">PhÃ­ CAM/mÂ²</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.camPerSqm.toLocaleString()} â‚«</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Tá»•ng/thÃ¡ng</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-semibold text-gray-700">
                        {u.totalMonthlyRent?.toLocaleString()} â‚«
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">NgÃ nh hÃ ng</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.category ?? 'â€”'}</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Táº§ng</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.floor?.name ?? 'â€”'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-gray-500">KhÃ¡ch thuÃª</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.tenant?.brandName ?? 'â€”'}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ÄÃ³ng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


type ViewMode = 'grid' | 'floor' | 'map' | 'analytics';

export default function SpacesPage() {
  const { selectedMallId } = useMallStore();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'LEASING_MANAGER' || user?.role === 'MALL_DIRECTOR';

  // View & filters
  const {
    search, setSearch,
    statusFilter, setStatusFilter,
    floorFilter, setFloorFilter,
    minArea, setMinArea,
    maxArea, setMaxArea,
    minRent, setMinRent,
    maxRent, setMaxRent,
    categoryFilter, setCategoryFilter,
    spaceTypeFilter, setSpaceTypeFilter,
    tierFilter, setTierFilter,
    leaseTermFilter, setLeaseTermFilter,
    hasAdvancedFilters,
    clearFilters,
  } = useSpacesFilters();
  const view = (searchParams.get('view') as ViewMode) ?? 'grid';
  const setView = (v: ViewMode) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('view', v);
    return next;
  }, { replace: true });
  // Shared UI state from store
  const {
    selectedUnit, setSelectedUnit,
    selectionMode, setSelectionMode,
    selectedIds, toggleSelect, selectAll, clearSelection,
    compareOpen, setCompareOpen,
    mergeDialogOpen, setMergeDialogOpen,
    mapEditorMode, setMapEditorMode,
    mapEditorFloorId, setMapEditorFloorId,
    reset: resetSpacesStore,
  } = useSpacesStore();

  // Advanced filter panel visibility (local UI state)
  const [showFilters, setShowFilters] = useState(false);

  // Selection & modals (local)
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingUnit, setDeletingUnit] = useState<any>(null);

  // Floor management (local)
  const [floorDialogOpen, setFloorDialogOpen] = useState(false);
  const [editingFloor, setEditingFloor] = useState<any>(null);
  const [deletingFloor, setDeletingFloor] = useState<any>(null);

  // Bulk action panel (local)
  const [bulkActionOpen, setBulkActionOpen] = useState<'status' | 'category' | 'rent' | null>(null);

  // Reset floor filter when mall changes
  const isFirstMallRender = useRef(true);
  useEffect(() => {
    if (isFirstMallRender.current) { isFirstMallRender.current = false; return; }
    setFloorFilter('');
  }, [selectedMallId]);

  // Clear selection when exiting selection mode
  useEffect(() => { if (!selectionMode) clearSelection(); }, [selectionMode]);

  // Reset store state when leaving the page
  useEffect(() => () => { resetSpacesStore(); }, []);

  const { data: floorsData } = useQuery({
    queryKey: ['floors', selectedMallId],
    queryFn: () => spacesApi.listFloors(selectedMallId ?? undefined),
    enabled: !!selectedMallId,
  });
  const floors: any[] = (floorsData?.data ?? floorsData ?? []).sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  const { data: categoryOptions } = useQuery({ queryKey: ['category-options'], queryFn: categoriesApi.getOptions, staleTime: 300_000 });
  const categoryNames: string[] = useMemo(() => {
    const fromApi = (categoryOptions as any[])?.map((c: any) => c.name).filter(Boolean) ?? [];
    return fromApi.length > 0 ? fromApi : CATEGORIES;
  }, [categoryOptions]);

  const { data, isLoading } = useQuery({
    queryKey: ['units', { search, status: statusFilter, mallId: selectedMallId, floorId: floorFilter, minArea, maxArea, minRent, maxRent, category: categoryFilter, spaceType: spaceTypeFilter, tier: tierFilter, leaseTermType: leaseTermFilter }],
    queryFn: () => spacesApi.listUnits({
      search: search || undefined,
      status: statusFilter || undefined,
      mallId: selectedMallId || undefined,
      floorId: floorFilter || undefined,
      minArea: minArea || undefined,
      maxArea: maxArea || undefined,
      minRent: minRent || undefined,
      maxRent: maxRent || undefined,
      category: categoryFilter || undefined,
      spaceType: spaceTypeFilter || undefined,
      tier: tierFilter || undefined,
      leaseTermType: leaseTermFilter || undefined,
      page: 1,
      limit: 300,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => spacesApi.deleteUnit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: 'ÄÃ£ xÃ³a máº·t báº±ng' });
      setDeletingUnit(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lá»—i xÃ³a', variant: 'destructive' }),
  });

  const deleteFloorMutation = useMutation({
    mutationFn: (id: string) => spacesApi.deleteFloor(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['floors'] });
      toast({ title: 'ÄÃ£ xÃ³a táº§ng' });
      setDeletingFloor(null);
      if (floorFilter === id) setFloorFilter('');
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lá»—i xÃ³a', variant: 'destructive' }),
  });

  const bulkMutation = useMutation({
    mutationFn: (params: { unitIds: string[]; updates: any }) => spacesApi.bulkUpdateUnits(params),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: `ÄÃ£ cáº­p nháº­t ${result.updated} máº·t báº±ng` });
      clearSelection();
      setSelectionMode(false);
      setBulkActionOpen(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lá»—i cáº­p nháº­t', variant: 'destructive' }),
  });

  const units: Unit[] = data?.data ?? [];

  const unitIds = units.map((u) => u.id);
  const { data: slotSummaries = {} } = useQuery<Record<string, UnitSlotSummary>>({
    queryKey: ['slot-summaries', unitIds.join(',')],
    queryFn: () => slotsApi.getSummaries(unitIds),
    enabled: unitIds.length > 0,
  });
  
  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mall Spaces</h1>
          <p className="text-sm text-gray-500 mt-1">Quáº£n lÃ½ máº·t báº±ng vÃ  tÃ¬nh tráº¡ng cho thuÃª</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
            <button
              onClick={() => setView('grid')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title="Danh sÃ¡ch"
            >
              <LayoutGrid size={14} /> <span className="hidden sm:inline">Danh sÃ¡ch</span>
            </button>
            <button
              onClick={() => setView('floor')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'floor' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title="SÆ¡ Ä‘á»“ táº§ng"
            >
              <Map size={14} /> <span className="hidden sm:inline">SÆ¡ Ä‘á»“ táº§ng</span>
            </button>
            <button
              onClick={() => { setView('map'); setMapEditorMode(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'map' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title="Báº£n Ä‘á»“ sá»‘"
            >
              <Map size={14} /> <span className="hidden sm:inline">Báº£n Ä‘á»“ sá»‘</span>
            </button>
            <button
              onClick={() => setView('analytics')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'analytics' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title="Analytics"
            >
              <BarChart3 size={14} /> <span className="hidden sm:inline">Analytics</span>
            </button>
          </div>
          {selectedMallId && (
            <Button onClick={() => setCreateOpen(true)} className="gap-2" title="ThÃªm máº·t báº±ng">
              <Plus size={15} /> <span className="hidden sm:inline">ThÃªm máº·t báº±ng</span>
            </Button>
          )}
        </div>
      </div>

      {/* Floor tabs */}
      {(floors.length > 0 || (isAdmin && selectedMallId)) && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
          <Layers size={14} className="text-gray-400 shrink-0" />
          <button
            onClick={() => setFloorFilter('')}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium border transition-colors whitespace-nowrap
              ${!floorFilter ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            Táº¥t cáº£ táº§ng
          </button>
          {floors.map((f: any) => (
            <div key={f.id} className="group relative shrink-0">
              <button
                onClick={() => setFloorFilter(floorFilter === f.id ? '' : f.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors whitespace-nowrap
                  ${floorFilter === f.id
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}
                  ${isAdmin ? 'pr-8' : ''}`}
              >
                {f.name}
                {f._count?.units > 0 && (
                  <span className={`ml-1.5 ${floorFilter === f.id ? 'text-blue-200' : 'text-gray-400'}`}>
                    {f._count.units}
                  </span>
                )}
              </button>
              {isAdmin && (
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingFloor(f); setFloorDialogOpen(true); }}
                    className={`p-0.5 rounded hover:bg-black/10 ${floorFilter === f.id ? 'text-white' : 'text-gray-400'}`}
                    title="Sá»­a táº§ng"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletingFloor(f); }}
                    className={`p-0.5 rounded hover:bg-black/10 ${floorFilter === f.id ? 'text-white' : 'text-gray-400'}`}
                    title="XÃ³a táº§ng"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {isAdmin && selectedMallId && (
            <button
              onClick={() => { setEditingFloor(null); setFloorDialogOpen(true); }}
              className="shrink-0 text-xs px-2.5 py-1.5 rounded-full font-medium border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 hover:border-gray-400 flex items-center gap-1 whitespace-nowrap"
            >
              <Plus size={12} /> ThÃªm táº§ng
            </button>
          )}
        </div>
      )}

      {/* Alerts */}
      {view !== 'analytics' && <SpacesAlerts mallId={selectedMallId} />}

      {/* Analytics View */}
      {view === 'analytics' && <AnalyticsView mallId={selectedMallId} />}

      {/* Filters (grid view) */}
      {view === 'grid' && (
        <div className="space-y-3 mb-4">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative w-full sm:flex-1 sm:max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="TÃ¬m mÃ£, tÃªn máº·t báº±ng..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Táº¥t cáº£ tráº¡ng thÃ¡i" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Táº¥t cáº£</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={selectionMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectionMode(!selectionMode)}
              className="gap-1.5"
            >
              <CheckSquare size={14} />
              <span className="hidden sm:inline">{selectionMode ? 'ThoÃ¡t' : 'Chá»n nhiá»u'}</span>
            </Button>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1.5"
            >
              <SlidersHorizontal size={14} />
              Bá»™ lá»c nÃ¢ng cao
              {hasAdvancedFilters && <span className="w-2 h-2 bg-gray-500 rounded-full" />}
            </Button>
            {(statusFilter || floorFilter || search || hasAdvancedFilters) && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X size={14} className="mr-1" /> XÃ³a bá»™ lá»c
              </Button>
            )}
          </div>

          {/* Advanced Filters Panel */}
          {showFilters && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Diá»‡n tÃ­ch min (mÂ²)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minArea}
                    onChange={(e) => setMinArea(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Diá»‡n tÃ­ch max (mÂ²)</label>
                  <Input
                    type="number"
                    placeholder="1000"
                    value={maxArea}
                    onChange={(e) => setMaxArea(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">GiÃ¡ thuÃª min (â‚«/mÂ²)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minRent}
                    onChange={(e) => setMinRent(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">GiÃ¡ thuÃª max (â‚«/mÂ²)</label>
                  <Input
                    type="number"
                    placeholder="1000000"
                    value={maxRent}
                    onChange={(e) => setMaxRent(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">NgÃ nh hÃ ng</label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Táº¥t cáº£ ngÃ nh hÃ ng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Táº¥t cáº£</SelectItem>
                      {categoryNames.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* GAP #4 */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Loáº¡i sáº£nh</label>
                  <Select value={spaceTypeFilter} onValueChange={setSpaceTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Táº¥t cáº£ loáº¡i" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Táº¥t cáº£</SelectItem>
                      {SPACE_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* GAP #6 */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Tier</label>
                  <Select value={tierFilter} onValueChange={setTierFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Táº¥t cáº£ tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Táº¥t cáº£</SelectItem>
                      {TIER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* GAP #3 */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">HÃ¬nh thá»©c thuÃª</label>
                  <Select value={leaseTermFilter} onValueChange={setLeaseTermFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Táº¥t cáº£" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Táº¥t cáº£</SelectItem>
                      {LEASE_TERM_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Selection Bar */}
      {selectionMode && selectedIds.size > 0 && view === 'grid' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 mb-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">
              ÄÃ£ chá»n {selectedIds.size} máº·t báº±ng
            </span>
            <Button variant="ghost" size="sm" onClick={() => selectAll(units.map(u => u.id))} className="text-gray-700">
              Chá»n táº¥t cáº£ ({units.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={() => clearSelection()} className="text-gray-700">
              Bá» chá»n
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size >= 2 && selectedIds.size <= 5 && (
              <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)} className="gap-1.5">
                <Columns size={14} /> So sÃ¡nh
              </Button>
            )}
            {/* GAP #2 â€” Gá»™p sáº£nh: chá»‰ hiá»‡n khi â‰¥2 unit Ä‘Æ°á»£c chá»n */}
            {selectedIds.size >= 2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMergeDialogOpen(true)}
                className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
              >
                <GitMerge size={14} /> Gá»™p sáº£nh
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setBulkActionOpen('status')} className="gap-1.5">
              <RefreshCw size={14} /> Äá»•i tráº¡ng thÃ¡i
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkActionOpen('category')} className="gap-1.5">
              <Filter size={14} /> Äá»•i ngÃ nh hÃ ng
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkActionOpen('rent')} className="gap-1.5">
              <DollarSign size={14} /> Äá»•i giÃ¡ thuÃª
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Action Dialogs */}
      <BulkStatusDialog
        open={bulkActionOpen === 'status'}
        count={selectedIds.size}
        onClose={() => setBulkActionOpen(null)}
        onConfirm={(status) => bulkMutation.mutate({ unitIds: Array.from(selectedIds), updates: { status } })}
        loading={bulkMutation.isPending}
      />
      <BulkCategoryDialog
        open={bulkActionOpen === 'category'}
        count={selectedIds.size}
        onClose={() => setBulkActionOpen(null)}
        onConfirm={(category) => bulkMutation.mutate({ unitIds: Array.from(selectedIds), updates: { category } })}
        loading={bulkMutation.isPending}
      />
      <BulkRentDialog
        open={bulkActionOpen === 'rent'}
        count={selectedIds.size}
        onClose={() => setBulkActionOpen(null)}
        onConfirm={(rent, cam) => bulkMutation.mutate({ unitIds: Array.from(selectedIds), updates: { baseRentPerSqm: rent, camPerSqm: cam } })}
        loading={bulkMutation.isPending}
      />

      {/* Compare Modal */}
      <CompareModal
        unitIds={Array.from(selectedIds)}
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
      />

      {/* Merge Units Dialog (GAP #2) */}
      <MergeUnitsDialog
        open={mergeDialogOpen}
        units={units.filter((u) => selectedIds.has(u.id))}
        mallId={selectedMallId ?? ''}
        onClose={() => setMergeDialogOpen(false)}
      />

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 15 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-20" /></CardContent></Card>
          ))}
        </div>
      ) : view === 'floor' ? (
        <FloorPlan
          units={units}
          onUnitClick={setSelectedUnit}
          selectedUnitId={selectedUnit?.id}
          slotSummaries={slotSummaries}
          allFloors={floors}
          isAdmin={isAdmin}
          onCreateFloor={() => { setEditingFloor(null); setFloorDialogOpen(true); }}
          onEditFloor={(f: any) => { setEditingFloor(f); setFloorDialogOpen(true); }}
          onDeleteFloor={(f: any) => setDeletingFloor(f)}
        />
      ) : view === 'map' ? (
        <div className="space-y-3">
          {/* Map mode toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Map size={16} className="text-blue-600" /> Báº£n Ä‘á»“ sá»‘ máº·t báº±ng
            </div>
            {isAdmin && (
              <div className="flex rounded-lg border overflow-hidden text-xs ml-auto">
                <button
                  onClick={() => { setMapEditorMode(false); setMapEditorFloorId(null); }}
                  className={`px-3 py-1.5 transition-colors ${!mapEditorMode ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Xem báº£n Ä‘á»“
                </button>
                <button
                  onClick={() => setMapEditorMode(true)}
                  className={`px-3 py-1.5 transition-colors ${mapEditorMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Chá»‰nh sá»­a sÆ¡ Ä‘á»“
                </button>
              </div>
            )}
          </div>

          {mapEditorMode && isAdmin ? (
            /* Editor: pick a floor first */
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">Chá»n táº§ng Ä‘á»ƒ chá»‰nh sá»­a:</span>
                {floors.map((f: any) => (
                  <button
                    key={f.id}
                    onClick={() => setMapEditorFloorId(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      mapEditorFloorId === f.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {f.level} â€” {f.name}
                    {f.floorPlanUrl ? (
                      <span className="ml-1 text-green-400">âœ“</span>
                    ) : (
                      <span className="ml-1 text-gray-300">+</span>
                    )}
                  </button>
                ))}
                {selectedMallId && (
                  <button
                    onClick={() => { setEditingFloor(null); setFloorDialogOpen(true); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-blue-300 text-blue-500 hover:bg-blue-50 transition-all flex items-center gap-1"
                  >
                    <Plus size={11} /> ThÃªm táº§ng
                  </button>
                )}
              </div>
              {mapEditorFloorId ? (
                <MallMapEditor floorId={mapEditorFloorId} />
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-sm border-2 border-dashed rounded-xl gap-3">
                  {!selectedMallId ? (
                    <span className="text-center px-6">Vui lÃ²ng chá»n má»™t <strong className="text-gray-600">mall cá»¥ thá»ƒ</strong> á»Ÿ header trÆ°á»›c (khÃ´ng pháº£i "Táº¥t cáº£ Mall")</span>
                  ) : floors.length === 0 ? (
                    <>
                      <span>ChÆ°a cÃ³ táº§ng nÃ o trong mall nÃ y</span>
                      <button
                        onClick={() => { setEditingFloor(null); setFloorDialogOpen(true); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        <Plus size={14} /> ThÃªm táº§ng Ä‘áº§u tiÃªn
                      </button>
                    </>
                  ) : (
                    <span>Chá»n má»™t táº§ng á»Ÿ trÃªn Ä‘á»ƒ báº¯t Ä‘áº§u chá»‰nh sá»­a sÆ¡ Ä‘á»“</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Viewer: show interactive map */
            floors.length > 0 ? (
              <MallMapViewer
                floors={floors}
                onUnitClick={(u) => setSelectedUnit(u)}
                onBookUnit={(u) => setSelectedUnit(u)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400 text-sm border-2 border-dashed rounded-xl">
                <Map size={36} className="opacity-30" />
                <p>ChÆ°a cÃ³ táº§ng nÃ o trong mall nÃ y</p>
              </div>
            )
          )}
        </div>
      ) : (
        <>
          <div className="text-sm text-gray-400 mb-3">{data?.total ?? units.length} máº·t báº±ng</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {units.map((unit) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                onClick={() => setSelectedUnit(unit)}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(unit.id)}
                onToggleSelect={() => toggleSelect(unit.id)}
                slotSummary={slotSummaries[unit.id]}
              />
            ))}
          </div>
          {units.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Building2 size={48} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium">KhÃ´ng tÃ¬m tháº¥y máº·t báº±ng</p>
              {selectedMallId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={14} /> ThÃªm máº·t báº±ng Ä‘áº§u tiÃªn
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* Unit detail sheet */}
      <UnitDetailSheet
        unit={selectedUnit}
        onClose={() => setSelectedUnit(null)}
        onEdit={(u) => setEditingUnit(u)}
        onDelete={(u) => setDeletingUnit(u)}
      />

      {/* Create unit dialog */}
      <CreateEditUnitDialog
        open={createOpen}
        mallId={selectedMallId ?? ''}
        defaultFloorId={floorFilter}
        onClose={() => setCreateOpen(false)}
      />

      {/* Edit unit dialog */}
      <CreateEditUnitDialog
        open={!!editingUnit}
        unit={editingUnit}
        mallId={selectedMallId ?? editingUnit?.mallId ?? ''}
        onClose={() => setEditingUnit(null)}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deletingUnit}
        title={`XÃ³a máº·t báº±ng ${deletingUnit?.code}?`}
        description={`Thao tÃ¡c nÃ y sáº½ áº©n máº·t báº±ng "${deletingUnit?.code}" khá»i há»‡ thá»‘ng. Dá»¯ liá»‡u lá»‹ch sá»­ sáº½ Ä‘Æ°á»£c giá»¯ láº¡i.`}
        onConfirm={() => deleteMutation.mutate(deletingUnit.id)}
        onCancel={() => setDeletingUnit(null)}
        loading={deleteMutation.isPending}
      />

      {/* Create/Edit floor dialog */}
      <CreateEditFloorDialog
        open={floorDialogOpen}
        floor={editingFloor}
        mallId={selectedMallId ?? ''}
        onClose={() => { setFloorDialogOpen(false); setEditingFloor(null); }}
      />

      {/* Delete floor confirm */}
      <ConfirmDialog
        open={!!deletingFloor}
        title={`XÃ³a táº§ng ${deletingFloor?.name}?`}
        description={`Thao tÃ¡c nÃ y sáº½ áº©n táº§ng "${deletingFloor?.name}" khá»i há»‡ thá»‘ng. CÃ¡c máº·t báº±ng thuá»™c táº§ng nÃ y sáº½ khÃ´ng bá»‹ xÃ³a.`}
        onConfirm={() => deleteFloorMutation.mutate(deletingFloor.id)}
        onCancel={() => setDeletingFloor(null)}
        loading={deleteFloorMutation.isPending}
      />
    </div>
  );
}
