import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  X, MapPin, Building2, ArrowRight, Image as ImageIcon,
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
} from 'lucide-react';
import type { FloorMapData, Unit, Floor } from '@/types';
import { cn } from '@/lib/utils';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, {
  fill: string; stroke: string; fillOpacity: number;
  label: string; badgeClass: string; animate?: boolean;
}> = {
  VACANT:       { fill: '#ef4444', stroke: '#dc2626', fillOpacity: 0.55, label: 'Trống',        badgeClass: 'bg-red-100 text-red-700 border-red-300' },
  BOOKING:      { fill: '#f59e0b', stroke: '#d97706', fillOpacity: 0.55, label: 'Booking',      badgeClass: 'bg-amber-100 text-amber-700 border-amber-300' },
  NEGOTIATING:  { fill: '#f97316', stroke: '#ea580c', fillOpacity: 0.55, label: 'Thương thảo', badgeClass: 'bg-orange-100 text-orange-700 border-orange-300' },
  CONTRACTED:   { fill: '#3b82f6', stroke: '#2563eb', fillOpacity: 0.55, label: 'Hợp đồng',    badgeClass: 'bg-blue-100 text-blue-700 border-blue-300' },
  UNDER_FITOUT: { fill: '#a855f7', stroke: '#9333ea', fillOpacity: 0.5,  label: 'Thi công',    badgeClass: 'bg-purple-100 text-purple-700 border-purple-300', animate: true },
  OCCUPIED:     { fill: '#22c55e', stroke: '#16a34a', fillOpacity: 0.55, label: 'Đang thuê',   badgeClass: 'bg-green-100 text-green-700 border-green-300' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Pt = [number, number];

const API_ORIGIN = ((import.meta as any).env?.VITE_API_URL || '/api').replace(/\/api\/?$/, '');

function resolveFileUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith('http')) return raw;
  const normalized = raw.replace(/\\/g, '/');
  const idx = normalized.indexOf('uploads/');
  if (idx === -1) return undefined;
  return `${API_ORIGIN}/${normalized.slice(idx)}`;
}

function fmtMoney(n?: number | null) {
  if (n == null) return null;
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
}

function centroid(pts: Pt[]): Pt {
  const n = pts.length;
  return [
    pts.reduce((s, [x]) => s + x, 0) / n,
    pts.reduce((s, [, y]) => s + y, 0) / n,
  ];
}

function polygonArea(pts: Pt[]) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function getUnitPolygon(u: Unit): Pt[] | null {
  if (u.mapPolygon) return u.mapPolygon;
  if (u.mapPosX != null) {
    const { mapPosX: x, mapPosY: y, mapPosW: w, mapPosH: h } = u;
    return [[x!, y!], [x!+w!, y!], [x!+w!, y!+h!], [x!, y!+h!]];
  }
  return null;
}

const isPlaced = (u: Unit) => u.mapPolygon != null || u.mapPosX != null;

// ─── Unit Info Popup ──────────────────────────────────────────────────────────

