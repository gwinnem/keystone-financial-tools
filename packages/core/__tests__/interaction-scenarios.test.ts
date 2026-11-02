import { describe, expect, it } from 'vitest';
import { GeometryCache } from '../src/hit/geometry-cache';
import { hitTest, type HitResult } from '../src/hit/hit-test';
import type { Point, PointerType } from '../src/host';
import { GestureRecogniser, type Gesture } from '../src/interaction/gesture';
import { reduceInteraction } from '../src/interaction/machine';
import { IDLE_STATE, type InteractionEffect, type InteractionInput, type InteractionState } from '../src/interaction/types';
import { DrawingStore } from '../src/store';
import { createMockHost } from '../src/testing/mock-host';
import type { Anchor, Drawing } from '../src/types';

// QA-005: scenarios on the mock host: raw pointer and key events through the gesture recogniser,
// hit-testing and the state machine, with the effects collected.
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });

const DRAWINGS: Drawing[] = [
  { id: 'l', kind: 'trend-line', anchors: [A(100, 100), A(300, 100)] },
  { id: 'r', kind: 'rectangle', anchors: [A(400, 50), A(500, 150)], locked: true },
  { id: 'n', kind: 'text-note', anchors: [A(200, 300)], text: 'hello' },
];

function driver(drawings: Drawing[] = DRAWINGS) {
  const host = createMockHost();
  const store = new DrawingStore(drawings);
  const cache = new GeometryCache(host, { store });
  const recogniser = new GestureRecogniser({ now: () => clock.t });
  const clock = { t: 0 };
  const log: InteractionEffect[] = [];
  const ignored: InteractionInput[] = [];
  let state: InteractionState = IDLE_STATE;

  const ctx = {
    lookup: (id: string) => {
      const drawing = store.get(id);
      return drawing === undefined ? undefined : { kind: drawing.kind, locked: drawing.locked === true };
    },
  };
  const apply = (input: InteractionInput): void => {
    const result = reduceInteraction(state, input, ctx);
    state = result.state;
    log.push(...result.effects);
    if (result.ignored) ignored.push(input);
  };
  const selection = (): readonly string[] => (state.type === 'selected' ? state.ids : state.type === 'dragging-handle' || state.type === 'moving' ? state.selection : []);
  const hitAt = (point: Point, pointerType: PointerType): HitResult | null => hitTest(point, { drawings: store.list(), cache, selected: new Set(selection()), pointerType });

  const inputOf = (gesture: Gesture): InteractionInput => {
    switch (gesture.type) {
      case 'move':
        return { type: 'hover', id: hitAt(gesture.point, gesture.pointerType)?.id ?? null };
      case 'click':
        return { type: 'click', button: gesture.button, shiftKey: gesture.shiftKey, target: hitAt(gesture.point, gesture.pointerType) };
      case 'double-click':
        return { type: 'double-click', target: hitAt(gesture.point, gesture.pointerType) };
      case 'drag-start':
        return { type: 'drag-start', origin: gesture.origin, target: hitAt(gesture.origin, gesture.pointerType) };
      case 'drag':
        return { type: 'drag', point: gesture.point };
      case 'drag-end':
        return { type: 'drag-end', point: gesture.point };
      case 'cancel':
        return { type: 'cancel' };
      case 'leave':
        return { type: 'hover', id: null };
    }
  };
  host.onPointer((event) => {
    for (const gesture of recogniser.handle(event)) apply(inputOf(gesture));
  });
  host.onKey((event) => {
    apply({ type: 'key', key: event.key });
    return true;
  });

  const tap = (x: number, y: number, extra: { shiftKey?: boolean; button?: number } = {}): void => {
    host.pointer('down', x, y, extra);
    host.pointer('up', x, y, extra);
  };
  return {
    host,
    store,
    apply,
    log,
    ignored,
    clock,
    tap,
    get state() {
      return state;
    },
  };
}

const ids = (state: InteractionState): readonly string[] => (state.type === 'selected' ? state.ids : []);
const lastEffect = (log: readonly InteractionEffect[]): InteractionEffect | undefined => log[log.length - 1];

