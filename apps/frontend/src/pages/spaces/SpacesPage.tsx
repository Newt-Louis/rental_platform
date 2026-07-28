import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { spacesApi, categoriesApi, slotsApi } from '@/api';
import { useSearchParams } from 'react-router-dom';
import { useMallStore } from '@/store/mall.store';
import { Button } from '@/components/ui/button';
import { FloorPlan } from '@/components/FloorPlan';
import { MallMapViewer } from '@/components/MallMapViewer';
import { MallMapEditor } from '@/components/MallMapEditor';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from 'react-i18next';
import {
  Map, Plus, Pencil, Trash2, Layers, LayoutGrid, BarChart3,
} from 'lucide-react';
import type { Unit, UnitSlotSummary } from '@/types';
import { CATEGORIES } from './spaces.constants';
import { useSpacesFilters } from '@/hooks/useSpacesFilters';
import { useSpacesStore } from '@/store/spaces.store';

import { ConfirmDialog } from '@/components/spaces/dialogs/ConfirmDialog';
import { CreateEditUnitDialog } from '@/components/spaces/dialogs/CreateEditUnitDialog';
import { CreateEditFloorDialog } from '@/components/spaces/dialogs/CreateEditFloorDialog';
import { UnitDetailSheet } from '@/components/spaces/UnitDetailSheet';
import { SpacesAlerts } from '@/components/spaces/SpacesAlerts';
import { AnalyticsView } from '@/components/spaces/AnalyticsView';
import { SpacesFilters } from './SpacesFilters';
import { SpacesGrid } from './SpacesGrid';

type ViewMode = 'grid' | 'floor' | 'map' | 'analytics';

