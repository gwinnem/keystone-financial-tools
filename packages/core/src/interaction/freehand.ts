import type { Point, Rect } from '../host';

/** A freehand stroke takes a new point only when the pointer is at least this far (CSS px) from the last one (FR-TOOL-034). */
export const FREEHAND_SAMPLE_PX = 3;

/** A finished stroke is simplified within this distance (CSS px, Ramer-Douglas-Peucker). */
export const FREEHAND_TOLERANCE_PX = 1;

/** A finished stroke has at most this many anchors. */
export const FREEHAND_MAX_ANCHORS = 512;

/** The distance of `point` from the segment `from` to `to`. */
function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

/**
 * The indices of the points that stay when a path is simplified within `tolerance` (Ramer-Douglas-Peucker): the first and the last point
 * always stay, and every point that goes is within `tolerance` of the segment between the two points that stay around it. It works from a
 * stack, so a path of any length is fine.
 *
 * @example
 * ```ts
 * simplifyIndices([{ x: 0, y: 0 }, { x: 5, y: 0.2 }, { x: 10, y: 0 }], 1); // [0, 2]
 * ```
 */
export function simplifyIndices(points: readonly Point[], tolerance: number): number[] {
  if (points.length <= 2) return points.map((_, index) => index);
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  for (let range = stack.pop(); range !== undefined; range = stack.pop()) {
    const [start, end] = range;
    let farthest = -1;
    let distance = tolerance;
    for (let index = start + 1; index < end; index++) {
      const d = distanceToSegment(points[index] as Point, points[start] as Point, points[end] as Point);
      if (d > distance) {
        distance = d;
        farthest = index;
      }
    }
    if (farthest < 0) continue;
    keep[farthest] = true;
    stack.push([start, farthest], [farthest, end]);
  }
  return keep.flatMap((kept, index) => (kept ? [index] : []));
}

/**
 * A path simplified within `tolerance` CSS px (Ramer-Douglas-Peucker, FR-TOOL-034): the first and the last point stay.
 *
 * @example
 * ```ts
 * simplifyPath([{ x: 0, y: 0 }, { x: 5, y: 0.2 }, { x: 10, y: 0 }], 1); // [{ x: 0, y: 0 }, { x: 10, y: 0 }]
 * ```
 */
export function simplifyPath(points: readonly Point[], tolerance: number): Point[] {
  return simplifyIndices(points, tolerance).map((index) => points[index] as Point);
}

/**
 * The indices of the points a finished stroke keeps: simplified within `FREEHAND_TOLERANCE_PX` and, when that leaves more than `max`
 * (at most `FREEHAND_MAX_ANCHORS`), simplified again with twice the tolerance until it fits, so the shape of the stroke is kept as well
 * as `max` points allow. The first and the last point always stay.
 *
 * @example
 * ```ts
 * const kept = strokeIndices(path, 512).map((index) => anchors[index]);
 * ```
 */
export function strokeIndices(points: readonly Point[], max: number = FREEHAND_MAX_ANCHORS): number[] {
  const limit = Math.max(2, Math.min(max, FREEHAND_MAX_ANCHORS));
  let tolerance = FREEHAND_TOLERANCE_PX;
  let kept = simplifyIndices(points, tolerance);
  while (kept.length > limit) {
    tolerance *= 2;
    kept = simplifyIndices(points, tolerance);
  }
  return kept;
}

/**
 * Where a segment is inside a rectangle (Liang-Barsky): the point where it enters and the point where it leaves, or null when no part of it
 * is inside. A segment that starts inside enters at its start, one that ends inside leaves at its end. The edges belong to the rectangle.
 */
export function clipSegment(rect: Rect, from: Point, to: Point): { readonly enter: Point; readonly leave: Point } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, from.x - rect.x],
    [dx, rect.x + rect.width - from.x],
    [-dy, from.y - rect.y],
    [dy, rect.y + rect.height - from.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      t0 = Math.max(t0, t);
    } else {
      if (t < t0) return null;
      t1 = Math.min(t1, t);
    }
  }
  return { enter: { x: from.x + t0 * dx, y: from.y + t0 * dy }, leave: { x: from.x + t1 * dx, y: from.y + t1 * dy } };
}

/** True for a point inside a rectangle, its edges included. */
export function insideRect(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/**
 * The points a stroke gets when the pointer goes from `from` to `to` in a pane `rect`: a stroke is clipped at the edge of the pane (FR-TOOL-034),
 * so the part of the move inside the pane counts and the rest does not. Inside to inside is `to`; inside to outside is the point where the
 * pointer left; outside to inside is the point where it came back and then `to`; outside to outside is the part, if any, that crosses a corner.
 *
 * @example
 * ```ts
 * strokeSteps({ x: 0, y: 0, width: 100, height: 100 }, { x: 90, y: 50 }, { x: 120, y: 50 }); // [{ x: 100, y: 50 }]
 * ```
 */
export function strokeSteps(rect: Rect, from: Point, to: Point): Point[] {
  const clip = clipSegment(rect, from, to);
  if (clip === null) return [];
  const steps: Point[] = [];
  if (!insideRect(rect, from)) steps.push(clip.enter);
  steps.push(insideRect(rect, to) ? to : clip.leave);
  return steps;
}