describe('hover and selection (FR-INT-020, FR-INT-021)', () => {
  it('follows the pointer over drawings', () => {
    const d = driver();
    d.host.pointer('move', 200, 100);
    expect(d.state).toEqual({ type: 'idle', hover: 'l' });
    d.host.pointer('move', 700, 380);
    expect(d.state).toEqual({ type: 'idle', hover: null });
    d.host.pointer('move', 200, 100);
    d.host.pointer('leave', 200, 100);
    expect(d.state).toEqual({ type: 'idle', hover: null });
  });

  it('selects on a click, adds with shift-click, narrows with a plain click and clears on empty space', () => {
    const d = driver();
    d.tap(200, 100);
    expect(ids(d.state)).toEqual(['l']);
    d.tap(450, 100, { shiftKey: true });
    expect(ids(d.state)).toEqual(['l', 'r']);
    d.tap(200, 100, { shiftKey: true });
    expect(ids(d.state)).toEqual(['r']);
    d.tap(210, 308);
    expect(ids(d.state)).toEqual(['n']);
    d.tap(700, 380);
    expect(d.state.type).toBe('idle');
  });

  it('does not select with the right button, and Escape clears the selection', () => {
    const d = driver();
    d.tap(200, 100, { button: 2 });
    expect(d.state.type).toBe('idle');
    d.tap(200, 100);
    d.host.key('Escape');
    expect(d.state.type).toBe('idle');
    expect(d.ignored).toHaveLength(1);
  });

  it('does not turn a press that moves a little into a drag (FR-INT-002)', () => {
    const d = driver();
    d.host.pointer('down', 200, 100);
    d.host.pointer('move', 201, 102);
    d.host.pointer('up', 202, 101);
    expect(ids(d.state)).toEqual(['l']);
  });
});

describe('dragging a handle (FR-INT-030, FR-INT-033)', () => {
  const grab = () => {
    const d = driver();
    d.tap(200, 100);
    d.host.pointer('down', 100, 100);
    d.host.pointer('move', 110, 100);
    return d;
  };

  it('starts on a handle of the selected drawing, follows and commits on up', () => {
    const d = grab();
    expect(d.state).toEqual({ type: 'dragging-handle', drawingId: 'l', handle: 0, selection: ['l'] });
    d.host.pointer('move', 130, 105);
    d.host.pointer('up', 130, 105);
    expect(d.state).toEqual({ type: 'selected', ids: ['l'], hover: null });
    expect(d.log).toEqual([
      { type: 'drag-start', mode: 'handle', drawingId: 'l', handle: 0, origin: { x: 100, y: 100 } },
      { type: 'drag-update', point: { x: 130, y: 105 } },
      { type: 'drag-commit', point: { x: 130, y: 105 } },
    ]);
  });

  it('reverts on Escape, and the rest of the gesture does nothing', () => {
    const d = grab();
    d.host.key('Escape');
    expect(d.state).toEqual({ type: 'selected', ids: ['l'], hover: null });
    expect(lastEffect(d.log)).toEqual({ type: 'drag-revert' });
    d.host.pointer('move', 150, 100);
    d.host.pointer('up', 150, 100);
    expect(d.log.filter((effect) => effect.type === 'drag-commit')).toEqual([]);
  });

  it('reverts when the pointer leaves the plot', () => {
    const d = grab();
    d.host.pointer('leave', 900, 100);
    expect(d.state.type).toBe('selected');
    expect(lastEffect(d.log)).toEqual({ type: 'drag-revert' });
  });

  it('reverts on pointer cancel', () => {
    const d = grab();
    d.host.pointer('cancel', 120, 100);
    expect(d.state.type).toBe('selected');
    expect(lastEffect(d.log)).toEqual({ type: 'drag-revert' });
  });
});

