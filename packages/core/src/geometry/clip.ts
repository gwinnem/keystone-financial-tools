import type { Point, Rect } from '../host';

/** The point `p + d * t`. */
export function at(p: Point, d: Point, t: number): Point {
  return { x: p.x + d.x * t, y: p.y + d.y * t };
}

/**
 * The range of `t` for which the line `p + d * t` lies inside `rect` (Liang-Barsky), or null when
 * the line misses it. Edges count as inside. `d` must not be the zero vector.
 */
export function lineRectRange(p: Point, d: Point, rect: Rect): readonly [number, number] | null {
  let enter = -Infinity;
  let exit = Infinity;
  // Each constraint reads `step * t <= room`.
  const constraints: readonly (readonly [number, number])[] = [
    [-d.x, p.x - rect.x],
    [d.x, rect.x + rect.width - p.x],
    [-d.y, p.y - rect.y],
    [d.y, rect.y + rect.height - p.y],
  ];
  for (const [step, room] of constraints) {
    if (step < 0) {
      enter = Math.max(enter, room / step);
    } else if (step > 0) {
      exit = Math.min(exit, room / step);
    } else if (room < 0) {
      return null;
    }
  }
  return enter <= exit ? [enter, exit] : null;
}
