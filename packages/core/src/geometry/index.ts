import type { DrawingHost, Point, Rect } from '../host';
import { resolveOptions } from '../options';
import { anchorToPoint } from '../projection';
import { resolveStyle } from '../theme';
import type { Drawing, FibonacciLevel } from '../types';
import { rectangleShapes, textNoteShapes } from './boxes';
import { arcShapes, fanShapes, retracementShapes, timeZoneShapes, type RetracementOptions } from './fibonacci';
import { handlesOf } from './handles';
import { horizontalLineShapes, trendLineShapes } from './lines';
import type { DrawingGeometry, GeometryOptions, Shape } from './types';

function shapesOf(drawing: Drawing, points: readonly Point[], rect: Rect, host: DrawingHost, options: GeometryOptions): Shape[] {
  const [a1, a2] = drawing.anchors;
  const [p1, p2] = points;
  const kindOptions = resolveOptions(drawing.kind, drawing.options);
  const levels = kindOptions.levels as readonly FibonacciLevel[];
  switch (drawing.kind) {
    case 'trend-line':
      return trendLineShapes(p1, p2, rect, kindOptions.extendLeft as boolean, kindOptions.extendRight as boolean);
    case 'horizontal-line':
      return horizontalLineShapes(p1, rect);
    case 'rectangle':
      return rectangleShapes(p1, p2);
    case 'text-note':
      return textNoteShapes(p1, drawing.text ?? '', resolveStyle(drawing, options.theme).fontSize, options.measureText);
    case 'fibonacci-retracement':
      return retracementShapes(a1, a2, rect, host, kindOptions as RetracementOptions);
    case 'fibonacci-fans':
      return fanShapes(a1, a2, rect, host, levels);
    case 'fibonacci-arcs':
      return arcShapes(p1, p2, levels, kindOptions.fullCircles as boolean);
    case 'fibonacci-time-zones':
      return timeZoneShapes(a1, a2, rect, host, kindOptions.sequence as readonly number[]);
  }
}

/**
 * The pixel geometry of a drawing for the current frame (FR-GEO-001): its shapes (segments, rays,
 * rectangles, arcs, text boxes, level labels) and handle points, from the host transforms and the
 * pane of its y-axis. Pure and deterministic; returns null when the y-axis has no pane. Assumes a
 * valid drawing (see `validateDrawing`); `hidden` is not considered here.
 *
 * | Kind | Shapes |
 * |---|---|
 * | `trend-line` | One line from left to right, extended to the pane edge per `extendLeft`/`extendRight` |
 * | `horizontal-line` | One line across the pane |
 * | `rectangle` | One rect, normalised |
 * | `text-note` | One text box with its top left corner at the anchor |
 * | `fibonacci-retracement` | Per visible level a line (`level:<ratio>`), then its label when shown |
 * | `fibonacci-fans` | Per visible level a ray clipped to the pane |
 * | `fibonacci-arcs` | Per visible level with a positive radius an arc around anchor 2 |
 * | `fibonacci-time-zones` | Per sequence value inside the pane a vertical line (`level:<n>`) |
 *
 * @example
 * ```ts
 * const geometry = geometryOf(drawing, host, { theme: DARK_THEME });
 * for (const shape of geometry?.shapes ?? []) {
 *   if (shape.type === 'line') ctx.moveTo(shape.from.x, shape.from.y), ctx.lineTo(shape.to.x, shape.to.y);
 * }
 * ```
 */
export function geometryOf(drawing: Drawing, host: DrawingHost, options: GeometryOptions = {}): DrawingGeometry | null {
  const rect = host.paneRect(drawing.anchors[0].yAxisId);
  if (rect === null) return null;
  const points = drawing.anchors.map((anchor) => anchorToPoint(anchor, host));
  return { drawingId: drawing.id, kind: drawing.kind, shapes: shapesOf(drawing, points, rect, host, options), handles: handlesOf(drawing.kind, points, rect) };
}
