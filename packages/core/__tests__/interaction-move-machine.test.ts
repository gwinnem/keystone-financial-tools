import { describe, expect, it } from 'vitest';
import type { HitResult } from '../src/hit/hit-test';
import { reduceInteraction } from '../src/interaction/machine';
import { SHIFT_STEP_FACTOR } from '../src/interaction/move';
import type { InteractionContext, InteractionEffect, InteractionInput, InteractionResult, InteractionState } from '../src/interaction/types';
import type { DrawingKind } from '../src/types';

const DRAWINGS = new Map<string, { kind: DrawingKind; locked: boolean }>([
  ['a', { kind: 'trend-line', locked: false }],
  ['b', { kind: 'rectangle', locked: false }],
  ['lk', { kind: 'trend-line', locked: true }],
]);
const ctx: InteractionContext = { lookup: (id) => DRAWINGS.get(id) };

const idle: InteractionState = { type: 'idle', hover: null };
const selected = (ids: string[]): InteractionState => ({ type: 'selected', ids, hover: 'a' });
const placing: InteractionState = { type: 'placing', tool: 'trend-line' };
const arrow = (name: string, extra: { ctrl?: boolean; shift?: boolean } = {}): InteractionInput => ({ type: 'key', key: name, ...extra });
const step = (state: InteractionState, input: InteractionInput): InteractionResult => reduceInteraction(state, input, ctx);

function expectGo(state: InteractionState, input: InteractionInput, next: InteractionState, effects: InteractionEffect[]): void {
  expect(step(state, input)).toEqual({ state: next, effects, ignored: false });
}

function expectIgnored(state: InteractionState, input: InteractionInput): void {
  const result = step(state, input);
  expect(result.ignored).toBe(true);
  expect(result.state).toBe(state);
  expect(result.effects).toEqual([]);
}

const BUSY: InteractionState[] = [
  { type: 'dragging-handle', drawingId: 'a', handle: 0, selection: ['a'] },
  { type: 'moving', ids: ['a'], selection: ['a'] },
  { type: 'editing-text', drawingId: 'a' },
];

// What each arrow key asks for: [key, bars, pixels].
const ARROWS: [string, number, number][] = [
  ['ArrowLeft', -1, 0],
  ['ArrowRight', 1, 0],
  ['ArrowUp', 0, -1],
  ['ArrowDown', 0, 1],
];

describe('arrow keys nudge the selection (FR-INT-034)', () => {
  it.each(ARROWS)('%s nudges the unlocked selected drawings one bar or one pixel', (name, bars, pixels) => {
    const state = selected(['a', 'b']);
    expectGo(state, arrow(name), state, [{ type: 'nudge', ids: ['a', 'b'], bars, pixels }]);
    expect(step(state, arrow(name)).state).toBe(state);
  });

  it.each(ARROWS)('%s with Shift goes ten times as far', (name, bars, pixels) => {
    const state = selected(['a']);
    expectGo(state, arrow(name, { shift: true }), state, [{ type: 'nudge', ids: ['a'], bars: bars * SHIFT_STEP_FACTOR, pixels: pixels * SHIFT_STEP_FACTOR }]);
    expectGo(state, arrow(name, { shift: false }), state, [{ type: 'nudge', ids: ['a'], bars, pixels }]);
  });

  it('uses ten as the Shift factor', () => {
    expect(SHIFT_STEP_FACTOR).toBe(10);
  });

  it('leaves locked drawings where they are and reports them as blocked', () => {
    const state = selected(['a', 'lk', 'b']);
    expectGo(state, arrow('ArrowRight'), state, [
      { type: 'nudge', ids: ['a', 'b'], bars: 1, pixels: 0 },
      { type: 'blocked', ids: ['lk'] },
    ]);
  });

  it('only reports blocked when everything selected is locked', () => {
    const state = selected(['lk']);
    expectGo(state, arrow('ArrowDown'), state, [{ type: 'blocked', ids: ['lk'] }]);
  });

  it('skips drawings that are gone and is ignored when none is left', () => {
    expectGo(selected(['gone', 'a']), arrow('ArrowUp'), selected(['gone', 'a']), [{ type: 'nudge', ids: ['a'], bars: 0, pixels: -1 }]);
    expectIgnored(selected(['gone']), arrow('ArrowUp'));
    expectIgnored(selected([]), arrow('ArrowUp'));
  });

  it('is ignored with Ctrl or Cmd, for other keys, with nothing selected and while busy', () => {
    for (const [name] of ARROWS) {
      expectIgnored(selected(['a']), arrow(name, { ctrl: true }));
      expectIgnored(idle, arrow(name));
      for (const state of BUSY) expectIgnored(state, arrow(name));
    }
    expectIgnored(selected(['a']), arrow('Home'));
    expectIgnored(selected(['a']), arrow('a'));
  });
});

