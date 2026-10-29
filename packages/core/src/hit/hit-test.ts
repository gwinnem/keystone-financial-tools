import type { GeometryPart } from '../geometry/types';
import type { Point, PointerType } from '../host';
import { resolveStyle, type DrawingTheme } from '../theme';
import type { Drawing } from '../types';
import { distanceToShape } from './distance';
import type { GeometryCache } from './geometry-cache';

/** How close (CSS px) a pointer must be to hit something, by pointer type (FR-HIT-001). */
export const HIT_TOLERANCE: Readonly<Record<PointerType, number>> = Object.freeze({ mouse: 6, pen: 6, touch: 12 });

/** What a hit found: a grab handle (`handle:<n>`), a Fibonacci level, a label or the body. */
export type HitPart = GeometryPart | `handle:${number}`;

/** The drawing and part under the pointer. `locked` drawings are hit too, so they can be selected. */
export interface HitResult {
  readonly id: string;
  readonly part: HitPart;
  readonly locked: boolean;
}

/** Options of `hitTest`. */
export interface HitTestOptions {
  /** The drawings to test, in insertion order (`store.list()`); `zIndex` and insertion decide which one wins. */
  readonly drawings: readonly Drawing[];
  /** Supplies the pixel geometry of each drawing. */
  readonly cache: GeometryCache;
  /** Ids of the selected drawings: only their handles can be hit. Default none. */
  readonly selected?: ReadonlySet<string>;
  /** Sets the tolerance (`HIT_TOLERANCE`). Default `mouse`. */
  readonly pointerType?: PointerType;
  /** Decides whether a rectangle has a fill (`fillOpacity` above 0). Default `LIGHT_THEME`. */
  readonly theme?: DrawingTheme;
}

const NO_SELECTION: ReadonlySet<string> = new Set();

/** The nearest handle of a drawing within `tolerance` of `point`; the lowest index wins a tie. */
function handleAt(drawing: Drawing, point: Point, tolerance: number, options: HitTestOptions): HitPart | null {
  const geometry = options.cache.get(drawing);
  if (geometry === null) return null;
  let part: HitPart | null = null;
  let nearest = Infinity;
  for (const handle of geometry.handles) {
    const distance = Math.hypot(point.x - handle.x, point.y - handle.y);
    if (distance <= tolerance && distance < nearest) {
      part = handle.id;
      nearest = distance;
    }
  }
  return part;
}

/**
 * The part of a drawing within `tolerance` of `point`: a label when the point is on its anchor,
 * otherwise the nearest shape (the first one on a tie).
 */
function bodyAt(drawing: Drawing, point: Point, tolerance: number, options: HitTestOptions): HitPart | null {
  const geometry = options.cache.get(drawing);
  if (geometry === null) return null;
  const filled = (): boolean => resolveStyle(drawing, options.theme).fillOpacity > 0;
  let part: HitPart | null = null;
  let nearest = Infinity;
  for (const shape of geometry.shapes) {
    const distance = distanceToShape(point, shape, filled);
    if (distance > tolerance) continue;
    if (shape.type === 'label') return 'label';
    if (distance < nearest) {
      part = shape.part;
      nearest = distance;
    }
  }
  return part;
}

/** The topmost visible drawing (highest `zIndex`, then the latest) that `probe` finds a part of. */
function topmost(drawings: readonly Drawing[], probe: (drawing: Drawing) => HitPart | null): HitResult | null {
  let result: HitResult | null = null;
  let top = -Infinity;
  for (const drawing of drawings) {
    const zIndex = drawing.zIndex ?? 0;
    if (drawing.hidden === true || zIndex < top) continue;
    const part = probe(drawing);
    if (part !== null) {
      result = { id: drawing.id, part, locked: drawing.locked === true };
      top = zIndex;
    }
  }
  return result;
}

/**
 * Finds what is under a plot point (FR-HIT-001..003): within 6 CSS px of a mouse or pen pointer,
 * 12 of a touch pointer. The handles of selected drawings win over every body; among drawings the
 * highest `zIndex` wins, then the one added last. Within a drawing the nearest line, arc, rectangle
 * border or text box wins and reports its part (`body`, `level:<ratio>`); a label wins when the
 * point is on its anchor. A rectangle also hits inside when its resolved `fillOpacity` is above 0.
 * Hidden drawings are never hit; locked ones are, with `locked: true` (and so are their handles, so
 * the caller decides what a locked drawing allows).
 *
 * @example
 * ```ts
 * const cache = new GeometryCache(host, { store });
 * const hit = hitTest({ x: event.x, y: event.y }, {
 *   drawings: store.list(),
 *   cache,
 *   selected: new Set(selection),
 *   pointerType: event.pointerType,
 * });
 * if (hit !== null) console.log(hit.id, hit.part, hit.locked);
 * ```
 */
export function hitTest(point: Point, options: HitTestOptions): HitResult | null {
  const tolerance = HIT_TOLERANCE[options.pointerType ?? 'mouse'];
  const selected = options.selected ?? NO_SELECTION;
  return (
    topmost(options.drawings, (drawing) => (selected.has(drawing.id) ? handleAt(drawing, point, tolerance, options) : null)) ??
    topmost(options.drawings, (drawing) => bodyAt(drawing, point, tolerance, options))
  );
}
