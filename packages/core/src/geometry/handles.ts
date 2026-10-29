import type { Point, Rect } from '../host';
import type { DrawingKind } from '../types';
import type { HandlePoint } from './types';

function handle(index: number, x: number, y: number): HandlePoint {
  return { id: `handle:${index}`, x, y };
}

/**
 * The grab points of a drawing (FR-GEO-001, FR-INT-032), with ids that stay the same across frames:
 *
 * - every kind: `handle:<n>` at anchor n;
 * - horizontal line: its one handle at the horizontal centre of the pane;
 * - Fibonacci time zones: at the anchor times, vertically centred in the pane;
 * - rectangle: `handle:2` at (x1, y2) and `handle:3` at (x2, y1), the other two corners, then the
 *   edge midpoints `handle:4` (x1, middle), `handle:5` (x2, middle), `handle:6` (middle, y1) and
 *   `handle:7` (middle, y2). Each edge handle moves one coordinate of one anchor.
 */
export function handlesOf(kind: DrawingKind, points: readonly Point[], rect: Rect): HandlePoint[] {
  if (kind === 'horizontal-line') return [handle(0, rect.x + rect.width / 2, points[0].y)];
  if (kind === 'fibonacci-time-zones') return points.map((p, index) => handle(index, p.x, rect.y + rect.height / 2));
  const handles = points.map((p, index) => handle(index, p.x, p.y));
  if (kind === 'rectangle') {
    const [{ x: x1, y: y1 }, { x: x2, y: y2 }] = points;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    handles.push(handle(2, x1, y2), handle(3, x2, y1), handle(4, x1, midY), handle(5, x2, midY), handle(6, midX, y1), handle(7, midX, y2));
  }
  return handles;
}
