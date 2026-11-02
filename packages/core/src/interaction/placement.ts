import { ANCHOR_COUNT } from '../kinds';
import type { DrawingHost, Point } from '../host';
import { anchorToPoint, pointToAnchor } from '../projection';
import type { Anchor, Drawing, DrawingKind } from '../types';

/** Two anchors closer than this in both x and y (CSS px) are one point: no drawing is created from them (FR-INT-011). */
export const ZERO_LENGTH_PX = 1;

/**
 * How far a placement has come.
 * - `waiting`: the tool is active and nothing is placed.
 * - `anchored`: a two-anchor tool has its first anchor; `pointer` is the second anchor under the pointer on the first anchor's y-axis (the preview) and `dragging` tells whether the pointer is held down (drag mode) or not (click-click mode).
 */
export type PlacementProgress = { readonly type: 'waiting' } | { readonly type: 'anchored'; readonly first: Anchor; readonly pointer: Anchor; readonly dragging: boolean };

type Anchored = Extract<PlacementProgress, { type: 'anchored' }>;

/**
 * The progress of a tool that has just been activated, or whose placement was cancelled.
 *
 * @example
 * ```ts
 * let progress: PlacementProgress = PLACEMENT_START;
 * ```
 */
export const PLACEMENT_START: PlacementProgress = Object.freeze({ type: 'waiting' });

/**
 * What drives a placement: the pointer gestures of `GestureRecogniser` that the caller has
 * unpacked. `button` is `PointerEvent.button`; only the primary button (0) places.
 */
export type PlacementInput =
  | { readonly type: 'move'; readonly point: Point }
  | { readonly type: 'click'; readonly point: Point; readonly button: number }
  | { readonly type: 'drag-start'; readonly origin: Point; readonly button: number }
  | { readonly type: 'drag'; readonly point: Point }
  | { readonly type: 'drag-end'; readonly point: Point }
  | { readonly type: 'cancel' };

/** The outcome of one input. */
export interface PlacementResult {
  readonly progress: PlacementProgress;
  /** The anchors of the drawing to create (one command, one history entry), or null. */
  readonly anchors: readonly Anchor[] | null;
  /** True when the input changed nothing and creates nothing (log at debug level). */
  readonly ignored: boolean;
}

const ignore = (progress: PlacementProgress): PlacementResult => ({ progress, anchors: null, ignored: true });
const go = (progress: PlacementProgress, anchors: readonly Anchor[] | null = null): PlacementResult => ({ progress, anchors, ignored: false });

/** The anchor under a point, or null outside every pane (FR-INT-012). */
function anchorAt(point: Point, host: DrawingHost): Anchor | null {
  const yAxisId = host.yAxisAt(point.x, point.y);
  return yAxisId === null ? null : pointToAnchor(point, yAxisId, host);
}

function reduceWaiting(tool: DrawingKind, progress: PlacementProgress, input: PlacementInput, host: DrawingHost): PlacementResult {
  const oneAnchor = ANCHOR_COUNT[tool] === 1;
  switch (input.type) {
    case 'click': {
      const anchor = input.button === 0 ? anchorAt(input.point, host) : null;
      if (anchor === null) return ignore(progress);
      return oneAnchor ? go(progress, [anchor]) : go({ type: 'anchored', first: anchor, pointer: anchor, dragging: false });
    }
    case 'drag-start': {
      const anchor = input.button === 0 && !oneAnchor ? anchorAt(input.origin, host) : null;
      return anchor === null ? ignore(progress) : go({ type: 'anchored', first: anchor, pointer: anchor, dragging: true });
    }
    default:
      return ignore(progress);
  }
}

/** The preview follows the pointer, projected onto the first anchor's y-axis wherever the pointer is. */
function follow(progress: Anchored, point: Point, host: DrawingHost): PlacementResult {
  const pointer = pointToAnchor(point, progress.first.yAxisId, host);
  return pointer === null ? ignore(progress) : go({ type: 'anchored', first: progress.first, pointer, dragging: progress.dragging });
}

function isZeroLength(first: Anchor, second: Anchor, host: DrawingHost): boolean {
  const a = anchorToPoint(first, host);
  const b = anchorToPoint(second, host);
  return Math.abs(a.x - b.x) <= ZERO_LENGTH_PX && Math.abs(a.y - b.y) <= ZERO_LENGTH_PX;
}

/**
 * The second anchor arrives. A zero-length drawing is not created: a drag that ends where it began
 * starts over, a second click on the first anchor is ignored and waits for another.
 */
function finish(progress: Anchored, point: Point, host: DrawingHost): PlacementResult {
  const second = pointToAnchor(point, progress.first.yAxisId, host);
  if (second === null) return ignore(progress);
  if (isZeroLength(progress.first, second, host)) return progress.dragging ? go(PLACEMENT_START) : ignore(progress);
  return go(PLACEMENT_START, [progress.first, second]);
}

function reduceAnchored(progress: Anchored, input: PlacementInput, host: DrawingHost): PlacementResult {
  switch (input.type) {
    case 'move':
    case 'drag':
      return follow(progress, input.point, host);
    case 'click':
      return input.button === 0 ? finish(progress, input.point, host) : ignore(progress);
    case 'drag-start':
      return input.button === 0 && !progress.dragging ? go({ type: 'anchored', first: progress.first, pointer: progress.pointer, dragging: true }) : ignore(progress);
    case 'drag-end':
      return finish(progress, input.point, host);
    case 'cancel':
      return go(PLACEMENT_START);
  }
}

/**
 * Placement of SDS 9.2 (FR-INT-010..012): a pure reducer, like `reduceInteraction`, that the
 * caller runs while the machine is in `placing`.
 *
 * - A one-anchor tool places on a left click inside a pane (`anchors` has one anchor).
 * - A two-anchor tool places by click, move, click, or by pressing, dragging and releasing. The
 *   second anchor is projected onto the first anchor's y-axis even over another pane. A second
 *   anchor within `ZERO_LENGTH_PX` of the first creates nothing.
 * - A click, or a press, outside every pane starts nothing and keeps the tool active.
 * - `GestureRecogniser`'s `drag-start` carries where the press went down (`origin`) and where the pointer is now (`point`): pass a `drag-start` with the origin, then a `drag` with the point.
 * - A pointer `cancel` while a drag is in progress starts over. Escape, the right button and
 *   deactivating the tool belong to `reduceInteraction`; when it reports `cancel-placement`, the
 *   caller resets the progress to `PLACEMENT_START`.
 *
 * @example
 * ```ts
 * let progress: PlacementProgress = PLACEMENT_START;
 * const result = reducePlacement('trend-line', progress, { type: 'click', point: { x: 120, y: 80 }, button: 0 }, host);
 * progress = result.progress;
 * if (result.anchors !== null) store.add({ id: createId(), kind: 'trend-line', anchors: result.anchors });
 * ```
 */
export function reducePlacement(tool: DrawingKind, progress: PlacementProgress, input: PlacementInput, host: DrawingHost): PlacementResult {
  return progress.type === 'waiting' ? reduceWaiting(tool, progress, input, host) : reduceAnchored(progress, input, host);
}

/**
 * The drawing to show while placing (the `preview` option of the scene): the first anchor and the
 * anchor under the pointer, or null before the first anchor is set.
 *
 * @example
 * ```ts
 * const preview = placementPreview('trend-line', progress, 'preview');
 * ```
 */
export function placementPreview(tool: DrawingKind, progress: PlacementProgress, id: string): Drawing | null {
  return progress.type === 'anchored' ? { id, kind: tool, anchors: [progress.first, progress.pointer] } : null;
}
