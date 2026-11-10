import type { Point, Rect } from '../host';
import type { HandlePoint } from './types';

function handle(index: number, x: number, y: number): HandlePoint {
  return { id: `handle:${index}`, x, y };
}

/** The default grab points: `handle:<n>` at anchor n (FR-GEO-001, FR-INT-032). */
export function anchorHandles(points: readonly Point[]): HandlePoint[] {
  return points.map((p, index) => handle(index, p.x, p.y));
}

/** Horizontal line: its one handle at the horizontal centre of the pane. */
export function horizontalLineHandles(points: readonly Point[], rect: Rect): HandlePoint[] {
  return [handle(0, rect.x + rect.width / 2, points[0].y)];
}

/** Fibonacci time zones: at the anchor times, vertically centred in the pane. */
export function timeZoneHandles(points: readonly Point[], rect: Rect): HandlePoint[] {
  return points.map((p, index) => handle(index, p.x, rect.y + rect.height / 2));
}

/**
 * Rectangle: `handle:0` and `handle:1` at the anchors, `handle:2` at (x1, y2) and `handle:3` at (x2, y1), the other
 * two corners, then the edge midpoints `handle:4` (x1, middle), `handle:5` (x2, middle), `handle:6` (middle, y1) and
 * `handle:7` (middle, y2). Each edge handle moves one coordinate of one anchor.
 */
export function rectangleHandles(points: readonly Point[]): HandlePoint[] {
  const handles = anchorHandles(points);
  const [{ x: x1, y: y1 }, { x: x2, y: y2 }] = points;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  handles.push(handle(2, x1, y2), handle(3, x2, y1), handle(4, x1, midY), handle(5, x2, midY), handle(6, midX, y1), handle(7, midX, y2));
  return handles;
}
