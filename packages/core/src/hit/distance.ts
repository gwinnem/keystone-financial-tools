import type { Point } from '../host';
import type { ArcShape, RectShape, Shape } from '../geometry/types';
import { arrowheadPoints, ellipsePoints, flattenCurve } from './flatten';

const TAU = 2 * Math.PI;

/** Distance (CSS px) from `p` to the segment from `a` to `b`; a zero-length segment is a point. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Distance from `p` to a rectangle. A `filled` rectangle is 0 inside; otherwise only its border
 * counts, so a point inside is as far from it as from the nearest edge.
 */
export function distanceToRect(p: Point, rect: Pick<RectShape, 'x' | 'y' | 'width' | 'height'>, filled: boolean): number {
  const dx = Math.max(rect.x - p.x, 0, p.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - p.y, 0, p.y - (rect.y + rect.height));
  const outside = Math.hypot(dx, dy);
  if (outside > 0 || filled) return outside;
  return Math.min(p.x - rect.x, rect.x + rect.width - p.x, p.y - rect.y, rect.y + rect.height - p.y);
}

/**
 * Distance from `p` to the curve of an arc: the distance to the circle where the arc covers the
 * direction of `p`, otherwise to the nearer end of the arc. Angles are radians, canvas convention,
 * from `startAngle` clockwise to `endAngle`.
 *
 * Both cases are one formula. With `outside` the angle between the direction of `p` and the nearer
 * end (0 where the arc covers the direction), the distance to the point of the circle at that angle
 * is the hypotenuse of the radial offset and the chord `2 * sqrt(r * R) * sin(outside / 2)`. It is
 * continuous at the ends of the arc, so there is no boundary to decide.
 */
export function distanceToArc(p: Point, arc: Pick<ArcShape, 'center' | 'radius' | 'startAngle' | 'endAngle'>): number {
  const dx = p.x - arc.center.x;
  const dy = p.y - arc.center.y;
  const turn = (((Math.atan2(dy, dx) - arc.startAngle) % TAU) + TAU) % TAU;
  const outside = Math.max(0, Math.min(turn - (arc.endAngle - arc.startAngle), TAU - turn));
  const radial = Math.hypot(dx, dy);
  return Math.hypot(radial - arc.radius, 2 * Math.sqrt(radial * arc.radius) * Math.sin(outside / 2));
}

/**
 * Distance from `p` to the path through `points`, closed (the last point joins the first) or open. A path of one point is that point.
 *
 * @example
 * ```ts
 * distanceToPath({ x: 5, y: 3 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }], false); // 3
 * ```
 */
export function distanceToPath(p: Point, points: readonly Point[], closed: boolean): number {
  let nearest = Infinity;
  const last = closed ? points.length : points.length - 1;
  for (let index = 0; index < last; index++) {
    nearest = Math.min(nearest, distanceToSegment(p, points[index] as Point, points[(index + 1) % points.length] as Point));
  }
  return points.length === 1 ? Math.hypot(p.x - (points[0] as Point).x, p.y - (points[0] as Point).y) : nearest;
}

/** True when `p` is inside the closed path through `points` (even-odd rule: a ray to the right crosses an odd number of edges). */
export function insidePolygon(p: Point, points: readonly Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const a = points[index] as Point;
    const b = points[previous] as Point;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Distance from `p` to a polygon given by its corners. A `filled` polygon is 0 inside; otherwise only its outline counts, so a point
 * inside is as far from it as from the nearest edge.
 *
 * @example
 * ```ts
 * const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
 * distanceToPolygon({ x: 5, y: 4 }, square, true); // 0
 * distanceToPolygon({ x: 5, y: 4 }, square, false); // 4
 * ```
 */
export function distanceToPolygon(p: Point, points: readonly Point[], filled: boolean): number {
  return filled && insidePolygon(p, points) ? 0 : distanceToPath(p, points, true);
}

/**
 * Distance from `p` to a geometry shape (CSS px). A rectangle counts as a solid area when
 * `filled()` is true (asked only for rectangles, polygons and ellipses). A text box is always solid. A label is the point
 * where it is anchored. A polyline is its segments, a polygon and an ellipse their outline and, when filled, their inside; a curve and an
 * ellipse are measured on a flattened copy (`FLATNESS_PX`, 0.25 px); an arrowhead is a solid triangle and a glyph its box (FR-TOOL-037).
 */
export function distanceToShape(p: Point, shape: Shape, filled: () => boolean): number {
  switch (shape.type) {
    case 'line':
      return distanceToSegment(p, shape.from, shape.to);
    case 'rect':
      return distanceToRect(p, shape, filled());
    case 'arc':
      return distanceToArc(p, shape);
    case 'text':
      return distanceToRect(p, shape, true);
    case 'label':
      return Math.hypot(p.x - shape.x, p.y - shape.y);
    case 'polyline':
      return distanceToPath(p, shape.points, false);
    case 'polygon':
      return distanceToPolygon(p, shape.points, filled());
    case 'ellipse':
      return distanceToPolygon(p, ellipsePoints(shape), filled());
    case 'curve':
      return distanceToPath(p, flattenCurve(shape), false);
    case 'arrowhead':
      return distanceToPolygon(p, arrowheadPoints(shape), true);
    case 'glyph':
      return distanceToRect(p, shape, true);
  }
}
