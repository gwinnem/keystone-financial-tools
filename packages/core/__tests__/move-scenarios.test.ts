import { describe, expect, it } from 'vitest';
import { GeometryCache } from '../src/hit/geometry-cache';
import { hitTest, type HitResult } from '../src/hit/hit-test';
import type { Point, PointerType } from '../src/host';
import { History, type HistoryTransaction } from '../src/history';
import { GestureRecogniser, type Gesture } from '../src/interaction/gesture';
import { reduceInteraction } from '../src/interaction/machine';
import { dragHandle, keyboardCursorStart, moveDrawings, moveKeyboardCursor, nudgeAnchors } from '../src/interaction/move';
import { PLACEMENT_START, reducePlacement, type PlacementInput, type PlacementProgress } from '../src/interaction/placement';
import { IDLE_STATE, type InteractionEffect, type InteractionInput, type InteractionResult, type InteractionState } from '../src/interaction/types';
import { DrawingStore } from '../src/store';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import type { Anchor, Drawing } from '../src/types';

// QA-005: move, resize and nudge scenarios on the mock host. A small stand-in for the controller
// (E04-F06) wires raw pointer and key events through the gesture recogniser, hit-testing and the
// state machine, and carries out the drag, nudge and keyboard placement effects with the pure move
// functions and a history transaction. Time is x * 6000; a price pane pixel is half a price and a
// volume pane pixel is 10 volume.
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
const DRAWINGS: Drawing[] = [
  { id: 'l', kind: 'trend-line', anchors: [A(100, 100), A(300, 100)] },
  { id: 'r', kind: 'rectangle', anchors: [A(400, 50), A(500, 150)], locked: true },
  { id: 'u', kind: 'rectangle', anchors: [A(600, 50), A(700, 150)] },
  { id: 'v', kind: 'horizontal-line', anchors: [{ time: 150 * 6000, price: 500, yAxisId: 'volume' }] },
];

type Session = { readonly handle: number | null; readonly originals: readonly Drawing[]; readonly origin: Point; readonly tx: HistoryTransaction };

