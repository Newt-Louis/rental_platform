import React, { useState, useEffect, useCallback, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { Button } from '@/components/ui/button';
import {
  MapPin, ChevronLeft, ChevronRight, Maximize2, Minimize2,
  ZoomIn, ZoomOut, Locate, ImageOff, SearchX,
} from 'lucide-react';
import type { FloorMapData, Unit, Floor, UnitSlotSummary } from '@/types';
import type { HandoverSummary } from '@/api/handover-readiness';
import { bookingHolderLabel, type UnitBookingSummary } from '@/components/spaces/unitBookingSummary';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatRatePerSqm, getUnitStatusLabel } from '@/pages/spaces/spacesPresentation';
import {
  clampPan, detailLevel, focusOn, INITIAL_VIEW, MAX_ZOOM, MIN_ZOOM, moreDetail, unitScreenSize, ZOOM_STEP, zoomAt,
  type MapDetail, type MapView,
} from './mallMapView';
import {
  elevationLevel, presentationOrder, shadowGeometry, statusToken,
  MAP_CAD, MAP_ELEVATION, MAP_FOCUS_OUTLINE, MAP_MOTION_MS,
  MAP_SELECTED_OUTLINE, MAP_STATUS_ORDER,
  type ElevationLevel, type ShadowGeometry,
} from './mallMapTheme';
import { MallMapUnitPanel } from './MallMapUnitPanel';

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

function centroid(pts: Pt[]): Pt {
  const n = pts.length;
  return [
    pts.reduce((s, [x]) => s + x, 0) / n,
    pts.reduce((s, [, y]) => s + y, 0) / n,
  ];
}

function getUnitPolygon(u: Unit): Pt[] | null {
  if (u.mapPolygon) return u.mapPolygon;
  if (u.mapPosX != null) {
    const { mapPosX: x, mapPosY: y, mapPosW: w, mapPosH: h } = u;
    return [[x!, y!], [x! + w!, y!], [x! + w!, y! + h!], [x!, y! + h!]];
  }
  return null;
}

const isPlaced = (u: Unit) => u.mapPolygon != null || u.mapPosX != null;

const pointsOf = (poly: Pt[]) => poly.map(([x, y]) => `${x},${y}`).join(' ');

/** How far a press has to travel before the map treats it as a drag, not a click. */
const DRAG_THRESHOLD_PX = 4;

// ─── Unit polygon ─────────────────────────────────────────────────────────────

/**
 * CR-SPACES-FLOOR-MAP-UX-001 — one leasing unit, floating above the plan.
 *
 * Three nodes, in paint order: a blurred copy of the same shape dropped below
 * it (the shadow that makes it read as raised), a white underlay that keeps the
 * status hue from taking colour off whatever the plan draws underneath, and the
 * status surface itself. None of them take the pointer — a separate hit layer
 * does, so the visual lift can never move the click target.
 *
 * The geometry is the unit's real stored polygon, used verbatim. Elevation is a
 * render transform on top of it and never changes a coordinate.
 */
const UnitPolygon = React.memo(function UnitPolygon({
  points, status, level, geo, filterId, stripeId, motion,
}: {
  points: string;
  status: string;
  level: ElevationLevel;
  geo: ShadowGeometry;
  filterId: string;
  stripeId: string;
  motion: string;
}) {
  const token = statusToken(status);
  const elev = MAP_ELEVATION[level];
  const lifted = geo.lift > 0 ? `translate(0 ${-geo.lift})` : undefined;

  return (
    <>
      <polygon
        points={points}
        fill="#0f172a"
        fillOpacity={elev.shadowOpacity}
        filter={`url(#${filterId})`}
        transform={`translate(${geo.dx} ${geo.dy - geo.lift})`}
        style={{ pointerEvents: 'none', transition: motion }}
        data-elevation={level}
      />
      <g transform={lifted} style={{ pointerEvents: 'none', transition: motion }}>
        <polygon
          points={points}
          fill="#ffffff"
          fillOpacity={elev.baseOpacity}
        />
        <polygon
          points={points}
          fill={token.surface}
          fillOpacity={elev.surfaceOpacity}
          stroke={level === 'selected' ? MAP_SELECTED_OUTLINE : token.border}
          strokeWidth={elev.strokeWidth}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ transition: motion }}
        />
        {status === 'UNDER_FITOUT' && (
          <polygon points={points} fill={`url(#${stripeId})`} />
        )}
      </g>
    </>
  );
});

// ─── Unit label ───────────────────────────────────────────────────────────────

/**
 * What a unit says on the plan.
 *
 * The label is ink on the unit's own surface, not a white sticker laid over the
 * drawing: a floor of stickers hid the architecture the map exists to show. It
 * stays the same size on screen however far the map is zoomed, and zooming in
 * buys room for more of the unit's facts rather than bigger letters.
 */
