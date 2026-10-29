import type { DrawingHost, Point, Rect } from '../host';
import type { Anchor, FibonacciLevel } from '../types';
import { at, lineRectRange } from './clip';
import type { ArcShape, LabelShape, LineShape } from './types';

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

/**
 * Fibonacci retracement (FR-GEO-003): one horizontal line per visible level at
 * `p1 + (p2 - p1) * ratio` (`reverse` swaps p1 and p2), from the left to the right anchor, or to the
 * pane edge on an extended side. With `showLabels` or `showPrices` each line is followed by its
 * label at the left end.
 */
export function retracementShapes(a1: Anchor, a2: Anchor, rect: Rect, host: DrawingHost, options: RetracementOptions): (LineShape | LabelShape)[] {
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
    if (labelled) shapes.push({ type: 'label', part: 'label', x: left, y, ratio, price, showRatio: options.showLabels, showPrice: options.showPrices });
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
