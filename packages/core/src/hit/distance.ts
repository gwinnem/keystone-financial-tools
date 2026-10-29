import type { Point } from '../host';
import type { ArcShape, RectShape, Shape } from '../geometry/types';

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
 */
export function distanceToArc(p: Point, arc: Pick<ArcShape, 'center' | 'radius' | 'startAngle' | 'endAngle'>): number {
  const dx = p.x - arc.center.x;
  const dy = p.y - arc.center.y;
  const turn = (((Math.atan2(dy, dx) - arc.startAngle) % TAU) + TAU) % TAU;
  // Stryker disable next-line EqualityOperator: on the end angle the point lies on the radius through the end of the arc, so the circle and the end give the same distance.
  if (turn <= arc.endAngle - arc.startAngle) return Math.abs(Math.hypot(dx, dy) - arc.radius);
  const toEnd = (angle: number): number => Math.hypot(p.x - (arc.center.x + arc.radius * Math.cos(angle)), p.y - (arc.center.y + arc.radius * Math.sin(angle)));
  return Math.min(toEnd(arc.startAngle), toEnd(arc.endAngle));
}

/**
 * Distance from `p` to a geometry shape (CSS px). A rectangle counts as a solid area when
 * `filled()` is true (asked only for rectangles). A text box is always solid. A label is the point
 * where it is anchored.
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
  }
}