export function UnitLabel({ unit, bookingName, detail, selected, hovered, scale, liftPx, t }: {
  unit: Unit;
  /** Who is holding the space, when one of the larger label sizes has room. */
  bookingName?: string;
  detail: MapDetail;
  selected: boolean;
  hovered: boolean;
  scale: number;
  liftPx: number;
  t: (key: string, opts?: any) => string;
}) {
  const token = statusToken(unit.status);
  const statusLabel = getUnitStatusLabel(t, unit.status);
  const tenantName = unit.tenant?.brandName;
  const rent = unit.askingRentPerSqm ?? unit.baseRentPerSqm;

  if (detail === 'DOT') {
    return (
      <span
        data-testid={`map-dot-${unit.code}`}
        title={`${unit.code} · ${statusLabel}`}
        style={{
          display: 'block', width: 11, height: 11, borderRadius: 9999,
          background: token.swatch, border: '2px solid rgba(255,255,255,0.9)',
          boxShadow: selected || hovered ? `0 0 0 3px ${token.border}55` : '0 1px 3px rgba(15,23,42,0.4)',
          transform: `scale(${scale}) translateY(${-liftPx}px)`,
        }}
      />
    );
  }

  // A soft white halo rather than a filled card: it lifts the text off the
  // surface without covering the plan around the words.
  const halo = '0 1px 2px rgba(255,255,255,0.95), 0 0 7px rgba(255,255,255,0.8)';

  return (
    <div
      data-testid={`map-card-${unit.code}`}
      style={{
        transform: `scale(${scale}) translateY(${-liftPx}px)`,
        transformOrigin: 'center',
        textShadow: halo,
      }}
      className="text-center leading-tight"
    >
      <div className="whitespace-nowrap text-[13px] font-bold text-slate-900">{unit.code}</div>
      {detail !== 'CODE' && (
        <div className="whitespace-nowrap text-[11px] font-medium text-slate-600 tabular-nums">
          {unit.areaNLA.toLocaleString('vi-VN')} m²
        </div>
      )}
      {detail !== 'CODE' && (
        <div className="whitespace-nowrap text-[10px] font-semibold" style={{ color: token.ink }}>
          {detail === 'FULL' && tenantName ? tenantName : statusLabel}
        </div>
      )}
      {/* A held space says whose hold it is -- "Đang giữ chỗ" with no name is
          what sent readers to the Bookings screen to find out. */}
      {detail === 'FULL' && !tenantName && bookingName && (
        <div className="whitespace-nowrap text-[10px] font-medium text-amber-700">{bookingName}</div>
      )}
      {detail === 'FULL' && rent > 0 && (
        <div className="whitespace-nowrap text-[10px] text-slate-500 tabular-nums">
          {formatRatePerSqm(rent, unit.currencyCode)}
        </div>
      )}
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────

/** Compact numbers that support the map; the map stays the workspace. */
/**
 * SPACE-MAP-KPI-01 -- these numbers describe the units actually drawn on the
 * map, never the whole floor behind a filter. A strip reading "12 spaces" over
 * a map showing four is how a reader ends up quoting the wrong availability.
 */
function KpiStrip({ visible, floorPlaced, floorTotal, filtered }: {
  visible: Unit[];
  floorPlaced: Unit[];
  floorTotal: number;
  filtered: boolean;
}) {
  const { t } = useTranslation('spaces');
  const placed = visible;
  const occupied = placed.filter((u) => u.status === 'OCCUPIED');
  const vacant = placed.filter((u) => u.status === 'VACANT');
  const totalArea = placed.reduce((s, u) => s + u.areaNLA, 0);
  const occupiedArea = occupied.reduce((s, u) => s + u.areaNLA, 0);
  const occupancyPct = totalArea > 0 ? Math.round((occupiedArea / totalArea) * 100) : 0;

  const cells: Array<[string, string]> = [
    [t('map.kpi.total'), String(placed.length)],
    [t('map.kpi.occupied'), String(occupied.length)],
    [t('map.kpi.vacant'), String(vacant.length)],
    [t('map.kpi.area'), `${Math.round(totalArea).toLocaleString('vi-VN')} m²`],
    [t('map.kpi.occupancy'), `${occupancyPct}%`],
  ];

  return (
    <div data-testid="map-kpi-strip" className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-gray-200 bg-white px-3 py-2">
      {cells.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-gray-400">{label}</span>
          <span className="text-sm font-semibold tabular-nums text-gray-900">{value}</span>
        </div>
      ))}
      {filtered ? (
        <span className="ml-auto text-[11px] text-gray-400" data-testid="map-kpi-filtered-note">
          {t('map.filteredCount', { shown: visible.length, total: floorPlaced.length })}
        </span>
      ) : floorPlaced.length < floorTotal ? (
        <span className="ml-auto text-[11px] text-gray-400">
          {t('map.placedCount', { placed: floorPlaced.length, total: floorTotal })}
        </span>
      ) : null}
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
  /**
   * Set by a page that owns the floor selector itself. When present the map
   * does not draw a second one -- two floor pickers on one screen was the
   * single most reported confusion on this page.
   */
  activeFloorId?: string;
  onFloorChange?: (floorId: string) => void;
  /**
   * Identities of the units the owning page's filters resolved to, for this
   * floor. Given this, the map draws exactly that population and hides its own
   * status pills -- the page's filter bar is the single control. Omitted by
   * embedded uses that have no filter bar, which keep the local pills.
   */
  activeUnitIds?: Set<string>;
  filtersActive?: boolean;
  onClearFilters?: () => void;
  /**
   * The same facts the list and the floor plan show for a space. Supplied by
   * the page so all three views describe a space identically.
   */
  slotSummaries?: Record<string, UnitSlotSummary>;
  handoverByUnit?: Record<string, HandoverSummary>;
  bookingByUnit?: Record<string, UnitBookingSummary>;
  onUnitClick?: (unit: Unit) => void;
  onBookUnit?: (unit: Unit) => void;
  /** Ghim vị trí vấn đề/khiếm khuyết fitout (D-Map) — tuỳ chọn, không có thì không đổi hành vi hiện tại. */
  issuePins?: IssuePin[];
}

export function MallMapViewer({
  floors, initialFloorId, activeFloorId: controlledFloorId, onFloorChange,
  activeUnitIds, filtersActive, onClearFilters,
  slotSummaries = {}, handoverByUnit = {}, bookingByUnit = {},
  onUnitClick, onBookUnit, issuePins,
}: MallMapViewerProps) {
  const { t } = useTranslation('spaces');
  const uid = useId().replace(/:/g, '');
  const reducedMotion = useReducedMotion();
  const sortedFloors = [...floors].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const isControlled = controlledFloorId !== undefined;
  const [ownFloorId, setOwnFloorId] = useState<string>(initialFloorId ?? sortedFloors[0]?.id ?? '');
  const activeFloorId = isControlled ? controlledFloorId : ownFloorId;

  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [focusedUnitId, setFocusedUnitId] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<MapView>(INITIAL_VIEW);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const frameRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ pointerX: number; pointerY: number; view: MapView } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [showWheelHint, setShowWheelHint] = useState(false);

  const motion = reducedMotion ? 'none' : `transform ${MAP_MOTION_MS}ms ease-out, fill-opacity ${MAP_MOTION_MS}ms ease-out, stroke-width ${MAP_MOTION_MS}ms ease-out`;

  // The hint is an answer to what the reader just tried, so it fades on its own.
  useEffect(() => {
    if (!showWheelHint) return;
    const id = setTimeout(() => setShowWheelHint(false), 1600);
    return () => clearTimeout(id);
  }, [showWheelHint]);

  // The frame's pixel size decides the pan limits, how much of a unit fits on
  // screen, and how many map units a pixel of shadow is worth -- so it is
  // measured rather than assumed.
  //
  // The measurement lives in an effect rather than in the ref callback: React
  // 18 discards anything a callback ref returns, so a cleanup written there is
  // never run and the observer outlives the element it watched.
  const [frameNode, setFrameNode] = useState<HTMLDivElement | null>(null);
  const attachFrame = useCallback((node: HTMLDivElement | null) => {
    frameRef.current = node;
    setFrameNode(node);
  }, []);

  useEffect(() => {
    if (!frameNode) return;
    const measure = () => setFrame({ width: frameNode.clientWidth, height: frameNode.clientHeight });
    measure();
    // ResizeObserver is missing in older browsers and in jsdom; the window
    // resize event is enough to keep the frame size honest there.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(frameNode);
    return () => observer.disconnect();
  }, [frameNode]);

  const zoomBy = useCallback((factor: number) => {
    setView((v) => zoomAt(v, factor, frame.width / 2, frame.height / 2, frame.width, frame.height));
  }, [frame.width, frame.height]);

  const resetView = useCallback(() => setView(INITIAL_VIEW), []);

  const focusUnit = useCallback((u: Unit) => {
    const poly = getUnitPolygon(u);
    if (!poly || !frame.width) return;
    const [cx, cy] = centroid(poly);
    const { width } = unitScreenSize(poly, frame.width, frame.height, 1);
    // Zoom until the unit is about a third of the frame, within the allowed range.
    const target = width > 0 ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (frame.width / 3) / width)) : 2;
    setView(focusOn(cx, cy, target, frame.width, frame.height));
  }, [frame.width, frame.height]);

  /**
   * Inside the page the wheel belongs to the page: scrolling past the map used
   * to zoom it instead of scrolling, and the reader lost their place. Zooming
   * asks for Ctrl (or ⌘) and says so; in fullscreen the map owns the wheel.
   */
  const handleWheel = useCallback((e: React.WheelEvent, fullscreen: boolean) => {
    if (!frameRef.current) return;
    if (!fullscreen && !e.ctrlKey && !e.metaKey) {
      setShowWheelHint(true);
      return;
    }
    e.preventDefault();
    const rect = frameRef.current.getBoundingClientRect();
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    setView((v) => zoomAt(v, factor, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height));
  }, []);

  /**
   * Panning must not cost the reader their clicks.
   *
   * Capturing the pointer the moment a press lands retargets the rest of the
   * gesture to the frame, so as soon as the map was zoomed in at all, every
   * press -- on a unit, and on the zoom buttons themselves -- was swallowed by
   * the pan: the map stuck at 140% and stopped responding entirely. A press is
   * a drag only once it has actually travelled.
   */
  const handlePointerDown = (e: React.PointerEvent) => {
    if (view.zoom <= MIN_ZOOM) return;
    // Secondary buttons open menus, they do not drag the map. Environments with
    // no PointerEvent leave button undefined, which means the primary one.
    if ((e.button ?? 0) !== 0) return;
    // A press that starts on a control belongs to that control, not to the map.
    if ((e.target as Element | null)?.closest?.('button')) return;
    panRef.current = { pointerX: e.clientX, pointerY: e.clientY, view };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = panRef.current;
    if (!start) return;
    const dx = e.clientX - start.pointerX;
    const dy = e.clientY - start.pointerY;
    if (!isPanning) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      setIsPanning(true);
      // Absent on SVG targets in some engines, and in jsdom: panning still works
      // through the frame's own move handler, so this is an enhancement, not a need.
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    setView(clampPan({
      zoom: start.view.zoom,
      x: start.view.x + dx,
      y: start.view.y + dy,
    }, frame.width, frame.height));
  };

  const endPan = () => { panRef.current = null; setIsPanning(false); };

  const currentIdx = sortedFloors.findIndex((f) => f.id === activeFloorId);

  const goToFloor = useCallback((id: string) => {
    if (isControlled) onFloorChange?.(id);
    else setOwnFloorId(id);
  }, [isControlled, onFloorChange]);

  const prevFloor = () => currentIdx > 0 && goToFloor(sortedFloors[currentIdx - 1].id);
  const nextFloor = () => currentIdx < sortedFloors.length - 1 && goToFloor(sortedFloors[currentIdx + 1].id);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 800);
    return () => clearInterval(id);
  }, []);

  const { data: floor, isLoading } = useQuery<FloorMapData>({
    queryKey: ['floor-map', activeFloorId],
    queryFn: () => spacesApi.getFloorMapData(activeFloorId),
    enabled: !!activeFloorId,
  });

  // A new floor is a new drawing and a new set of units: nothing carried over
  // from the previous one is still true.
  useEffect(() => {
    setImageRatio(null);
    setImageFailed(false);
    setSelectedUnit(null);
    setHoveredUnitId(null);
    setFocusedUnitId(null);
    setFilterStatus(null);
    setView(INITIAL_VIEW);
  }, [activeFloorId]);
  useEffect(() => { setView(INITIAL_VIEW); }, [isFullscreen]);

  // Close popup on ESC, fullscreen on F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // These shortcuts belong to the map, not to whoever happens to be typing.
      // The filter bar now sits beside the map, and a search for "B1-01" was
      // reaching the "0" binding and throwing the reader's zoom away; "f" in a
      // brand name threw them into fullscreen.
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape') {
        if (isFullscreen) { setIsFullscreen(false); return; }
        setSelectedUnit(null);
      }
      if (e.key === 'f' || e.key === 'F') setIsFullscreen((v) => !v);
      if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP);
      if (e.key === '-' || e.key === '_') zoomBy(1 / ZOOM_STEP);
      if (e.key === '0') resetView();
      if (e.key === 'ArrowLeft') prevFloor();
      if (e.key === 'ArrowRight') nextFloor();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen, currentIdx, sortedFloors, zoomBy, resetView]);

  const units = floor?.units ?? [];
  const floorPlaced = useMemo(() => units.filter(isPlaced), [units]);

  /**
   * SPACE-MAP-FILTER-01 -- which units this map is showing.
   *
   * When the page owns the filters it hands down the identities it resolved,
   * and the map simply draws those. No filter rule -- area, rent, category,
   * lease type, readiness -- is evaluated a second time here, so the map cannot
   * drift from the list beside it. Embedded uses that pass no population (the
   * Fitout D-Map) keep the map's own status pills, exactly as before.
   */
  const pageOwnsFilters = activeUnitIds !== undefined;
  const matchesFilter = useCallback(
    (u: Unit) => (pageOwnsFilters
      ? activeUnitIds!.has(u.id)
      : filterStatus === null || u.status === filterStatus),
    [pageOwnsFilters, activeUnitIds, filterStatus],
  );
  const visibleUnits = useMemo(() => floorPlaced.filter(matchesFilter), [floorPlaced, matchesFilter]);

  // Nothing filtered out may stay behind as live state: not the unit in the
  // panel, not a raised polygon under a pointer that has nothing to point at.
  useEffect(() => {
    if (selectedUnit && !matchesFilter(selectedUnit)) setSelectedUnit(null);
    if (hoveredUnitId && !visibleUnits.some((u) => u.id === hoveredUnitId)) setHoveredUnitId(null);
    if (focusedUnitId && !visibleUnits.some((u) => u.id === focusedUnitId)) setFocusedUnitId(null);
  }, [visibleUnits, selectedUnit, hoveredUnitId, focusedUnitId, matchesFilter]);

  // Paint order, not data order: a selected unit has to be drawn after its
  // neighbours or their surfaces cover the shadow that promotes it.
  const paintOrder = useMemo(
    () => presentationOrder(visibleUnits, hoveredUnitId, selectedUnit?.id),
    [visibleUnits, hoveredUnitId, selectedUnit?.id],
  );

  const geo = useMemo(() => ({
    rest: shadowGeometry('rest', frame.width, frame.height, view.zoom),
    hover: shadowGeometry('hover', frame.width, frame.height, view.zoom),
    selected: shadowGeometry('selected', frame.width, frame.height, view.zoom),
  }), [frame.width, frame.height, view.zoom]);

  // Use server-stored ratio first, fall back to client-measured
  const ratio = floor?.floorPlanRatio ?? imageRatio ?? 16 / 9;

  const selectUnit = useCallback((u: Unit) => {
    setSelectedUnit((prev) => (prev?.id === u.id ? null : u));
  }, []);

  const coverUrl = selectedUnit
    ? resolveFileUrl((selectedUnit as any).media?.find((m: any) => m.mimeType?.startsWith('image'))?.fileUrl)
    : undefined;

  // ── Map inner content (shared between normal and fullscreen) ──────────────

  const renderMap = (fullscreen: boolean) => {
    if (isLoading) {
      return (
        <div className={cn('flex items-center justify-center text-sm text-gray-400', fullscreen ? 'h-full' : 'h-64')}>
          {t('map.loading')}
        </div>
      );
    }
    if (!floor?.floorPlanUrl) {
      return (
        <div className={cn('flex flex-col items-center justify-center gap-2 text-gray-300', fullscreen ? 'h-full' : 'h-64')}>
          <MapPin size={36} className="opacity-40" />
          <p className="text-sm text-gray-400">{t('map.noFloorPlan')}</p>
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

    const scale = 1 / view.zoom;
    const wrapperStyle: React.CSSProperties = {
      position: 'absolute', inset: 0,
      transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
      transformOrigin: '0 0',
      willChange: 'transform',
    };

    return (
      <div
        ref={attachFrame}
        style={{ ...containerStyle, overflow: 'hidden', touchAction: 'none', cursor: isPanning ? 'grabbing' : view.zoom > MIN_ZOOM ? 'grab' : 'default' }}
        className={cn('bg-white', !fullscreen && 'rounded-2xl')}
        onWheel={(e) => handleWheel(e, fullscreen)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerLeave={endPan}
        data-testid="mall-map-frame"
      >
        <div style={wrapperStyle}>
          {/* Layer 0 — the architectural drawing, held back to context so the
              leasing objects above it are what the eye lands on first. Still
              legible: corridors, escalators and entrances must stay readable. */}
          {imageFailed ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-50 text-gray-300">
              <ImageOff size={32} />
              <p className="text-xs text-gray-400">{t('map.planFailed')}</p>
            </div>
          ) : (
            <img
              src={resolveFileUrl(floor.floorPlanUrl)}
              alt={`Floor plan ${floor.level}`}
              data-testid="map-cad-layer"
              className="pointer-events-none absolute inset-0 h-full w-full select-none"
              style={{ objectFit: 'fill', opacity: MAP_CAD.opacity, filter: MAP_CAD.filter }}
              draggable={false}
              onError={() => setImageFailed(true)}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setImageRatio(img.naturalWidth / img.naturalHeight);
                }
              }}
            />
          )}

          {/* Layers 1 and 2 — the leasing units. viewBox 0 0 100 100 = % coords. */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            style={{ ['--map-focus-outline' as any]: MAP_FOCUS_OUTLINE }}
          >
            <defs>
              <pattern id={`${uid}-stripe`} width="1.5" height="1.5" patternUnits="userSpaceOnUse"
                patternTransform={`rotate(45) translate(${tick % 2 === 0 ? 0 : 0.75})`}>
                <line x1="0" y1="0" x2="0" y2="1.5" stroke="rgba(255,255,255,0.75)" strokeWidth="0.55" />
              </pattern>
              {(['rest', 'hover', 'selected'] as const).map((level) => (
                <filter
                  key={level}
                  id={`${uid}-shadow-${level}`}
                  x="-60%" y="-60%" width="220%" height="220%"
                  colorInterpolationFilters="sRGB"
                >
                  {/* Two deviations: the viewBox is stretched to the frame, so a
                      single value would blur more on one axis than the other. */}
                  <feGaussianBlur stdDeviation={`${geo[level].blurX} ${geo[level].blurY}`} />
                </filter>
              ))}
            </defs>

            {/* Click the plan itself to put the current unit down. */}
            <rect x="0" y="0" width="100" height="100" fill="transparent"
              onClick={() => setSelectedUnit(null)} />

            {paintOrder.map((u) => {
              const poly = getUnitPolygon(u);
              if (!poly) return null;
              const selected = u.id === selectedUnit?.id;
              const hovered = u.id === hoveredUnitId || u.id === focusedUnitId;
              const level = elevationLevel(selected, hovered);
              return (
                <g key={u.id} data-testid={`map-unit-${u.code}`}>
                  <UnitPolygon
                    points={pointsOf(poly)}
                    status={u.status}
                    level={level}
                    geo={geo[level]}
                    filterId={`${uid}-shadow-${level}`}
                    stripeId={`${uid}-stripe`}
                    motion={motion}
                  />
                </g>
              );
            })}

            {/* Hit layer — never moves, never blurs, never reorders. The visible
                polygon may lift by a couple of pixels; the target it is clicked
                by must not, or the pointer would fall off its own hover. */}
            {visibleUnits.map((u) => {
              const poly = getUnitPolygon(u);
              if (!poly) return null;
              return (
                <polygon
                  key={`hit-${u.id}`}
                  points={pointsOf(poly)}
                  data-testid={`map-hit-${u.code}`}
                  // The focus ring is a :focus-visible rule (index.css), so it
                  // answers a reader tabbing through the floor without drawing
                  // itself over every unit somebody merely clicked.
                  className="map-unit-hit"
                  fill="transparent"
                  stroke="transparent"
                  vectorEffect="non-scaling-stroke"
                  tabIndex={0}
                  role="button"
                  aria-label={`${u.code} — ${getUnitStatusLabel(t, u.status)} — ${u.areaNLA.toLocaleString('vi-VN')} m²`}
                  style={{ cursor: 'pointer', outline: 'none' }}
                  onClick={(e) => { e.stopPropagation(); selectUnit(u); }}
                  onDoubleClick={(e) => { e.stopPropagation(); focusUnit(u); }}
                  onMouseEnter={() => setHoveredUnitId(u.id)}
                  onMouseLeave={() => setHoveredUnitId(null)}
                  onFocus={() => setFocusedUnitId(u.id)}
                  onBlur={() => setFocusedUnitId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectUnit(u); }
                  }}
                />
              );
            })}
          </svg>

          {/* Labels — HTML so the text keeps its shape under a stretched viewBox,
              counter-scaled so it keeps its size on screen. They take no pointer
              events: the SVG hit layer underneath is the single click target. */}
          {visibleUnits.map((u) => {
            const poly = getUnitPolygon(u);
            if (!poly) return null;
            const [cx, cy] = centroid(poly);
            const size = unitScreenSize(poly, frame.width, frame.height, view.zoom);
            const selected = u.id === selectedUnit?.id;
            const hovered = u.id === hoveredUnitId || u.id === focusedUnitId;
            const fits = detailLevel(size.width, size.height);
            const detail = selected ? moreDetail(fits) : fits;
            const level = elevationLevel(selected, hovered);
            return (
              <div
                key={`label-${u.id}`}
                style={{
                  position: 'absolute', left: `${cx}%`, top: `${cy}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: selected ? 30 : hovered ? 25 : 10,
                  pointerEvents: 'none',
                }}
              >
                <UnitLabel
                  unit={u}
                  bookingName={bookingHolderLabel(bookingByUnit[u.id]) ?? undefined}
                  detail={detail}
                  selected={selected}
                  hovered={hovered}
                  scale={scale}
                  liftPx={MAP_ELEVATION[level].lift}
                  t={t}
                />
              </div>
            );
          })}

          {/* Fitout issue pins (D-Map) — badge at unit centroid, count + highest severity color */}
          {issuePins && issuePins.length > 0 && visibleUnits.map((u) => {
            const pinsForUnit = issuePins.filter((pin) => pin.unitId === u.id);
            if (pinsForUnit.length === 0) return null;
            const poly = getUnitPolygon(u);
            if (!poly) return null;
            const [cx, cy] = centroid(poly);
            const topSeverity = pinsForUnit.reduce(
              (top, pin) => (PIN_SEVERITY_RANK[pin.severity] ?? 0) > (PIN_SEVERITY_RANK[top] ?? 0) ? pin.severity : top,
              pinsForUnit[0].severity,
            );
            return (
              <div key={`pin-${u.id}`} style={{
                position: 'absolute', left: `${cx}%`, top: `${cy}%`,
                transform: `translate(-50%, -50%) scale(${scale}) translate(0, -220%)`,
                pointerEvents: 'none', zIndex: 35,
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
        </div>

        {/* Map controls — one stack, fixed to the frame while the map moves under it */}
        <div className="absolute bottom-3 right-3 z-40 flex flex-col items-stretch gap-1 rounded-xl bg-white/95 p-1 shadow-lg ring-1 ring-black/5">
          <button type="button" aria-label={t('map.zoomIn')} title={`${t('map.zoomIn')} (+)`}
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
            disabled={view.zoom >= MAX_ZOOM} onClick={() => zoomBy(ZOOM_STEP)}>
            <ZoomIn size={16} />
          </button>
          <div data-testid="map-zoom-level" className="text-center text-[10px] font-semibold tabular-nums text-gray-500">{Math.round(view.zoom * 100)}%</div>
          <button type="button" aria-label={t('map.zoomOut')} title={`${t('map.zoomOut')} (−)`}
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
            disabled={view.zoom <= MIN_ZOOM} onClick={() => zoomBy(1 / ZOOM_STEP)}>
            <ZoomOut size={16} />
          </button>
          <button type="button" aria-label={t('map.resetZoom')} title={`${t('map.resetZoom')} (0)`}
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
            disabled={view.zoom === MIN_ZOOM && view.x === 0 && view.y === 0} onClick={resetView}>
            <Locate size={16} />
          </button>
        </div>

        {showWheelHint && !fullscreen && (
          <div
            role="status"
            data-testid="map-wheel-hint"
            className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-gray-900/45 text-center text-sm font-medium text-white backdrop-blur-[1px]"
          >
            <span className="rounded-full bg-gray-900/80 px-4 py-2">{t('map.wheelHint')}</span>
          </div>
        )}

        {floorPlaced.length === 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-gray-900/70 px-4 py-2 text-xs text-white">
            {t('map.noPositions')}
          </div>
        )}

        {floorPlaced.length > 0 && visibleUnits.length === 0 && (
          <div
            data-testid="map-empty-filter"
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-gray-900/75 px-4 py-2 text-xs text-white"
          >
            <SearchX size={13} /> {t('map.noFilterMatch')}
            {onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="ml-1 underline underline-offset-2 hover:no-underline"
              >
                {t('filters.clearAll')}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Floor navigation (only when the page has not taken it over) ───────────

  const renderFloorNav = (dark: boolean) => (
    <div className={cn('flex items-center gap-2', dark ? 'text-white' : '')} data-testid="map-floor-nav">
      <button
        onClick={prevFloor}
        disabled={currentIdx <= 0}
        className={cn(
          'rounded-lg p-1.5 transition-all disabled:opacity-30',
          dark ? 'text-white hover:bg-white/20' : 'border border-gray-200 text-gray-600 hover:bg-gray-100',
        )}
        title="Tầng trước (←)"
      >
        <ChevronLeft size={16} />
      </button>

      <div className={cn('flex items-center gap-1 rounded-lg p-1', dark ? 'bg-white/10' : 'bg-gray-100')}>
        {sortedFloors.map((f) => (
          <button
            key={f.id}
            onClick={() => goToFloor(f.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              f.id === activeFloorId
                ? dark ? 'bg-white text-gray-900' : 'bg-white text-gray-900 shadow-sm'
                : dark ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-gray-500 hover:text-gray-800',
            )}
          >
            {f.level}
            {!f.floorPlanUrl && !dark && <span className="ml-1 text-[10px] text-gray-300">({t('map.floorHint')})</span>}
          </button>
        ))}
      </div>

      <button
        onClick={nextFloor}
        disabled={currentIdx >= sortedFloors.length - 1}
        className={cn(
          'rounded-lg p-1.5 transition-all disabled:opacity-30',
          dark ? 'text-white hover:bg-white/20' : 'border border-gray-200 text-gray-600 hover:bg-gray-100',
        )}
        title="Tầng tiếp (→)"
      >
        <ChevronRight size={16} />
      </button>

      <span className={cn('text-xs tabular-nums', dark ? 'text-white/60' : 'text-gray-400')}>
        {currentIdx + 1} / {sortedFloors.length}
      </span>
    </div>
  );

  /**
   * Fullscreen hides the page's filter bar, so it says what the filters are
   * currently doing and offers to lift them. It deliberately does NOT offer a
   * second set of filter controls: the page owns that state, and a duplicate
   * copy here is how the map and the list drifted apart in the first place.
   */
  const renderActiveFilterSummary = () => (
    <div className="flex items-center gap-2 text-xs" data-testid="map-filter-summary">
      <span className="text-white/70">
        {filtersActive
          ? t('map.filteredCount', { shown: visibleUnits.length, total: floorPlaced.length })
          : t('map.unfilteredCount', { total: floorPlaced.length })}
      </span>
      {filtersActive && onClearFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="rounded-full border border-white/30 px-2.5 py-1 font-medium text-white hover:bg-white/10"
        >
          {t('filters.clearAll')}
        </button>
      )}
    </div>
  );

  // ── Status filter pills ────────────────────────────────────────────────────

  const renderStatusFilters = (dark: boolean) => {
    const present = MAP_STATUS_ORDER
      .map((key) => ({ key, token: statusToken(key), count: floorPlaced.filter((u) => u.status === key).length }))
      .filter((s) => s.count > 0);
    if (present.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5" data-testid="map-status-filters">
        <button onClick={() => setFilterStatus(null)}
          className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
            !filterStatus
              ? dark ? 'border-white bg-white text-gray-900' : 'border-gray-800 bg-gray-800 text-white'
              : dark ? 'border-white/20 text-white/60 hover:border-white/40' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-400')}>
          {t('filters.all')} ({floorPlaced.length})
        </button>
        {present.map(({ key, token, count }) => (
          <button key={key} onClick={() => setFilterStatus(filterStatus === key ? null : key)}
            className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
              filterStatus === key
                ? 'border-transparent text-white'
                : dark ? 'border-white/20 text-white/70 hover:border-white/40' : 'border-gray-200 bg-white hover:border-gray-400')}
            style={filterStatus === key
              ? { background: token.swatch, borderColor: token.border }
              : dark ? {} : { color: token.ink }}>
            {getUnitStatusLabel(t, key)} ({count})
          </button>
        ))}
      </div>
    );
  };

  const panel = selectedUnit ? (
    <MallMapUnitPanel
      unit={selectedUnit}
      coverUrl={coverUrl}
      floorName={floor?.name}
      slotSummary={slotSummaries[selectedUnit.id]}
      handover={handoverByUnit[selectedUnit.id]}
      booking={bookingByUnit[selectedUnit.id]}
      onClose={() => setSelectedUnit(null)}
      onViewDetail={onUnitClick}
      onBook={onBookUnit}
    />
  ) : null;

  // ── Fullscreen modal ───────────────────────────────────────────────────────

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-gray-900 px-4 py-3">
          {/* Fullscreen hides the page chrome, so the floor selector belongs
              here even when the page owns it in the normal view. */}
          {renderFloorNav(true)}
          <div className="flex items-center gap-3">
            {pageOwnsFilters ? renderActiveFilterSummary() : renderStatusFilters(true)}
            <Button size="sm" variant="outline"
              className="h-8 gap-1.5 border-white/30 bg-transparent text-xs text-white hover:bg-white/10"
              onClick={() => setIsFullscreen(false)}>
              <Minimize2 size={13} /> {t('map.exitFullscreen')}
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-3 p-4">
          <div className="flex min-w-0 flex-1 items-center justify-center">{renderMap(true)}</div>
          {panel}
        </div>
      </div>
    );
  }

  // ── Normal view ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-2.5">
      {/*
        Row 1 — the floor selector when the page has not provided one, and a
        fullscreen button that is always offered. Folding fullscreen into the
        corner control stack left it as an unlabelled icon, and on a page that
        owns the floor selector this whole row disappeared with it: readers
        could no longer find the one control that makes a floor plan legible.
      */}
      <div className="flex flex-wrap items-center gap-3">
        {!isControlled && renderFloorNav(false)}
        <button
          type="button"
          onClick={() => setIsFullscreen(true)}
          title={`${t('map.fullscreen')} (F)`}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 transition-all hover:border-gray-400 hover:text-gray-900"
        >
          <Maximize2 size={13} /> {t('map.fullscreen')}
        </button>
      </div>

      {/* Row 2 — business filters, only where this map owns them */}
      {!pageOwnsFilters && renderStatusFilters(false)}

      {/* Row 3 — compact KPI strip supporting the map */}
      {!isLoading && (
        <KpiStrip
          visible={visibleUnits}
          floorPlaced={floorPlaced}
          floorTotal={units.length}
          filtered={visibleUnits.length !== floorPlaced.length}
        />
      )}

      {/* Workspace — map, with the current unit opened beside it */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white shadow-sm">
          {renderMap(false)}
        </div>
        {panel}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 text-xs text-gray-500">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t('map.legend')}</span>
        {MAP_STATUS_ORDER.filter((key) => visibleUnits.some((u) => u.status === key)).map((key) => {
          const token = statusToken(key);
          return (
            <span key={key} className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded border-2"
                style={{ background: `${token.surface}66`, borderColor: token.border }} />
              {getUnitStatusLabel(t, key)}
            </span>
          );
        })}
        <span className="ml-auto text-[11px] text-gray-400">{t('map.clickHint')}</span>
      </div>
    </div>
  );
}
