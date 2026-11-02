import { describe, expect, it } from 'vitest';
import type { HitPart, HitResult } from '../src/hit/hit-test';
import { reduceInteraction } from '../src/interaction/machine';
import { IDLE_STATE, type InteractionContext, type InteractionEffect, type InteractionInput, type InteractionResult, type InteractionState } from '../src/interaction/types';
import type { DrawingKind } from '../src/types';

const DRAWINGS = new Map<string, { kind: DrawingKind; locked: boolean }>([
  ['a', { kind: 'trend-line', locked: false }],
  ['b', { kind: 'rectangle', locked: false }],
  ['c', { kind: 'trend-line', locked: false }],
  ['lk', { kind: 'trend-line', locked: true }],
  ['note', { kind: 'text-note', locked: false }],
  ['lnote', { kind: 'text-note', locked: true }],
]);
const ctx: InteractionContext = { lookup: (id) => DRAWINGS.get(id) };

const hit = (id: string, part: HitPart = 'body', locked = DRAWINGS.get(id)?.locked ?? false): HitResult => ({ id, part, locked });
const idle = (hover: string | null = null): InteractionState => ({ type: 'idle', hover });
const selected = (ids: string[], hover: string | null = null): InteractionState => ({ type: 'selected', ids, hover });
const placing = (tool: DrawingKind = 'trend-line'): InteractionState => ({ type: 'placing', tool });
const key = (name: string): InteractionInput => ({ type: 'key', key: name });
const click = (target: HitResult | null, extra: { button?: number; shiftKey?: boolean } = {}): InteractionInput => ({
  type: 'click',
  button: extra.button ?? 0,
  shiftKey: extra.shiftKey ?? false,
  target,
});
const dragStart = (target: HitResult | null): InteractionInput => ({ type: 'drag-start', origin: { x: 5, y: 6 }, target });
const sync: InteractionInput = { type: 'sync' };

function step(state: InteractionState, input: InteractionInput): InteractionResult {
  return reduceInteraction(state, input, ctx);
}

function expectGo(state: InteractionState, input: InteractionInput, next: InteractionState, effects: InteractionEffect[] = []): void {
  expect(step(state, input)).toEqual({ state: next, effects, ignored: false });
}

function expectIgnored(state: InteractionState, input: InteractionInput): void {
  const result = step(state, input);
  expect(result.ignored).toBe(true);
  expect(result.state).toBe(state);
  expect(result.effects).toEqual([]);
}

const ALL_INPUTS: InteractionInput[] = [
  { type: 'activate', tool: 'rectangle' },
  { type: 'deactivate' },
  { type: 'hover', id: 'a' },
  click(hit('a')),
  { type: 'double-click', target: hit('note') },
  dragStart(hit('a')),
  { type: 'drag', point: { x: 1, y: 2 } },
  { type: 'drag-end', point: { x: 1, y: 2 } },
  { type: 'cancel' },
  key('Escape'),
  key('Delete'),
  key('Enter'),
  { type: 'placement-complete', id: 'a', stay: false },
  { type: 'edit-result', text: 'x' },
  sync,
];

const ALL_STATES: InteractionState[] = [
  IDLE_STATE,
  placing(),
  selected(['a']),
  { type: 'dragging-handle', drawingId: 'a', handle: 0, selection: ['a'] },
  { type: 'moving', ids: ['a'], selection: ['a'] },
  { type: 'editing-text', drawingId: 'note' },
];

describe('the machine never throws and never returns something unusual (FR-INT-001)', () => {
  it.each(ALL_STATES.map((state) => [state.type, state] as const))('in %s every input gives a state, effects and a flag', (_name, state) => {
    for (const input of ALL_INPUTS) {
      const result = step(state, input);
      expect(typeof result.state.type).toBe('string');
      expect(Array.isArray(result.effects)).toBe(true);
      if (result.ignored) {
        expect(result.state).toBe(state);
        expect(result.effects).toEqual([]);
      }
    }
  });

  it('starts idle with nothing hovered, frozen', () => {
    expect(IDLE_STATE).toEqual({ type: 'idle', hover: null });
    expect(Object.isFrozen(IDLE_STATE)).toBe(true);
  });

  it('does not modify its input state', () => {
    const state = selected(['a', 'b'], 'a');
    const copy = JSON.stringify(state);
    step(state, click(hit('c'), { shiftKey: true }));
    step(state, key('Delete'));
    expect(JSON.stringify(state)).toBe(copy);
  });
});