function UnitInfoPopup({
  unit, onClose, onViewDetail, onBook,
}: {
  unit: Unit & { media?: { fileUrl: string; mimeType?: string }[] };
  onClose: () => void;
  onViewDetail?: (u: Unit) => void;
  onBook?: (u: Unit) => void;
}) {
  const [mediaIdx, setMediaIdx] = useState(0);
  const cfg = STATUS_CFG[unit.status] ?? STATUS_CFG.VACANT;
  const photos = (unit.media ?? []).filter((m) => m.mimeType?.startsWith('image'));

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-72 overflow-hidden">
      {photos.length > 0 ? (
        <div className="relative h-36 bg-gray-100">
          <img src={resolveFileUrl(photos[mediaIdx]?.fileUrl)} alt="" className="w-full h-full object-cover" />
          {photos.length > 1 && (
            <>
              <button className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1"
                onClick={(e) => { e.stopPropagation(); setMediaIdx((i) => (i - 1 + photos.length) % photos.length); }}>
                <ChevronLeft size={14} />
              </button>
              <button className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1"
                onClick={(e) => { e.stopPropagation(); setMediaIdx((i) => (i + 1) % photos.length); }}>
                <ChevronRight size={14} />
              </button>
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
                {photos.map((_, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === mediaIdx ? 'bg-white' : 'bg-white/50'}`} />)}
              </div>
            </>
          )}
          <button className="absolute top-2 right-2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1" onClick={onClose}>
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="h-20 bg-gray-50 flex items-center justify-center relative">
          <ImageIcon size={28} className="text-gray-200" />
          <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="font-bold text-gray-900 text-base">{unit.code}</div>
            {unit.name && <div className="text-xs text-gray-500 mt-0.5">{unit.name}</div>}
          </div>
          <Badge className={cn('text-xs border shrink-0', cfg.badgeClass)}>{cfg.label}</Badge>
        </div>

        {unit.tenant && (
          <div className="flex items-center gap-2 bg-green-50 rounded-lg px-2.5 py-2 mb-3">
            <Building2 size={13} className="text-green-600 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-green-800">{unit.tenant.brandName}</div>
              <div className="text-[11px] text-green-600">{unit.tenant.companyName}</div>
            </div>
          </div>
        )}

        <div className="space-y-1.5 text-xs text-gray-600 mb-4">
          <div className="flex justify-between">
            <span className="text-gray-400">Diện tích NLA:</span>
            <span className="font-semibold text-gray-800">{unit.areaNLA.toLocaleString('vi-VN')} m²</span>
          </div>
          {unit.zone && <div className="flex justify-between"><span className="text-gray-400">Khu vực:</span><span>{unit.zone.name}</span></div>}
          {unit.category && (
            <div className="flex justify-between">
              <span className="text-gray-400">Loại:</span>
              <span className="truncate ml-2 text-right">{(unit as any).categoryRef?.name ?? unit.category}</span>
            </div>
          )}
          {(unit.baseRentPerSqm > 0 || unit.askingRentPerSqm) && (
            <div className="flex justify-between">
              <span className="text-gray-400">Giá thuê:</span>
              <span className="font-medium text-gray-800">{fmtMoney(unit.askingRentPerSqm ?? unit.baseRentPerSqm)}/m²</span>
            </div>
          )}
          {unit.leaseEndDate && (
            <div className="flex justify-between">
              <span className="text-gray-400">HĐ đến:</span>
              <span>{new Date(unit.leaseEndDate).toLocaleDateString('vi-VN')}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {onBook && unit.status === 'VACANT' && (
            <Button size="sm" className="flex-1 text-xs gap-1 h-8" onClick={() => onBook(unit)}>Booking</Button>
          )}
          {onViewDetail && (
            <Button size="sm" variant="outline" className="flex-1 text-xs gap-1 h-8" onClick={() => onViewDetail(unit)}>
              Chi tiết <ArrowRight size={11} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ units }: { units: Unit[] }) {
  const placed = units.filter(isPlaced);
  const byStatus = Object.entries(STATUS_CFG)
    .map(([key, cfg]) => ({ key, cfg, count: placed.filter((u) => u.status === key).length }))
    .filter((x) => x.count > 0);
  const totalArea = placed.reduce((s, u) => s + u.areaNLA, 0);
  const occupiedArea = placed.filter((u) => u.status === 'OCCUPIED').reduce((s, u) => s + u.areaNLA, 0);
  const occupancyPct = totalArea > 0 ? Math.round((occupiedArea / totalArea) * 100) : 0;

  return (
    <div className="flex items-center gap-4 flex-wrap text-xs">
      <div className="font-semibold text-gray-700">{placed.length}/{units.length} unit có vị trí</div>
      <div className="h-3 w-px bg-gray-200" />
      {byStatus.map(({ key, cfg, count }) => (
        <span key={key} className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: cfg.fill }} />
          <span style={{ color: cfg.stroke }}>{count} {cfg.label.toLowerCase()}</span>
        </span>
      ))}
      {totalArea > 0 && (
        <div className="ml-auto text-gray-400">
          Lấp đầy: <span className="font-semibold text-gray-700">{occupancyPct}%</span>
          <span className="ml-1 text-gray-300">({occupiedArea.toLocaleString()} / {totalArea.toLocaleString()} m²)</span>
        </div>
      )}
    </div>
  );
}

// ─── Main MallMapViewer ───────────────────────────────────────────────────────

interface IssuePin {
  unitId: string;
  severity: string;
}

const PIN_SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const PIN_SEVERITY_COLOR: Record<string, string> = { CRITICAL: '#dc2626', HIGH: '#f97316', MEDIUM: '#3b82f6', LOW: '#6b7280' };

interface MallMapViewerProps {
  floors: Floor[];
  initialFloorId?: string;
  onUnitClick?: (unit: Unit) => void;
  onBookUnit?: (unit: Unit) => void;
  /** Ghim vị trí vấn đề/khiếm khuyết fitout (D-Map) — tuỳ chọn, không có thì không đổi hành vi hiện tại. */
  issuePins?: IssuePin[];
}

export function MallMapViewer({ floors, initialFloorId, onUnitClick, onBookUnit, issuePins }: MallMapViewerProps) {
  const sortedFloors = [...floors].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const [activeFloorId, setActiveFloorId] = useState<string>(initialFloorId ?? sortedFloors[0]?.id ?? '');
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tick, setTick] = useState(0);

  const currentIdx = sortedFloors.findIndex((f) => f.id === activeFloorId);

  const goToFloor = useCallback((id: string) => {
    setActiveFloorId(id);
    setSelectedUnit(null);
    setFilterStatus(null);
    setImageRatio(null);
  }, []);

  const prevFloor = () => currentIdx > 0 && goToFloor(sortedFloors[currentIdx - 1].id);
  const nextFloor = () => currentIdx < sortedFloors.length - 1 && goToFloor(sortedFloors[currentIdx + 1].id);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 800);
    return () => clearInterval(id);
  }, []);

  const { data: floor, isLoading } = useQuery<FloorMapData>({
    queryKey: ['floor-map', activeFloorId],
    queryFn: () => spacesApi.getFloorMapData(activeFloorId),
    enabled: !!activeFloorId,
  });

  useEffect(() => { setImageRatio(null); setSelectedUnit(null); }, [activeFloorId]);

  // Close popup on ESC, fullscreen on F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) { setIsFullscreen(false); return; }
        setSelectedUnit(null);
      }
      if (e.key === 'f' || e.key === 'F') setIsFullscreen((v) => !v);
      if (e.key === 'ArrowLeft') prevFloor();
      if (e.key === 'ArrowRight') nextFloor();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen, currentIdx, sortedFloors]);

  const units = floor?.units ?? [];
  const placedUnits = units.filter(isPlaced);
  const filteredUnits = filterStatus ? placedUnits.filter((u) => u.status === filterStatus) : placedUnits;

  // Use server-stored ratio first, fall back to client-measured
  const ratio = floor?.floorPlanRatio ?? imageRatio ?? 16 / 9;

  const popupPos = selectedUnit ? (() => {
    const poly = getUnitPolygon(selectedUnit);
    if (!poly) return null;
    const [cx, cy] = centroid(poly);
    return { cx, cy };
  })() : null;

  // Smart popup positioning: flip above/below based on centroid Y, clamp X to stay in-view
  const getPopupStyle = (cx: number, cy: number): React.CSSProperties => {
    const clampedLeft = Math.max(20, Math.min(cx, 80));   // keep popup horizontally in-view
    const showBelow = cy < 42;                             // flip below if unit is in upper area
    return {
      position: 'absolute',
      left: `${clampedLeft}%`,
      top: showBelow ? `${cy + 2}%` : `${cy}%`,
      transform: showBelow ? 'translateX(-50%)' : 'translateX(-50%) translateY(-100%)',
      zIndex: 100,
    };
  };

  // ── Map inner content (shared between normal and fullscreen) ──────────────

  const renderMap = (fullscreen: boolean) => {
    if (isLoading) {
      return (
        <div className={cn('flex items-center justify-center text-sm text-gray-400', fullscreen ? 'h-full' : 'h-64')}>
          Đang tải bản đồ...
        </div>
      );
    }
    if (!floor?.floorPlanUrl) {
      return (
        <div className={cn('flex flex-col items-center justify-center gap-2 text-gray-300', fullscreen ? 'h-full' : 'h-64')}>
          <MapPin size={36} className="opacity-40" />
          <p className="text-sm text-gray-400">Tầng này chưa có sơ đồ mặt bằng</p>
        </div>
      );
    }

    /*
      Aspect-ratio container: in normal mode use paddingTop trick.
      In fullscreen, use CSS aspect-ratio + max constraints so the map
      fills the screen as large as possible while preserving proportions.
    */
    const containerStyle: React.CSSProperties = fullscreen
      ? {
          position: 'relative',
          aspectRatio: `${ratio}`,
          maxWidth: '100%',
          maxHeight: 'calc(100vh - 88px)',   // 88px = fullscreen toolbar height
          width: `min(100%, calc((100vh - 88px) * ${ratio}))`,
          margin: '0 auto',
        }
      : {
          position: 'relative',
          width: '100%',
          paddingTop: `${(1 / ratio) * 100}%`,
        };

    return (
      <div style={containerStyle}>
        {/* Floor plan image */}
        <img
          src={resolveFileUrl(floor.floorPlanUrl)}
          alt={`Floor plan ${floor.level}`}
          className={cn('absolute inset-0 w-full h-full select-none pointer-events-none', !fullscreen && 'rounded-2xl')}
          style={{ objectFit: 'fill' }}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setImageRatio(img.naturalWidth / img.naturalHeight);
            }
          }}
        />

        {/* SVG polygon overlay — viewBox 0 0 100 100 = % coords */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <defs>
            <pattern id="stripe-fitout" width="1.5" height="1.5" patternUnits="userSpaceOnUse"
              patternTransform={`rotate(45) translate(${tick % 2 === 0 ? 0 : 0.75})`}>
              <line x1="0" y1="0" x2="0" y2="1.5" stroke="rgba(168,85,247,0.45)" strokeWidth="0.55" />
            </pattern>
          </defs>
          {/* Transparent background — click here to deselect unit */}
          <rect x="0" y="0" width="100" height="100" fill="transparent"
            onClick={() => setSelectedUnit(null)} />
          {filteredUnits.map((u) => {
            const poly = getUnitPolygon(u);
            if (!poly) return null;
            const cfg = STATUS_CFG[u.status] ?? STATUS_CFG.VACANT;
            const isHovered = u.id === hoveredUnitId;
            const isSelected = u.id === selectedUnit?.id;
            const dimmed = filterStatus !== null && u.status !== filterStatus;
            const opacity = dimmed ? 0.12 : isSelected ? 0.8 : isHovered ? 0.75 : cfg.fillOpacity;
            const ptStr = poly.map(([x, y]) => `${x},${y}`).join(' ');
            return (
              <g key={u.id} style={{ cursor: 'pointer' }}>
                <polygon points={ptStr} fill={cfg.fill} fillOpacity={opacity}
                  stroke={isSelected ? '#1d4ed8' : cfg.stroke}
                  strokeWidth={isSelected ? 2 : isHovered ? 1.8 : 1.3}
                  vectorEffect="non-scaling-stroke"
                  style={{ transition: 'fill-opacity 0.15s, stroke-width 0.1s' }}
                  onClick={(e) => { e.stopPropagation(); setSelectedUnit((prev) => prev?.id === u.id ? null : u); }}
                  onMouseEnter={() => setHoveredUnitId(u.id)}
                  onMouseLeave={() => setHoveredUnitId(null)}
                />
                {u.status === 'UNDER_FITOUT' && !dimmed && (
                  <polygon points={ptStr} fill="url(#stripe-fitout)" style={{ pointerEvents: 'none' }} />
                )}
              </g>
            );
          })}
        </svg>

        {/* Unit labels as HTML divs (no SVG text distortion) */}
        {filteredUnits.map((u) => {
          const poly = getUnitPolygon(u);
          if (!poly) return null;
          const dimmed = filterStatus !== null && u.status !== filterStatus;
          if (dimmed) return null;
          const area = polygonArea(poly);
          if (area < 12) return null;
          const [cx, cy] = centroid(poly);
          return (
            <div key={`lbl-${u.id}`} style={{
              position: 'absolute', left: `${cx}%`, top: `${cy}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none', userSelect: 'none', textAlign: 'center', lineHeight: 1.2,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.85)', whiteSpace: 'nowrap' }}>
                {u.code}
              </div>
              {area > 40 && u.tenant && (
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', marginTop: 1 }}>
                  {u.tenant.brandName.length > 12 ? u.tenant.brandName.slice(0, 10) + '…' : u.tenant.brandName}
                </div>
              )}
            </div>
          );
        })}

        {/* Fitout issue pins (D-Map) — badge at unit centroid, count + highest severity color */}
        {issuePins && issuePins.length > 0 && filteredUnits.map((u) => {
          const pinsForUnit = issuePins.filter((p) => p.unitId === u.id);
          if (pinsForUnit.length === 0) return null;
          const poly = getUnitPolygon(u);
          if (!poly) return null;
          const [cx, cy] = centroid(poly);
          const topSeverity = pinsForUnit.reduce(
            (top, p) => (PIN_SEVERITY_RANK[p.severity] ?? 0) > (PIN_SEVERITY_RANK[top] ?? 0) ? p.severity : top,
            pinsForUnit[0].severity,
          );
          return (
            <div key={`pin-${u.id}`} style={{
              position: 'absolute', left: `${cx}%`, top: `${cy}%`,
              transform: 'translate(-50%, -150%)', pointerEvents: 'none', zIndex: 20,
            }}>
              <div style={{
                background: PIN_SEVERITY_COLOR[topSeverity] ?? '#6b7280', color: 'white', borderRadius: 9999,
                width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }}>
                {pinsForUnit.length}
              </div>
            </div>
          );
        })}

        {/* Unit info popup — smart positioning: flips above/below based on centroid Y */}
        {selectedUnit && popupPos && (
          <div style={getPopupStyle(popupPos.cx, popupPos.cy)} onClick={(e) => e.stopPropagation()}>
            <UnitInfoPopup unit={selectedUnit} onClose={() => setSelectedUnit(null)}
              onViewDetail={onUnitClick} onBook={onBookUnit} />
          </div>
        )}

        {placedUnits.length === 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/70 text-white text-xs px-4 py-2 rounded-full">
            Chưa có unit nào được đặt vị trí — vào Admin → Sơ đồ để thiết lập
          </div>
        )}
      </div>
    );
  };

  // ── Floor navigation bar ──────────────────────────────────────────────────

  const renderFloorNav = (dark: boolean) => (
    <div className={cn('flex items-center gap-2', dark ? 'text-white' : '')}>
      {/* Prev */}
      <button
        onClick={prevFloor}
        disabled={currentIdx <= 0}
        className={cn(
          'p-1.5 rounded-lg transition-all disabled:opacity-30',
          dark
            ? 'hover:bg-white/20 text-white'
            : 'hover:bg-gray-100 text-gray-600 border border-gray-200',
        )}
        title="Tầng trước (←)"
      >
        <ChevronLeft size={16} />
      </button>

      {/* Floor tabs */}
      <div className={cn('flex items-center gap-1 p-1 rounded-lg', dark ? 'bg-white/10' : 'bg-gray-100')}>
        {sortedFloors.map((f) => (
          <button
            key={f.id}
            onClick={() => goToFloor(f.id)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
              f.id === activeFloorId
                ? dark ? 'bg-white text-gray-900' : 'bg-white shadow-sm text-gray-900'
                : dark ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-800',
            )}
          >
            {f.level}
            {!f.floorPlanUrl && !dark && <span className="ml-1 text-[10px] text-gray-300">(chưa có sơ đồ)</span>}
          </button>
        ))}
      </div>

      {/* Next */}
      <button
        onClick={nextFloor}
        disabled={currentIdx >= sortedFloors.length - 1}
        className={cn(
          'p-1.5 rounded-lg transition-all disabled:opacity-30',
          dark
            ? 'hover:bg-white/20 text-white'
            : 'hover:bg-gray-100 text-gray-600 border border-gray-200',
        )}
        title="Tầng tiếp (→)"
      >
        <ChevronRight size={16} />
      </button>

      {/* Floor counter */}
      <span className={cn('text-xs tabular-nums', dark ? 'text-white/60' : 'text-gray-400')}>
        {currentIdx + 1} / {sortedFloors.length}
      </span>
    </div>
  );

  // ── Fullscreen modal ───────────────────────────────────────────────────────

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
        {/* Fullscreen toolbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
          {renderFloorNav(true)}

          <div className="flex items-center gap-3 ml-4">
            {/* Status filter chips (compact) */}
            <div className="flex items-center gap-1">
              <button onClick={() => setFilterStatus(null)}
                className={cn('px-2 py-0.5 rounded-full text-xs font-medium border transition-all',
                  !filterStatus ? 'bg-white text-gray-900 border-white' : 'text-white/60 border-white/20 hover:border-white/40')}>
                Tất cả
              </button>
              {Object.entries(STATUS_CFG).map(([key, cfg]) => {
                const count = placedUnits.filter((u) => u.status === key).length;
                if (count === 0) return null;
                return (
                  <button key={key} onClick={() => setFilterStatus(filterStatus === key ? null : key)}
                    className={cn('px-2 py-0.5 rounded-full text-xs font-medium border transition-all',
                      filterStatus === key ? 'text-white border-transparent' : 'text-white/60 border-white/20 hover:border-white/40')}
                    style={filterStatus === key ? { background: cfg.fill, borderColor: cfg.stroke } : {}}>
                    {cfg.label} ({count})
                  </button>
                );
              })}
            </div>

            <Button size="sm" variant="outline"
              className="gap-1.5 text-xs h-8 text-white border-white/30 bg-transparent hover:bg-white/10"
              onClick={() => setIsFullscreen(false)}>
              <Minimize2 size={13} /> Thoát toàn màn hình
            </Button>
          </div>
        </div>

        {/* Map area — no overflow-hidden so popup can extend outside container bounds */}
        <div className="flex-1 min-h-0 flex items-center justify-center p-4">
          {renderMap(true)}
        </div>
      </div>
    );
  }

  // ── Normal view ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Floor navigation + fullscreen button */}
      <div className="flex items-center gap-3 flex-wrap">
        {renderFloorNav(false)}

        <button
          onClick={() => setIsFullscreen(true)}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-400 px-2.5 py-1.5 rounded-lg transition-all"
          title="Toàn màn hình (F)"
        >
          <Maximize2 size={13} /> Toàn màn hình
        </button>
      </div>

      {/* Stats */}
      {!isLoading && <StatsBar units={units} />}

      {/* Status filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setFilterStatus(null)}
          className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-all border',
            !filterStatus ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400')}>
          Tất cả ({placedUnits.length})
        </button>
        {Object.entries(STATUS_CFG).map(([key, cfg]) => {
          const count = placedUnits.filter((u) => u.status === key).length;
          if (count === 0) return null;
          return (
            <button key={key} onClick={() => setFilterStatus(filterStatus === key ? null : key)}
              className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-all border',
                filterStatus === key ? 'text-white border-transparent' : 'bg-white border-gray-200 hover:border-gray-400')}
              style={filterStatus === key ? { background: cfg.fill, borderColor: cfg.stroke } : { color: cfg.stroke }}>
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Map canvas — no overflow-hidden so the popup can extend above/below without clipping */}
      <div className="relative w-full rounded-2xl border border-gray-200 shadow-inner bg-gray-50">
        {renderMap(false)}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-500 pt-1">
        <span className="font-semibold text-gray-400 tracking-wide uppercase text-[10px]">Chú thích:</span>
        {Object.entries(STATUS_CFG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded border-2 inline-block"
              style={{ background: cfg.fill, borderColor: cfg.stroke, opacity: 0.85 }} />
            {cfg.label}
          </span>
        ))}
        <span className="ml-auto text-gray-400 text-[11px]">Click unit để xem thông tin · F = toàn màn hình · ← → chuyển tầng</span>
      </div>
    </div>
  );
}
