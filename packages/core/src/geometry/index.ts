import type { DrawingHost } from '../host';
import { kindDefinition } from '../kinds';
import { resolveOptions } from '../options';
import { panePoint, positionOf } from '../pane-space';
import { anchorToPoint } from '../projection';
import type { Drawing } from '../types';
import { anchorHandles } from './handles';
import type { DrawingGeometry, GeometryOptions } from './types';

/**
 * The pixel geometry of a drawing for the current frame (FR-GEO-001): its shapes (segments, rays,
 * rectangles, arcs, text boxes, level labels) and handle points, from the host transforms and the
 * pane of its y-axis. Pure and deterministic; returns null when the y-axis has no pane or the kind is not
 * registered. Assumes a valid drawing (see `validateDrawing`); `hidden` is not considered here. The shapes
 * and handles of a kind come from its registry entry (`KindDefinition`).
 *
 * | Kind | Shapes |
 * |---|---|
 * | `trend-line` | One line from left to right, extended to the pane edge per `extendLeft`/`extendRight` |
 * | `horizontal-line` | One line across the pane, then its price label (a `text` shape of the part `label`, formatted by `priceFormatter`) |
 * | `rectangle` | One rect, normalised |
 * | `text-note` | One text box with its top left corner at the anchor |
 * | `fibonacci-retracement` | Per visible level a line (`level:<ratio>`), then its label (with its text, the price formatted by `priceFormatter`) when shown |
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
  const definition = kindDefinition(drawing.kind);
  if (definition === undefined) return null;
  const rect = host.paneRect(drawing.anchors[0].yAxisId);
  if (rect === null) return null;
  // A pane-anchored kind (D-10) is placed from the pane: its anchor only names the pane, so time and price play no part.
  const points = definition.space === 'pane' ? [panePoint(rect, positionOf(drawing))] : drawing.anchors.map((anchor) => anchorToPoint(anchor, host));
  const kindOptions = resolveOptions(drawing.kind, drawing.options);
  return {
    drawingId: drawing.id,
    kind: drawing.kind,
    shapes: definition.geometry({ drawing, points, rect, host, options, kindOptions }),
    handles: (definition.handles ?? anchorHandles)(points, rect),
  };
}