describe('tools: activate and deactivate', () => {
  it('goes from idle and selected into placing', () => {
    expectGo(IDLE_STATE, { type: 'activate', tool: 'rectangle' }, placing('rectangle'));
    expectGo(selected(['a']), { type: 'activate', tool: 'fibonacci-fans' }, placing('fibonacci-fans'));
  });

  it('switches tool while placing and drops the placement in progress', () => {
    expectGo(placing('trend-line'), { type: 'activate', tool: 'rectangle' }, placing('rectangle'), [{ type: 'cancel-placement' }]);
  });

  it('is ignored during a drag and while editing', () => {
    expectIgnored({ type: 'dragging-handle', drawingId: 'a', handle: 0, selection: ['a'] }, { type: 'activate', tool: 'rectangle' });
    expectIgnored({ type: 'moving', ids: ['a'], selection: ['a'] }, { type: 'activate', tool: 'rectangle' });
    expectIgnored({ type: 'editing-text', drawingId: 'note' }, { type: 'activate', tool: 'rectangle' });
  });

  it('deactivates only while placing', () => {
    expectGo(placing(), { type: 'deactivate' }, idle(), [{ type: 'cancel-placement' }]);
    expectIgnored(IDLE_STATE, { type: 'deactivate' });
    expectIgnored(selected(['a']), { type: 'deactivate' });
    expectIgnored({ type: 'moving', ids: ['a'], selection: ['a'] }, { type: 'deactivate' });
  });
});

describe('idle', () => {
  it('follows the hover, keeping the state object when nothing changes', () => {
    expectGo(idle(), { type: 'hover', id: 'a' }, idle('a'));
    expectGo(idle('a'), { type: 'hover', id: null }, idle());
    const same = idle('a');
    expect(step(same, { type: 'hover', id: 'a' })).toEqual({ state: idle('a'), effects: [], ignored: false });
    expect(step(same, { type: 'hover', id: 'a' }).state).toBe(same);
  });

  it('selects the drawing under a left click and keeps the hover', () => {
    expectGo(idle('a'), click(hit('a')), selected(['a'], 'a'));
    expectGo(idle(), click(hit('lk')), selected(['lk']));
    expectGo(idle(), click(hit('a'), { shiftKey: true }), selected(['a']));
  });

  it('ignores clicks on nothing and other buttons', () => {
    expectIgnored(idle(), click(null));
    expectIgnored(idle(), click(hit('a'), { button: 2 }));
    expectIgnored(idle(), click(hit('a'), { button: 1 }));
  });

  it('ignores keys, drags and double-clicks', () => {
    for (const input of [
      key('Escape'),
      key('Delete'),
      key('Enter'),
      dragStart(hit('a')),
      { type: 'drag', point: { x: 1, y: 1 } } as const,
      { type: 'double-click', target: hit('note') } as const,
      { type: 'cancel' } as const,
    ]) {
      expectIgnored(idle(), input);
    }
  });

  it('forgets a hovered drawing that no longer exists, and keeps one that does', () => {
    expectGo(idle('gone'), sync, idle());
    const same = idle('a');
    expect(step(same, sync)).toEqual({ state: idle('a'), effects: [], ignored: false });
    expect(step(same, sync).state).toBe(same);
    expect(step(idle(), sync).state).toEqual(idle());
  });
});

