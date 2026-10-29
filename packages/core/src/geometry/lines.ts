import type { Point, Rect } from '../host';
import { at, lineRectRange } from './clip';
import type { LineShape } from './types';

/**
 * The segment from `a` to `b`, extended beyond `a` (`extendStart`) and/or beyond `b` (`extendEnd`)
 * to the edge of `rect`. An extension never shortens the segment, and nothing is extended when the
 * line misses `rect` or `a` and `b` are the same point.
 */
export function extendSegment(a: Point, b: Point, rect: Rect, extendStart: boolean, extendEnd: boolean): { readonly from: Point; readonly to: Point } {
  const d = { x: b.x - a.x, y: b.y - a.y };
  const range = d.x === 0 && d.y === 0 ? null : lineRectRange(a, d, rect);
  if (range === null) return { from: a, to: b };
  return {
    from: extendStart ? at(a, d, Math.min(0, range[0])) : a,
    to: extendEnd ? at(a, d, Math.max(1, range[1])) : b,
  };
}

/**
 * A trend line: the segment between its anchor points, from left to right. `extendLeft` extends the
 * end with the smaller x, `extendRight` the one with the larger x, each to the pane edge
 * (FR-GEO-002). For a vertical line (both anchors at one time) left is anchor 1 and right anchor 2.
 */
export function trendLineShapes(p1: Point, p2: Point, rect: Rect, extendLeft: boolean, extendRight: boolean): LineShape[] {
  const [left, right] = p2.x < p1.x ? [p2, p1] : [p1, p2];
  return [{ type: 'line', part: 'body', ...extendSegment(left, right, rect, extendLeft, extendRight) }];
}

/** A horizontal line: the full width of the pane at the anchor's y. */
export function horizontalLineShapes(p: Point, rect: Rect): LineShape[] {
  return [{ type: 'line', part: 'body', from: { x: rect.x, y: p.y }, to: { x: rect.x + rect.width, y: p.y } }];
}
