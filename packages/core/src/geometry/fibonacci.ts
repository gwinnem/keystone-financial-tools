import type { DrawingHost, Point, Rect } from '../host';
import type { Anchor, FibonacciLevel } from '../types';
import { at, lineRectRange } from './clip';
import { extendSegment } from './lines';
import type { ArcShape, LabelShape, LineShape, PolylineShape } from './types';

/** The part of a Fibonacci level, for example `level:0.618`. */
export function levelPart(value: number): `level:${number}` {
  return `level:${value}`;
}

/** Retracement options, resolved. */
export interface RetracementOptions {
  readonly levels: readonly FibonacciLevel[];
  readonly reverse: boolean;
  readonly extendLeft: boolean;
  readonly extendRight: boolean;
  readonly showLabels: boolean;
  readonly showPrices: boolean;
}

/** The text of a level label: the ratio, the price, or both as `0.618 (111.80)`. Needs `showLabels` or `showPrices`. */
function labelText(ratio: number, price: number, options: RetracementOptions, formatPrice: (price: number) => string): string {
  if (!options.showPrices) return String(ratio);
  return options.showLabels ? `${ratio} (${formatPrice(price)})` : formatPrice(price);
}

/**
 * Fibonacci retracement (FR-GEO-003): one horizontal line per visible level at
 * `p1 + (p2 - p1) * ratio` (`reverse` swaps p1 and p2), from the left to the right anchor, or to the
 * pane edge on an extended side. With `showLabels` or `showPrices` each line is followed by its
 * label at the left end, with its text: the ratio (`showLabels`), the price formatted by
 * `formatPrice` (`showPrices`), or both. `formatPrice` is only called for a label with a price.
 */
export function retracementShapes(a1: Anchor, a2: Anchor, rect: Rect, host: DrawingHost, options: RetracementOptions, formatPrice: (price: number) => string): (LineShape | LabelShape)[] {
  const [from, to] = options.reverse ? [a2.price, a1.price] : [a1.price, a2.price];
  const x1 = host.timeToX(a1.time);
  const x2 = host.timeToX(a2.time);
  const left = options.extendLeft ? Math.min(rect.x, x1, x2) : Math.min(x1, x2);
  const right = options.extendRight ? Math.max(rect.x + rect.width, x1, x2) : Math.max(x1, x2);
  const labelled = options.showLabels || options.showPrices;
  const shapes: (LineShape | LabelShape)[] = [];
  for (const { ratio, visible } of options.levels) {
    if (!visible) continue;
    const price = from + (to - from) * ratio;
    const y = host.priceToY(price, a1.yAxisId);
    shapes.push({ type: 'line', part: levelPart(ratio), from: { x: left, y }, to: { x: right, y } });
    if (labelled) {
      shapes.push({
        type: 'label',
        part: 'label',
        x: left,
        y,
        ratio,
        price,
        showRatio: options.showLabels,
        showPrice: options.showPrices,
        text: labelText(ratio, price, options, formatPrice),
      });
    }
  }
  return shapes;
}

/**
 * Fibonacci fans (FR-GEO-004): for each visible level a ray from anchor 1 through
 * `(t2, p2 + (p1 - p2) * ratio)`, clipped to the pane. Rays without a direction (the level point is
 * anchor 1) and rays that miss the pane are left out.
 */
export function fanShapes(a1: Anchor, a2: Anchor, rect: Rect, host: DrawingHost, levels: readonly FibonacciLevel[]): LineShape[] {
  const origin = { x: host.timeToX(a1.time), y: host.priceToY(a1.price, a1.yAxisId) };
  const x2 = host.timeToX(a2.time);
  const shapes: LineShape[] = [];
  for (const { ratio, visible } of levels) {
    if (!visible) continue;
    const d = { x: x2 - origin.x, y: host.priceToY(a2.price + (a1.price - a2.price) * ratio, a1.yAxisId) - origin.y };
    const range = d.x === 0 && d.y === 0 ? null : lineRectRange(origin, d, rect);
    if (range === null) continue;
    const start = Math.max(0, range[0]);
    if (start >= range[1]) continue;
    shapes.push({ type: 'line', part: levelPart(ratio), from: at(origin, d, start), to: at(origin, d, range[1]) });
  }
  return shapes;
}

/**
 * Fibonacci arcs (FR-GEO-005): circles around anchor 2 with radius `ratio` times the pixel distance
 * between the anchors, so they keep their shape on screen at every zoom. Half circles open away from
 * anchor 1 (the curve faces it); full circles with `fullCircles`. Levels with a radius of 0 or less
 * (including both anchors on one point) are left out.
 */