describe('placing', () => {
  it('is cancelled by Escape and by the right button', () => {
    expectGo(placing(), key('Escape'), idle(), [{ type: 'cancel-placement' }]);
    expectGo(placing(), click(null, { button: 2 }), idle(), [{ type: 'cancel-placement' }]);
  });

  it('ignores other keys and left clicks (placement is handled by the placement inputs)', () => {
    expectIgnored(placing(), key('Delete'));
    expectIgnored(placing(), key('Enter'));
    expectIgnored(placing(), click(null));
    expectIgnored(placing(), click(null, { button: 1 }));
    expectIgnored(placing(), { type: 'hover', id: 'a' });
    expectIgnored(placing(), sync);
  });

  it('selects the new drawing when done, or stays in the tool', () => {
    expectGo(placing('rectangle'), { type: 'placement-complete', id: 'b', stay: false }, selected(['b']));
    expectGo(placing('rectangle'), { type: 'placement-complete', id: 'b', stay: true }, placing('rectangle'));
  });
});

describe('selected: selecting', () => {
  it('replaces the selection with a clicked drawing, also from a multi-selection', () => {
    expectGo(selected(['a'], 'b'), click(hit('b')), selected(['b'], 'b'));
    expectGo(selected(['a', 'b']), click(hit('a')), selected(['a']));
    expectGo(selected(['a']), click(hit('a')), selected(['a']));
  });

  it('toggles with shift: adds, and removes (the last one leaves selected)', () => {
    expectGo(selected(['a']), click(hit('b'), { shiftKey: true }), selected(['a', 'b']));
    expectGo(selected(['a', 'b'], 'a'), click(hit('a'), { shiftKey: true }), selected(['b'], 'a'));
    expectGo(selected(['a', 'b']), click(hit('b'), { shiftKey: true }), selected(['a']));
    expectGo(selected(['a'], 'a'), click(hit('a'), { shiftKey: true }), idle('a'));
  });

  it('clears the selection on a click on empty space, also with shift', () => {
    expectGo(selected(['a'], 'a'), click(null), idle('a'));
    expectGo(selected(['a', 'b']), click(null, { shiftKey: true }), idle());
  });

  it('ignores clicks of other buttons', () => {
    expectIgnored(selected(['a']), click(hit('b'), { button: 2 }));
    expectIgnored(selected(['a']), click(null, { button: 1 }));
  });

  it('follows the hover, keeping the object when nothing changes', () => {
    expectGo(selected(['a']), { type: 'hover', id: 'b' }, selected(['a'], 'b'));
    const same = selected(['a'], 'b');
    expect(step(same, { type: 'hover', id: 'b' }).state).toBe(same);
    expectGo(selected(['a'], 'b'), { type: 'hover', id: null }, selected(['a']));
  });

  it('is left by Escape, keeping the hover', () => {
    expectGo(selected(['a', 'b'], 'a'), key('Escape'), idle('a'));
  });

  it('ignores other inputs', () => {
    for (const input of [
      { type: 'drag', point: { x: 1, y: 1 } } as const,
      { type: 'drag-end', point: { x: 1, y: 1 } } as const,
      { type: 'cancel' } as const,
      key('x'),
      key('a'),
      { type: 'edit-result', text: 'x' } as const,
      { type: 'placement-complete', id: 'a', stay: true } as const,
    ]) {
      expectIgnored(selected(['a']), input);
    }
  });
});

describe('selected: delete (FR-INT-022)', () => {
  it.each(['Delete', 'Backspace'])('removes the unlocked drawings with %s and goes idle', (name) => {
    expectGo(selected(['a', 'b'], 'a'), key(name), idle(), [{ type: 'remove', ids: ['a', 'b'] }]);
  });

  it('keeps the locked drawings selected and reports them as blocked, after the removal', () => {
    expectGo(selected(['a', 'lk', 'b', 'lnote']), key('Delete'), selected(['lk', 'lnote']), [
      { type: 'remove', ids: ['a', 'b'] },
      { type: 'blocked', ids: ['lk', 'lnote'] },
    ]);
  });

  it('only reports blocked when everything is locked', () => {
    expectGo(selected(['lk']), key('Backspace'), selected(['lk']), [{ type: 'blocked', ids: ['lk'] }]);
  });

  it('skips drawings that no longer exist', () => {
    expectGo(selected(['gone', 'a']), key('Delete'), idle(), [{ type: 'remove', ids: ['a'] }]);
    expectGo(selected(['gone']), key('Delete'), idle());
  });
});