export default function SpacesPage() {
  const { t } = useTranslation(['spaces', 'common']);
  const { selectedMallId } = useMallStore();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'LEASING_MANAGER' || user?.role === 'MALL_DIRECTOR';

  // View
  const view = (searchParams.get('view') as ViewMode) ?? 'grid';
  const setView = (v: ViewMode) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('view', v);
    return next;
  }, { replace: true });

  // Filters (need floorFilter for queries and floor tabs)
  const {
    search,
    statusFilter,
    floorFilter, setFloorFilter,
    minArea,
    maxArea,
    minRent,
    maxRent,
    categoryFilter,
    spaceTypeFilter,
    tierFilter,
    leaseTermFilter,
  } = useSpacesFilters();

  // Shared UI state from store
  const {
    selectedUnit, setSelectedUnit,
    mapEditorMode, setMapEditorMode,
    mapEditorFloorId, setMapEditorFloorId,
    reset: resetSpacesStore,
  } = useSpacesStore();

  // Local dialog state
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingUnit, setDeletingUnit] = useState<any>(null);
  const [floorDialogOpen, setFloorDialogOpen] = useState(false);
  const [editingFloor, setEditingFloor] = useState<any>(null);
  const [deletingFloor, setDeletingFloor] = useState<any>(null);

  // Reset floor filter when mall changes
  const isFirstMallRender = useRef(true);
  useEffect(() => {
    if (isFirstMallRender.current) { isFirstMallRender.current = false; return; }
    setFloorFilter('');
    setSelectedUnit(null);
    setEditingUnit(null);
    setDeletingUnit(null);
  }, [selectedMallId]);

  // Reset store state when leaving the page
  useEffect(() => () => { resetSpacesStore(); }, []);

  // Queries
  const { data: floorsData } = useQuery({
    queryKey: ['floors', selectedMallId],
    queryFn: () => spacesApi.listFloors(selectedMallId ?? undefined),
    enabled: !!selectedMallId,
  });
  const floors: any[] = (floorsData?.data ?? floorsData ?? []).sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  const { data: categoryOptions } = useQuery({ queryKey: ['category-options'], queryFn: categoriesApi.getOptions, staleTime: 300_000 });
  const categoryNames: string[] = useMemo(() => {
    const opts = Array.isArray(categoryOptions) ? categoryOptions : categoryOptions?.data ?? [];
    const fromApi = opts.map((c: any) => c.name).filter(Boolean);
    return fromApi.length > 0 ? fromApi : CATEGORIES;
  }, [categoryOptions]);

  const { data, isLoading, isError, refetch } = useQuery({
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
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const units: Unit[] = (data?.data ?? data ?? []) as Unit[];
  const unitIds = units.map((u) => u.id);

  const { data: slotSummaries = {} } = useQuery<Record<string, UnitSlotSummary>>({
    queryKey: ['slot-summaries', unitIds.join(',')],
    queryFn: () => slotsApi.getSummaries(unitIds),
    enabled: unitIds.length > 0,
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id: string) => spacesApi.deleteUnit(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['occupancy'] });
      qc.invalidateQueries({ queryKey: ['floors'] });
      qc.invalidateQueries({ queryKey: ['floor-map'] });
      qc.invalidateQueries({ queryKey: ['slot-summaries'] });
      toast({ title: t('deleteSuccess') });
      setDeletingUnit(null);
      if (selectedUnit?.id === id) setSelectedUnit(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('deleteFail'), variant: 'destructive' }),
  });

  const deleteFloorMutation = useMutation({
    mutationFn: (id: string) => spacesApi.deleteFloor(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['floors'] });
      toast({ title: t('deleteFloorSuccess') });
      setDeletingFloor(null);
      if (floorFilter === id) setFloorFilter('');
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('deleteFloorFail'), variant: 'destructive' }),
  });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('common:nav.spaces')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
            <button
              onClick={() => setView('grid')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title={t('views.grid')}
            >
              <LayoutGrid size={14} /> <span className="hidden sm:inline">{t('views.grid')}</span>
            </button>
            <button
              onClick={() => setView('floor')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'floor' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title={t('views.floor')}
            >
              <Map size={14} /> <span className="hidden sm:inline">{t('views.floor')}</span>
            </button>
            <button
              onClick={() => { setView('map'); setMapEditorMode(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'map' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title={t('views.map')}
            >
              <Map size={14} /> <span className="hidden sm:inline">{t('views.map')}</span>
            </button>
            <button
              onClick={() => setView('analytics')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                view === 'analytics' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              title={t('views.analytics')}
            >
              <BarChart3 size={14} /> <span className="hidden sm:inline">{t('views.analytics')}</span>
            </button>
          </div>
{isAdmin && selectedMallId && (
            <Button onClick={() => setCreateOpen(true)} className="gap-2" title={t('unit.create')}>
              <Plus size={15} /> <span className="hidden sm:inline">{t('unit.create')}</span>
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
            {t('floor.allFloors')}
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
                    title={t('floor.edit')}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletingFloor(f); }}
                    className={`p-0.5 rounded hover:bg-black/10 ${floorFilter === f.id ? 'text-white' : 'text-gray-400'}`}
                    title={t('floor.delete')}
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
              <Plus size={12} /> {t('floor.create')}
            </button>
          )}
        </div>
      )}

      {/* Alerts */}
      {view !== 'analytics' && <SpacesAlerts mallId={selectedMallId} />}

      {isError && view !== 'analytics' && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{t('error.loadFailed')}</p>
          <p className="mt-1 text-sm text-red-600">{t('error.loadDesc')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>{t('common:actions.retry')}</Button>
        </div>
      )}

      {/* Analytics View */}
      {view === 'analytics' && <AnalyticsView mallId={selectedMallId} />}

      {/* Filters (grid view only) */}
      {view === 'grid' && <SpacesFilters categoryNames={categoryNames} />}

      {/* Grid view */}
      {view === 'grid' && !isError && (
        <SpacesGrid
          units={units}
          slotSummaries={slotSummaries}
          isLoading={isLoading}
          isAdmin={isAdmin}
          mallId={selectedMallId}
          onUnitClick={setSelectedUnit}
          onEditUnit={setEditingUnit}
          onDeleteUnit={setDeletingUnit}
          onCreateUnit={() => setCreateOpen(true)}
        />
      )}

      {/* Floor plan view */}
      {!isLoading && !isError && view === 'floor' && (
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
      )}

      {/* Map view */}
      {!isLoading && !isError && view === 'map' && (
        <div className="space-y-3">
          {/* Map mode toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Map size={16} className="text-blue-600" /> {t('map.title')}
            </div>
            {isAdmin && (
              <div className="flex rounded-lg border overflow-hidden text-xs ml-auto">
                <button
                  onClick={() => { setMapEditorMode(false); setMapEditorFloorId(null); }}
                  className={`px-3 py-1.5 transition-colors ${!mapEditorMode ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {t('map.viewMode')}
                </button>
                <button
                  onClick={() => setMapEditorMode(true)}
                  className={`px-3 py-1.5 transition-colors ${mapEditorMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {t('map.editDiagram')}
                </button>
              </div>
            )}
          </div>

          {mapEditorMode && isAdmin ? (
            /* Editor: pick a floor first */
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">{t('floor.selectToEdit')}</span>
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
                    <Plus size={11} /> {t('floor.create')}
                  </button>
                )}
              </div>
              {mapEditorFloorId ? (
                <MallMapEditor floorId={mapEditorFloorId} />
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-sm border-2 border-dashed rounded-xl gap-3">
                  {!selectedMallId ? (
                    <span className="text-center px-6">{t('map.noMallSelected')}</span>
                  ) : floors.length === 0 ? (
                    <>
                      <span>{t('floor.noFloorYet')}</span>
                      <button
                        onClick={() => { setEditingFloor(null); setFloorDialogOpen(true); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        <Plus size={14} /> {t('floor.addFirst')}
                      </button>
                    </>
                  ) : (
                    <span>{t('floor.selectForMap')}</span>
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
                <p>{t('floor.noFloorYet')}</p>
              </div>
            )
          )}
        </div>
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
        mallId={editingUnit?.mallId ?? selectedMallId ?? ''}
        onClose={() => setEditingUnit(null)}
      />

      {/* Delete unit confirm */}
      <ConfirmDialog
        open={!!deletingUnit}
        title={t('unit.delete') + ` ${deletingUnit?.code}?`}
        description={t('unit.deleteDesc')}
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
