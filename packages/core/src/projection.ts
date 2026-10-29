import type { DrawingHost, Point } from './host';
import type { Anchor } from './types';

/**
 * Where an anchor is on screen: plot coordinates (CSS px) from the host transforms. Anchors in
 * future space (beyond the last bar) follow the host's extrapolation, so they keep their place
 * relative to the bars when the chart scrolls or zooms.
 *
 * @example
 * ```ts
 * const { x, y } = anchorToPoint({ time, price: 101.5, yAxisId: 'price' }, host);
 * ```
 */
export function anchorToPoint(anchor: Anchor, host: DrawingHost): Point {
  return { x: host.timeToX(anchor.time), y: host.priceToY(anchor.price, anchor.yAxisId) };
}

/**
 * The anchor at a plot point on a y-axis, or null when that y-axis has no pane (`paneRect` is
 * null). The point does not have to lie inside the pane: the second anchor of a drawing is
 * projected onto the first anchor's axis even when the pointer is over another pane (FR-INT-012).
 *
 * @example
 * ```ts
 * const anchor = pointToAnchor({ x: event.x, y: event.y }, 'price', host);
 * if (anchor !== null) store.update(id, { anchors: [anchor, second] });
 * ```
 */
export function pointToAnchor(point: Point, yAxisId: string, host: DrawingHost): Anchor | null {
  if (host.paneRect(yAxisId) === null) return null;
  return { time: host.xToTime(point.x), price: host.yToPrice(point.y, yAxisId), yAxisId };
}
