import type { ArrowheadShape, CurveShape, EllipseShape } from '../geometry/types';
import type { Point } from '../host';

/** The most (CSS px) a flattened curve or ellipse may lie from the shape it stands for (FR-TOOL-037). */
export const FLATNESS_PX = 0.25;

/** The fewest and the most segments of a flattened ellipse. */
const ELLIPSE_SEGMENTS = { min: 8, max: 1024 } as const;

function offset(a: Point, b: Point, c: Point): number {
  return Math.hypot(a.x - 2 * b.x + c.x, a.y - 2 * b.y + c.y);
}

/**
 * The points of a Bezier curve cut into straight segments no farther than `FLATNESS_PX` from it, the first and the last point
 * included. The count follows from the second difference of the control points, which bounds how much the curve bends: a quadratic
 * needs `sqrt(d / (4 * flatness))` segments for `d` the second difference, a cubic `sqrt(3 * m / (4 * flatness))` for `m` the larger
 * of its two.
 *
 * @example
 * ```ts
 * flattenCurve({ type: 'curve', part: 'body', from: { x: 0, y: 0 }, controls: [{ x: 50, y: 40 }], to: { x: 100, y: 0 } }); // 10 points
 * ```
 */
export function flattenCurve(curve: CurveShape): Point[] {
  const { from, to, controls } = curve;
  const [first, second] = controls;
  const bend = second === undefined ? offset(from, first, to) : Math.max(offset(from, first, second), offset(first, second, to));
  const factor = second === undefined ? 1 : 3;
  const segments = Math.max(1, Math.ceil(Math.sqrt((factor * bend) / (4 * FLATNESS_PX))));
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const u = 1 - t;
    if (second === undefined) {
      return { x: u * u * from.x + 2 * u * t * first.x + t * t * to.x, y: u * u * from.y + 2 * u * t * first.y + t * t * to.y };
    }
    return {
      x: u * u * u * from.x + 3 * u * u * t * first.x + 3 * u * t * t * second.x + t * t * t * to.x,
      y: u * u * u * from.y + 3 * u * u * t * first.y + 3 * u * t * t * second.y + t * t * t * to.y,
    };
  });
}

/**
 * The corners of a polygon that stands for an ellipse within `FLATNESS_PX`: as many evenly spaced points of its outline as the larger
 * radius needs (at least 8, at most 1024). The last point is not the first one again.
 *
 * @example
 * ```ts
 * ellipsePoints({ type: 'ellipse', part: 'body', center: { x: 0, y: 0 }, radiusX: 20, radiusY: 10, rotation: 0 }); // 20 points
 * ```
 */
export function ellipsePoints(ellipse: EllipseShape): Point[] {
  const { center, radiusX, radiusY, rotation } = ellipse;
  const radius = Math.max(radiusX, radiusY);
  // A chord of angle `step` on a circle of that radius is `radius * (1 - cos(step / 2))` from it, so a step of `2 * acos(1 - flatness / radius)` is flat enough.
  const wanted = Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - FLATNESS_PX / radius)));
  const segments = Math.min(ELLIPSE_SEGMENTS.max, Math.max(ELLIPSE_SEGMENTS.min, wanted));
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return Array.from({ length: segments }, (_, index) => {
    const angle = (2 * Math.PI * index) / segments;
    const x = radiusX * Math.cos(angle);
    const y = radiusY * Math.sin(angle);
    return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
  });
}

/**
 * The three corners of an arrowhead: its tip, then the two ends of its base, `length` behind the tip along the direction it points and
 * `width` apart.
 *
 * @example
 * ```ts
 * arrowheadPoints({ type: 'arrowhead', part: 'body', tip: { x: 10, y: 0 }, angle: 0, length: 10, width: 8 }); // tip (10, 0), base (0, 4) and (0, -4)
 * ```
 */
export function arrowheadPoints(arrow: ArrowheadShape): Point[] {
  const dx = Math.cos(arrow.angle);
  const dy = Math.sin(arrow.angle);
  const back = { x: arrow.tip.x - dx * arrow.length, y: arrow.tip.y - dy * arrow.length };
  const half = arrow.width / 2;
  return [arrow.tip, { x: back.x - dy * half, y: back.y + dx * half }, { x: back.x + dy * half, y: back.y - dx * half }];
}
