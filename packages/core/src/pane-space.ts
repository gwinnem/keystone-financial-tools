import type { DrawingHost, Point, Rect } from './host';
import { kindDefinition } from './kinds';
import { resolveOptions } from './options';
import type { Drawing, DrawingPatch, PanePosition } from './types';

/** True for a kind that is anchored to the pane (`space: 'pane'`, D-10): its geometry comes from `options.position`, not from time and price. */
export function isPaneKind(kind: string): boolean {
  return kindDefinition(kind)?.space === 'pane';
}

/** The position of a drawing of a pane kind: its own over the default of the kind. */
export function positionOf(drawing: Drawing): PanePosition {
  return resolveOptions(drawing.kind, drawing.options).position as PanePosition;
}

/** The plot point of a position in a pane. */
export function panePoint(rect: Rect, position: PanePosition): Point {
  return { x: rect.x + position.x * rect.width, y: rect.y + position.y * rect.height };
}

function fraction(value: number, from: number, size: number): number {
  return size > 0 ? Math.min(Math.max((value - from) / size, 0), 1) : 0;
}

/** The position of a plot point in a pane, kept inside the pane (0..1), so a drawing stays at least partly inside it. */
export function positionAt(rect: Rect, point: Point): PanePosition {
  return { x: fraction(point.x, rect.x, rect.width), y: fraction(point.y, rect.y, rect.height) };
}

/** CSS px that one bar is wide on the screen. */
export function barWidthPx(host: DrawingHost): number {
  const time = host.xToTime(0);
  return host.timeToX(time + host.barInterval()) - host.timeToX(time);
}

/**
 * The patch that moves a drawing of a pane kind by `dx` and `dy` CSS px, or null when its pane is gone. The position is
 * clamped to the pane. Only `options` changes: the anchor just names the pane.
 *
 * @example
 * ```ts
 * const patch = paneShift(drawing, 10, 0, host);
 * if (patch !== null) store.update(drawing.id, patch);
 * ```
 */
export function paneShift(drawing: Drawing, dx: number, dy: number, host: DrawingHost): Pick<DrawingPatch, 'options'> | null {
  const rect = host.paneRect(drawing.anchors[0].yAxisId);
  if (rect === null) return null;
  const here = panePoint(rect, positionOf(drawing));
  return { options: { ...drawing.options, position: positionAt(rect, { x: here.x + dx, y: here.y + dy }) } };
}