describe('selected: dragging a handle (FR-INT-030)', () => {
  it('starts from a handle of a selected unlocked drawing', () => {
    expectGo(selected(['a', 'b']), dragStart(hit('b', 'handle:3')), { type: 'dragging-handle', drawingId: 'b', handle: 3, selection: ['a', 'b'] }, [
      { type: 'drag-start', mode: 'handle', drawingId: 'b', handle: 3, origin: { x: 5, y: 6 } },
    ]);
    expectGo(selected(['a']), dragStart(hit('a', 'handle:0')), { type: 'dragging-handle', drawingId: 'a', handle: 0, selection: ['a'] }, [
      { type: 'drag-start', mode: 'handle', drawingId: 'a', handle: 0, origin: { x: 5, y: 6 } },
    ]);
    expectGo(selected(['a']), dragStart(hit('a', 'handle:12')), { type: 'dragging-handle', drawingId: 'a', handle: 12, selection: ['a'] }, [
      { type: 'drag-start', mode: 'handle', drawingId: 'a', handle: 12, origin: { x: 5, y: 6 } },
    ]);
  });

  it('is refused on a locked drawing, which is reported as blocked', () => {
    expectGo(selected(['lk']), dragStart(hit('lk', 'handle:1')), selected(['lk']), [{ type: 'blocked', ids: ['lk'] }]);
  });

  it('does not start from a drawing that is not selected, or from nothing', () => {
    expectIgnored(selected(['a']), dragStart(hit('b', 'handle:1')));
    expectIgnored(selected(['a']), dragStart(hit('b')));
    expectIgnored(selected(['a']), dragStart(null));
  });

  it('follows, commits and reverts', () => {
    const state: InteractionState = { type: 'dragging-handle', drawingId: 'a', handle: 1, selection: ['a', 'b'] };
    expectGo(state, { type: 'drag', point: { x: 7, y: 8 } }, state, [{ type: 'drag-update', point: { x: 7, y: 8 } }]);
    expectGo(state, { type: 'drag-end', point: { x: 9, y: 10 } }, selected(['a', 'b']), [{ type: 'drag-commit', point: { x: 9, y: 10 } }]);
    expectGo(state, key('Escape'), selected(['a', 'b']), [{ type: 'drag-revert' }]);
  });

  it('reverts on pointer cancel and leave, like Escape', () => {
    const state: InteractionState = { type: 'dragging-handle', drawingId: 'a', handle: 1, selection: ['a'] };
    expectGo(state, { type: 'cancel' }, selected(['a']), [{ type: 'drag-revert' }]);
  });

  it('ignores other keys and inputs', () => {
    const state: InteractionState = { type: 'dragging-handle', drawingId: 'a', handle: 1, selection: ['a'] };
    for (const input of [key('Delete'), key('Enter'), click(hit('b')), dragStart(hit('b')), { type: 'hover', id: 'b' } as const, { type: 'edit-result', text: null } as const]) {
      expectIgnored(state, input);
    }
  });

  it('keeps going on sync while the drawing exists, and reverts when it is gone', () => {
    const state: InteractionState = { type: 'dragging-handle', drawingId: 'a', handle: 1, selection: ['a', 'gone'] };
    expect(step({ ...state, selection: ['a', 'b'] }, sync)).toEqual({ state: { ...state, selection: ['a', 'b'] }, effects: [], ignored: false });
    expectGo({ type: 'dragging-handle', drawingId: 'gone', handle: 1, selection: ['gone', 'a'] }, sync, selected(['a']), [{ type: 'drag-revert' }]);
  });

  it('drops drawings that are gone from the selection it returns to', () => {
    const state: InteractionState = { type: 'dragging-handle', drawingId: 'a', handle: 1, selection: ['gone', 'a'] };
    expectGo(state, { type: 'drag-end', point: { x: 1, y: 1 } }, selected(['a']), [{ type: 'drag-commit', point: { x: 1, y: 1 } }]);
    expectGo({ type: 'dragging-handle', drawingId: 'gone', handle: 1, selection: ['gone'] }, key('Escape'), idle(), [{ type: 'drag-revert' }]);
  });
});

