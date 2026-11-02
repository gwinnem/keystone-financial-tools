import type { DrawingHost } from '../host';
import { anchorToPoint, pointToAnchor } from '../projection';
import type { Anchor, Drawing } from '../types';

/** How far down the screen (CSS px) a duplicate lies from its original (FR-INT-024). */
export const DUPLICATE_OFFSET_PX = 10;

/**
 * The copy of a drawing that Ctrl/Cmd+D adds (FR-INT-024): the same drawing under a new id, shifted
 * one bar later in time and `DUPLICATE_OFFSET_PX` down the screen, on the same y-axis. The copy is
 * never locked, whatever the original is. Returns null when an anchor's y-axis has no pane.
 *
 * @example
 * ```ts
 * const copies = ids.flatMap((id) => {
 *   const copy = duplicateDrawing(store.get(id)!, createId(), host);
 *   return copy === null ? [] : [copy];
 * });
 * store.batch(() => copies.forEach((copy) => store.add(copy))); // one history entry
 * ```
 */
export function duplicateDrawing(drawing: Drawing, id: string, host: DrawingHost): Drawing | null {
  const interval = host.barInterval();
  const anchors: Anchor[] = [];
  for (const anchor of drawing.anchors) {
    const here = anchorToPoint(anchor, host);
    const shifted = pointToAnchor({ x: here.x, y: here.y + DUPLICATE_OFFSET_PX }, anchor.yAxisId, host);
    if (shifted === null) return null;
    anchors.push({ time: anchor.time + interval, price: shifted.price, yAxisId: anchor.yAxisId });
  }
  return { ...drawing, id, anchors, locked: false };
}
