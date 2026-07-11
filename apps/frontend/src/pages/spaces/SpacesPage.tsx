import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
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
import { UnitDetailSheet } from '@/components/spaces/UnitDetailSheet';


// ─── Compare Modal ────────────────────────────────────────────────────────────

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
            So sánh {unitIds.length} mặt bằng
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="py-10 text-center text-gray-400">Đang tải...</div>
        ) : units.length > 0 && (
          <div className="space-y-4">
            {/* Summary */}
            {summary && (
              <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-xs text-gray-500">Giá thuê TB</div>
                  <div className="font-semibold">{Number(summary.avgRent).toLocaleString()} ₫/m²</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Diện tích TB</div>
                  <div className="font-semibold">{Number(summary.avgArea).toLocaleString()} m²</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Range giá</div>
                  <div className="font-semibold text-sm">{summary.minRent.toLocaleString()} - {summary.maxRent.toLocaleString()}</div>
                </div>
              </div>
            )}

            {/* Comparison table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Thuộc tính</th>
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
                    <td className="py-2 px-3 text-gray-500">Trạng thái</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">
                        <Badge className={STATUS_CONFIG[u.status]?.color}>{STATUS_CONFIG[u.status]?.label}</Badge>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Diện tích NLA</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-medium">
                        {u.areaNLA.toLocaleString()} m²
                        <span className={`ml-1 text-xs ${Number(u.areaVsAvg) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({u.areaVsAvg > 0 ? '+' : ''}{u.areaVsAvg}%)
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Giá thuê/m²</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-medium">
                        {u.baseRentPerSqm.toLocaleString()} ₫
                        <span className={`ml-1 text-xs ${Number(u.rentVsAvg) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({u.rentVsAvg > 0 ? '+' : ''}{u.rentVsAvg}%)
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Phí CAM/m²</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.camPerSqm.toLocaleString()} ₫</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Tổng/tháng</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-semibold text-gray-700">
                        {u.totalMonthlyRent?.toLocaleString()} ₫
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Ngành hàng</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.category ?? '—'}</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Tầng</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.floor?.name ?? '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-gray-500">Khách thuê</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.tenant?.brandName ?? '—'}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
      toast({ title: 'Đã xóa mặt bằng' });
      setDeletingUnit(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi xóa', variant: 'destructive' }),
  });

  const deleteFloorMutation = useMutation({
    mutationFn: (id: string) => spacesApi.deleteFloor(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['floors'] });
      toast({ title: 'Đã xóa tầng' });
      setDeletingFloor(null);
      if (floorFilter === id) setFloorFilter('');
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi xóa', variant: 'destructive' }),
  });

  const bulkMutation = useMutation({
    mutationFn: (params: { unitIds: string[]; updates: any }) => spacesApi.bulkUpdateUnits(params),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      toast({ title: `Đã cập nhật ${result.updated} mặt bằng` });
      clearSelection();
      setSelectionMode(false);
      setBulkActionOpen(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi cập nhật', variant: 'destructive' }),
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
          <p className="text-sm text-gray-500 mt-1">Quản lý mặt bằng và tình trạng cho thuê</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
            <button
              onClick={() => setView('grid')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title="Danh sách"
            >
              <LayoutGrid size={14} /> <span className="hidden sm:inline">Danh sách</span>
            </button>
            <button
              onClick={() => setView('floor')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'floor' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title="Sơ đồ tầng"
            >
              <Map size={14} /> <span className="hidden sm:inline">Sơ đồ tầng</span>
            </button>
            <button
              onClick={() => { setView('map'); setMapEditorMode(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'map' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title="Bản đồ số"
            >
              <Map size={14} /> <span className="hidden sm:inline">Bản đồ số</span>
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
            <Button onClick={() => setCreateOpen(true)} className="gap-2" title="Thêm mặt bằng">
              <Plus size={15} /> <span className="hidden sm:inline">Thêm mặt bằng</span>
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
            Tất cả tầng
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
                    title="Sửa tầng"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletingFloor(f); }}
                    className={`p-0.5 rounded hover:bg-black/10 ${floorFilter === f.id ? 'text-white' : 'text-gray-400'}`}
                    title="Xóa tầng"
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
              <Plus size={12} /> Thêm tầng
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
                placeholder="Tìm mã, tên mặt bằng..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Tất cả trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tất cả</SelectItem>
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
              <span className="hidden sm:inline">{selectionMode ? 'Thoát' : 'Chọn nhiều'}</span>
            </Button>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1.5"
            >
              <SlidersHorizontal size={14} />
              Bộ lọc nâng cao
              {hasAdvancedFilters && <span className="w-2 h-2 bg-gray-500 rounded-full" />}
            </Button>
            {(statusFilter || floorFilter || search || hasAdvancedFilters) && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X size={14} className="mr-1" /> Xóa bộ lọc
              </Button>
            )}
          </div>

          {/* Advanced Filters Panel */}
          {showFilters && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Diện tích min (m²)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minArea}
                    onChange={(e) => setMinArea(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Diện tích max (m²)</label>
                  <Input
                    type="number"
                    placeholder="1000"
                    value={maxArea}
                    onChange={(e) => setMaxArea(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Giá thuê min (₫/m²)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minRent}
                    onChange={(e) => setMinRent(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Giá thuê max (₫/m²)</label>
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
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Ngành hàng</label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tất cả ngành hàng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Tất cả</SelectItem>
                      {categoryNames.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* GAP #4 */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Loại sảnh</label>
                  <Select value={spaceTypeFilter} onValueChange={setSpaceTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tất cả loại" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Tất cả</SelectItem>
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
                      <SelectValue placeholder="Tất cả tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Tất cả</SelectItem>
                      {TIER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* GAP #3 */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Hình thức thuê</label>
                  <Select value={leaseTermFilter} onValueChange={setLeaseTermFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tất cả" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Tất cả</SelectItem>
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
              Đã chọn {selectedIds.size} mặt bằng
            </span>
            <Button variant="ghost" size="sm" onClick={() => selectAll(units.map(u => u.id))} className="text-gray-700">
              Chọn tất cả ({units.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={() => clearSelection()} className="text-gray-700">
              Bỏ chọn
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size >= 2 && selectedIds.size <= 5 && (
              <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)} className="gap-1.5">
                <Columns size={14} /> So sánh
              </Button>
            )}
            {/* GAP #2 — Gộp sảnh: chỉ hiện khi ≥2 unit được chọn */}
            {selectedIds.size >= 2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMergeDialogOpen(true)}
                className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
              >
                <GitMerge size={14} /> Gộp sảnh
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setBulkActionOpen('status')} className="gap-1.5">
              <RefreshCw size={14} /> Đổi trạng thái
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkActionOpen('category')} className="gap-1.5">
              <Filter size={14} /> Đổi ngành hàng
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkActionOpen('rent')} className="gap-1.5">
              <DollarSign size={14} /> Đổi giá thuê
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
              <Map size={16} className="text-blue-600" /> Bản đồ số mặt bằng
            </div>
            {isAdmin && (
              <div className="flex rounded-lg border overflow-hidden text-xs ml-auto">
                <button
                  onClick={() => { setMapEditorMode(false); setMapEditorFloorId(null); }}
                  className={`px-3 py-1.5 transition-colors ${!mapEditorMode ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Xem bản đồ
                </button>
                <button
                  onClick={() => setMapEditorMode(true)}
                  className={`px-3 py-1.5 transition-colors ${mapEditorMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Chỉnh sửa sơ đồ
                </button>
              </div>
            )}
          </div>

          {mapEditorMode && isAdmin ? (
            /* Editor: pick a floor first */
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">Chọn tầng để chỉnh sửa:</span>
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
                    {f.level} — {f.name}
                    {f.floorPlanUrl ? (
                      <span className="ml-1 text-green-400">✓</span>
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
                    <Plus size={11} /> Thêm tầng
                  </button>
                )}
              </div>
              {mapEditorFloorId ? (
                <MallMapEditor floorId={mapEditorFloorId} />
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-sm border-2 border-dashed rounded-xl gap-3">
                  {!selectedMallId ? (
                    <span className="text-center px-6">Vui lòng chọn một <strong className="text-gray-600">mall cụ thể</strong> ở header trước (không phải "Tất cả Mall")</span>
                  ) : floors.length === 0 ? (
                    <>
                      <span>Chưa có tầng nào trong mall này</span>
                      <button
                        onClick={() => { setEditingFloor(null); setFloorDialogOpen(true); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        <Plus size={14} /> Thêm tầng đầu tiên
                      </button>
                    </>
                  ) : (
                    <span>Chọn một tầng ở trên để bắt đầu chỉnh sửa sơ đồ</span>
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
                <p>Chưa có tầng nào trong mall này</p>
              </div>
            )
          )}
        </div>
      ) : (
        <>
          <div className="text-sm text-gray-400 mb-3">{data?.total ?? units.length} mặt bằng</div>
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
              <p className="font-medium">Không tìm thấy mặt bằng</p>
              {selectedMallId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={14} /> Thêm mặt bằng đầu tiên
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
        title={`Xóa mặt bằng ${deletingUnit?.code}?`}
        description={`Thao tác này sẽ ẩn mặt bằng "${deletingUnit?.code}" khỏi hệ thống. Dữ liệu lịch sử sẽ được giữ lại.`}
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
        title={`Xóa tầng ${deletingFloor?.name}?`}
        description={`Thao tác này sẽ ẩn tầng "${deletingFloor?.name}" khỏi hệ thống. Các mặt bằng thuộc tầng này sẽ không bị xóa.`}
        onConfirm={() => deleteFloorMutation.mutate(deletingFloor.id)}
        onCancel={() => setDeletingFloor(null)}
        loading={deleteFloorMutation.isPending}
      />
    </div>
  );
}