describe('selected: moving (FR-INT-030)', () => {
  it('starts from the body, a level or a label of a selected drawing and moves the unlocked selected drawings', () => {
    const expected = (ids: string[], selection: string[]): [InteractionState, InteractionEffect[]] => [
      { type: 'moving', ids, selection },
      [{ type: 'drag-start', mode: 'move', ids, origin: { x: 5, y: 6 } }],
    ];
    expectGo(selected(['a', 'lk', 'b']), dragStart(hit('a')), ...expected(['a', 'b'], ['a', 'lk', 'b']));
    expectGo(selected(['a']), dragStart(hit('a', 'level:0.5')), ...expected(['a'], ['a']));
    expectGo(selected(['a']), dragStart(hit('a', 'label')), ...expected(['a'], ['a']));
  });

  it('leaves out drawings that no longer exist', () => {
    expectGo(selected(['gone', 'a']), dragStart(hit('a')), { type: 'moving', ids: ['a'], selection: ['gone', 'a'] }, [{ type: 'drag-start', mode: 'move', ids: ['a'], origin: { x: 5, y: 6 } }]);
  });

  it('is refused from a locked drawing, even when others in the selection are not locked', () => {
    expectGo(selected(['a', 'lk']), dragStart(hit('lk')), selected(['a', 'lk']), [{ type: 'blocked', ids: ['lk'] }]);
  });

  it('follows, commits and reverts', () => {
    const state: InteractionState = { type: 'moving', ids: ['a'], selection: ['a', 'lk'] };
    expectGo(state, { type: 'drag', point: { x: 3, y: 4 } }, state, [{ type: 'drag-update', point: { x: 3, y: 4 } }]);
    expectGo(state, { type: 'drag-end', point: { x: 3, y: 4 } }, selected(['a', 'lk']), [{ type: 'drag-commit', point: { x: 3, y: 4 } }]);
    expectGo(state, key('Escape'), selected(['a', 'lk']), [{ type: 'drag-revert' }]);
    expectGo(state, { type: 'cancel' }, selected(['a', 'lk']), [{ type: 'drag-revert' }]);
  });

  it('ignores other keys', () => {
    expectIgnored({ type: 'moving', ids: ['a'], selection: ['a'] }, key('Delete'));
  });

  it('reverts when any moved drawing is gone, and keeps going when all exist', () => {
    const whole: InteractionState = { type: 'moving', ids: ['a', 'b'], selection: ['a', 'b'] };
    expect(step(whole, sync)).toEqual({ state: whole, effects: [], ignored: false });
    expectGo({ type: 'moving', ids: ['a', 'gone'], selection: ['a', 'gone', 'b'] }, sync, selected(['a', 'b']), [{ type: 'drag-revert' }]);
  });
});

