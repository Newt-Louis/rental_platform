/**
 * CR-SPACES-FLOOR-MAP-UX-001 — presentation tokens for the leasing floor map.
 *
 * The map is read as a business map, not as a CAD drawing: the architectural
 * plan is context, each leasing unit is the object of work. That reading is
 * produced by three things kept together here so no component invents its own:
 * how far the CAD is pushed back, what surface a status paints, and how far a
 * unit floats above the plan.
 *
 * Everything is presentation. Nothing here touches stored geometry.
 */

export interface MapStatusToken {
  /** Translucent surface painted over the de-emphasised plan. */
  surface: string;
  /** Boundary of the business object, and the accent its label borrows. */
  border: string;
  /** Ink for the status word — darker than the border so small text stays legible. */
  ink: string;
  /** Solid colour for legend swatches and filter pills, where there is no plan underneath. */
  swatch: string;
}

/**
 * Status surfaces. They are deliberately light: a status must be recognisable
 * without hiding the corridor, escalator or entrance drawn underneath it.
 * Saturation is reserved for the legend and the filter pills.
 */
export const MAP_STATUS: Record<string, MapStatusToken> = {
  VACANT: { surface: '#f87171', border: '#dc2626', ink: '#b91c1c', swatch: '#ef4444' },
  OFFERING: { surface: '#2dd4bf', border: '#0d9488', ink: '#0f766e', swatch: '#14b8a6' },
  BOOKING: { surface: '#fbbf24', border: '#d97706', ink: '#b45309', swatch: '#f59e0b' },
  NEGOTIATING: { surface: '#fb923c', border: '#ea580c', ink: '#c2410c', swatch: '#f97316' },
  CONTRACTED: { surface: '#c084fc', border: '#9333ea', ink: '#7e22ce', swatch: '#a855f7' },
  UNDER_FITOUT: { surface: '#60a5fa', border: '#2563eb', ink: '#1d4ed8', swatch: '#3b82f6' },
  OCCUPIED: { surface: '#4ade80', border: '#16a34a', ink: '#15803d', swatch: '#22c55e' },
  // Warm neutral, not another red: a unit winding down is not a unit to lease,
  // and at a glance it was indistinguishable from VACANT.
  LIQUIDATED: { surface: '#a8a29e', border: '#78716c', ink: '#57534e', swatch: '#a8a29e' },
  MERGED: { surface: '#cbd5e1', border: '#94a3b8', ink: '#64748b', swatch: '#94a3b8' },
};

/** Legend and filter order — leasing lifecycle, not alphabetical. */
export const MAP_STATUS_ORDER = [
  'VACANT', 'OFFERING', 'BOOKING', 'NEGOTIATING',
  'CONTRACTED', 'UNDER_FITOUT', 'OCCUPIED', 'LIQUIDATED', 'MERGED',
] as const;

const UNKNOWN_STATUS: MapStatusToken = { surface: '#cbd5e1', border: '#94a3b8', ink: '#475569', swatch: '#94a3b8' };

export function statusToken(status?: string | null): MapStatusToken {
  return (status && MAP_STATUS[status]) || UNKNOWN_STATUS;
}

/**
 * The architectural plan, pushed back to context. Desaturated and lightened
 * rather than blurred: the reader must still recognise corridors, escalators,
 * entrances and loading areas, which a blur destroys.
 */
export const MAP_CAD = {
  opacity: 0.44,
  // Colourless and lightened, but its own contrast left intact: dropping that
  // as well washed the corridors and escalators out of the drawing entirely,
  // and took with them the ground a shadow needs in order to read as a shadow.
  filter: 'grayscale(1) contrast(0.88)',
} as const;

export type ElevationLevel = 'rest' | 'hover' | 'selected';

export interface ElevationToken {
  /** Shadow drop, in screen pixels at any zoom. */
  dy: number;
  /** Shadow softness, in screen pixels at any zoom. */
  blur: number;
  shadowOpacity: number;
  /** How far the polygon itself rises, in screen pixels. Zero at rest so no unit drifts off its footprint. */
  lift: number;
  /** Opacity of the white underlay that keeps the status hue stable over the plan. */
  baseOpacity: number;
  /** Opacity of the status surface itself. */
  surfaceOpacity: number;
  strokeWidth: number;
}

