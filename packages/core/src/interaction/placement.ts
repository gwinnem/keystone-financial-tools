import { ANCHOR_RULES, isFreehandKind } from '../kinds';
import type { DrawingHost, Point, Rect } from '../host';
import { anchorToPoint, pointToAnchor } from '../projection';
import type { Anchor, Drawing, DrawingKind } from '../types';
import { FREEHAND_SAMPLE_PX, strokeIndices, strokeSteps } from './freehand';
import { ANGLE_KINDS, constrainAngle } from './move';
import { snapAnchor, type MagnetMode } from './snap';

/** Two anchors closer than this in both x and y (CSS px) are one point: no drawing is created from them (FR-INT-011). */
export const ZERO_LENGTH_PX = 1;

/**
 * How far a placement has come.
 * - `waiting`: the tool is active and nothing is placed.
 * - `anchored`: the tool has its first anchor (`first`) and, for a tool with three or more anchors, the anchors that followed it (`more`, empty until the second is placed); `pointer` is the next anchor under the pointer on the first anchor's y-axis (the preview) and `dragging` tells whether the pointer is held down (drag mode) or not (click mode).
 */
export type PlacementProgress =
  { readonly type: 'waiting' } | { readonly type: 'anchored'; readonly first: Anchor; readonly more: readonly Anchor[]; readonly pointer: Anchor; readonly dragging: boolean };

type Anchored = Extract<PlacementProgress, { type: 'anchored' }>;

/** How many anchors a placement has fixed so far (the anchor under the pointer is not one); internal, the controller announces the next one with it. */
export function placedCount(progress: PlacementProgress): number {
  return progress.type === 'anchored' ? 1 + progress.more.length : 0;
}

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
 * unpacked. `button` is `PointerEvent.button`; only the primary button (0) places. `finish` completes a tool with a
 * variable number of anchors (Enter, a double click or a double tap) and `remove-anchor` takes the last placed anchor back
 * (Backspace).
 */
export type PlacementInput =
  | { readonly type: 'move'; readonly point: Point }
  | { readonly type: 'click'; readonly point: Point; readonly button: number }
  | { readonly type: 'drag-start'; readonly origin: Point; readonly button: number }
  | { readonly type: 'drag'; readonly point: Point }
  | { readonly type: 'drag-end'; readonly point: Point }
  | { readonly type: 'finish' }
  | { readonly type: 'remove-anchor' }
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

/** The anchor at a point on a y-axis, snapped by the magnet (FR-INT-040), or null when the y-axis has no pane. */
function anchorOn(point: Point, yAxisId: string, magnet: MagnetMode, host: DrawingHost): Anchor | null {
  const anchor = pointToAnchor(point, yAxisId, host);
  return anchor === null ? null : (snapAnchor(anchor, magnet, host)?.anchor ?? anchor);
}

/** The anchor under a point, or null outside every pane (FR-INT-012). */
function anchorAt(point: Point, magnet: MagnetMode, host: DrawingHost): Anchor | null {
  const yAxisId = host.yAxisAt(point.x, point.y);
  return yAxisId === null ? null : anchorOn(point, yAxisId, magnet, host);
}

function reduceWaiting(tool: DrawingKind, progress: PlacementProgress, input: PlacementInput, magnet: MagnetMode, host: DrawingHost): PlacementResult {
  const oneAnchor = ANCHOR_RULES[tool].max === 1;
  const freehand = isFreehandKind(tool);
  switch (input.type) {
    case 'click': {
      // A click alone is not a stroke.
      const anchor = input.button === 0 && !freehand ? anchorAt(input.point, magnet, host) : null;
      if (anchor === null) return ignore(progress);
      return oneAnchor ? go(progress, [anchor]) : go({ type: 'anchored', first: anchor, more: [], pointer: anchor, dragging: false });
    }
    case 'drag-start': {
      // A stroke starts where the pointer went down and does not snap.
      const anchor = input.button === 0 && !oneAnchor ? anchorAt(input.origin, freehand ? 'off' : magnet, host) : null;
      return anchor === null ? ignore(progress) : go({ type: 'anchored', first: anchor, more: [], pointer: anchor, dragging: true });
    }
    default:
      return ignore(progress);
  }
}