describe('selected: editing text', () => {
  it('starts on a double-click on an unlocked text note', () => {
    expectGo(selected(['note']), { type: 'double-click', target: hit('note') }, { type: 'editing-text', drawingId: 'note' }, [{ type: 'edit-text', drawingId: 'note' }]);
  });

  it('starts on Enter with exactly one unlocked text note selected', () => {
    expectGo(selected(['note']), key('Enter'), { type: 'editing-text', drawingId: 'note' }, [{ type: 'edit-text', drawingId: 'note' }]);
  });

  it('does not start on anything else', () => {
    expectIgnored(selected(['a']), { type: 'double-click', target: hit('a') });
    expectIgnored(selected(['lnote']), { type: 'double-click', target: hit('lnote') });
    expectIgnored(selected(['note']), { type: 'double-click', target: null });
    expectIgnored(selected(['gone']), { type: 'double-click', target: hit('gone') });
    expectIgnored(selected(['a']), key('Enter'));
    expectIgnored(selected(['lnote']), key('Enter'));
    expectIgnored(selected(['note', 'a']), key('Enter'));
    expectIgnored(selected(['a', 'note']), key('Enter'));
    expectIgnored(selected(['note', 'note2']), key('Enter'));
    expectIgnored(selected(['gone']), key('Enter'));
  });

  it('ends with the new text, or with nothing when cancelled', () => {
    const state: InteractionState = { type: 'editing-text', drawingId: 'note' };
    expectGo(state, { type: 'edit-result', text: 'hello' }, selected(['note']), [{ type: 'apply-text', drawingId: 'note', text: 'hello' }]);
    expectGo(state, { type: 'edit-result', text: '' }, selected(['note']), [{ type: 'apply-text', drawingId: 'note', text: '' }]);
    expectGo(state, { type: 'edit-result', text: null }, selected(['note']));
  });

  it('ignores everything else while editing, Escape included (the editor handles it)', () => {
    const state: InteractionState = { type: 'editing-text', drawingId: 'note' };
    for (const input of [
      key('Escape'),
      key('Delete'),
      click(null),
      click(hit('a')),
      { type: 'cancel' } as const,
      dragStart(hit('a')),
      { type: 'hover', id: 'a' } as const,
      { type: 'drag', point: { x: 1, y: 1 } } as const,
    ]) {
      expectIgnored(state, input);
    }
  });

  it('goes idle on sync when the note is gone, and stays when it exists', () => {
    const state: InteractionState = { type: 'editing-text', drawingId: 'note' };
    expect(step(state, sync)).toEqual({ state, effects: [], ignored: false });
    expectGo({ type: 'editing-text', drawingId: 'gone' }, sync, idle());
  });
});

describe('selected: sync (FR-ST-020)', () => {
  it('drops ids and hover that no longer exist', () => {
    expectGo(selected(['a', 'gone', 'b'], 'gone'), sync, selected(['a', 'b']));
    expectGo(selected(['a', 'gone'], 'b'), sync, selected(['a'], 'b'));
    expectGo(selected(['gone', 'gone2'], 'a'), sync, idle('a'));
  });

  it('drops only the hover when every selected drawing still exists', () => {
    expectGo(selected(['a', 'b'], 'gone'), sync, selected(['a', 'b']));
  });

  it('keeps the state object when nothing changed', () => {
    const state = selected(['a', 'b'], 'a');
    expect(step(state, sync)).toEqual({ state, effects: [], ignored: false });
    expect(step(state, sync).state).toBe(state);
    const noHover = selected(['a']);
    expect(step(noHover, sync).state).toBe(noHover);
  });
});

describe('lookups: the context is asked only about drawings the state names', () => {
  function spyContext(): { spy: InteractionContext; asked: unknown[] } {
    const asked: unknown[] = [];
    return {
      asked,
      spy: {
        lookup: (id) => {
          asked.push(id);
          return DRAWINGS.get(id);
        },
      },
    };
  }

  it('does not look up a hover that is not there, in idle or in selected', () => {
    const { spy, asked } = spyContext();
    const noHover = idle();
    expect(reduceInteraction(noHover, sync, spy).state).toBe(noHover);
    expect(asked).toHaveLength(0);
    reduceInteraction(selected(['a']), sync, spy);
    expect(asked).toEqual(['a']);
  });

  it('does not look up anything on Enter without a selected drawing', () => {
    const { spy, asked } = spyContext();
    // The machine never makes an empty `selected` itself; it is a hand-built state.
    const empty = selected([]);
    const result = reduceInteraction(empty, key('Enter'), spy);
    expect(result.ignored).toBe(true);
    expect(result.state).toBe(empty);
    expect(asked).toHaveLength(0);
  });
});
