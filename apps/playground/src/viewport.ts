/** The smallest zoom is the one that shows every bar and the future space; the largest is this many CSS px per bar (or the fitting one, if that is larger). */
export const MAX_PX_PER_BAR = 60;

/** One step of zoom: the bar width is multiplied or divided by this. */
export const ZOOM_STEP = 1.25;

/** What the chart shows: how wide a bar is, and which bar slot is at the left edge. */
export interface Viewport {
  /** CSS px per bar interval. */
  readonly pxPerBar: number;
  /** The bar slot at the left edge of the plot, as a fraction: 0 is the first bar's slot, 2.5 is halfway into the third. */
  readonly offset: number;
}

/** A key that changes the viewport. */
export type ViewportKeyAction = 'zoom-in' | 'zoom-out' | 'scroll-start' | 'scroll-end' | 'page-back' | 'page-forward';

const KEY_ACTIONS: ReadonlyMap<string, ViewportKeyAction> = new Map<string, ViewportKeyAction>([
  ['+', 'zoom-in'],
  ['=', 'zoom-in'],
  ['-', 'zoom-out'],
  ['_', 'zoom-out'],
  ['Home', 'scroll-start'],
  ['End', 'scroll-end'],
  ['PageUp', 'page-back'],
  ['PageDown', 'page-forward'],
]);

/**
 * Brings a viewport into what is allowed: no narrower a bar than the one that shows all `total` slots
 * (bars and future space) across `width`, no wider than `MAX_PX_PER_BAR` (unless showing everything needs
 * more), and never scrolled before the first slot or past the last.
 *
 * @example
 * ```ts
 * clampViewport({ pxPerBar: 1, offset: -3 }, 800, 120); // { pxPerBar: 6.67, offset: 0 }: everything fits, so no scroll
 * ```
 */
export function clampViewport(viewport: Viewport, width: number, total: number): Viewport {
  const fit = width / total;
  const pxPerBar = Math.min(Math.max(fit, MAX_PX_PER_BAR), Math.max(fit, viewport.pxPerBar));
  const maxOffset = Math.max(0, total - width / pxPerBar);
  return { pxPerBar, offset: Math.min(maxOffset, Math.max(0, viewport.offset)) };
}

/**
 * Zooms by `factor` (above 1 zooms in) and keeps the bar under `anchorX` where it is on the screen.
 *
 * @example
 * ```ts
 * zoomViewport(viewport, ZOOM_STEP, pointerX, 800, 120);
 * ```
 */
export function zoomViewport(viewport: Viewport, factor: number, anchorX: number, width: number, total: number): Viewport {
  const { pxPerBar } = clampViewport({ pxPerBar: viewport.pxPerBar * factor, offset: 0 }, width, total);
  const slotUnderAnchor = viewport.offset + anchorX / viewport.pxPerBar;
  return clampViewport({ pxPerBar, offset: slotUnderAnchor - anchorX / pxPerBar }, width, total);
}

/**
 * Scrolls by `bars` bar slots, right for a positive number, to the edge when it is too many (`Infinity` goes to the end).
 *
 * @example
 * ```ts
 * scrollViewport(viewport, -5, 800, 120);
 * ```
 */
export function scrollViewport(viewport: Viewport, bars: number, width: number, total: number): Viewport {
  return clampViewport({ pxPerBar: viewport.pxPerBar, offset: viewport.offset + bars }, width, total);
}

/**
 * What a key does to the viewport: `+` and `-` zoom, Home and End go to the first and the last slot, Page Up and Page Down
 * scroll half a screen. Null for any other key and for a key held with Ctrl, Alt or Cmd (the browser's own zoom, the tools' shortcuts).
 *
 * @example
 * ```ts
 * viewportKeyAction({ key: '+', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false }); // 'zoom-in'
 * ```
 */
export function viewportKeyAction(event: { readonly key: string; readonly ctrlKey: boolean; readonly altKey: boolean; readonly metaKey: boolean }): ViewportKeyAction | null {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return KEY_ACTIONS.get(event.key) ?? null;
}
