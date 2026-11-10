import { BOX_CORNERS, boundsOf } from '../geometry/handles';
import type { DrawingHost, Point } from '../host';
import { isFreehandKind } from '../kinds';
import { barWidthPx, isPaneKind, paneShift } from '../pane-space';
import { anchorToPoint, pointToAnchor } from '../projection';
import type { Anchor, Drawing, DrawingKind, DrawingPatch, KindOptions } from '../types';
import { snapAnchor, type MagnetMode } from './snap';

/** What Shift multiplies an arrow key step by (FR-INT-034). */
export const SHIFT_STEP_FACTOR = 10;

/** How far inside a pane edge (CSS px) the keyboard cursor stays, so it is always over the pane. */
export const KEYBOARD_CURSOR_INSET_PX = 1;

/** A drawing's new anchors after a move. A pane-anchored drawing (D-10) keeps its anchors and has its new `options` too. */
export interface MovedDrawing {
  readonly id: string;
  readonly anchors: readonly Anchor[];
  readonly options?: KindOptions;
}

/** Which of an anchor's coordinates a handle changes. */
interface Edit {
  readonly index: number;
  readonly time: boolean;
  readonly price: boolean;
}

const BOTH = { time: true, price: true };
const TIME_ONLY = { time: true, price: false };
const PRICE_ONLY = { time: false, price: true };

/**
 * What each rectangle handle changes (`handle:<n>`, see `geometryOf`): 0 and 1 the corners at anchor 1
 * and anchor 2, 2 and 3 the other two corners (one time from each anchor, one price from the other),
 * 4 to 7 the edges, one coordinate each.
 */
const RECTANGLE_HANDLES: readonly (readonly Edit[])[] = [
  [{ index: 0, ...BOTH }],
  [{ index: 1, ...BOTH }],
  [
    { index: 0, ...TIME_ONLY },
    { index: 1, ...PRICE_ONLY },
  ],
  [
    { index: 1, ...TIME_ONLY },
    { index: 0, ...PRICE_ONLY },
  ],
  [{ index: 0, ...TIME_ONLY }],
  [{ index: 1, ...TIME_ONLY }],
  [{ index: 0, ...PRICE_ONLY }],
  [{ index: 1, ...PRICE_ONLY }],
];

/** The kinds whose anchors, while placed and while dragged by a handle, snap to 45 degree angles with Shift (FR-INT-031). */
export const ANGLE_KINDS: ReadonlySet<DrawingKind> = new Set<DrawingKind>(['trend-line', 'fibonacci-fans']);

const DIAGONAL = Math.SQRT1_2;
/** The unit vectors of the eight multiples of 45 degrees, from 0 (right) clockwise on the screen. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [DIAGONAL, DIAGONAL],
  [0, 1],
  [-DIAGONAL, DIAGONAL],
  [-1, 0],
  [-DIAGONAL, -DIAGONAL],
  [0, -1],
  [DIAGONAL, -DIAGONAL],
];
const DIRECTION_COUNT = DIRECTIONS.length;
const DIRECTION_STEP = (2 * Math.PI) / DIRECTION_COUNT;

/**
 * Shift while moving (FR-INT-031): the point with the smaller of the two pixel deltas from `origin`
 * dropped, so the move is horizontal or vertical; equal deltas move horizontally.
 *
 * @example
 * ```ts
 * constrainMove({ x: 10, y: 10 }, { x: 50, y: 20 }); // { x: 50, y: 10 }
 * ```
 */
export function constrainMove(origin: Point, point: Point): Point {
  return Math.abs(point.x - origin.x) >= Math.abs(point.y - origin.y) ? { x: point.x, y: origin.y } : { x: origin.x, y: point.y };
}

/**
 * Shift while dragging a trend-line or fan anchor (FR-INT-031): the point at the same pixel distance
 * from `fixed`, in the direction of the nearest multiple of 45 degrees.
 *
 * @example
 * ```ts
 * constrainAngle({ x: 0, y: 0 }, { x: 100, y: 10 }); // about { x: 100.5, y: 0 }
 * ```
 */
export function constrainAngle(fixed: Point, point: Point): Point {
  const dx = point.x - fixed.x;
  const dy = point.y - fixed.y;
  const length = Math.hypot(dx, dy);
  // atan2 is in (-PI, PI], so the rounded index is in [-4, 4]; adding 8 makes it a valid index.
  const index = (Math.round(Math.atan2(dy, dx) / DIRECTION_STEP) + DIRECTION_COUNT) % DIRECTION_COUNT;
  const [ux, uy] = DIRECTIONS[index] as readonly [number, number];
  return { x: fixed.x + length * ux, y: fixed.y + length * uy };
}

