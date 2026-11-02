import type { DrawingHost, Point } from '../host';
import { anchorToPoint } from '../projection';
import type { Anchor } from '../types';

/**
 * The magnet modes (FR-INT-040): `off` never snaps, `weak` snaps when an OHLC value of the nearest
 * bar is within `WEAK_MAGNET_PX`, `strong` always snaps to the nearest OHLC value.
 */
export type MagnetMode = 'off' | 'weak' | 'strong';

/** How close (CSS px) an open, high, low or close must be for the `weak` magnet to snap. */
export const WEAK_MAGNET_PX = 12;

/** Where an anchor snapped to: the new anchor and its plot point (for the snap indicator, FR-INT-043). */
export interface SnapResult {
  readonly anchor: Anchor;
  readonly point: Point;
}

/**
 * The mode in force while Ctrl/Cmd is held or not (FR-INT-042): holding it turns `off` into `strong`
 * and `weak` or `strong` into `off`. The stored mode is never changed; pass the result to the
 * functions that snap.
 *
 * @example
 * ```ts
 * const magnet = effectiveMagnet(tools.magnet, event.ctrlKey || event.metaKey);
 * ```
 */
export function effectiveMagnet(mode: MagnetMode, invert: boolean): MagnetMode {
  if (!invert) return mode;
  return mode === 'off' ? 'strong' : 'off';
}

/**
 * Snaps an anchor to the bar nearest to its time (FR-INT-040, FR-INT-041): the time becomes the
 * bar's time and the price the open, high, low or close nearest to the anchor in pixels. `weak`
 * snaps only when that value is within `WEAK_MAGNET_PX` of the anchor (both coordinates), otherwise
 * the anchor stays free; `strong` always snaps. Null when nothing snaps: the mode is `off`, the
 * y-axis has no pane, the host has no bar, or the nearest bar is further than half a bar interval
 * away (future space, before the first bar, or a gap), where nothing is snapped. On a tie the
 * first of open, high, low and close wins.
 *
 * @example
 * ```ts
 * const snapped = snapAnchor(anchor, 'strong', host);
 * if (snapped !== null) anchor = snapped.anchor;
 * ```
 */
export function snapAnchor(anchor: Anchor, magnet: MagnetMode, host: DrawingHost): SnapResult | null {
  if (magnet === 'off' || host.paneRect(anchor.yAxisId) === null) return null;
  const bar = host.nearestBar(anchor.time);
  if (bar === null || Math.abs(bar.time - anchor.time) > host.barInterval() / 2) return null;
  const from = anchorToPoint(anchor, host);
  const x = host.timeToX(bar.time);
  let best: SnapResult | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const price of [bar.ohlc.open, bar.ohlc.high, bar.ohlc.low, bar.ohlc.close]) {
    const point = { x, y: host.priceToY(price, anchor.yAxisId) };
    const distance = Math.hypot(point.x - from.x, point.y - from.y);
    if (distance < bestDistance) {
      best = { anchor: { time: bar.time, price, yAxisId: anchor.yAxisId }, point };
      bestDistance = distance;
    }
  }
  return magnet === 'weak' && bestDistance > WEAK_MAGNET_PX ? null : best;
}