/**
 * Depth. Rest is a hairline float — enough to read the polygon as an object
 * placed on the plan, not a wash over it — and it does not move, so every unit
 * stays exactly on its footprint. Only the unit under the pointer, or the one
 * being worked on, actually rises.
 */
export const MAP_ELEVATION: Record<ElevationLevel, ElevationToken> = {
  rest: { dy: 3, blur: 5, shadowOpacity: 0.26, lift: 0, baseOpacity: 0.5, surfaceOpacity: 0.32, strokeWidth: 1.5 },
  hover: { dy: 7, blur: 9, shadowOpacity: 0.26, lift: 1.5, baseOpacity: 0.56, surfaceOpacity: 0.44, strokeWidth: 2.2 },
  selected: { dy: 11, blur: 14, shadowOpacity: 0.3, lift: 2.5, baseOpacity: 0.62, surfaceOpacity: 0.55, strokeWidth: 3 },
};

/** A unit filtered out stays on the plan as context, flat and colourless. */
export const MAP_DIMMED = { baseOpacity: 0.45, surfaceOpacity: 0.07, strokeWidth: 1 } as const;

/** The current work object is outlined, not recoloured. */
export const MAP_SELECTED_OUTLINE = '#1e3a8a';
export const MAP_FOCUS_OUTLINE = '#2563eb';

/** Operational system: the lift must register, not perform. */
export const MAP_MOTION_MS = 150;

/**
 * Screen pixels expressed in the map's own units.
 *
 * The overlay is a 100x100 viewBox stretched to the frame with
 * preserveAspectRatio="none", so one user unit is a different number of pixels
 * horizontally and vertically, and zoom changes both. Shadows are deliberately
 * SCREEN-relative: a shadow that scaled with the drawing would be a hairline
 * when zoomed out and a dark smear at 8x, and depth would stop meaning
 * "this object is above the plan". Converting here keeps it constant.
 */
export function pxToUnits(px: number, frameSize: number, zoom: number): number {
  if (!(frameSize > 0) || !(zoom > 0)) return 0;
  return (px / frameSize) * 100 / zoom;
}

export interface ShadowGeometry {
  /** Shadow offset in user units. */
  dx: number;
  dy: number;
  /** Gaussian deviation per axis — separate because the viewBox scales anisotropically. */
  blurX: number;
  blurY: number;
  /** Upward translation of the polygon itself, in user units. */
  lift: number;
}

export function shadowGeometry(
  level: ElevationLevel,
  frameWidth: number,
  frameHeight: number,
  zoom: number,
): ShadowGeometry {
  const token = MAP_ELEVATION[level];
  return {
    dx: 0,
    dy: pxToUnits(token.dy, frameHeight, zoom),
    blurX: pxToUnits(token.blur / 2, frameWidth, zoom),
    blurY: pxToUnits(token.blur / 2, frameHeight, zoom),
    lift: pxToUnits(token.lift, frameHeight, zoom),
  };
}

/**
 * Paint order for the overlay.
 *
 * In SVG a later sibling paints over an earlier one, so a selected unit cannot
 * be promoted with a bigger shadow alone — its neighbours would still cover it.
 * This returns a reordered VIEW of the units. The caller's array, and the order
 * the server sent, are left alone.
 */
export function presentationOrder<T extends { id: string }>(
  units: T[],
  hoveredId?: string | null,
  selectedId?: string | null,
): T[] {
  const rank = (u: T) => (u.id === selectedId ? 2 : u.id === hoveredId ? 1 : 0);
  return units
    .map((unit, index) => ({ unit, index, rank: rank(unit) }))
    .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
    .map((entry) => entry.unit);
}

export function elevationLevel(selected: boolean, hovered: boolean): ElevationLevel {
  if (selected) return 'selected';
  if (hovered) return 'hover';
  return 'rest';
}
