import type { DrawingKind } from '../types';
import { SHIFT_STEP_FACTOR } from './move';
import type { InteractionContext, InteractionEffect, InteractionInput, InteractionResult, InteractionState } from './types';

const NO_EFFECTS: readonly InteractionEffect[] = Object.freeze([]);
const CANCEL_PLACEMENT: InteractionEffect = Object.freeze({ type: 'cancel-placement' });
const DRAG_REVERT: InteractionEffect = Object.freeze({ type: 'drag-revert' });
const SELECT_ALL: InteractionEffect = Object.freeze({ type: 'select-all' });
const KEYBOARD_PLACE: InteractionEffect = Object.freeze({ type: 'keyboard-place' });
const REMOVE_ANCHOR: InteractionEffect = Object.freeze({ type: 'remove-anchor' });
const HANDLE_PREFIX = 'handle:';

/** What each arrow key moves: bars right and pixels down. */
const ARROW_STEPS: ReadonlyMap<string, readonly [bars: number, pixels: number]> = new Map<string, readonly [bars: number, pixels: number]>([
  ['ArrowLeft', [-1, 0]],
  ['ArrowRight', [1, 0]],
  ['ArrowUp', [0, -1]],
  ['ArrowDown', [0, 1]],
]);

type Selected = Extract<InteractionState, { type: 'selected' }>;
type Idle = Extract<InteractionState, { type: 'idle' }>;
type Placing = Extract<InteractionState, { type: 'placing' }>;
type DraggingHandle = Extract<InteractionState, { type: 'dragging-handle' }>;
type Moving = Extract<InteractionState, { type: 'moving' }>;
type EditingText = Extract<InteractionState, { type: 'editing-text' }>;

const ignore = (state: InteractionState): InteractionResult => ({ state, effects: NO_EFFECTS, ignored: true });
const go = (state: InteractionState, effects: readonly InteractionEffect[] = NO_EFFECTS): InteractionResult => ({ state, effects, ignored: false });

/** `selected` for a non-empty selection, `idle` for an empty one. */
function selection(ids: readonly string[], hover: string | null): InteractionState {
  return ids.length === 0 ? { type: 'idle', hover } : { type: 'selected', ids, hover };
}

const exists = (ctx: InteractionContext, id: string): boolean => ctx.lookup(id) !== undefined;

/** Ctrl or Cmd with this letter (any case). */
const isShortcut = (input: Extract<InteractionInput, { type: 'key' }>, letter: string): boolean => input.ctrl === true && input.key.toLowerCase() === letter;

/** The bars and pixels an arrow key asks for, ten times as many with Shift; null for any other key and with Ctrl or Cmd. */
function arrowStep(input: Extract<InteractionInput, { type: 'key' }>): { readonly bars: number; readonly pixels: number } | null {
  const step = input.ctrl === true ? undefined : ARROW_STEPS.get(input.key);
  if (step === undefined) return null;
  const factor = input.shift === true ? SHIFT_STEP_FACTOR : 1;
  return { bars: step[0] * factor, pixels: step[1] * factor };
}

/** The existing drawings of `ids`, split into the unlocked and the locked ones; drawings that are gone are left out. */
function partitionByLock(ids: readonly string[], ctx: InteractionContext): { readonly unlocked: string[]; readonly locked: string[] } {
  const unlocked: string[] = [];
  const locked: string[] = [];
  for (const id of ids) {
    const drawing = ctx.lookup(id);
    if (drawing === undefined) continue;
    (drawing.locked ? locked : unlocked).push(id);
  }
  return { unlocked, locked };
}

/** Select exactly these drawings, those that exist, in the given order; the same state when that is the selection already. */
function select(state: Idle | Selected, ids: readonly string[], ctx: InteractionContext): InteractionResult {
  const wanted = [...new Set(ids)].filter((id) => exists(ctx, id));
  const current = state.type === 'selected' ? state.ids : [];
  const unchanged = wanted.length === current.length && wanted.every((id, index) => id === current[index]);
  return go(unchanged ? state : selection(wanted, state.hover));
}

/** The state after a drag ends: the selection that existed, without drawings that are gone. */
function afterDrag(ids: readonly string[], ctx: InteractionContext): InteractionState {
  return selection(
    ids.filter((id) => exists(ctx, id)),
    null
  );
}