/** The preview follows the pointer, projected onto the first anchor's y-axis wherever the pointer is. */
function follow(progress: Anchored, point: Point, magnet: MagnetMode, host: DrawingHost): PlacementResult {
  const pointer = anchorOn(point, progress.first.yAxisId, magnet, host);
  return pointer === null ? ignore(progress) : go({ ...progress, pointer });
}

/** True when the placement has at least the fewest anchors of a tool that takes a variable number of them, so that it can be finished. */
function canFinish(tool: DrawingKind, progress: PlacementProgress): boolean {
  const rule = ANCHOR_RULES[tool];
  return rule.min < rule.max && placedCount(progress) >= rule.min && !isFreehandKind(tool);
}

/** The anchors a placement has fixed, in order (the anchor under the pointer is not one). */
function placedAnchors(progress: Anchored): readonly Anchor[] {
  return [progress.first, ...progress.more];
}

function isZeroLength(previous: Anchor, next: Anchor, host: DrawingHost): boolean {
  const a = anchorToPoint(previous, host);
  const b = anchorToPoint(next, host);
  return Math.abs(a.x - b.x) <= ZERO_LENGTH_PX && Math.abs(a.y - b.y) <= ZERO_LENGTH_PX;
}

/**
 * The next anchor arrives (FR-TOOL-032). The last anchor of the tool completes the drawing; any other
 * is kept and the placement goes on. An anchor within `ZERO_LENGTH_PX` of the previous one is not
 * kept: a drag that ends where it began starts over when it was the first segment and otherwise only
 * lets go, a click on the previous anchor is ignored and waits for another.
 */
function finish(tool: DrawingKind, progress: Anchored, point: Point, magnet: MagnetMode, host: DrawingHost): PlacementResult {
  const next = anchorOn(point, progress.first.yAxisId, magnet, host);
  if (next === null) return ignore(progress);
  const placed = placedAnchors(progress);
  if (isZeroLength(placed[placed.length - 1] as Anchor, next, host)) {
    if (!progress.dragging) return ignore(progress);
    return go(progress.more.length === 0 ? PLACEMENT_START : { ...progress, dragging: false });
  }
  const anchors = [...placed, next];
  if (anchors.length >= ANCHOR_RULES[tool].max) return go(PLACEMENT_START, anchors);
  return go({ type: 'anchored', first: progress.first, more: anchors.slice(1), pointer: next, dragging: false });
}

/**
 * The pointer moves while a stroke is drawn (`end` false) or is released (`end` true): the points of the move inside the pane (`strokeSteps`)
 * that are at least `FREEHAND_SAMPLE_PX` from the last one are added, and the release also adds the end of the stroke when it is more
 * than `ZERO_LENGTH_PX` from the last point. A release simplifies the stroke (`strokeIndices`) and creates the drawing, or nothing when
 * the stroke has fewer anchors than the kind needs.
 */
function stroke(tool: DrawingKind, progress: Anchored, point: Point, end: boolean, host: DrawingHost): PlacementResult {
  const pointer = pointToAnchor(point, progress.first.yAxisId, host);
  if (pointer === null) return end ? go(PLACEMENT_START) : ignore(progress);
  const placed = [...placedAnchors(progress)];
  let last = anchorToPoint(placed[placed.length - 1] as Anchor, host);
  const steps = strokeSteps(host.paneRect(progress.first.yAxisId) as Rect, anchorToPoint(progress.pointer, host), point);
  for (const [index, step] of steps.entries()) {
    const distance = Math.hypot(step.x - last.x, step.y - last.y);
    const lastOfEnd = end && index === steps.length - 1;
    if (distance >= FREEHAND_SAMPLE_PX || (lastOfEnd && distance > ZERO_LENGTH_PX)) {
      placed.push(pointToAnchor(step, progress.first.yAxisId, host) as Anchor);
      last = step;
    }
  }
  if (!end) return go({ ...progress, more: placed.slice(1), pointer });
  const kept = strokeIndices(
    placed.map((anchor) => anchorToPoint(anchor, host)),
    ANCHOR_RULES[tool].max
  ).map((index) => placed[index] as Anchor);
  return kept.length >= ANCHOR_RULES[tool].min ? go(PLACEMENT_START, kept) : go(PLACEMENT_START);
}