/**
 * An anchor moved by the pointer's travel from `origin` to `point`, in data space: the time delta
 * of the two x positions and the price delta of the two y positions on the anchor's own y-axis.
 * Only the coordinates asked for change. Null when the y-axis has no pane.
 */
function dragged(anchor: Anchor, origin: Point, point: Point, host: DrawingHost, change: { readonly time: boolean; readonly price: boolean }): Anchor | null {
  if (host.paneRect(anchor.yAxisId) === null) return null;
  const time = change.time ? anchor.time + host.xToTime(point.x) - host.xToTime(origin.x) : anchor.time;
  const price = change.price ? anchor.price + host.yToPrice(point.y, anchor.yAxisId) - host.yToPrice(origin.y, anchor.yAxisId) : anchor.price;
  return { time, price, yAxisId: anchor.yAxisId };
}

/**
 * The edits dragging a handle makes; undefined for a rectangle handle that does not exist. For the
 * other kinds the handle is the anchor index, and `dragHandle` finds that anchor missing.
 */
function editsOf(drawing: Drawing, handle: number): readonly Edit[] | undefined {
  if (drawing.kind === 'rectangle') return RECTANGLE_HANDLES[handle];
  // A horizontal line has only a price and time-zone lines only times: the other coordinate plays no part in the geometry.
  const change = drawing.kind === 'horizontal-line' ? PRICE_ONLY : drawing.kind === 'fibonacci-time-zones' ? TIME_ONLY : BOTH;
  return [{ index: handle, ...change }];
}

/** A handle drag: the new anchors and, when the dragged anchor snapped, the plot point it snapped to. */
interface HandleDrag {
  readonly anchors: readonly Anchor[];
  readonly snap: Point | null;
}

/** Shift on a trend-line or fan anchor: the dragged anchor goes to the 45 degree direction nearest to where the pointer took it. It never snaps. */
function dragAngleHandle(drawing: Drawing, handle: number, origin: Point, point: Point, host: DrawingHost): HandleDrag | null {
  const moving = drawing.anchors[handle];
  const fixed = drawing.anchors[1 - handle];
  // Both anchors need a pane: without one their pixel position is NaN.
  if (moving === undefined || fixed === undefined || host.paneRect(moving.yAxisId) === null || host.paneRect(fixed.yAxisId) === null) return null;
  const from = anchorToPoint(moving, host);
  const target = constrainAngle(anchorToPoint(fixed, host), { x: from.x + point.x - origin.x, y: from.y + point.y - origin.y });
  // The pane of the moving anchor exists (checked above), so the projection cannot be null.
  const anchor = pointToAnchor(target, moving.yAxisId, host) as Anchor;
  return { anchors: drawing.anchors.map((existing, index) => (index === handle ? anchor : existing)), snap: null };
}

/**
 * A freehand drawing scaled by dragging a corner of its box (FR-TOOL-035): in pixels, every point keeps its place relative to the opposite
 * corner, multiplied by how far the dragged corner moved relative to that corner, on each axis. A box with no width (or no height) cannot be
 * scaled along that axis. Null when the handle is not one of the four corners or an anchor's y-axis has no pane.
 */
function scaleAnchors(drawing: Drawing, handle: number, origin: Point, point: Point, host: DrawingHost): HandleDrag | null {
  const corner = BOX_CORNERS[handle];
  if (corner === undefined || drawing.anchors.some((anchor) => host.paneRect(anchor.yAxisId) === null)) return null;
  const pixels = drawing.anchors.map((anchor) => anchorToPoint(anchor, host));
  const box = boundsOf(pixels);
  const pivot = { x: box.x + (1 - corner[0]) * box.width, y: box.y + (1 - corner[1]) * box.height };
  const grabbed = { x: box.x + corner[0] * box.width, y: box.y + corner[1] * box.height };
  const scaleX = box.width === 0 ? 1 : (grabbed.x + point.x - origin.x - pivot.x) / (grabbed.x - pivot.x);
  const scaleY = box.height === 0 ? 1 : (grabbed.y + point.y - origin.y - pivot.y) / (grabbed.y - pivot.y);
  // Every pane exists (checked above), so no projection can be null.
  const anchors = pixels.map((p, index) => pointToAnchor({ x: pivot.x + (p.x - pivot.x) * scaleX, y: pivot.y + (p.y - pivot.y) * scaleY }, (drawing.anchors[index] as Anchor).yAxisId, host) as Anchor);
  return { anchors, snap: null };
}