function activate(state: InteractionState, tool: DrawingKind): InteractionResult {
  switch (state.type) {
    case 'idle':
    case 'selected':
      return go({ type: 'placing', tool });
    case 'placing':
      return go({ type: 'placing', tool }, [CANCEL_PLACEMENT]);
    default:
      return ignore(state);
  }
}

function startEditing(state: InteractionState, id: string, ctx: InteractionContext): InteractionResult {
  const drawing = ctx.lookup(id);
  if (drawing?.kind !== 'text-note' || drawing.locked) return ignore(state);
  return go({ type: 'editing-text', drawingId: id }, [{ type: 'edit-text', drawingId: id }]);
}

function reduceIdle(state: Idle, input: InteractionInput, ctx: InteractionContext): InteractionResult {
  switch (input.type) {
    case 'hover':
      return go(state.hover === input.id ? state : { type: 'idle', hover: input.id });
    case 'click':
      return input.button === 0 && input.target !== null ? go({ type: 'selected', ids: [input.target.id], hover: state.hover }) : ignore(state);
    case 'sync':
      return go(state.hover !== null && !exists(ctx, state.hover) ? { type: 'idle', hover: null } : state);
    case 'select':
      return select(state, input.ids, ctx);
    case 'key':
      return isShortcut(input, 'a') ? go(state, [SELECT_ALL]) : ignore(state);
    default:
      return ignore(state);
  }
}

function clickSelected(state: Selected, input: Extract<InteractionInput, { type: 'click' }>): InteractionResult {
  if (input.button !== 0) return ignore(state);
  const target = input.target;
  if (target === null) return go({ type: 'idle', hover: state.hover });
  if (!input.shiftKey) return go({ type: 'selected', ids: [target.id], hover: state.hover });
  const ids = state.ids.includes(target.id) ? state.ids.filter((id) => id !== target.id) : [...state.ids, target.id];
  return go(selection(ids, state.hover));
}

function removeSelected(state: Selected, ctx: InteractionContext): InteractionResult {
  const { unlocked, locked } = partitionByLock(state.ids, ctx);
  const effects: InteractionEffect[] = [];
  if (unlocked.length > 0) effects.push({ type: 'remove', ids: unlocked });
  if (locked.length > 0) effects.push({ type: 'blocked', ids: locked });
  return go(selection(locked, null), effects);
}

/** An arrow key: nudge the unlocked selected drawings and report the locked ones as blocked; ignored when none of them exists. */
function nudgeSelected(state: Selected, step: { readonly bars: number; readonly pixels: number }, ctx: InteractionContext): InteractionResult {
  const { unlocked, locked } = partitionByLock(state.ids, ctx);
  const effects: InteractionEffect[] = [];
  if (unlocked.length > 0) effects.push({ type: 'nudge', ids: unlocked, bars: step.bars, pixels: step.pixels });
  if (locked.length > 0) effects.push({ type: 'blocked', ids: locked });
  return effects.length === 0 ? ignore(state) : go(state, effects);
}

function startDrag(state: Selected, input: Extract<InteractionInput, { type: 'drag-start' }>, ctx: InteractionContext): InteractionResult {
  const target = input.target;
  if (target === null || !state.ids.includes(target.id)) return ignore(state);
  if (target.locked) return go(state, [{ type: 'blocked', ids: [target.id] }]);
  if (target.part.startsWith(HANDLE_PREFIX)) {
    const handle = Number(target.part.slice(HANDLE_PREFIX.length));
    return go({ type: 'dragging-handle', drawingId: target.id, handle, selection: state.ids }, [{ type: 'drag-start', mode: 'handle', drawingId: target.id, handle, origin: input.origin }]);
  }
  const { unlocked, locked } = partitionByLock(state.ids, ctx);
  const effects: InteractionEffect[] = [{ type: 'drag-start', mode: 'move', ids: unlocked, origin: input.origin }];
  if (locked.length > 0) effects.push({ type: 'blocked', ids: locked });
  return go({ type: 'moving', ids: unlocked, selection: state.ids }, effects);
}

function syncSelected(state: Selected, ctx: InteractionContext): InteractionResult {
  const ids = state.ids.filter((id) => exists(ctx, id));
  const hover = state.hover !== null && !exists(ctx, state.hover) ? null : state.hover;
  return go(ids.length === state.ids.length && hover === state.hover ? state : selection(ids, hover));
}

