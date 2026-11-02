import { describe, expect, it } from 'vitest';
import { reduceInteraction } from '../src/interaction/machine';
import type { InteractionContext, InteractionEffect, InteractionInput, InteractionResult, InteractionState } from '../src/interaction/types';
import type { DrawingKind } from '../src/types';

const DRAWINGS = new Map<string, { kind: DrawingKind; locked: boolean }>([
  ['a', { kind: 'trend-line', locked: false }],
  ['b', { kind: 'rectangle', locked: false }],
  ['c', { kind: 'trend-line', locked: false }],
  ['lk', { kind: 'trend-line', locked: true }],
]);
const ctx: InteractionContext = { lookup: (id) => DRAWINGS.get(id) };

const idle = (hover: string | null = null): InteractionState => ({ type: 'idle', hover });
const selected = (ids: string[], hover: string | null = null): InteractionState => ({ type: 'selected', ids, hover });
const select = (...ids: string[]): InteractionInput => ({ type: 'select', ids });
const ctrl = (key: string): InteractionInput => ({ type: 'key', key, ctrl: true });

const step = (state: InteractionState, input: InteractionInput): InteractionResult => reduceInteraction(state, input, ctx);

function expectGo(state: InteractionState, input: InteractionInput, next: InteractionState, effects: InteractionEffect[] = []): void {
  expect(step(state, input)).toEqual({ state: next, effects, ignored: false });
}

function expectIgnored(state: InteractionState, input: InteractionInput): void {
  const result = step(state, input);
  expect(result.ignored).toBe(true);
  expect(result.state).toBe(state);
  expect(result.effects).toEqual([]);
}

const BUSY: InteractionState[] = [
  { type: 'placing', tool: 'rectangle' },
  { type: 'dragging-handle', drawingId: 'a', handle: 0, selection: ['a'] },
  { type: 'moving', ids: ['a'], selection: ['a'] },
  { type: 'editing-text', drawingId: 'a' },
];

describe('select (FR-INT-011, FR-INT-023)', () => {
  it('selects exactly the given drawings, in the given order', () => {
    expectGo(idle(), select('a', 'b'), selected(['a', 'b']));
    expectGo(selected(['a']), select('c', 'b'), selected(['c', 'b']));
  });

  it('keeps the hover', () => {
    expectGo(idle('a'), select('b'), selected(['b'], 'a'));
    expectGo(selected(['a'], 'c'), select('b'), selected(['b'], 'c'));
  });

  it('leaves out ids that do not exist and repeated ids', () => {
    expectGo(idle(), select('gone', 'a', 'a', 'b', 'gone'), selected(['a', 'b']));
  });

  it('goes idle when nothing is left to select', () => {
    expectGo(selected(['a'], 'b'), select(), idle('b'));
    expectGo(selected(['a']), select('gone'), idle());
  });

  it('returns the same state when the selection is the same', () => {
    for (const [state, input] of [
      [selected(['a', 'b'], 'c'), select('a', 'b')],
      [selected(['a', 'b']), select('a', 'gone', 'b', 'a')],
      [selected(['a']), select('a')],
      [idle('a'), select()],
      [idle(), select('gone')],
    ] as const) {
      const result = step(state, input);
      expect(result.state).toBe(state);
      expect(result.effects).toEqual([]);
      expect(result.ignored).toBe(false);
    }
  });

  it('changes the state when only the order, or only one end, differs', () => {
    expectGo(selected(['a', 'b']), select('b', 'a'), selected(['b', 'a']));
    expectGo(selected(['a', 'b']), select('a'), selected(['a']));
    expectGo(selected(['a']), select('a', 'b'), selected(['a', 'b']));
    expectGo(selected(['a', 'b']), select('a', 'c'), selected(['a', 'c']));
    expectGo(selected(['a', 'b']), select('c', 'b'), selected(['c', 'b']));
  });

  it.each(BUSY.map((state) => [state.type, state] as const))('is ignored in %s', (_name, state) => {
    expectIgnored(state, select('a'));
  });
});

describe('Ctrl/Cmd+A (FR-INT-023)', () => {
  it.each(['a', 'A'])('asks for every visible drawing in idle and selected with key %s', (letter) => {
    expectGo(idle('b'), ctrl(letter), idle('b'), [{ type: 'select-all' }]);
    expectGo(selected(['a'], 'b'), ctrl(letter), selected(['a'], 'b'), [{ type: 'select-all' }]);
  });

  it('returns the same state', () => {
    const state = selected(['a']);
    expect(step(state, ctrl('a')).state).toBe(state);
  });

  it('needs Ctrl or Cmd', () => {
    for (const state of [idle(), selected(['a'])]) {
      expectIgnored(state, { type: 'key', key: 'a' });
      expectIgnored(state, { type: 'key', key: 'a', ctrl: false });
    }
  });

  it('is ignored for other letters, and while busy', () => {
    expectIgnored(idle(), ctrl('b'));
    expectIgnored(selected(['a']), ctrl('b'));
    for (const state of BUSY) expectIgnored(state, ctrl('a'));
  });
});

describe('Ctrl/Cmd+D (FR-INT-024)', () => {
  it.each(['d', 'D'])('copies the selected drawings with key %s', (letter) => {
    expectGo(selected(['a', 'b'], 'c'), ctrl(letter), selected(['a', 'b'], 'c'), [{ type: 'duplicate', ids: ['a', 'b'] }]);
  });

  it('copies locked drawings too (the copies are unlocked)', () => {
    expectGo(selected(['lk', 'a']), ctrl('d'), selected(['lk', 'a']), [{ type: 'duplicate', ids: ['lk', 'a'] }]);
  });

  it('leaves out drawings that are gone and is ignored when none is left', () => {
    expectGo(selected(['gone', 'a']), ctrl('d'), selected(['gone', 'a']), [{ type: 'duplicate', ids: ['a'] }]);
    expectIgnored(selected(['gone']), ctrl('d'));
  });

  it('is ignored with nothing selected, without Ctrl, and while busy', () => {
    expectIgnored(idle(), ctrl('d'));
    expectIgnored(selected(['a']), { type: 'key', key: 'd' });
    expectIgnored(selected(['a']), { type: 'key', key: 'd', ctrl: false });
    expectIgnored(selected(['a']), ctrl('e'));
    for (const state of BUSY) expectIgnored(state, ctrl('d'));
  });

  it('does not take over Delete or Escape', () => {
    expectGo(selected(['a']), { type: 'key', key: 'Delete', ctrl: true }, idle(), [{ type: 'remove', ids: ['a'] }]);
    expectGo(selected(['a']), { type: 'key', key: 'Escape', ctrl: true }, idle());
  });
});
