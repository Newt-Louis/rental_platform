import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Upload, Trash2, Save, X, CheckCircle, AlertTriangle, LayoutGrid, Pentagon, Undo,
} from 'lucide-react';
import type { FloorMapData, Unit } from '@/types';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

type Pt = [number, number];

// ─── Status colors ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, { fill: string; stroke: string; label: string }> = {
  VACANT:       { fill: '#ef4444', stroke: '#dc2626', label: 'Trống' },
  BOOKING:      { fill: '#f59e0b', stroke: '#d97706', label: 'Booking' },
  NEGOTIATING:  { fill: '#f97316', stroke: '#ea580c', label: 'Thương thảo' },
  CONTRACTED:   { fill: '#3b82f6', stroke: '#2563eb', label: 'Hợp đồng' },
  UNDER_FITOUT: { fill: '#a855f7', stroke: '#9333ea', label: 'Thi công' },
  OCCUPIED:     { fill: '#22c55e', stroke: '#16a34a', label: 'Đang thuê' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function dist(a: Pt, b: Pt) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
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

// ─── Main MallMapEditor ───────────────────────────────────────────────────────

export function MallMapEditor({ floorId }: { floorId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Unit state
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [pendingPositions, setPendingPositions] = useState<Record<string, Pt[]>>({});
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);

  // Image aspect ratio (measured on load to eliminate letterboxing)
  const [imageRatio, setImageRatio] = useState<number | null>(null);

  // Polygon drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<Pt[]>([]);
  const [cursorPt, setCursorPt] = useState<Pt | null>(null);
  const [nearClose, setNearClose] = useState(false);
  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false);

  const { data: floor, isLoading } = useQuery<FloorMapData>({
    queryKey: ['floor-map', floorId],
    queryFn: () => spacesApi.getFloorMapData(floorId),
  });

  const uploadMutation = useMutation({
    mutationFn: (fd: FormData) => spacesApi.uploadFloorPlan(floorId, fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor-map', floorId] });
      setImageRatio(null);
      toast({ title: 'Đã upload sơ đồ mặt bằng' });
    },
    onError: (e: any) =>
      toast({ title: e?.response?.data?.message ?? 'Upload thất bại', variant: 'destructive' }),
  });

  const deletePlanMutation = useMutation({
    mutationFn: () => spacesApi.deleteFloorPlan(floorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor-map', floorId] });
      setImageRatio(null);
      toast({ title: 'Đã xóa sơ đồ' });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (positions: { unitId: string; polygon: Pt[] }[]) =>
      spacesApi.saveMapPositions(
        floorId,
        positions.map((p) => ({ unitId: p.unitId, polygon: p.polygon })),
      ),
    onSuccess: (_, positions) => {
      qc.invalidateQueries({ queryKey: ['floor-map', floorId] });
      setPendingPositions({});
      toast({ title: `Đã lưu vị trí ${positions.length} unit` });
    },
    onError: (e: any) =>
      toast({ title: e?.response?.data?.message ?? 'Lỗi lưu', variant: 'destructive' }),
  });

  const clearPosMutation = useMutation({
    mutationFn: (unitId: string) => spacesApi.clearUnitMapPosition(unitId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor-map', floorId] });
      setSelectedUnitId(null);
    },
  });

  // ESC cancels drawing
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelDrawing(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Warn before leaving with unsaved positions
  useEffect(() => {
    const hasPendingData = Object.keys(pendingPositions).length > 0;
    const handler = (e: BeforeUnloadEvent) => {
      if (hasPendingData) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingPositions]);

  const cancelDrawing = () => {
    setIsDrawing(false);
    setDrawPoints([]);
    setCursorPt(null);
    setNearClose(false);
  };

  // Convert mouse event to SVG viewBox coordinates (0–100)
  const getSvgPos = (e: React.MouseEvent<SVGSVGElement>): Pt => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return [Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))];
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    const pt = getSvgPos(e);
    setCursorPt(pt);
    setNearClose(drawPoints.length >= 3 && dist(pt, drawPoints[0]) < 2.5);
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    e.stopPropagation();
    const pt = getSvgPos(e);
    if (drawPoints.length >= 3 && dist(pt, drawPoints[0]) < 2.5) {
      closePoly();
      return;
    }
    setDrawPoints((prev) => [...prev, pt]);
  };

  const handleSvgDblClick = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (isDrawing && drawPoints.length >= 3) closePoly();
  };

  const closePoly = () => {
    if (!selectedUnitId || drawPoints.length < 3) return;
    setPendingPositions((prev) => ({ ...prev, [selectedUnitId]: drawPoints }));
    cancelDrawing();
  };

  const startDrawing = () => {
    if (!selectedUnitId) return;
    setIsDrawing(true);
    setDrawPoints([]);
    setCursorPt(null);
    setNearClose(false);
  };

  // Derive unit polygon: pending → stored polygon → convert legacy rect
  const getUnitPolygon = (u: Unit): Pt[] | null => {
    if (pendingPositions[u.id]) return pendingPositions[u.id];
    if (u.mapPolygon) return u.mapPolygon;
    if (u.mapPosX != null) {
      const { mapPosX: x, mapPosY: y, mapPosW: w, mapPosH: h } = u;
      return [[x!, y!], [x!+w!, y!], [x!+w!, y!+h!], [x!, y!+h!]];
    }
    return null;
  };

  const hasPosition = (u: Unit) =>
    u.mapPolygon != null || u.mapPosX != null || !!pendingPositions[u.id];

  const allUnits = floor?.units ?? [];
  const placed = allUnits.filter(hasPosition);
  const unplaced = allUnits.filter((u) => !hasPosition(u));
  const hasPending = Object.keys(pendingPositions).length > 0;
  const selectedUnit = allUnits.find((u) => u.id === selectedUnitId) ?? null;
  const ratio = imageRatio ?? 16 / 9;

  const renderUnitItem = (u: Unit) => {
    const color = STATUS_COLOR[u.status] ?? STATUS_COLOR.VACANT;
    const isSelected = u.id === selectedUnitId;
    const isPending = !!pendingPositions[u.id];
    return (
      <button
        key={u.id}
        onClick={() => { if (!isDrawing) setSelectedUnitId(isSelected ? null : u.id); }}
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all ${
          isSelected
            ? 'bg-blue-50 border border-blue-300 ring-1 ring-blue-200'
            : 'bg-white border border-gray-100 hover:border-gray-300'
        }`}
      >
        <div className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ background: color.fill, border: `1px solid ${color.stroke}` }} />
        <span className="font-medium flex-1 truncate">{u.code}</span>
        <span className="text-gray-400 text-[10px]">{u.areaNLA.toLocaleString()} m²</span>
        {isPending && <span className="text-amber-500 text-[10px]">*</span>}
        {hasPosition(u) && !isPending && <CheckCircle size={9} className="text-green-500 shrink-0" />}
      </button>
    );
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Đang tải...</div>;
  }

  return (
    <div className="flex gap-4" style={{ height: 680 }}>
      {/* ── Left: unit list ── */}
      <div className="w-52 shrink-0 flex flex-col gap-2 overflow-hidden">
        {isDrawing ? (
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-blue-600 flex items-center gap-1.5">
              <Pentagon size={14} /> Đang vẽ vùng
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1.5">
              <p className="font-semibold truncate">{selectedUnit?.code}</p>
              <p>• Click để thêm đỉnh</p>
              <p>• Double-click để đóng</p>
              <p>• Click đỉnh đầu để đóng</p>
              <p>• ESC để hủy</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-mono">
                {drawPoints.length} đỉnh
              </span>
              {drawPoints.length >= 1 && (
                <button
                  onClick={() => setDrawPoints((p) => p.slice(0, -1))}
                  className="flex items-center gap-1 bg-white border border-blue-200 text-blue-600 px-2 py-1 rounded text-xs hover:bg-blue-50"
                >
                  <Undo size={10} /> Hoàn tác
                </button>
              )}
            </div>
            {drawPoints.length >= 3 && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={closePoly}>
                <Pentagon size={11} /> Đóng vùng
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cancelDrawing}>
              Hủy (ESC)
            </Button>
          </div>
        ) : (
          <>
            <div className="text-sm font-semibold text-gray-700">Danh sách Unit</div>
            <div className="text-xs text-gray-500">
              {selectedUnitId ? 'Nhấn "Vẽ vùng" để bắt đầu' : 'Chọn unit để vẽ vị trí'}
            </div>
            <div className="text-[11px] font-semibold text-red-400 uppercase px-1 shrink-0">
              Chưa đặt ({unplaced.length})
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {unplaced.length === 0 ? (
                <div className="text-center text-gray-300 text-xs py-3">Tất cả đã đặt ✓</div>
              ) : (
                unplaced.map(renderUnitItem)
              )}
            </div>
            {placed.length > 0 && (
              <>
                <div className="text-[11px] font-semibold text-green-500 uppercase px-1 shrink-0">
                  Đã đặt ({placed.length})
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                  {placed.map(renderUnitItem)}
                </div>
              </>
            )}
          </>
        )}

        {hasPending && !isDrawing && (
          <Button
            size="sm"
            className="gap-1 w-full mt-auto shrink-0"
            onClick={() => {
              saveMutation.mutate(
                Object.entries(pendingPositions).map(([unitId, polygon]) => ({ unitId, polygon })),
              );
            }}
            disabled={saveMutation.isPending}
          >
            <Save size={13} />
            {saveMutation.isPending
              ? 'Đang lưu...'
              : `Lưu ${Object.keys(pendingPositions).length} unit`}
          </Button>
        )}
      </div>

      {/* ── Right: editor ── */}
      <div className="flex-1 flex flex-col gap-2 min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button
            size="sm"
            variant={isDrawing ? 'default' : 'outline'}
            className="gap-1.5 h-8 text-xs"
            onClick={startDrawing}
            disabled={!selectedUnitId || isDrawing}
          >
            <Pentagon size={12} />
            {isDrawing ? 'Đang vẽ...' : 'Vẽ vùng'}
          </Button>

          <div className="h-4 w-px bg-gray-200" />

          <Button
            size="sm" variant="outline" className="gap-1 h-8 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            <Upload size={11} />
            {floor?.floorPlanUrl ? 'Đổi sơ đồ' : 'Upload sơ đồ'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const fd = new FormData();
              fd.append('file', f);
              uploadMutation.mutate(fd);
              e.target.value = '';
            }}
          />

          {floor?.floorPlanUrl && (
            <Button
              size="sm" variant="outline" className="gap-1 h-8 text-xs text-red-500 hover:bg-red-50"
              onClick={() => setConfirmDeletePlan(true)}
            >
              <Trash2 size={11} /> Xóa sơ đồ
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
            {hasPending && (
              <span className="text-amber-500 font-medium flex items-center gap-1">
                <AlertTriangle size={11} /> {Object.keys(pendingPositions).length} chưa lưu
              </span>
            )}
            <span>{placed.length}/{allUnits.length} đã đặt</span>
          </div>
        </div>

        {/* Selected unit info bar */}
        {selectedUnitId && !isDrawing && selectedUnit && (() => {
          const poly = getUnitPolygon(selectedUnit);
          const isPending = !!pendingPositions[selectedUnitId];
          return (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs shrink-0">
              <span className="font-semibold text-blue-800">{selectedUnit.code}</span>
              <span className="text-blue-500">{selectedUnit.areaNLA} m²</span>
              {poly ? (
                <>
                  <span className="text-blue-400">
                    {poly.length} đỉnh{isPending ? ' (chưa lưu)' : ''}
                  </span>
                  <Button
                    size="sm" variant="outline"
                    className="ml-auto gap-1 h-6 text-[11px] text-red-500 hover:bg-red-50 border-red-200"
                    onClick={() => {
                      if (isPending) {
                        setPendingPositions((p) => { const n = { ...p }; delete n[selectedUnitId]; return n; });
                      } else {
                        clearPosMutation.mutate(selectedUnitId);
                      }
                    }}
                  >
                    <X size={10} /> Xóa vị trí
                  </Button>
                  <Button size="sm" className="gap-1 h-6 text-[11px]" onClick={startDrawing}>
                    <Pentagon size={10} /> Vẽ lại
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-blue-400">Chưa có vị trí</span>
                  <Button size="sm" className="ml-auto gap-1 h-6 text-[11px]" onClick={startDrawing}>
                    <Pentagon size={10} /> Vẽ vùng
                  </Button>
                </>
              )}
              <button className="text-blue-300 hover:text-blue-500 ml-1" onClick={() => setSelectedUnitId(null)}>
                <X size={14} />
              </button>
            </div>
          );
        })()}

        {/* Map */}
        {!floor?.floorPlanUrl ? (
          <div className="flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 text-gray-300 min-h-0">
            <LayoutGrid size={48} className="opacity-30" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-400">Chưa có sơ đồ mặt bằng</p>
              <p className="text-xs text-gray-400 mt-1">Upload ảnh JPG/PNG/WebP để bắt đầu vẽ vùng</p>
              <Button size="sm" variant="outline" className="mt-3 gap-1"
                onClick={() => fileInputRef.current?.click()}>
                <Upload size={12} /> Upload sơ đồ
              </Button>
            </div>
          </div>
        ) : (
          /* Scrollable container so tall floor plans don't overflow */
          <div className="flex-1 overflow-auto min-h-0 rounded-xl border border-gray-200 bg-gray-50">
            {/*
              Aspect-ratio trick: paddingTop = (1/ratio)*100% forces the container
              to exactly match the image's natural proportions — no letterboxing.
              The image uses objectFit:fill to fill the container perfectly.
              The SVG viewBox="0 0 100 100" + preserveAspectRatio="none" makes
              SVG coordinates equal to percentages, so clicks map 1:1.
            */}
            <div
              className="relative w-full"
              style={{ paddingTop: `${(1 / ratio) * 100}%` }}
            >
              <img
                src={resolveFileUrl(floor.floorPlanUrl)}
                alt="Floor plan"
                className="absolute inset-0 w-full h-full select-none"
                style={{ objectFit: 'fill' }}
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth && img.naturalHeight) {
                    setImageRatio(img.naturalWidth / img.naturalHeight);
                  }
                }}
              />

              {/* SVG overlay: viewBox 0 0 100 100 = % coordinates */}
              <svg
                ref={svgRef}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full"
                style={{
                  cursor: isDrawing && selectedUnitId
                    ? nearClose ? 'cell' : 'crosshair'
                    : 'default',
                }}
                onMouseMove={handleSvgMouseMove}
                onClick={handleSvgClick}
                onDoubleClick={handleSvgDblClick}
              >
                {/* Placed unit polygons — no text here, labels are HTML divs below */}
                {allUnits.map((u) => {
                  const poly = getUnitPolygon(u);
                  if (!poly) return null;
                  const color = STATUS_COLOR[u.status] ?? STATUS_COLOR.VACANT;
                  const isPending = !!pendingPositions[u.id];
                  const isSelected = u.id === selectedUnitId;
                  const isHovered = u.id === hoveredUnitId;
                  const ptStr = poly.map(([x, y]) => `${x},${y}`).join(' ');

                  return (
                    <g key={u.id}>
                      <polygon
                        points={ptStr}
                        fill={color.fill}
                        fillOpacity={isSelected ? 0.75 : isHovered ? 0.65 : 0.45}
                        stroke={isSelected ? '#1d4ed8' : isPending ? '#f59e0b' : color.stroke}
                        strokeWidth={isSelected ? 2 : isPending ? 1.5 : 1.2}
                        strokeDasharray={isPending ? '0.8,0.4' : undefined}
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor: isDrawing ? 'crosshair' : 'pointer', transition: 'fill-opacity 0.1s' }}
                        onClick={(e) => {
                          if (isDrawing) return;
                          e.stopPropagation();
                          setSelectedUnitId(isSelected ? null : u.id);
                        }}
                        onMouseEnter={() => setHoveredUnitId(u.id)}
                        onMouseLeave={() => setHoveredUnitId(null)}
                      />
                    </g>
                  );
                })}

                {/* In-progress polygon preview */}
                {isDrawing && drawPoints.length > 0 && (() => {
                  const color = selectedUnit
                    ? (STATUS_COLOR[selectedUnit.status] ?? STATUS_COLOR.VACANT)
                    : { fill: '#3b82f6', stroke: '#2563eb' };
                  const previewPts = cursorPt ? [...drawPoints, cursorPt] : drawPoints;
                  const ptStr = previewPts.map(([x, y]) => `${x},${y}`).join(' ');

                  return (
                    <g style={{ pointerEvents: 'none' }}>
                      {/* Transparent area fill */}
                      {previewPts.length >= 3 && (
                        <polygon
                          points={ptStr}
                          fill={color.fill}
                          fillOpacity={0.18}
                          stroke="none"
                        />
                      )}
                      {/* Dashed outline */}
                      <polyline
                        points={ptStr}
                        fill="none"
                        stroke={color.stroke}
                        strokeWidth="1.5"
                        strokeDasharray="0.8,0.4"
                        vectorEffect="non-scaling-stroke"
                      />
                      {/* Closing line to first point */}
                      {cursorPt && drawPoints.length >= 2 && (
                        <line
                          x1={cursorPt[0]} y1={cursorPt[1]}
                          x2={drawPoints[0][0]} y2={drawPoints[0][1]}
                          stroke={nearClose ? '#16a34a' : color.stroke}
                          strokeWidth="1"
                          strokeDasharray="0.5,0.4"
                          strokeOpacity={0.55}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {/* Vertex dots */}
                      {drawPoints.map(([x, y], i) => (
                        <circle key={i} cx={x} cy={y} r="0.8"
                          fill={i === 0 ? (nearClose ? '#16a34a' : '#fff') : color.fill}
                          stroke={i === 0 ? (nearClose ? '#16a34a' : color.stroke) : '#fff'}
                          strokeWidth="1" vectorEffect="non-scaling-stroke"
                        />
                      ))}
                      {/* Close-indicator ring on first vertex */}
                      {nearClose && (
                        <circle cx={drawPoints[0][0]} cy={drawPoints[0][1]} r="2"
                          fill="none" stroke="#16a34a" strokeWidth="1.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </g>
                  );
                })()}
              </svg>

              {/* Unit code labels — HTML divs avoid SVG text distortion from preserveAspectRatio="none" */}
              {allUnits.map((u) => {
                const poly = getUnitPolygon(u);
                if (!poly) return null;
                const area = polygonArea(poly);
                if (area < 12) return null;
                const [cx, cy] = centroid(poly);
                return (
                  <div
                    key={`lbl-${u.id}`}
                    style={{
                      position: 'absolute',
                      left: `${cx}%`,
                      top: `${cy}%`,
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'white',
                      textShadow: '0 1px 2px rgba(0,0,0,0.85)',
                      lineHeight: 1,
                    }}
                  >
                    {u.code}
                  </div>
                );
              })}

              {/* Drawing hint at bottom */}
              {isDrawing && selectedUnitId && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-gray-900/80 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none select-none whitespace-nowrap">
                  {drawPoints.length === 0
                    ? 'Click để đặt đỉnh đầu tiên'
                    : nearClose
                    ? '✓ Click để đóng vùng'
                    : `${drawPoints.length} đỉnh — double-click hoặc click đỉnh đầu để đóng`}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 shrink-0">
          {Object.entries(STATUS_COLOR).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm border inline-block"
                style={{ background: cfg.fill, borderColor: cfg.stroke }} />
              {cfg.label}
            </span>
          ))}
          <span className="ml-auto text-gray-400 flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm border-2 border-dashed border-amber-500 inline-block" /> Chưa lưu
          </span>
        </div>
      </div>
      <ConfirmActionDialog
        open={confirmDeletePlan}
        onOpenChange={setConfirmDeletePlan}
        title="Xóa sơ đồ mặt bằng"
        description="Ảnh sơ đồ hiện tại sẽ bị xóa. Các vị trí hiển thị có thể không còn sử dụng được."
        confirmLabel="Xóa sơ đồ"
        destructive
        loading={deletePlanMutation.isPending}
        onConfirm={() => deletePlanMutation.mutate(undefined, { onSuccess: () => setConfirmDeletePlan(false) })}
      />
    </div>
  );
}
