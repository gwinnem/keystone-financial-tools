import type { HitResult } from '../hit/hit-test';
import type { Point } from '../host';
import type { DrawingKind } from '../types';

/**
 * The interaction states of SDS 9.1. `hover` is the id of the drawing under the pointer.
 * - `idle`: nothing selected, no tool.
 * - `placing`: a drawing tool is active.
 * - `selected`: one or more drawings are selected (`ids`, in selection order).
 * - `dragging-handle`: a handle of `drawingId` is being dragged; `selection` is restored afterwards.
 * - `moving`: the unlocked selected drawings `ids` are being moved; `selection` is restored afterwards.
 * - `editing-text`: the text of the note `drawingId` is being edited; `resume` is the tool to return to afterwards when the note was placed with `stayInTool` (otherwise the note is selected).
 */
export type InteractionState =
  | { readonly type: 'idle'; readonly hover: string | null }
  | { readonly type: 'placing'; readonly tool: DrawingKind }
  | { readonly type: 'selected'; readonly ids: readonly string[]; readonly hover: string | null }
  | { readonly type: 'dragging-handle'; readonly drawingId: string; readonly handle: number; readonly selection: readonly string[] }
  | { readonly type: 'moving'; readonly ids: readonly string[]; readonly selection: readonly string[] }
  | { readonly type: 'editing-text'; readonly drawingId: string; readonly resume?: DrawingKind };

/**
 * The start state.
 *
 * @example
 * ```ts
 * let state: InteractionState = IDLE_STATE;
 * ```
 */
export const IDLE_STATE: InteractionState = Object.freeze({ type: 'idle', hover: null });

/**
 * What drives the machine. Pointer input arrives as gestures (`GestureRecogniser`) that the caller
 * has resolved with `hitTest`: `target` is what was under the click, or under the press for a drag.
 * - `select`: select exactly these drawings (the API, or the answer to a `select-all` or `duplicate` effect); ids that do not exist are dropped.
 * - `key`: `ctrl` is true when Ctrl or Cmd is held.
 * - `placement-complete`: the drawing `id` was created; `stay` is the `stayInTool` option and `edit` asks for the text editor (a text note, FR-INT-050).
 * - `sync`: the store changed; drop what no longer exists.
 */
export type InteractionInput =
  | { readonly type: 'activate'; readonly tool: DrawingKind }
  | { readonly type: 'deactivate' }
  | { readonly type: 'hover'; readonly id: string | null }
  | { readonly type: 'click'; readonly button: number; readonly shiftKey: boolean; readonly target: HitResult | null }
  | { readonly type: 'double-click'; readonly target: HitResult | null }
  | { readonly type: 'drag-start'; readonly origin: Point; readonly target: HitResult | null }
  | { readonly type: 'drag'; readonly point: Point }
  | { readonly type: 'drag-end'; readonly point: Point }
  | { readonly type: 'cancel' }
  | { readonly type: 'select'; readonly ids: readonly string[] }
  | { readonly type: 'key'; readonly key: string; readonly ctrl?: boolean }
  | { readonly type: 'placement-complete'; readonly id: string; readonly stay: boolean; readonly edit?: boolean }
  | { readonly type: 'edit-result'; readonly text: string | null }
  | { readonly type: 'sync' };

/**
 * What the caller does in response; the machine itself changes nothing.
 * - `remove`: delete these drawings (one history entry).
 * - `blocked`: these locked drawings were asked to change (`KFT-E-LOCKED`).
 * - `drag-start` / `drag-update` / `drag-commit` / `drag-revert`: a handle or move drag begins, follows the pointer, ends or is undone.
 * - `edit-text`: open the text editor for the note; `apply-text`: store its new text.
 * - `cancel-placement`: drop the drawing being placed.
 * - `select-all`: answer with a `select` of every visible drawing (Ctrl/Cmd+A).
 * - `duplicate`: copy these drawings (`duplicateDrawing`), add the copies in one change and answer with a `select` of them (Ctrl/Cmd+D).
 */
export type InteractionEffect =
  | { readonly type: 'remove'; readonly ids: readonly string[] }
  | { readonly type: 'blocked'; readonly ids: readonly string[] }
  | { readonly type: 'drag-start'; readonly mode: 'handle'; readonly drawingId: string; readonly handle: number; readonly origin: Point }
  | { readonly type: 'drag-start'; readonly mode: 'move'; readonly ids: readonly string[]; readonly origin: Point }
  | { readonly type: 'drag-update'; readonly point: Point }
  | { readonly type: 'drag-commit'; readonly point: Point }
  | { readonly type: 'drag-revert' }
  | { readonly type: 'edit-text'; readonly drawingId: string }
  | { readonly type: 'apply-text'; readonly drawingId: string; readonly text: string }
  | { readonly type: 'cancel-placement' }
  | { readonly type: 'select-all' }
  | { readonly type: 'duplicate'; readonly ids: readonly string[] };

/** What the machine needs to know about the drawings; supplied by the caller from the store. */
export interface InteractionContext {
  /** The kind and lock flag of a drawing, or undefined when it does not exist. */
  lookup(id: string): { readonly kind: DrawingKind; readonly locked: boolean } | undefined;
}

/** The outcome of one input: the next state, what to do, and whether the input meant nothing in this state. */
export interface InteractionResult {
  readonly state: InteractionState;
  readonly effects: readonly InteractionEffect[];
  /** True when the input does not apply in this state: nothing changed and there are no effects (log at debug level). */
  readonly ignored: boolean;
}