function driver() {
  const host = createMockHost({ panes: [DEFAULT_MOCK_PANE, { yAxisId: 'volume', top: 400, height: 100, min: 0, max: 1000 }] });
  const store = new DrawingStore(DRAWINGS);
  const clock = { t: 1000 };
  const history = new History(store, { now: () => clock.t });
  const cache = new GeometryCache(host, { store });
  const recogniser = new GestureRecogniser({ now: () => clock.t });
  const blocked: (readonly string[])[] = [];
  const notified: (readonly Drawing[])[] = [];
  store.subscribe((drawings) => notified.push(drawings));
  let state: InteractionState = IDLE_STATE;
  let progress: PlacementProgress = PLACEMENT_START;
  let cursor: Point | null = null;
  let session: Session | null = null;
  let shift = false;
  let created = 0;

  const ctx = {
    lookup: (id: string) => {
      const drawing = store.get(id);
      return drawing === undefined ? undefined : { kind: drawing.kind, locked: drawing.locked === true };
    },
  };
  const selection = (): readonly string[] => (state.type === 'selected' ? state.ids : state.type === 'dragging-handle' || state.type === 'moving' ? state.selection : []);
  const hitAt = (point: Point, pointerType: PointerType): HitResult | null => hitTest(point, { drawings: store.list(), cache, selected: new Set(selection()), pointerType });

  const originalsOf = (ids: readonly string[]): Drawing[] => ids.flatMap((id) => store.get(id) ?? []);
  const follow = (point: Point): void => {
    if (session === null) return;
    const current = session;
    store.batch(() => {
      if (current.handle !== null) {
        const [original] = current.originals;
        const anchors = original === undefined ? null : dragHandle(original, current.handle, current.origin, point, shift, host);
        if (original !== undefined && anchors !== null) store.update(original.id, { anchors });
      } else {
        for (const moved of moveDrawings(current.originals, current.origin, point, shift, host)) store.update(moved.id, { anchors: moved.anchors });
      }
    });
  };
  const place = (input: PlacementInput): void => {
    if (state.type !== 'placing') return;
    const tool = state.tool;
    const result = reducePlacement(tool, progress, input, host);
    progress = result.progress;
    if (result.anchors === null) return;
    const id = `d${++created}`;
    store.add({ id, kind: tool, anchors: result.anchors });
    apply({ type: 'placement-complete', id, stay: false });
  };
  const perform = (effect: InteractionEffect): void => {
    switch (effect.type) {
      case 'blocked':
        blocked.push(effect.ids);
        break;
      case 'drag-start':
        session =
          effect.mode === 'handle'
            ? { handle: effect.handle, originals: originalsOf([effect.drawingId]), origin: effect.origin, tx: history.transaction('drag') }
            : { handle: null, originals: originalsOf(effect.ids), origin: effect.origin, tx: history.transaction('drag') };
        break;
      case 'drag-update':
        follow(effect.point);
        break;
      case 'drag-commit':
        follow(effect.point);
        session?.tx.commit();
        session = null;
        break;
      case 'drag-revert':
        session?.tx.cancel();
        session = null;
        break;
      case 'nudge': {
        const tx = history.transaction('nudge');
        store.batch(() => {
          for (const id of effect.ids) {
            const drawing = store.get(id);
            const anchors = drawing === undefined ? null : nudgeAnchors(drawing, effect.bars, effect.pixels, host);
            if (anchors !== null) store.update(id, { anchors });
          }
        });
        tx.commit();
        break;
      }
      case 'keyboard-move':
        cursor = moveKeyboardCursor(cursor ?? keyboardCursorStart('price', host) ?? { x: 0, y: 0 }, effect.bars, effect.pixels, 'price', host);
        if (cursor !== null) place({ type: 'move', point: cursor });
        break;
      case 'keyboard-place':
        cursor ??= keyboardCursorStart('price', host);
        if (cursor !== null) place({ type: 'click', point: cursor, button: 0 });
        break;
      case 'cancel-placement':
        progress = PLACEMENT_START;
        cursor = null;
        break;
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

  const inputsOf = (gesture: Gesture): InteractionInput[] => {
    switch (gesture.type) {
      case 'move':
        return [{ type: 'hover', id: hitAt(gesture.point, gesture.pointerType)?.id ?? null }];
      case 'click':
        return [{ type: 'click', button: gesture.button, shiftKey: gesture.shiftKey, target: hitAt(gesture.point, gesture.pointerType) }];
      case 'drag-start':
        // The gesture carries the press origin and the current point: start at the origin, then follow to the point.
        return [
          { type: 'drag-start', origin: gesture.origin, target: hitAt(gesture.origin, gesture.pointerType) },
          { type: 'drag', point: gesture.point },
        ];
      case 'drag':
        return [{ type: 'drag', point: gesture.point }];
      case 'drag-end':
        return [{ type: 'drag-end', point: gesture.point }];
      case 'cancel':
        return [{ type: 'cancel' }];
      default:
        return [];
    }
  };
  host.onPointer((event) => {
    for (const gesture of recogniser.handle(event)) {
      if ('shiftKey' in gesture) shift = gesture.shiftKey;
      inputsOf(gesture).forEach(apply);
    }
  });
  host.onKey((event) => !apply({ type: 'key', key: event.key, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey }).ignored);

  const tap = (x: number, y: number): void => {
    clock.t += 1000;
    host.pointer('down', x, y);
    host.pointer('up', x, y);
  };
  return {
    host,
    store,
    history,
    clock,
    blocked,
    notified,
    apply,
    tap,
    get state() {
      return state;
    },
    get progress() {
      return progress;
    },
  };
}

type Driver = ReturnType<typeof driver>;
const anchorsOf = (d: Driver, id: string): readonly Anchor[] => d.store.get(id)?.anchors ?? [];
const original = (id: string): readonly Anchor[] => DRAWINGS.find((drawing) => drawing.id === id)?.anchors ?? [];
const selectedIds = (state: InteractionState): readonly string[] => (state.type === 'selected' ? state.ids : []);

describe('dragging a handle (FR-INT-030, FR-INT-032, FR-HI-003)', () => {
  it('moves one end of a trend line, with the whole drag as one history entry', () => {
    const d = driver();
    d.tap(200, 100);
    d.host.pointer('down', 300, 100);
    d.host.pointer('move', 320, 130);
    d.host.pointer('move', 330, 140);
    d.host.pointer('up', 330, 140);
    const [first, second] = anchorsOf(d, 'l');
    expect(first).toEqual(A(100, 100));
    expect(second?.time).toBe(330 * 6000);
    expect(second?.price).toBeCloseTo(130, 9);
    expect(d.history.getState().undoDepth).toBe(1);
    d.history.undo();
    expect(anchorsOf(d, 'l')).toEqual(original('l'));
    expect(selectedIds(d.state)).toEqual(['l']);
  });

  it('changes one coordinate with an edge handle of a rectangle', () => {
    const d = driver();
    d.tap(650, 100);
    // handle 4 is the middle of the x1 edge.
    d.host.pointer('down', 600, 100);
    d.host.pointer('move', 620, 130);
    d.host.pointer('up', 620, 130);
    const [first, second] = anchorsOf(d, 'u');
    expect(first?.time).toBe(620 * 6000);
    expect(first?.price).toBe(original('u')[0]?.price);
    expect(second).toEqual(original('u')[1]);
  });

  it('does not move a locked drawing and reports it as blocked', () => {
    const d = driver();
    d.tap(450, 100);
    d.host.pointer('down', 400, 50);
    d.host.pointer('move', 420, 90);
    d.host.pointer('move', 430, 100);
    d.host.pointer('up', 430, 100);
    expect(d.blocked).toEqual([['r']]);
    expect(anchorsOf(d, 'r')).toEqual(original('r'));
    expect(d.history.getState().undoDepth).toBe(0);
    expect(selectedIds(d.state)).toEqual(['r']);
  });
});

describe('moving the selection (FR-INT-030)', () => {
  it('moves the unlocked drawings by the same time delta and each pane’s own price delta, and reports the locked one once', () => {
    const d = driver();
    d.apply({ type: 'select', ids: ['l', 'r', 'u', 'v'] });
    d.host.pointer('down', 200, 100);
    d.host.pointer('move', 205, 110);
    d.host.pointer('move', 210, 120);
    d.host.pointer('up', 210, 120);
    // 10 px right is 60 000 ms; 20 px down is 10 price on the price pane and 200 volume on the volume pane.
    for (const id of ['l', 'u']) {
      anchorsOf(d, id).forEach((anchor, index) => {
        expect(anchor.time).toBe((original(id)[index]?.time ?? 0) + 60_000);
        expect(anchor.price).toBeCloseTo((original(id)[index]?.price ?? 0) - 10, 9);
      });
    }
    expect(anchorsOf(d, 'v')[0]?.time).toBe(150 * 6000 + 60_000);
    expect(anchorsOf(d, 'v')[0]?.price).toBeCloseTo(300, 9);
    expect(anchorsOf(d, 'r')).toEqual(original('r'));
    expect(d.blocked).toEqual([['r']]);
    expect(d.history.getState().undoDepth).toBe(1);
    expect(selectedIds(d.state)).toEqual(['l', 'r', 'u', 'v']);
  });
});

describe('Shift constraints (FR-INT-031)', () => {
  it('moves horizontally while Shift is held and freely again when it is released', () => {
    const d = driver();
    d.tap(200, 100);
    d.host.pointer('down', 200, 100);
    d.host.pointer('move', 260, 110, { shiftKey: true });
    expect(anchorsOf(d, 'l')[0]?.time).toBe(160 * 6000);
    expect(anchorsOf(d, 'l')[0]?.price).toBeCloseTo(150, 9);
    d.host.pointer('move', 262, 160);
    expect(anchorsOf(d, 'l')[0]?.time).toBe(162 * 6000);
    expect(anchorsOf(d, 'l')[0]?.price).toBeCloseTo(120, 9);
    d.host.pointer('up', 262, 160);
    expect(anchorsOf(d, 'l')[0]?.price).toBeCloseTo(120, 9);
  });

  it('moves vertically when the vertical delta is larger', () => {
    const d = driver();
    d.tap(200, 100);
    d.host.pointer('down', 200, 100);
    d.host.pointer('move', 210, 160, { shiftKey: true });
    d.host.pointer('up', 210, 160, { shiftKey: true });
    expect(anchorsOf(d, 'l')[0]?.time).toBe(100 * 6000);
    expect(anchorsOf(d, 'l')[0]?.price).toBeCloseTo(120, 9);
  });

  it('keeps a trend line to a multiple of 45 degrees while Shift is held on a handle', () => {
    const d = driver();
    d.tap(200, 100);
    d.host.pointer('down', 300, 100);
    d.host.pointer('move', 400, 140, { shiftKey: true });
    d.host.pointer('up', 400, 140, { shiftKey: true });
    const second = anchorsOf(d, 'l')[1];
    expect(second?.time).toBeCloseTo((100 + Math.hypot(300, 40)) * 6000, 4);
    expect(second?.price).toBeCloseTo(150, 9);
  });
});

describe('Escape reverts a drag (FR-INT-033)', () => {
  it('puts a handle drag back without a history entry', () => {
    const d = driver();
    d.tap(200, 100);
    d.host.pointer('down', 300, 100);
    d.host.pointer('move', 320, 130);
    expect(anchorsOf(d, 'l')[1]?.time).toBe(320 * 6000);
    expect(d.host.key('Escape')).toBe(true);
    expect(anchorsOf(d, 'l')).toEqual(original('l'));
    expect(d.history.getState()).toMatchObject({ undoDepth: 0, redoDepth: 0 });
    // What a listener saw last is the restored state, and the release afterwards changes nothing.
    expect(d.notified[d.notified.length - 1]?.find((drawing) => drawing.id === 'l')?.anchors).toEqual(original('l'));
    d.host.pointer('up', 320, 130);
    expect(anchorsOf(d, 'l')).toEqual(original('l'));
    expect(selectedIds(d.state)).toEqual(['l']);
  });

  it('puts a moved selection back', () => {
    const d = driver();
    d.apply({ type: 'select', ids: ['l', 'u'] });
    d.host.pointer('down', 200, 100);
    d.host.pointer('move', 230, 140);
    d.host.key('Escape');
    expect(anchorsOf(d, 'l')).toEqual(original('l'));
    expect(anchorsOf(d, 'u')).toEqual(original('u'));
    expect(d.history.getState().undoDepth).toBe(0);
  });

  it('reverts when the pointer is taken away', () => {
    const d = driver();
    d.tap(200, 100);
    d.host.pointer('down', 300, 100);
    d.host.pointer('move', 320, 130);
    d.host.pointer('cancel', 320, 130);
    expect(anchorsOf(d, 'l')).toEqual(original('l'));
    expect(d.history.getState().undoDepth).toBe(0);
  });
});

describe('arrow keys nudge (FR-INT-034, NFR-A11Y-001)', () => {
  it('moves the selection one bar or one pixel and merges quick nudges into one history entry', () => {
    const d = driver();
    d.tap(200, 100);
    expect(d.host.key('ArrowRight')).toBe(true);
    expect(anchorsOf(d, 'l')[0]?.time).toBe(100 * 6000 + 60_000);
    d.clock.t += 100;
    expect(d.host.key('ArrowRight')).toBe(true);
    expect(anchorsOf(d, 'l')[0]?.time).toBe(100 * 6000 + 120_000);
    expect(d.history.getState().undoDepth).toBe(1);
    d.clock.t += 600;
    d.host.key('ArrowUp');
    expect(anchorsOf(d, 'l')[0]?.price).toBeCloseTo(150.5, 9);
    expect(d.history.getState().undoDepth).toBe(2);
    d.history.undo();
    d.history.undo();
    expect(anchorsOf(d, 'l')).toEqual(original('l'));
  });

  it('goes ten times as far with Shift', () => {
    const d = driver();
    d.tap(200, 100);
    d.host.key('ArrowLeft', { shiftKey: true });
    expect(anchorsOf(d, 'l')[0]?.time).toBe(100 * 6000 - 600_000);
    d.clock.t += 1000;
    d.host.key('ArrowDown', { shiftKey: true });
    expect(anchorsOf(d, 'l')[1]?.price).toBeCloseTo(145, 9);
  });

  it('leaves a locked drawing, reports it, and does not handle the key when nothing is selected', () => {
    const d = driver();
    expect(d.host.key('ArrowLeft')).toBe(false);
    d.tap(450, 100);
    expect(d.host.key('ArrowLeft')).toBe(true);
    expect(d.blocked).toEqual([['r']]);
    expect(anchorsOf(d, 'r')).toEqual(original('r'));
    expect(d.history.getState().undoDepth).toBe(0);
  });

  it('moves the unlocked drawings of a mixed selection and reports the locked one', () => {
    const d = driver();
    d.apply({ type: 'select', ids: ['l', 'r'] });
    d.host.key('ArrowRight');
    expect(anchorsOf(d, 'l')[0]?.time).toBe(100 * 6000 + 60_000);
    expect(anchorsOf(d, 'r')).toEqual(original('r'));
    expect(d.blocked).toEqual([['r']]);
  });
});

describe('placing with the keyboard (FR-INT-034, NFR-A11Y-001)', () => {
  it('places two anchors with Enter and the arrow keys', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'trend-line' });
    expect(d.host.key('Enter')).toBe(true);
    // The first anchor is at the centre of the price pane.
    expect(d.progress).toMatchObject({ type: 'anchored', first: A(400, 200) });
    expect(d.host.key('ArrowRight')).toBe(true);
    expect(d.progress).toMatchObject({ type: 'anchored', pointer: A(410, 200) });
    d.host.key('ArrowRight', { shiftKey: true });
    expect(d.host.key('Enter')).toBe(true);
    expect(d.store.get('d1')?.kind).toBe('trend-line');
    expect(d.store.get('d1')?.anchors.map((anchor) => anchor.time)).toEqual([400 * 6000, 510 * 6000]);
    expect(d.state).toEqual({ type: 'selected', ids: ['d1'], hover: null });
    expect(d.history.getState().undoDepth).toBe(1);
  });

  it('places a one-anchor drawing at the centre with Enter', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'horizontal-line' });
    d.host.key('Enter');
    expect(d.store.get('d1')?.anchors).toEqual([A(400, 200)]);
  });

  it('cancels with Escape and starts at the centre again next time', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'trend-line' });
    d.host.key('ArrowDown', { shiftKey: true });
    d.host.key('Enter');
    expect(d.progress.type).toBe('anchored');
    expect(d.host.key('Escape')).toBe(true);
    expect(d.state.type).toBe('idle');
    expect(d.progress).toEqual(PLACEMENT_START);
    expect(d.store.get('d1')).toBeUndefined();
    d.apply({ type: 'activate', tool: 'trend-line' });
    d.host.key('Enter');
    expect(d.progress).toMatchObject({ type: 'anchored', first: A(400, 200) });
  });

  it('does not handle other keys while placing', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'trend-line' });
    expect(d.host.key('x')).toBe(false);
    expect(d.host.key('ArrowLeft', { ctrlKey: true })).toBe(false);
  });
});
