import { describe, expect, it } from 'vitest';
import { GeometryCache } from '../src/hit/geometry-cache';
import { hitTest, type HitResult } from '../src/hit/hit-test';
import type { Point, PointerType } from '../src/host';
import { History } from '../src/history';
import { cursorFor, CursorSync } from '../src/interaction/cursor';
import { duplicateDrawing } from '../src/interaction/duplicate';
import { GestureRecogniser, type Gesture } from '../src/interaction/gesture';
import { reduceInteraction } from '../src/interaction/machine';
import { IDLE_STATE, type InteractionEffect, type InteractionInput, type InteractionResult, type InteractionState } from '../src/interaction/types';
import { DrawingStore } from '../src/store';
import { createMockHost } from '../src/testing/mock-host';
import type { Anchor, Drawing } from '../src/types';

// QA-005: selection scenarios on the mock host. A small stand-in for the controller (E04-F06) wires
// raw pointer and key events through the gesture recogniser, hit-testing, the state machine and
// the cursor mapping, and carries out the effects (remove, select-all, duplicate) on a store with
// history. The time of a point is x * 6000 and its price (400 - y) / 2.
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });

const DRAWINGS: Drawing[] = [
  { id: 'l', kind: 'trend-line', anchors: [A(100, 100), A(300, 100)] },
  { id: 'r', kind: 'rectangle', anchors: [A(400, 50), A(500, 150)], locked: true },
  { id: 'u', kind: 'rectangle', anchors: [A(600, 50), A(700, 150)] },
  { id: 'h', kind: 'horizontal-line', anchors: [A(200, 250)], hidden: true },
];

function driver(drawings: Drawing[] = DRAWINGS) {
  const host = createMockHost();
  const store = new DrawingStore(drawings);
  const history = new History(store);
  const cache = new GeometryCache(host, { store });
  const cursors = new CursorSync(host);
  const recogniser = new GestureRecogniser({ now: () => 0 });
  const blocked: (readonly string[])[] = [];
  let state: InteractionState = IDLE_STATE;
  let copies = 0;

  const ctx = {
    lookup: (id: string) => {
      const drawing = store.get(id);
      return drawing === undefined ? undefined : { kind: drawing.kind, locked: drawing.locked === true };
    },
  };
  const selection = (): readonly string[] => (state.type === 'selected' ? state.ids : []);
  const hitAt = (point: Point, pointerType: PointerType): HitResult | null =>
    hitTest(point, { drawings: store.list().filter((drawing) => drawing.hidden !== true), cache, selected: new Set(selection()), pointerType });

  const perform = (effect: InteractionEffect): void => {
    switch (effect.type) {
      case 'remove':
        store.batch(() => effect.ids.forEach((id) => store.remove(id)));
        break;
      case 'blocked':
        blocked.push(effect.ids);
        break;
      case 'select-all':
        apply({
          type: 'select',
          ids: store
            .list()
            .filter((drawing) => drawing.hidden !== true)
            .map((drawing) => drawing.id),
        });
        break;
      case 'duplicate': {
        const made: Drawing[] = [];
        for (const id of effect.ids) {
          const original = store.get(id);
          const copy = original === undefined ? null : duplicateDrawing(original, `copy-${++copies}`, host);
          if (copy !== null) made.push(copy);
        }
        store.batch(() => made.forEach((copy) => store.add(copy)));
        apply({ type: 'select', ids: made.map((copy) => copy.id) });
        break;
      }
      default:
        break;
    }
  };
  function apply(input: InteractionInput): InteractionResult {
    const result = reduceInteraction(state, input, ctx);
    state = result.state;
    result.effects.forEach(perform);
    return result;
  }

  const inputOf = (gesture: Gesture): InteractionInput => {
    switch (gesture.type) {
      case 'move': {
        const hit = hitAt(gesture.point, gesture.pointerType);
        const drawing = hit === null ? undefined : store.get(hit.id);
        cursors.set(cursorFor(state.type === 'placing' ? state.tool : null, hit, drawing, host));
        return { type: 'hover', id: hit?.id ?? null };
      }
      case 'click':
        return { type: 'click', button: gesture.button, shiftKey: gesture.shiftKey, target: hitAt(gesture.point, gesture.pointerType) };
      case 'leave':
        return { type: 'hover', id: null };
      default:
        return { type: 'cancel' };
    }
  };
  host.onPointer((event) => {
    for (const gesture of recogniser.handle(event)) apply(inputOf(gesture));
  });
  host.onKey((event) => !apply({ type: 'key', key: event.key, ctrl: event.ctrlKey || event.metaKey }).ignored);

  const tap = (x: number, y: number, extra: { shiftKey?: boolean } = {}): void => {
    host.pointer('down', x, y, extra);
    host.pointer('up', x, y, extra);
  };
  return {
    host,
    store,
    history,
    blocked,
    apply,
    tap,
    get state() {
      return state;
    },
  };
}

const ids = (state: InteractionState): readonly string[] => (state.type === 'selected' ? state.ids : []);
const listIds = (store: DrawingStore): string[] => store.list().map((drawing) => drawing.id);

