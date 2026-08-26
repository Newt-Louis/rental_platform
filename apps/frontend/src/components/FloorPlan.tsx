import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Unit, UnitSlotSummary } from '@/types';
import { SlotSummaryBadge } from '@/components/SlotSummaryBadge';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { getUnitStatusLabel } from '@/pages/spaces/spacesPresentation';

interface FloorMeta {
  id?: string;
  level: string;
  name: string;
  sortOrder: number;
}

const STATUS_CFG: Record<string, { bg: string; border: string; text: string }> = {
  VACANT:       { bg: 'bg-red-50',     border: 'border-red-300',    text: 'text-red-800' },
  BOOKING:      { bg: 'bg-amber-50',   border: 'border-amber-300',  text: 'text-amber-800' },
  NEGOTIATING:  { bg: 'bg-orange-50',  border: 'border-orange-300', text: 'text-orange-800' },
  CONTRACTED:   { bg: 'bg-blue-50',    border: 'border-blue-300',   text: 'text-blue-800' },
  UNDER_FITOUT: { bg: 'bg-purple-50',  border: 'border-purple-300', text: 'text-purple-800' },
  OCCUPIED:     { bg: 'bg-green-50',   border: 'border-green-300',  text: 'text-green-800' },
};

const FLOOR_SORT: Record<string, number> = { B2: -2, B1: -1, GF: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5, RF: 9 };

interface FloorPlanProps {
  units: Unit[];
  onUnitClick: (unit: Unit) => void;
  selectedUnitId?: string;
  slotSummaries?: Record<string, UnitSlotSummary>;
  allFloors?: FloorMeta[];
  isAdmin?: boolean;
  onCreateFloor?: () => void;
  onEditFloor?: (floor: FloorMeta) => void;
  onDeleteFloor?: (floor: FloorMeta) => void;
}

