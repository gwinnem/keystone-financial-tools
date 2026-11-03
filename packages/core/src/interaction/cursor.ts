import type { HitResult } from '../hit/hit-test';
import type { DrawingCursor, DrawingHost } from '../host';
import { anchorToPoint } from '../projection';
import type { Anchor, Drawing, DrawingKind } from '../types';

const HANDLE_PREFIX = 'handle:';

/** The first rectangle handle that is an edge midpoint: `handle:4` and `handle:5` are the x edges, `handle:6` and `handle:7` the y edges. */
const FIRST_EDGE_HANDLE = 4;
const LAST_X_EDGE_HANDLE = 5;
const RECTANGLE_ANCHORS = 2;

/**
 * The cursor of a rectangle handle: its corners show the diagonal they sit on, its edges the axis
 * they move along. `handle:0` and `handle:1` are opposite corners (anchor 1 and anchor 2), `handle:2`
 * and `handle:3` the other two, so which diagonal is which depends on the screen positions.
 */
function rectangleHandleCursor(drawing: Drawing, handle: number, host: DrawingHost): DrawingCursor {
  if (handle >= FIRST_EDGE_HANDLE) return handle <= LAST_X_EDGE_HANDLE ? 'ew-resize' : 'ns-resize';
  if (drawing.anchors.length < RECTANGLE_ANCHORS) return 'move';
  const [first, second] = drawing.anchors as readonly [Anchor, Anchor];
  const a = anchorToPoint(first, host);
  const b = anchorToPoint(second, host);
  const firstDiagonalIsNwse = (b.x - a.x) * (b.y - a.y) > 0;
  const onFirstDiagonal = handle < 2;
  return firstDiagonalIsNwse === onFirstDiagonal ? 'nwse-resize' : 'nesw-resize';
}

/**
 * The cursor to show for what is under the pointer (FR-INT-020):
 * - a tool is active: `crosshair`;
 * - nothing under the pointer: `default`;
 * - a handle of a locked drawing: `not-allowed`;
 * - anything of a horizontal line that is not locked (body, label or handle): `ns-resize`, as dragging it changes only its price;
 * - a body, level or label: `pointer`;
 * - a handle of Fibonacci time zones (not locked): `ew-resize`, as dragging it changes only a time (D-5);
 * - a rectangle handle: the resize cursor of its corner or edge; any other handle: `move`.
 *
 * @example
 * ```ts
 * const cursor = cursorFor(activeTool, hit, hit === null ? undefined : store.get(hit.id), host);
 * cursors.set(cursor);
 * ```
 */
export function cursorFor(tool: DrawingKind | null, hit: HitResult | null, drawing: Drawing | undefined, host: DrawingHost): DrawingCursor {
  if (tool !== null) return 'crosshair';
  if (hit === null) return 'default';
  const isHandle = hit.part.startsWith(HANDLE_PREFIX);
  if (isHandle && hit.locked) return 'not-allowed';
  if (drawing?.kind === 'horizontal-line' && !hit.locked) return 'ns-resize';
  if (!isHandle) return 'pointer';
  if (drawing?.kind === 'fibonacci-time-zones') return 'ew-resize';
  if (drawing === undefined || drawing.kind !== 'rectangle') return 'move';
  return rectangleHandleCursor(drawing, Number(hit.part.slice(HANDLE_PREFIX.length)), host);
}

/**
 * Passes cursors to `host.setCursor` only when they change (FR-INT-020), so a pointer that moves
 * over the same thing does not call the host on every event.
 *
 * @example
 * ```ts
 * const cursors = new CursorSync(host);
 * cursors.set('crosshair'); // calls host.setCursor
 * cursors.set('crosshair'); // does nothing
 * ```
 */
export class CursorSync {
  private current: DrawingCursor | null = null;

  constructor(private readonly host: Pick<DrawingHost, 'setCursor'>) {}

  /** Sets the cursor; returns true when the host was called. */
  set(cursor: DrawingCursor): boolean {
    if (cursor === this.current) return false;
    this.current = cursor;
    this.host.setCursor(cursor);
    return true;
  }

  /** Forgets the cursor shown, so the next `set` calls the host (after the host changed it itself). */
  reset(): void {
    this.current = null;
  }
}