describe('moving (FR-INT-030)', () => {
  it('moves the selected unlocked drawings from a press on a body', () => {
    const d = driver();
    d.tap(200, 100);
    d.tap(450, 100, { shiftKey: true });
    d.host.pointer('down', 200, 100);
    d.host.pointer('move', 230, 100);
    expect(d.state).toEqual({ type: 'moving', ids: ['l'], selection: ['l', 'r'] });
    d.host.pointer('up', 260, 100);
    expect(d.state).toEqual({ type: 'selected', ids: ['l', 'r'], hover: null });
    expect(d.log).toEqual([
      { type: 'drag-start', mode: 'move', ids: ['l'], origin: { x: 200, y: 100 } },
      { type: 'drag-commit', point: { x: 260, y: 100 } },
    ]);
  });

  it('does not move a drawing that is not selected', () => {
    const d = driver();
    d.host.pointer('down', 200, 100);
    d.host.pointer('move', 230, 100);
    d.host.pointer('up', 230, 100);
    expect(d.state.type).toBe('idle');
    expect(d.log).toEqual([]);
  });

  it('refuses a locked drawing and reports it as blocked (FR-DM-005)', () => {
    const d = driver();
    d.tap(450, 100);
    d.host.pointer('down', 450, 100);
    d.host.pointer('move', 480, 100);
    d.host.pointer('up', 480, 100);
    expect(ids(d.state)).toEqual(['r']);
    expect(d.log).toEqual([{ type: 'blocked', ids: ['r'] }]);
  });

  it('reverts a move on Escape', () => {
    const d = driver();
    d.tap(200, 100);
    d.host.pointer('down', 200, 100);
    d.host.pointer('move', 230, 100);
    d.host.key('Escape');
    expect(d.state).toEqual({ type: 'selected', ids: ['l'], hover: null });
    expect(lastEffect(d.log)).toEqual({ type: 'drag-revert' });
  });

  it('keeps the drag when the store changes elsewhere, and reverts when its drawing is removed', () => {
    const d = driver();
    d.tap(200, 100);
    d.host.pointer('down', 200, 100);
    d.host.pointer('move', 230, 100);
    d.store.remove('n');
    d.apply({ type: 'sync' });
    expect(d.state.type).toBe('moving');
    d.store.remove('l');
    d.apply({ type: 'sync' });
    expect(d.state).toEqual({ type: 'idle', hover: null });
    expect(lastEffect(d.log)).toEqual({ type: 'drag-revert' });
  });
});

describe('delete (FR-INT-022)', () => {
  it('removes unlocked drawings and keeps the locked ones selected', () => {
    const d = driver();
    d.tap(200, 100);
    d.tap(450, 100, { shiftKey: true });
    d.host.key('Delete');
    expect(d.log).toEqual([
      { type: 'remove', ids: ['l'] },
      { type: 'blocked', ids: ['r'] },
    ]);
    expect(ids(d.state)).toEqual(['r']);
  });
});

describe('placing (FR-INT-011)', () => {
  it('is cancelled by Escape and by the right button', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'trend-line' });
    expect(d.state).toEqual({ type: 'placing', tool: 'trend-line' });
    d.host.key('Escape');
    expect(d.state.type).toBe('idle');
    d.apply({ type: 'activate', tool: 'rectangle' });
    d.tap(10, 10, { button: 2 });
    expect(d.state.type).toBe('idle');
    expect(d.log).toEqual([{ type: 'cancel-placement' }, { type: 'cancel-placement' }]);
  });

  it('selects the new drawing when placement completes', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'rectangle' });
    d.apply({ type: 'placement-complete', id: 'r', stay: false });
    expect(ids(d.state)).toEqual(['r']);
  });
});