function dragHandleResult(drawing: Drawing, handle: number, origin: Point, point: Point, shift: boolean, magnet: MagnetMode, host: DrawingHost): HandleDrag | null {
  // A pane-anchored drawing has no anchor to drag: see `dragPatch`.
  if (isPaneKind(drawing.kind)) return null;
  if (isFreehandKind(drawing.kind)) return scaleAnchors(drawing, handle, origin, point, host);
  if (shift && ANGLE_KINDS.has(drawing.kind)) return dragAngleHandle(drawing, handle, origin, point, host);
  const edits = editsOf(drawing, handle);
  if (edits === undefined) return null;
  const anchors = [...drawing.anchors];
  let snap: Point | null = null;
  for (const edit of edits) {
    const anchor = anchors[edit.index];
    const next = anchor === undefined ? null : dragged(anchor, origin, point, host, edit);
    if (next === null) return null;
    // Only a handle that moves a whole anchor snaps: a half-moved anchor has no point to snap.
    const snapped = edit.time && edit.price ? snapAnchor(next, magnet, host) : null;
    anchors[edit.index] = snapped === null ? next : snapped.anchor;
    snap = snapped === null ? null : snapped.point;
  }
  return { anchors, snap };
}

/**
 * The anchors of a drawing after its handle `handle` was dragged from `origin` to `point` (FR-INT-030,
 * FR-INT-032), or null when nothing can change: the drawing has no such handle, or its y-axis has no
 * pane. The handle follows the pointer's travel, not its position, so it does not jump when grabbed
 * off centre. A rectangle's corner handles move one or both corners and its edge handles one
 * coordinate; a horizontal line changes only its price and time zones only their times. With
 * `shift`, the anchors of a trend line and of fans keep to multiples of 45 degrees in pixel space
 * (FR-INT-031). A freehand drawing (FR-TOOL-035) has four handles, the corners of the box around its points: dragging one scales all points
 * about the opposite corner, without snapping.
 *
 * With a `magnet` other than `off` (pass `effectiveMagnet` for the Ctrl/Cmd inversion) a handle that
 * moves a whole anchor snaps it to the nearest bar's open, high, low or close (`snapAnchor`,
 * FR-INT-040): every handle of the other kinds and the corners `handle:0` and `handle:1` of a
 * rectangle. Edge handles, the corners `handle:2` and `handle:3`, horizontal lines and time zones
 * move one coordinate of an anchor and do not snap, and neither does an angle-constrained drag.
 *
 * @example
 * ```ts
 * const anchors = dragHandle(original, 1, origin, event.point, event.shiftKey, host, magnet);
 * if (anchors !== null) store.update(original.id, { anchors });
 * ```
 */
export function dragHandle(drawing: Drawing, handle: number, origin: Point, point: Point, shift: boolean, host: DrawingHost, magnet: MagnetMode = 'off'): readonly Anchor[] | null {
  return dragHandleResult(drawing, handle, origin, point, shift, magnet, host)?.anchors ?? null;
}

/**
 * What dragging handle `handle` changes in a drawing, as a patch for `DrawingStore.update`, or null when nothing can change. The
 * anchors of a drawing in data space (see `dragHandle`); the `options.position` of a pane-anchored drawing (D-10), whose one handle
 * moves it, clamped to the pane.
 *
 * @example
 * ```ts
 * const patch = dragPatch(original, 0, origin, event.point, event.shiftKey, host);
 * if (patch !== null) store.update(original.id, patch);
 * ```
 */
export function dragPatch(drawing: Drawing, handle: number, origin: Point, point: Point, shift: boolean, host: DrawingHost, magnet: MagnetMode = 'off'): DrawingPatch | null {
  if (isPaneKind(drawing.kind)) return handle === 0 ? paneShift(drawing, point.x - origin.x, point.y - origin.y, host) : null;
  const anchors = dragHandle(drawing, handle, origin, point, shift, host, magnet);
  return anchors === null ? null : { anchors };
}

/**
 * Where the dragged handle snapped to (the `snap` option of the scene, FR-INT-043): the plot point,
 * or null when the drag does not snap or cannot happen. Takes the same arguments as `dragHandle`.
 *
 * @example
 * ```ts
 * const snap = handleSnap(original, 1, origin, event.point, event.shiftKey, host, magnet);
 * ```
 */
export function handleSnap(drawing: Drawing, handle: number, origin: Point, point: Point, shift: boolean, host: DrawingHost, magnet: MagnetMode = 'off'): Point | null {
  return dragHandleResult(drawing, handle, origin, point, shift, magnet, host)?.snap ?? null;
}

/**
 * The drawings moved by the pointer's travel from `origin` to `point` (FR-INT-030, FR-INT-031):
 * every anchor by the same time delta and by the price delta of its own y-axis, so drawings on
 * other panes move by the same time and their own pane's price. With `shift` the move is
 * horizontal or vertical, whichever pixel delta is larger. A horizontal line changes only its price,
 * whatever the pointer's horizontal travel. A drawing whose y-axis has no pane is
 * left out.
 *
 * @example
 * ```ts
 * for (const { id, anchors } of moveDrawings(originals, origin, event.point, event.shiftKey, host)) {
 *   store.update(id, { anchors });
 * }
 * ```
 */