export function arcShapes(p1: Point, p2: Point, levels: readonly FibonacciLevel[], fullCircles: boolean): ArcShape[] {
  const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const facing = Math.atan2(p1.y - p2.y, p1.x - p2.x);
  const [startAngle, endAngle] = fullCircles ? [0, 2 * Math.PI] : [facing - Math.PI / 2, facing + Math.PI / 2];
  const shapes: ArcShape[] = [];
  for (const { ratio, visible } of levels) {
    const radius = ratio * distance;
    if (visible && radius > 0) shapes.push({ type: 'arc', part: levelPart(ratio), center: p2, radius, startAngle, endAngle });
  }
  return shapes;
}

/**
 * Fibonacci time zones (FR-GEO-006): with the unit `u = t2 - t1`, a vertical line across the pane at
 * `t1 + n * u` for each `n` in the sequence. A negative unit runs to the left. Lines outside the
 * pane's horizontal range are left out, and so is everything when the unit is 0. Prices play no
 * part (D-5).
 */
export function timeZoneShapes(a1: Anchor, a2: Anchor, rect: Rect, host: DrawingHost, sequence: readonly number[]): LineShape[] {
  const unit = a2.time - a1.time;
  const shapes: LineShape[] = [];
  if (unit === 0) return shapes;
  for (const n of sequence) {
    const x = host.timeToX(a1.time + n * unit);
    if (x < rect.x || x > rect.x + rect.width) continue;
    shapes.push({ type: 'line', part: levelPart(n), from: { x, y: rect.y }, to: { x, y: rect.y + rect.height } });
  }
  return shapes;
}

/** Level options of a kind that draws horizontal price lines, resolved. */
export interface PriceLevelOptions {
  readonly levels: readonly FibonacciLevel[];
  readonly extendLeft: boolean;
  readonly extendRight: boolean;
  readonly showLabels: boolean;
  readonly showPrices: boolean;
}

/**
 * Fibonacci trend-based extension (FR-TOOL-018): the move from anchor 1 to anchor 2 projected from anchor 3. For each visible level a
 * horizontal line at `p3 + (p2 - p1) * ratio`, from the leftmost to the rightmost anchor, or to the pane edge on an extended side. A
 * level with `showLabels` or `showPrices` is followed by its label as for the retracement.
 */
export function trendBasedShapes(a1: Anchor, a2: Anchor, a3: Anchor, rect: Rect, host: DrawingHost, options: PriceLevelOptions, formatPrice: (price: number) => string): (LineShape | LabelShape)[] {
  const xs = [host.timeToX(a1.time), host.timeToX(a2.time), host.timeToX(a3.time)];
  const left = options.extendLeft ? Math.min(rect.x, ...xs) : Math.min(...xs);
  const right = options.extendRight ? Math.max(rect.x + rect.width, ...xs) : Math.max(...xs);
  const move = a2.price - a1.price;
  const shapes: (LineShape | LabelShape)[] = [];
  for (const { ratio, visible } of options.levels) {
    if (!visible) continue;
    const price = a3.price + move * ratio;
    const y = host.priceToY(price, a3.yAxisId);
    shapes.push({ type: 'line', part: levelPart(ratio), from: { x: left, y }, to: { x: right, y } });
    if (options.showLabels || options.showPrices) {
      shapes.push({
        type: 'label',
        part: 'label',
        x: left,
        y,
        ratio,
        price,
        showRatio: options.showLabels,
        showPrice: options.showPrices,
        text: labelText(ratio, price, { ...options, reverse: false }, formatPrice),
      });
    }
  }
  return shapes;
}

/**
 * Fibonacci channel (FR-TOOL-140): the base line through anchors 1 and 2 and, for each visible level, a line parallel to it moved by
 * `ratio` times the vector from the base line to anchor 3 (the perpendicular one, in pixels), so level 0 is the base line and level 1
 * runs through anchor 3. Each line is the segment between the moved anchors, from left to right, extended to the pane edge on an
 * extended side. Labels are the renderer's business.
 */
export function channelShapes(p1: Point, p2: Point, p3: Point, rect: Rect, levels: readonly FibonacciLevel[], extendLeft: boolean, extendRight: boolean): LineShape[] {
  const d = { x: p2.x - p1.x, y: p2.y - p1.y };
  const length = d.x * d.x + d.y * d.y;
  const along = length === 0 ? 0 : ((p3.x - p1.x) * d.x + (p3.y - p1.y) * d.y) / length;
  const offset = { x: p3.x - (p1.x + d.x * along), y: p3.y - (p1.y + d.y * along) };
  const shapes: LineShape[] = [];
  for (const { ratio, visible } of levels) {
    if (!visible) continue;
    const move = { x: offset.x * ratio, y: offset.y * ratio };
    const a = { x: p1.x + move.x, y: p1.y + move.y };
    const b = { x: p2.x + move.x, y: p2.y + move.y };
    const [from, to] = b.x < a.x ? [b, a] : [a, b];
    shapes.push({ type: 'line', part: levelPart(ratio), ...extendSegment(from, to, rect, extendLeft, extendRight) });
  }
  return shapes;
}