describe('tools (FR-INT-010, FR-INT-013)', () => {
  it('starts a tool from a selection, switches tool while placing and deactivates', () => {
    const d = driver();
    d.tap(200, 100);
    d.apply({ type: 'activate', tool: 'rectangle' });
    expect(d.state).toEqual({ type: 'placing', tool: 'rectangle' });
    d.apply({ type: 'activate', tool: 'trend-line' });
    expect(d.state).toEqual({ type: 'placing', tool: 'trend-line' });
    d.apply({ type: 'deactivate' });
    expect(d.state).toEqual({ type: 'idle', hover: null });
    expect(d.log).toEqual([{ type: 'cancel-placement' }, { type: 'cancel-placement' }]);
  });

  it('stays in the tool when placement completes with stay', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'trend-line' });
    d.apply({ type: 'placement-complete', id: 'l', stay: true });
    expect(d.state).toEqual({ type: 'placing', tool: 'trend-line' });
    expect(d.log).toEqual([]);
  });
});

describe('delete with Backspace (FR-INT-022)', () => {
  it('removes the selected unlocked drawing and goes idle', () => {
    const d = driver();
    d.tap(200, 100);
    d.host.key('Backspace');
    expect(d.log).toEqual([{ type: 'remove', ids: ['l'] }]);
    expect(d.state).toEqual({ type: 'idle', hover: null });
  });
});

describe('dragging the handle of a locked drawing (FR-DM-005)', () => {
  it('is refused and reported as blocked, keeping the selection', () => {
    const d = driver();
    d.tap(450, 100);
    d.host.pointer('down', 400, 50);
    d.host.pointer('move', 430, 50);
    d.host.pointer('up', 430, 50);
    expect(ids(d.state)).toEqual(['r']);
    expect(d.log).toEqual([{ type: 'blocked', ids: ['r'] }]);
  });
});

describe('store changes (FR-ST-020)', () => {
  it('drops a hovered, a selected and an edited drawing that were removed', () => {
    const d = driver();
    d.host.pointer('move', 200, 100);
    expect(d.state).toEqual({ type: 'idle', hover: 'l' });
    d.store.remove('l');
    d.apply({ type: 'sync' });
    expect(d.state).toEqual({ type: 'idle', hover: null });

    d.tap(210, 308);
    d.tap(450, 100, { shiftKey: true });
    expect(ids(d.state)).toEqual(['n', 'r']);
    d.store.remove('r');
    d.apply({ type: 'sync' });
    expect(d.state).toEqual({ type: 'selected', ids: ['n'], hover: null });

    d.host.key('Enter');
    expect(d.state).toEqual({ type: 'editing-text', drawingId: 'n' });
    d.store.remove('n');
    d.apply({ type: 'sync' });
    expect(d.state).toEqual({ type: 'idle', hover: null });
  });
});

describe('editing text (FR-INT-050)', () => {
  it('ends without applying text when the edit is cancelled', () => {
    const d = driver();
    d.tap(210, 308);
    d.tap(210, 308);
    expect(d.state).toEqual({ type: 'editing-text', drawingId: 'n' });
    d.apply({ type: 'edit-result', text: null });
    expect(ids(d.state)).toEqual(['n']);
    expect(d.log).toEqual([{ type: 'edit-text', drawingId: 'n' }]);
  });

  it('starts on a double-click and ends with the edit result', () => {
    const d = driver();
    d.tap(210, 308);
    d.tap(210, 308);
    expect(d.state).toEqual({ type: 'editing-text', drawingId: 'n' });
    expect(d.log).toEqual([{ type: 'edit-text', drawingId: 'n' }]);
    d.apply({ type: 'edit-result', text: 'new' });
    expect(ids(d.state)).toEqual(['n']);
    expect(lastEffect(d.log)).toEqual({ type: 'apply-text', drawingId: 'n', text: 'new' });
  });

  it('is not a double-click when the clicks are too far apart in time', () => {
    const d = driver();
    d.tap(210, 308);
    d.clock.t = 1000;
    d.tap(210, 308);
    expect(ids(d.state)).toEqual(['n']);
  });

  it('starts on Enter, and ignores the pointer while editing', () => {
    const d = driver();
    d.tap(210, 308);
    d.host.key('Enter');
    expect(d.state.type).toBe('editing-text');
    d.tap(200, 100);
    d.host.key('Delete');
    expect(d.state.type).toBe('editing-text');
    expect(d.ignored.length).toBeGreaterThan(0);
  });
});
