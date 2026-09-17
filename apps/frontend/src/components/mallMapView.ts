/**
 * Zoom, pan and label detail for the mall map.
 *
 * Kept apart from the component so the arithmetic that decides what a viewer
 * can actually read — how far they zoomed, where the map may be dragged to, and
 * how much of a unit's information fits — is testable on its own.
 */

export interface MapView {
  /** Scale factor; 1 = the whole floor plan fits the frame. */
  zoom: number;
  /** Pan offset in container pixels, applied before the scale (transform-origin 0 0). */
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 1.4;
export const INITIAL_VIEW: MapView = { zoom: 1, x: 0, y: 0 };

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Pan limits: at zoom k the content is k times the frame, so the offset may run
 * from -(k-1)·size up to 0. Anything else would drag the plan off the frame and
 * show empty space.
 */
export function clampPan(view: MapView, width: number, height: number): MapView {
  const minX = Math.min(0, width - width * view.zoom);
  const minY = Math.min(0, height - height * view.zoom);
  return {
    zoom: view.zoom,
    x: Math.min(0, Math.max(minX, view.x)),
    y: Math.min(0, Math.max(minY, view.y)),
  };
}

/**
 * Zoom keeping the point under the cursor still: that point must land on the
 * same pixel before and after the scale change.
 */
export function zoomAt(view: MapView, factor: number, pointerX: number, pointerY: number, width: number, height: number): MapView {
  const zoom = clampZoom(view.zoom * factor);
  if (zoom === view.zoom) return view;
  const ratio = zoom / view.zoom;
  return clampPan({
    zoom,
    x: pointerX - (pointerX - view.x) * ratio,
    y: pointerY - (pointerY - view.y) * ratio,
  }, width, height);
}

/** Centre a point given in map percentages, at the requested zoom. */
export function focusOn(percentX: number, percentY: number, zoom: number, width: number, height: number): MapView {
  const k = clampZoom(zoom);
  return clampPan({
    zoom: k,
    x: width / 2 - (percentX / 100) * width * k,
    y: height / 2 - (percentY / 100) * height * k,
  }, width, height);
}

export type MapDetail = 'DOT' | 'CODE' | 'COMPACT' | 'FULL';

/**
 * How much of a unit card is worth drawing, from the room it has on screen.
 * Below ~34px a card cannot hold legible text, so the unit becomes a dot.
 */
export function detailLevel(unitWidthPx: number, unitHeightPx: number): MapDetail {
  const shortest = Math.min(unitWidthPx, unitHeightPx);
  if (unitWidthPx < 54 || shortest < 22) return 'DOT';
  if (unitWidthPx < 96 || shortest < 34) return 'CODE';
  if (unitWidthPx < 150 || shortest < 58) return 'COMPACT';
  return 'FULL';
}

/** On-screen size of a unit: its share of the plan, times the frame, times zoom. */
export function unitScreenSize(
  polygon: Array<[number, number]>,
  frameWidth: number,
  frameHeight: number,
  zoom: number,
): { width: number; height: number } {
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  return {
    width: ((Math.max(...xs) - Math.min(...xs)) / 100) * frameWidth * zoom,
    height: ((Math.max(...ys) - Math.min(...ys)) / 100) * frameHeight * zoom,
  };
}