/**
 * Fibonacci time extension (FR-TOOL-141): with the unit `u = t2 - t1`, a vertical line across the pane at `t3 + ratio * u` for each
 * visible level. Lines outside the pane's horizontal range are left out, and so is everything when the unit is 0. Prices play no part (D-5).
 */
export function timeExtensionShapes(a1: Anchor, a2: Anchor, a3: Anchor, rect: Rect, host: DrawingHost, levels: readonly FibonacciLevel[]): LineShape[] {
  const unit = a2.time - a1.time;
  const shapes: LineShape[] = [];
  if (unit === 0) return shapes;
  for (const { ratio, visible } of levels) {
    const x = host.timeToX(a3.time + ratio * unit);
    if (!visible || x < rect.x || x > rect.x + rect.width) continue;
    shapes.push({ type: 'line', part: levelPart(ratio), from: { x, y: rect.y }, to: { x, y: rect.y + rect.height } });
  }
  return shapes;
}

/**
 * Fibonacci circles (FR-TOOL-142): full circles around the midpoint of the anchors with radius `ratio` times half the pixel distance
 * between them, so they keep their shape on screen at every zoom. Levels with a radius of 0 or less are left out.
 */
export function circleShapes(p1: Point, p2: Point, levels: readonly FibonacciLevel[]): ArcShape[] {
  const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const half = Math.hypot(p1.x - p2.x, p1.y - p2.y) / 2;
  const shapes: ArcShape[] = [];
  for (const { ratio, visible } of levels) {
    const radius = ratio * half;
    if (visible && radius > 0) shapes.push({ type: 'arc', part: levelPart(ratio), center, radius, startAngle: 0, endAngle: 2 * Math.PI });
  }
  return shapes;
}

/** The golden ratio: how much the spiral grows every quarter turn. */
export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
/** The segments of one quarter turn of the spiral, so a spiral has `turns * 4 * 32 + 1` points. */
export const SPIRAL_SEGMENTS_PER_QUARTER = 32;

/**
 * Fibonacci spiral (FR-TOOL-143): a golden spiral centred on anchor 1 that starts at anchor 2. The radius is the distance of anchor 2
 * times `GOLDEN_RATIO` to the power of the quarter turns made, over `turns` full turns, and the angle starts at the one of anchor 2 and
 * grows (clockwise on screen) or shrinks (`clockwise` false). One polyline of `SPIRAL_SEGMENTS_PER_QUARTER` segments per quarter turn;
 * nothing when the anchors are on one point.
 */
export function spiralShapes(p1: Point, p2: Point, turns: number, clockwise: boolean): PolylineShape[] {
  const radius = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (radius === 0) return [];
  const start = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const direction = clockwise ? 1 : -1;
  const points = Array.from({ length: turns * 4 * SPIRAL_SEGMENTS_PER_QUARTER + 1 }, (_, index) => {
    const quarters = index / SPIRAL_SEGMENTS_PER_QUARTER;
    const angle = start + direction * (Math.PI / 2) * quarters;
    const reach = radius * GOLDEN_RATIO ** quarters;
    return { x: p1.x + reach * Math.cos(angle), y: p1.y + reach * Math.sin(angle) };
  });
  return [{ type: 'polyline', part: 'body', points }];
}

/**
 * Fibonacci wedge (FR-TOOL-144): two rays from anchor 1 through anchors 2 and 3, clipped to the pane (part `body`, a ray without a
 * direction or outside the pane is left out), then for each visible level an arc centred on anchor 1 with radius `ratio` times the pixel
 * distance from anchor 1 to anchor 2, between the rays by the shorter way (no arc when the rays coincide or the radius is 0 or less).
 * The definition is the SDS text and is to be confirmed in its story (D-13).
 */
export function wedgeShapes(p1: Point, p2: Point, p3: Point, rect: Rect, levels: readonly FibonacciLevel[]): (LineShape | ArcShape)[] {
  const shapes: (LineShape | ArcShape)[] = [];
  for (const target of [p2, p3]) {
    const d = { x: target.x - p1.x, y: target.y - p1.y };
    const range = d.x === 0 && d.y === 0 ? null : lineRectRange(p1, d, rect);
    if (range === null) continue;
    const start = Math.max(0, range[0]);
    if (start < range[1]) shapes.push({ type: 'line', part: 'body', from: at(p1, d, start), to: at(p1, d, range[1]) });
  }
  const first = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const second = Math.atan2(p3.y - p1.y, p3.x - p1.x);
  // The turn from the first ray to the second, by the shorter way, in (-pi, pi].
  const turn = Math.atan2(Math.sin(second - first), Math.cos(second - first));
  const startAngle = turn >= 0 ? first : second;
  const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (turn === 0) return shapes;
  for (const { ratio, visible } of levels) {
    const radius = ratio * distance;
    if (visible && radius > 0) shapes.push({ type: 'arc', part: levelPart(ratio), center: p1, radius, startAngle, endAngle: startAngle + Math.abs(turn) });
  }
  return shapes;
}