export function moveDrawings(drawings: readonly Drawing[], origin: Point, point: Point, shift: boolean, host: DrawingHost): MovedDrawing[] {
  const target = shift ? constrainMove(origin, point) : point;
  return drawings.flatMap((drawing): MovedDrawing[] => {
    if (isPaneKind(drawing.kind)) {
      const patch = paneShift(drawing, target.x - origin.x, target.y - origin.y, host);
      return patch === null ? [] : [{ id: drawing.id, anchors: drawing.anchors, options: patch.options }];
    }
    const anchors: Anchor[] = [];
    for (const anchor of drawing.anchors) {
      const next = dragged(anchor, origin, target, host, drawing.kind === 'horizontal-line' ? PRICE_ONLY : BOTH);
      if (next === null) return [];
      anchors.push(next);
    }
    return [{ id: drawing.id, anchors }];
  });
}

/**
 * The anchors of a drawing shifted `bars` bars later (negative: earlier) and `pixels` px down
 * (negative: up) on the screen, each on its own y-axis (FR-INT-034, and the copy of FR-INT-024).
 * The price of an anchor is left exactly as it is when `pixels` is 0. Null when a y-axis has no pane.
 *
 * @example
 * ```ts
 * const anchors = nudgeAnchors(drawing, 0, -1, host); // one pixel up
 * ```
 */
export function nudgeAnchors(drawing: Drawing, bars: number, pixels: number, host: DrawingHost): readonly Anchor[] | null {
  const interval = host.barInterval();
  const anchors: Anchor[] = [];
  for (const anchor of drawing.anchors) {
    const here = anchorToPoint(anchor, host);
    const moved = pointToAnchor({ x: here.x, y: here.y + pixels }, anchor.yAxisId, host);
    if (moved === null) return null;
    anchors.push({ time: anchor.time + bars * interval, price: pixels === 0 ? anchor.price : moved.price, yAxisId: anchor.yAxisId });
  }
  return anchors;
}

/**
 * What an arrow key changes in a drawing: `nudgeAnchors` as a patch, or for a pane-anchored drawing its `options.position`
 * moved by `bars` bars and `pixels` px and clamped to the pane. Null when the pane is gone.
 *
 * @example
 * ```ts
 * const patch = nudgeDrawing(drawing, 1, 0, host);
 * ```
 */
export function nudgeDrawing(drawing: Drawing, bars: number, pixels: number, host: DrawingHost): DrawingPatch | null {
  if (isPaneKind(drawing.kind)) return paneShift(drawing, bars * barWidthPx(host), pixels, host);
  const anchors = nudgeAnchors(drawing, bars, pixels, host);
  return anchors === null ? null : { anchors };
}

/**
 * Where the keyboard cursor starts: the centre of the pane `yAxisId` (FR-INT-034, NFR-A11Y-001), or
 * null when the y-axis has no pane.
 *
 * @example
 * ```ts
 * let cursor = keyboardCursorStart('price', host); // when a tool is activated
 * ```
 */
export function keyboardCursorStart(yAxisId: string, host: DrawingHost): Point | null {
  const pane = host.paneRect(yAxisId);
  return pane === null ? null : { x: pane.x + pane.width / 2, y: pane.y + pane.height / 2 };
}

/**
 * The keyboard cursor moved `bars` bars right (negative: left) and `pixels` px down (negative:
 * up), kept inside the pane (`KEYBOARD_CURSOR_INSET_PX` from its edges). Null when the y-axis has
 * no pane.
 *
 * @example
 * ```ts
 * cursor = moveKeyboardCursor(cursor, effect.bars, effect.pixels, 'price', host) ?? cursor;
 * ```
 */
export function moveKeyboardCursor(cursor: Point, bars: number, pixels: number, yAxisId: string, host: DrawingHost): Point | null {
  const pane = host.paneRect(yAxisId);
  if (pane === null) return null;
  const time = host.xToTime(cursor.x);
  const pixelsPerBar = host.timeToX(time + host.barInterval()) - host.timeToX(time);
  const clamp = (value: number, from: number, size: number): number => Math.min(Math.max(value, from + KEYBOARD_CURSOR_INSET_PX), from + size - KEYBOARD_CURSOR_INSET_PX);
  return { x: clamp(cursor.x + bars * pixelsPerBar, pane.x, pane.width), y: clamp(cursor.y + pixels, pane.y, pane.height) };
}