function reduceSelected(state: Selected, input: InteractionInput, ctx: InteractionContext): InteractionResult {
  switch (input.type) {
    case 'hover':
      return go(state.hover === input.id ? state : { type: 'selected', ids: state.ids, hover: input.id });
    case 'click':
      return clickSelected(state, input);
    case 'double-click':
      return input.target === null ? ignore(state) : startEditing(state, input.target.id, ctx);
    case 'drag-start':
      return startDrag(state, input, ctx);
    case 'sync':
      return syncSelected(state, ctx);
    case 'select':
      return select(state, input.ids, ctx);
    case 'key':
      return reduceSelectedKey(state, input, ctx);
    default:
      return ignore(state);
  }
}

/** Ctrl/Cmd+D: copy the selected drawings that still exist. */
function duplicateSelected(state: Selected, ctx: InteractionContext): InteractionResult {
  const ids = state.ids.filter((id) => exists(ctx, id));
  return ids.length === 0 ? ignore(state) : go(state, [{ type: 'duplicate', ids }]);
}

function reduceSelectedKey(state: Selected, input: Extract<InteractionInput, { type: 'key' }>, ctx: InteractionContext): InteractionResult {
  if (isShortcut(input, 'a')) return go(state, [SELECT_ALL]);
  if (isShortcut(input, 'd')) return duplicateSelected(state, ctx);
  const step = arrowStep(input);
  if (step !== null) return nudgeSelected(state, step, ctx);
  switch (input.key) {
    case 'Escape':
      return go({ type: 'idle', hover: state.hover });
    case 'Delete':
    case 'Backspace':
      return removeSelected(state, ctx);
    case 'Enter': {
      const [only, second] = state.ids;
      return only === undefined || second !== undefined ? ignore(state) : startEditing(state, only, ctx);
    }
    default:
      return ignore(state);
  }
}

/** While placing: Escape cancels; Enter and the arrow keys place with the keyboard cursor; Backspace takes the last placed anchor back. */
function reducePlacingKey(state: Placing, input: Extract<InteractionInput, { type: 'key' }>): InteractionResult {
  if (input.key === 'Escape') return go({ type: 'idle', hover: null }, [CANCEL_PLACEMENT]);
  if (input.key === 'Enter') return go(state, [KEYBOARD_PLACE]);
  if (input.key === 'Backspace') return go(state, [REMOVE_ANCHOR]);
  const step = arrowStep(input);
  return step === null ? ignore(state) : go(state, [{ type: 'keyboard-move', bars: step.bars, pixels: step.pixels }]);
}

function reducePlacing(state: Placing, input: InteractionInput): InteractionResult {
  switch (input.type) {
    case 'key':
      return reducePlacingKey(state, input);
    case 'click':
      return input.button === 2 ? go({ type: 'idle', hover: null }, [CANCEL_PLACEMENT]) : ignore(state);
    case 'placement-complete':
      return completePlacement(state, input);
    default:
      return ignore(state);
  }
}

/** The drawing exists: select it, or stay in the tool; a note opens its editor first and returns to the tool afterwards when staying. */
function completePlacement(state: Placing, input: Extract<InteractionInput, { type: 'placement-complete' }>): InteractionResult {
  if (input.edit !== true) return input.stay ? go(state) : go({ type: 'selected', ids: [input.id], hover: null });
  const editing: EditingText = input.stay ? { type: 'editing-text', drawingId: input.id, resume: state.tool } : { type: 'editing-text', drawingId: input.id };
  return go(editing, [{ type: 'edit-text', drawingId: input.id }]);
}

/** Shared by `dragging-handle` and `moving`: follow, commit, revert, or notice the drawings are gone. */
function reduceDrag(state: DraggingHandle | Moving, affected: readonly string[], selectionIds: readonly string[], input: InteractionInput, ctx: InteractionContext): InteractionResult {
  switch (input.type) {
    case 'drag':
      return go(state, [{ type: 'drag-update', point: input.point }]);
    case 'drag-end':
      return go(afterDrag(selectionIds, ctx), [{ type: 'drag-commit', point: input.point }]);
    case 'cancel':
      return go(afterDrag(selectionIds, ctx), [DRAG_REVERT]);
    case 'key':
      return input.key === 'Escape' ? go(afterDrag(selectionIds, ctx), [DRAG_REVERT]) : ignore(state);
    case 'sync':
      return affected.every((id) => exists(ctx, id)) ? go(state) : go(afterDrag(selectionIds, ctx), [DRAG_REVERT]);
    default:
      return ignore(state);
  }
}