describe('placing with the keyboard (FR-INT-034, NFR-A11Y-001)', () => {
  it.each(ARROWS)('%s moves the keyboard cursor', (name, bars, pixels) => {
    expectGo(placing, arrow(name), placing, [{ type: 'keyboard-move', bars, pixels }]);
    expectGo(placing, arrow(name, { shift: true }), placing, [{ type: 'keyboard-move', bars: bars * SHIFT_STEP_FACTOR, pixels: pixels * SHIFT_STEP_FACTOR }]);
  });

  it('places an anchor with Enter, and keeps the state object', () => {
    expectGo(placing, arrow('Enter'), placing, [{ type: 'keyboard-place' }]);
    expect(step(placing, arrow('Enter')).state).toBe(placing);
  });

  it('is still cancelled by Escape', () => {
    expectGo(placing, arrow('Escape'), idle, [{ type: 'cancel-placement' }]);
  });

  it('ignores arrows with Ctrl or Cmd and other keys', () => {
    expectIgnored(placing, arrow('ArrowLeft', { ctrl: true }));
    expectIgnored(placing, arrow('Delete'));
    expectIgnored(placing, arrow('a'));
  });

  it('does not use Enter outside placing for it (a text note still edits on Enter)', () => {
    expectIgnored(idle, arrow('Enter'));
    for (const state of BUSY) expectIgnored(state, arrow('Enter'));
  });
});

describe('moving a mixed selection (FR-INT-030)', () => {
  const press: HitResult = { id: 'a', part: 'body', locked: false };
  const start = (): InteractionInput => ({ type: 'drag-start', origin: { x: 1, y: 2 }, target: press });

  it('reports the locked drawings once, with the start of the move', () => {
    expectGo(selected(['a', 'lk', 'b']), start(), { type: 'moving', ids: ['a', 'b'], selection: ['a', 'lk', 'b'] }, [
      { type: 'drag-start', mode: 'move', ids: ['a', 'b'], origin: { x: 1, y: 2 } },
      { type: 'blocked', ids: ['lk'] },
    ]);
  });

  it('does not report anything when nothing selected is locked, or for drawings that are gone', () => {
    expectGo(selected(['a', 'b']), start(), { type: 'moving', ids: ['a', 'b'], selection: ['a', 'b'] }, [{ type: 'drag-start', mode: 'move', ids: ['a', 'b'], origin: { x: 1, y: 2 } }]);
    expectGo(selected(['gone', 'a']), start(), { type: 'moving', ids: ['a'], selection: ['gone', 'a'] }, [{ type: 'drag-start', mode: 'move', ids: ['a'], origin: { x: 1, y: 2 } }]);
  });

  it('does not report the locked drawings again while the drag goes on', () => {
    const state: InteractionState = { type: 'moving', ids: ['a'], selection: ['a', 'lk'] };
    expectGo(state, { type: 'drag', point: { x: 3, y: 4 } }, state, [{ type: 'drag-update', point: { x: 3, y: 4 } }]);
    expectGo(state, { type: 'drag-end', point: { x: 3, y: 4 } }, { type: 'selected', ids: ['a', 'lk'], hover: null }, [{ type: 'drag-commit', point: { x: 3, y: 4 } }]);
  });
});