describe('cursors (FR-INT-020)', () => {
  it('shows a pointer over a drawing, the default cursor over nothing, and calls the host only on a change', () => {
    const d = driver();
    d.host.pointer('move', 200, 100);
    d.host.pointer('move', 205, 100);
    d.host.pointer('move', 700, 380);
    d.host.pointer('move', 710, 380);
    d.host.pointer('move', 250, 100);
    expect(d.host.cursors).toEqual(['pointer', 'default', 'pointer']);
  });

  it('shows move over a handle of a selected line and a resize cursor over a corner of a selected rectangle', () => {
    const d = driver();
    d.tap(200, 100);
    d.host.pointer('move', 100, 100);
    expect(d.host.cursors[d.host.cursors.length - 1]).toBe('move');
    d.tap(650, 100);
    d.host.pointer('move', 600, 50);
    expect(d.host.cursors[d.host.cursors.length - 1]).toBe('nwse-resize');
  });

  it('shows not-allowed over a handle of a locked drawing', () => {
    const d = driver();
    d.tap(450, 100);
    d.host.pointer('move', 400, 50);
    expect(d.host.cursors[d.host.cursors.length - 1]).toBe('not-allowed');
  });

  it('shows a crosshair while a tool is active, over drawings too', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'trend-line' });
    d.host.pointer('move', 200, 100);
    d.host.pointer('move', 700, 380);
    expect(d.host.cursors).toEqual(['crosshair']);
  });
});

describe('Delete (FR-INT-022)', () => {
  it('removes the selected drawings in one history entry and undo brings them back', () => {
    const d = driver();
    d.tap(200, 100);
    d.tap(650, 100, { shiftKey: true });
    expect(ids(d.state)).toEqual(['l', 'u']);
    expect(d.host.key('Delete')).toBe(true);
    expect(listIds(d.store)).toEqual(['r', 'h']);
    expect(d.state.type).toBe('idle');
    expect(d.blocked).toEqual([]);
    expect(d.history.getState().undoDepth).toBe(1);
    d.history.undo();
    expect(listIds(d.store)).toEqual(['l', 'r', 'u', 'h']);
  });

  it('keeps locked drawings, keeps them selected and reports them as blocked', () => {
    const d = driver();
    d.tap(200, 100);
    d.tap(450, 100, { shiftKey: true });
    d.tap(650, 100, { shiftKey: true });
    d.host.key('Backspace');
    expect(listIds(d.store)).toEqual(['r', 'h']);
    expect(ids(d.state)).toEqual(['r']);
    expect(d.blocked).toEqual([['r']]);
    expect(d.history.getState().undoDepth).toBe(1);
  });

  it('changes nothing when only locked drawings are selected', () => {
    const d = driver();
    d.tap(450, 100);
    expect(d.host.key('Delete')).toBe(true);
    expect(listIds(d.store)).toEqual(['l', 'r', 'u', 'h']);
    expect(ids(d.state)).toEqual(['r']);
    expect(d.blocked).toEqual([['r']]);
    expect(d.history.getState().undoDepth).toBe(0);
  });

  it('is not handled when nothing is selected', () => {
    const d = driver();
    expect(d.host.key('Delete')).toBe(false);
    expect(d.host.key('Backspace')).toBe(false);
    expect(d.history.getState().undoDepth).toBe(0);
  });
});

describe('select all (FR-INT-023)', () => {
  it.each([{ ctrlKey: true }, { metaKey: true }])('selects every visible drawing with %o', (modifiers) => {
    const d = driver();
    expect(d.host.key('a', modifiers)).toBe(true);
    expect(ids(d.state)).toEqual(['l', 'r', 'u']);
    d.host.key('Escape');
    expect(d.host.key('A', modifiers)).toBe(true);
    expect(ids(d.state)).toEqual(['l', 'r', 'u']);
  });

  it('keeps the selection when everything is selected already, and does nothing without Ctrl', () => {
    const d = driver();
    d.host.key('a', { ctrlKey: true });
    const before = d.state;
    d.host.key('a', { ctrlKey: true });
    expect(d.state).toBe(before);
    expect(d.host.key('a')).toBe(false);
  });

  it('selects nothing in an empty store', () => {
    const d = driver([]);
    expect(d.host.key('a', { ctrlKey: true })).toBe(true);
    expect(d.state).toEqual({ type: 'idle', hover: null });
  });
});

describe('duplicate (FR-INT-024)', () => {
  it('adds the copies shifted by one bar and ten pixels, selects them and records one history entry', () => {
    const d = driver();
    d.tap(200, 100);
    d.tap(450, 100, { shiftKey: true });
    expect(d.host.key('d', { ctrlKey: true })).toBe(true);
    expect(listIds(d.store)).toEqual(['l', 'r', 'u', 'h', 'copy-1', 'copy-2']);
    expect(ids(d.state)).toEqual(['copy-1', 'copy-2']);
    expect(d.history.getState().undoDepth).toBe(1);
    const copy = d.store.get('copy-1');
    expect(copy?.anchors.map((anchor) => anchor.time)).toEqual([100 * 6000 + 60_000, 300 * 6000 + 60_000]);
    expect(copy?.anchors[0]?.price).toBeCloseTo((400 - 110) / 2, 9);
    expect(d.store.get('l')?.anchors).toEqual(DRAWINGS[0]?.anchors);
  });

  it('makes the copy of a locked drawing unlocked', () => {
    const d = driver();
    d.tap(450, 100);
    d.host.key('d', { metaKey: true });
    expect(d.store.get('r')?.locked).toBe(true);
    expect(d.store.get('copy-1')?.locked).toBe(false);
    expect(ids(d.state)).toEqual(['copy-1']);
  });

  it('undo removes all copies at once and redo brings them back', () => {
    const d = driver();
    d.tap(200, 100);
    d.tap(650, 100, { shiftKey: true });
    d.host.key('d', { ctrlKey: true });
    d.history.undo();
    expect(listIds(d.store)).toEqual(['l', 'r', 'u', 'h']);
    d.history.redo();
    expect(listIds(d.store)).toEqual(['l', 'r', 'u', 'h', 'copy-1', 'copy-2']);
  });

  it('is not handled when nothing is selected', () => {
    const d = driver();
    expect(d.host.key('d', { ctrlKey: true })).toBe(false);
    expect(d.history.getState().undoDepth).toBe(0);
  });
});