/** Where editing ends: back in the tool the note was placed with, else `otherwise`. */
function afterEditing(state: EditingText, otherwise: InteractionState): InteractionState {
  return state.resume === undefined ? otherwise : { type: 'placing', tool: state.resume };
}

function reduceEditing(state: EditingText, input: InteractionInput, ctx: InteractionContext): InteractionResult {
  switch (input.type) {
    case 'edit-result':
      return go(
        afterEditing(state, { type: 'selected', ids: [state.drawingId], hover: null }),
        input.text === null ? NO_EFFECTS : [{ type: 'apply-text', drawingId: state.drawingId, text: input.text }]
      );
    case 'sync':
      return go(exists(ctx, state.drawingId) ? state : afterEditing(state, { type: 'idle', hover: null }));
    default:
      return ignore(state);
  }
}

/**
 * The interaction state machine of SDS 9.1 (FR-INT-001): a pure reducer. It never reads the host or
 * the store and never throws; an input that means nothing in the current state returns the same
 * state with `ignored: true` (log it at debug level). The caller carries out the effects.
 *
 * | State | Input | Next state (effects) |
 * |---|---|---|
 * | idle, selected | `activate` | placing |
 * | placing | `activate` | placing (`cancel-placement`) |
 * | placing | `deactivate`, Escape, right click | idle (`cancel-placement`) |
 * | placing | arrow keys, Enter | same (`keyboard-move`, `keyboard-place`) |
 * | placing | Backspace | same (`remove-anchor`) |
 * | placing | `placement-complete` | placing when `stay`, else selected; with `edit`: editing-text (`edit-text`), which returns to placing when `stay` |
 * | idle | left click on a drawing | selected |
 * | idle, selected | `select` | selected with those that exist (idle when none); the same state when unchanged |
 * | idle, selected | Ctrl/Cmd+A | same state (`select-all`: answer with a `select` of the visible drawings) |
 * | selected | Ctrl/Cmd+D | same state (`duplicate`: add the copies, answer with a `select` of them) |
 * | selected | click on a drawing; shift-click | selected (only it; toggled); a click on empty space is idle |
 * | selected | arrow keys (Shift: ten times as far) | same state (`nudge` the unlocked drawings one bar or one pixel, `blocked` the locked ones) |
 * | selected | Escape | idle |
 * | selected | Delete, Backspace | idle, or selected with the locked drawings (`remove`, `blocked`) |
 * | selected | drag from a handle of an unlocked selected drawing | dragging-handle (`drag-start`) |
 * | selected | drag from the body of a selected drawing | moving the unlocked selected drawings (`drag-start`, and `blocked` for the locked ones) |
 * | selected | drag from a locked drawing | selected (`blocked`) |
 * | selected | double-click, Enter on an unlocked text note | editing-text (`edit-text`) |
 * | dragging-handle, moving | `drag` | same (`drag-update`) |
 * | dragging-handle, moving | `drag-end` | selected (`drag-commit`) |
 * | dragging-handle, moving | `cancel` (pointer cancel or leave), Escape | selected (`drag-revert`) |
 * | editing-text | `edit-result` | selected, or placing when the note was placed with `stay` (`apply-text` unless cancelled with null) |
 *
 * `sync` after a store change drops selected, hovered and edited drawings that no longer exist (and
 * reverts a drag whose drawings are gone). `hover` only changes idle and selected.
 *
 * @example
 * ```ts
 * let state: InteractionState = IDLE_STATE;
 * const { state: next, effects, ignored } = reduceInteraction(state, { type: 'key', key: 'Escape' }, { lookup: (id) => lookupDrawing(id) });
 * state = next;
 * for (const effect of effects) perform(effect);
 * ```
 */
export function reduceInteraction(state: InteractionState, input: InteractionInput, ctx: InteractionContext): InteractionResult {
  if (input.type === 'activate') return activate(state, input.tool);
  if (input.type === 'deactivate') return state.type === 'placing' ? go({ type: 'idle', hover: null }, [CANCEL_PLACEMENT]) : ignore(state);
  switch (state.type) {
    case 'idle':
      return reduceIdle(state, input, ctx);
    case 'placing':
      return reducePlacing(state, input);
    case 'selected':
      return reduceSelected(state, input, ctx);
    case 'dragging-handle':
      return reduceDrag(state, [state.drawingId], state.selection, input, ctx);
    case 'moving':
      return reduceDrag(state, state.ids, state.selection, input, ctx);
    case 'editing-text':
      return reduceEditing(state, input, ctx);
  }
}