/** A freehand stroke: only the pointer moving, being released or being cancelled means anything. */
function reduceStroke(tool: DrawingKind, progress: Anchored, input: PlacementInput, host: DrawingHost): PlacementResult {
  switch (input.type) {
    case 'move':
    case 'drag':
      return stroke(tool, progress, input.point, false, host);
    case 'drag-end':
      return stroke(tool, progress, input.point, true, host);
    case 'cancel':
      return go(PLACEMENT_START);
    default:
      return ignore(progress);
  }
}

function reduceAnchored(tool: DrawingKind, progress: Anchored, input: PlacementInput, magnet: MagnetMode, host: DrawingHost): PlacementResult {
  if (isFreehandKind(tool)) return reduceStroke(tool, progress, input, host);
  switch (input.type) {
    case 'move':
    case 'drag':
      return follow(progress, input.point, magnet, host);
    case 'click':
      return input.button === 0 ? finish(tool, progress, input.point, magnet, host) : ignore(progress);
    case 'drag-start':
      return input.button === 0 && !progress.dragging ? go({ ...progress, dragging: true }) : ignore(progress);
    case 'drag-end':
      return finish(tool, progress, input.point, magnet, host);
    case 'finish':
      return canFinish(tool, progress) ? go(PLACEMENT_START, placedAnchors(progress)) : ignore(progress);
    case 'remove-anchor':
      return progress.more.length === 0 ? go(PLACEMENT_START) : go({ ...progress, more: progress.more.slice(0, -1), dragging: false });
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
 * - A tool with three or more anchors takes one click per anchor (the first two also by a drag);
 *   the last anchor completes the drawing (`anchors` has them all, one history entry) and every
 *   anchor within `ZERO_LENGTH_PX` of the one before it is ignored. `Escape` and the right button
 *   cancel through `reduceInteraction` and drop the anchors placed so far.
 * - A tool with a variable number of anchors (`min` below `max` in its rule) goes on until `max` completes it or
 *   `finish` does, which needs at least `min` anchors (fewer is ignored and creates nothing). `remove-anchor` takes the
 *   last placed anchor back; the first one back returns to `waiting`. Both are ignored by a tool with a fixed count
 *   (`finish`) or before the first anchor.
 * - A freehand tool (`placement: 'freehand'`) is drawn with the pointer held down: the press starts the stroke (no click does), moves add a
 *   point at least `FREEHAND_SAMPLE_PX` from the last, the part of the stroke outside the pane of the first point is clipped at the pane
 *   edge, and the release simplifies the stroke to `FREEHAND_TOLERANCE_PX`, limits it to the kind's most anchors (512 at most) and creates it.
 *   A stroke with fewer anchors than the kind needs creates nothing. The stroke does not snap.
 * - A click, or a press, outside every pane starts nothing and keeps the tool active.
 * - `GestureRecogniser`'s `drag-start` carries where the press went down (`origin`) and where the pointer is now (`point`): pass a `drag-start` with the origin, then a `drag` with the point.
 * - A pointer `cancel` while a drag is in progress starts over. Escape, the right button and
 *   deactivating the tool belong to `reduceInteraction`; when it reports `cancel-placement`, the
 *   caller resets the progress to `PLACEMENT_START`.
 * - With a `magnet` other than `off` every anchor, and the preview, snaps to the nearest bar's
 *   open, high, low or close (`snapAnchor`, FR-INT-040); pass `effectiveMagnet` for the Ctrl/Cmd
 *   inversion. Keyboard placement goes through the same inputs, so it snaps too.
 *
 * @example
 * ```ts
 * let progress: PlacementProgress = PLACEMENT_START;
 * const result = reducePlacement('trend-line', progress, { type: 'click', point: { x: 120, y: 80 }, button: 0 }, host);
 * progress = result.progress;
 * if (result.anchors !== null) store.add({ id: createId(), kind: 'trend-line', anchors: result.anchors });
 * ```
 */
export function reducePlacement(tool: DrawingKind, progress: PlacementProgress, input: PlacementInput, host: DrawingHost, magnet: MagnetMode = 'off'): PlacementResult {
  return progress.type === 'waiting' ? reduceWaiting(tool, progress, input, magnet, host) : reduceAnchored(tool, progress, input, magnet, host);
}

/**
 * What Enter does while placing, when it is not simply an anchor at the keyboard cursor: for a tool with a
 * variable number of anchors that already has its fewest, Enter finishes the drawing when no cursor is in use
 * (the pointer places) or when the cursor sits where the last anchor is (an Enter that would place nothing
 * new); otherwise, and for every other tool, it returns null and the caller places at the cursor.
 *
 * @example
 * ```ts
 * const input = enterInput('polyline', progress, cursor, 'off', host) ?? { type: 'click', point: cursor, button: 0 };
 * ```
 */
export function enterInput(tool: DrawingKind, progress: PlacementProgress, cursor: Point | null, magnet: MagnetMode, host: DrawingHost): PlacementInput | null {
  if (!canFinish(tool, progress)) return null;
  if (cursor !== null && !reducePlacement(tool, progress, { type: 'click', point: cursor, button: 0 }, host, magnet).ignored) return null;
  return { type: 'finish' };
}

/**
 * Shift while placing a trend line or fans (FR-INT-031): once the first anchor is set, the point of
 * a `move`, `click`, `drag` or `drag-end` goes to the multiple of 45 degrees (in pixel space,
 * measured from the first anchor) nearest to where the pointer is, at the same pixel distance. Any
 * other input, other kinds, a placement that has no first anchor yet, `shift` false and a first
 * anchor without a pane come back as they are. The caller places with the magnet `off` when the
 * returned input is not the one it passed: an angle-locked anchor never snaps.
 *
 * @example
 * ```ts
 * const aimed = lockAngle('trend-line', progress, input, event.shiftKey, host);
 * const result = reducePlacement('trend-line', progress, aimed, host, aimed === input ? magnet : 'off');
 * ```
 */
export function lockAngle(tool: DrawingKind, progress: PlacementProgress, input: PlacementInput, shift: boolean, host: DrawingHost): PlacementInput {
  if (!shift || progress.type !== 'anchored' || !ANGLE_KINDS.has(tool) || host.paneRect(progress.first.yAxisId) === null) return input;
  const first = anchorToPoint(progress.first, host);
  switch (input.type) {
    case 'move':
    case 'click':
    case 'drag':
    case 'drag-end':
      return { ...input, point: constrainAngle(first, input.point) };
    default:
      return input;
  }
}

/**
 * Where the pointer would snap during a placement (the `snap` option of the scene, FR-INT-043): the
 * plot point of the snapped anchor, or null when nothing snaps. It uses the y-axis `reducePlacement`
 * would use: the pane under the pointer before the first anchor, the first anchor's y-axis after.
 *
 * @example
 * ```ts
 * const snap = placementSnap(progress, event.point, magnet, host); // buildScene(host, { ..., snap })
 * ```
 */
export function placementSnap(progress: PlacementProgress, point: Point, magnet: MagnetMode, host: DrawingHost): Point | null {
  // The unsnapped anchor: on the first anchor's y-axis once placing, else under the pointer (null outside every pane).
  const anchor = progress.type === 'anchored' ? pointToAnchor(point, progress.first.yAxisId, host) : anchorAt(point, 'off', host);
  return anchor === null ? null : (snapAnchor(anchor, magnet, host)?.point ?? null);
}

/**
 * The drawing to show while placing (the `preview` option of the scene): the anchors placed so far
 * and the anchor under the pointer as the next one, or null before the first anchor is set.
 *
 * @example
 * ```ts
 * const preview = placementPreview('trend-line', progress, 'preview');
 * ```
 */
export function placementPreview(tool: DrawingKind, progress: PlacementProgress, id: string): Drawing | null {
  return progress.type === 'anchored' ? { id, kind: tool, anchors: [progress.first, ...progress.more, progress.pointer] } : null;
}