export function FloorPlan({
  units, onUnitClick, selectedUnitId, slotSummaries = {},
  allFloors, isAdmin, onCreateFloor, onEditFloor, onDeleteFloor,
}: FloorPlanProps) {
  const { t } = useTranslation('spaces');
  const floors = useMemo<FloorMeta[]>(() => {
    if (allFloors && allFloors.length > 0) {
      return [...allFloors].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    const seen = new Map<string, FloorMeta>();
    units.forEach(u => {
      if (u.floor && !seen.has(u.floor.level)) {
        seen.set(u.floor.level, {
          level: u.floor.level,
          name: u.floor.name,
          sortOrder: FLOOR_SORT[u.floor.level] ?? 99,
        });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [units, allFloors]);

  const [activeFloor, setActiveFloor] = useState<string>(() => floors[0]?.level ?? 'GF');

  const floorUnits = useMemo(() => units.filter(u => u.floor?.level === activeFloor), [units, activeFloor]);

  const zoneGroups = useMemo(() => {
    const map = new Map<string, Unit[]>();
    floorUnits.forEach(u => {
      // Chuỗi rỗng = chưa gán zone — nhóm riêng nhưng không hiển thị nhãn "Khu ?" giả
      const key = u.zone?.name ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [floorUnits]);

  const stats = useMemo(() => ({
    total: floorUnits.length,
    occupied: floorUnits.filter(u => u.status === 'OCCUPIED').length,
    vacant: floorUnits.filter(u => u.status === 'VACANT').length,
    booking: floorUnits.filter(u => u.status === 'BOOKING').length,
    negotiating: floorUnits.filter(u => u.status === 'NEGOTIATING').length,
    contracted: floorUnits.filter(u => u.status === 'CONTRACTED').length,
    fitout: floorUnits.filter(u => u.status === 'UNDER_FITOUT').length,
    totalArea: floorUnits.reduce((s, u) => s + u.areaNLA, 0),
    leasedArea: floorUnits.filter(u => u.status === 'OCCUPIED').reduce((s, u) => s + u.areaNLA, 0),
  }), [floorUnits]);

  // Split zones into north / south wings (half each)
  const mid = Math.ceil(zoneGroups.length / 2);
  const northWing = zoneGroups.slice(0, mid);
  const southWing = zoneGroups.slice(mid);

  const floorName = floors.find(f => f.level === activeFloor)?.name ?? activeFloor;

  return (
    <div className="space-y-4">
      {/* Floor tabs */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {floors.map(f => {
          const count = units.filter(u => u.floor?.level === f.level).length;
          return (
            <div key={f.level} className="group relative">
              <button
                onClick={() => setActiveFloor(f.level)}
                className={cn(
                  'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                  isAdmin && (onEditFloor || onDeleteFloor) ? 'pr-8' : '',
                  activeFloor === f.level
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800',
                )}
              >
                {f.level}
                <span className="ml-1 text-xs opacity-50">({count})</span>
              </button>
              {isAdmin && f.id && (onEditFloor || onDeleteFloor) && (
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
                  {onEditFloor && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditFloor(f); }}
                      className="p-0.5 rounded hover:bg-black/10 text-gray-400"
                      title={t('floor.edit')}
                    >
                      <Pencil size={11} />
                    </button>
                  )}
                  {onDeleteFloor && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteFloor(f); }}
                      className="p-0.5 rounded hover:bg-black/10 text-gray-400"
                      title={t('floor.delete')}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {isAdmin && onCreateFloor && (
          <button
            onClick={onCreateFloor}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-dashed border-gray-300 text-gray-500 hover:bg-white hover:border-gray-400 flex items-center gap-1"
          >
            <Plus size={12} /> {t('floor.create')}
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-gray-700">{floorName}</span>
        <span className="text-gray-300">|</span>
        <span className="text-green-600 font-medium">{stats.occupied} {getUnitStatusLabel(t, 'OCCUPIED').toLowerCase()}</span>
        <span className="text-red-500">{stats.vacant} {getUnitStatusLabel(t, 'VACANT').toLowerCase()}</span>
        {stats.booking > 0 && <span className="text-amber-500">{stats.booking} {getUnitStatusLabel(t, 'BOOKING').toLowerCase()}</span>}
        {stats.negotiating > 0 && <span className="text-orange-500">{stats.negotiating} {getUnitStatusLabel(t, 'NEGOTIATING').toLowerCase()}</span>}
        {stats.contracted > 0 && <span className="text-blue-500">{stats.contracted} {getUnitStatusLabel(t, 'CONTRACTED').toLowerCase()}</span>}
        {stats.fitout > 0 && <span className="text-purple-500">{stats.fitout} {getUnitStatusLabel(t, 'UNDER_FITOUT').toLowerCase()}</span>}
        <span className="ml-auto text-xs text-gray-400">
          {stats.leasedArea.toLocaleString()} / {stats.totalArea.toLocaleString()} m² NLA
        </span>
      </div>

      {/* Building schematic */}
      <div className="border-2 border-slate-300 rounded-xl overflow-hidden bg-slate-50 shadow-inner">
        {/* Header */}
        <div className="bg-slate-800 text-white text-center py-2.5 text-sm font-bold tracking-widest uppercase">
          THISO MALL — {floorName}
        </div>

        <div className="p-5 space-y-3">
          {/* North wing */}
          {northWing.map(([zoneName, zoneUnits]) => (
            <ZoneRow
              key={zoneName}
              zoneName={zoneName}
              units={zoneUnits}
              onUnitClick={onUnitClick}
              selectedUnitId={selectedUnitId}
              slotSummaries={slotSummaries}
            />
          ))}

          {/* Corridor divider (only when both wings exist) */}
          {northWing.length > 0 && southWing.length > 0 && (
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 border-t-2 border-dashed border-slate-400" />
              <span className="text-xs font-bold text-slate-400 tracking-widest whitespace-nowrap">
                {t('floorPlan.corridor')}
              </span>
              <div className="flex-1 border-t-2 border-dashed border-slate-400" />
            </div>
          )}

          {/* South wing */}
          {southWing.map(([zoneName, zoneUnits]) => (
            <ZoneRow
              key={zoneName}
              zoneName={zoneName}
              units={zoneUnits}
              onUnitClick={onUnitClick}
              selectedUnitId={selectedUnitId}
              slotSummaries={slotSummaries}
            />
          ))}

          {floorUnits.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-sm">
              {t('floorPlan.noUnits')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-800 text-slate-400 text-center py-1.5 text-xs tracking-widest">
          {t('floorPlan.entrance')}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
        <span className="font-semibold text-gray-400 uppercase tracking-wide">{t('floorPlan.legend')}</span>
        {Object.entries(STATUS_CFG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={cn('w-3.5 h-3.5 rounded border-2', cfg.bg, cfg.border)} />
            <span>{getUnitStatusLabel(t, key)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ZoneRowProps {
  zoneName: string;
  units: Unit[];
  onUnitClick: (unit: Unit) => void;
  selectedUnitId?: string;
  slotSummaries?: Record<string, UnitSlotSummary>;
}

function ZoneRow({ zoneName, units, onUnitClick, selectedUnitId, slotSummaries = {} }: ZoneRowProps) {
  const { t } = useTranslation('spaces');
  const sorted = [...units].sort((a, b) => a.code.localeCompare(b.code));
  const maxArea = Math.max(...sorted.map(u => u.areaNLA), 1);

  return (
    <div className="flex items-stretch gap-2">
      {/* Zone label — ẩn hoàn toàn nếu unit chưa được gán zone */}
      {zoneName && (
        <div className="w-28 shrink-0 flex items-center justify-center bg-slate-700 text-white text-xs font-bold rounded-lg px-2 py-3 text-center leading-tight">
          {zoneName}
        </div>
      )}

      {/* Units row */}
      <div className="flex-1 flex flex-wrap gap-2 min-h-[76px] items-start content-start">
        {sorted.map(unit => {
          const cfg = STATUS_CFG[unit.status] ?? STATUS_CFG.VACANT;
          const isSelected = unit.id === selectedUnitId;
          const pct = unit.areaNLA / maxArea;
          const minW = 80;
          const maxW = 220;
          const width = Math.round(minW + pct * (maxW - minW));
          const slotSummary = slotSummaries[unit.id];
          const slotHint = slotSummary?.totalSlots
            ? [
                slotSummary.confirmedSlots > 0 ? `${slotSummary.confirmedSlots} thuê` : null,
                slotSummary.pendingSlots > 0 ? `${slotSummary.pendingSlots} book` : null,
              ].filter(Boolean).join(' · ')
            : '';

          return (
            <button
              key={unit.id}
              onClick={() => onUnitClick(unit)}
              title={`${unit.code} — ${unit.tenant?.brandName ?? getUnitStatusLabel(t, 'VACANT')} — ${unit.areaNLA.toLocaleString()} m²${slotHint ? ` — ${slotSummary!.totalSlots} ô: ${slotHint}` : ''}`}
              style={{ minWidth: `${width}px` }}
              className={cn(
                'flex flex-col justify-between p-2.5 rounded-lg border-2 text-left transition-all cursor-pointer',
                cfg.bg, cfg.border, cfg.text,
                'hover:shadow-md hover:scale-[1.02]',
                isSelected && 'ring-2 ring-blue-500 ring-offset-1 shadow-lg scale-[1.02]',
              )}
            >
              <div>
                <div className="font-bold text-xs leading-tight">{unit.code}</div>
                {unit.tenant?.brandName && (
                  <div className="text-xs opacity-70 mt-0.5 truncate" style={{ maxWidth: `${width - 16}px` }}>
                    {unit.tenant.brandName}
                  </div>
                )}
              </div>
              <div className="text-xs opacity-50 mt-1.5">{unit.areaNLA.toLocaleString()} m²</div>
              {slotSummary && slotSummary.totalSlots > 0 && (
                <div className="text-[10px] mt-1 opacity-70 leading-tight">
                  {slotSummary.confirmedSlots > 0 && (
                    <span className="text-red-700">{slotSummary.confirmedSlots} ô thuê</span>
                  )}
                  {slotSummary.confirmedSlots > 0 && slotSummary.pendingSlots > 0 && ' · '}
                  {slotSummary.pendingSlots > 0 && (
                    <span className="text-amber-700">{slotSummary.pendingSlots} book</span>
                  )}
                  {!slotSummary.confirmedSlots && !slotSummary.pendingSlots && (
                    <span>{slotSummary.vacantSlots}/{slotSummary.totalSlots} ô trống</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
