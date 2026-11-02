import { describe, expect, it } from 'vitest';
import { History } from '../src/history';
import { GestureRecogniser, type Gesture } from '../src/interaction/gesture';
import { reduceInteraction } from '../src/interaction/machine';
import { PLACEMENT_START, placementPreview, reducePlacement, type PlacementInput, type PlacementProgress } from '../src/interaction/placement';
import { IDLE_STATE, type InteractionEffect, type InteractionInput, type InteractionState } from '../src/interaction/types';
import { ANCHOR_COUNT } from '../src/kinds';
import { DrawingStore } from '../src/store';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import { validateDrawing } from '../src/validate';
import type { Anchor, Drawing, DrawingKind } from '../src/types';

// QA-005: placement scenarios on the mock host. A small stand-in for the controller (E04-F06) wires
// raw pointer and key events through the gesture recogniser, `reducePlacement` and
// `reduceInteraction`, and creates the drawing in the store when placement reports its anchors.
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });

function driver(options: { stay?: boolean } = {}) {
  const host = createMockHost({ panes: [DEFAULT_MOCK_PANE, { yAxisId: 'volume', top: 400, height: 100, min: 0, max: 1000 }] });
  const store = new DrawingStore();
  const history = new History(store);
  const clock = { t: 0 };
  const recogniser = new GestureRecogniser({ now: () => clock.t });
  const log: InteractionEffect[] = [];
  const settings = { stay: options.stay ?? false };
  let state: InteractionState = IDLE_STATE;
  let progress: PlacementProgress = PLACEMENT_START;
  let created = 0;
  let storeChanges = 0;
  store.subscribe(() => storeChanges++);

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
    if (result.effects.some((effect) => effect.type === 'cancel-placement')) progress = PLACEMENT_START;
  };
  const place = (tool: DrawingKind, inputs: readonly PlacementInput[]): void => {
    for (const input of inputs) placeOne(tool, input);
  };
  const placeOne = (tool: DrawingKind, input: PlacementInput): void => {
    const result = reducePlacement(tool, progress, input, host);
    progress = result.progress;
    if (result.anchors === null) return;
    const id = `d${++created}`;
    const drawing: Drawing = { id, kind: tool, anchors: result.anchors };
    store.add(drawing);
    apply({ type: 'placement-complete', id, stay: settings.stay, edit: tool === 'text-note' });
  };
  // A drag-start gesture carries the pointer's current position as well as where it went down:
  // the stand-in passes both, a drag-start and then a drag to the current position.
  const placementInputs = (gesture: Gesture): readonly PlacementInput[] => {
    switch (gesture.type) {
      case 'move':
        return [{ type: 'move', point: gesture.point }];
      case 'click':
        return [{ type: 'click', point: gesture.point, button: gesture.button }];
      case 'drag-start':
        return [
          { type: 'drag-start', origin: gesture.origin, button: gesture.button },
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
  const machineInput = (gesture: Gesture): InteractionInput | null => (gesture.type === 'click' ? { type: 'click', button: gesture.button, shiftKey: gesture.shiftKey, target: null } : null);

  host.onPointer((event) => {
    for (const gesture of recogniser.handle(event)) {
      const wasPlacing = state.type === 'placing' ? state.tool : null;
      const forMachine = machineInput(gesture);
      if (forMachine !== null) apply(forMachine);
      // The machine decides first: a right click that cancels the placement is not also a placement input.
      if (wasPlacing !== null && state.type === 'placing') place(wasPlacing, placementInputs(gesture));
    }
  });
  host.onKey((event) => {
    apply({ type: 'key', key: event.key });
    return true;
  });

  const tap = (x: number, y: number, button = 0): void => {
    clock.t += 1000;
    host.pointer('down', x, y, { button });
    host.pointer('up', x, y, { button });
  };
  return {
    host,
    store,
    history,
    log,
    settings,
    apply,
    tap,
    get state() {
      return state;
    },
    get progress() {
      return progress;
    },
    get storeChanges() {
      return storeChanges;
    },
    preview: () => (state.type === 'placing' ? placementPreview(state.tool, progress, 'preview') : null),
  };
}

const kinds = (d: { store: DrawingStore }): string[] => d.store.list().map((drawing) => drawing.kind);

describe('one-anchor placement (FR-INT-010)', () => {
  it('places a horizontal line with one click as one store change and one history entry', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'horizontal-line' });
    d.tap(200, 100);
    expect(d.store.list()).toEqual([{ id: 'd1', kind: 'horizontal-line', anchors: [A(200, 100)] }]);
    expect(d.storeChanges).toBe(1);
    expect(d.history.getState().undoDepth).toBe(1);
    expect(d.state).toEqual({ type: 'selected', ids: ['d1'], hover: null });
  });

  it('places in the pane under the pointer', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'horizontal-line' });
    d.tap(200, 450);
    expect(d.store.list()[0]?.anchors[0]?.yAxisId).toBe('volume');
  });

  it('opens the text editor right after a note is placed (FR-INT-050)', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'text-note' });
    d.tap(300, 200);
    expect(kinds(d)).toEqual(['text-note']);
    expect(d.state).toEqual({ type: 'editing-text', drawingId: 'd1' });
    expect(d.log).toContainEqual({ type: 'edit-text', drawingId: 'd1' });
    d.apply({ type: 'edit-result', text: 'support' });
    expect(d.log).toContainEqual({ type: 'apply-text', drawingId: 'd1', text: 'support' });
    expect(d.state).toEqual({ type: 'selected', ids: ['d1'], hover: null });
  });
});

describe('two-anchor placement (FR-INT-011, FR-INT-012)', () => {
  it('places by click, move, click with a preview that follows the pointer', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'trend-line' });
    expect(d.preview()).toBeNull();
    d.tap(100, 100);
    expect(d.store.list()).toEqual([]);
    expect(d.preview()?.anchors).toEqual([A(100, 100), A(100, 100)]);
    d.host.pointer('move', 250, 160);
    expect(d.preview()?.anchors).toEqual([A(100, 100), A(250, 160)]);
    d.host.pointer('move', 300, 150);
    expect(d.preview()?.anchors).toEqual([A(100, 100), A(300, 150)]);
    d.tap(300, 150);
    expect(d.store.list()).toEqual([{ id: 'd1', kind: 'trend-line', anchors: [A(100, 100), A(300, 150)] }]);
    expect(d.storeChanges).toBe(1);
    expect(d.history.getState().undoDepth).toBe(1);
    expect(d.state).toEqual({ type: 'selected', ids: ['d1'], hover: null });
    expect(d.progress).toBe(PLACEMENT_START);
  });

  it('places by pressing, dragging and releasing', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'rectangle' });
    d.host.pointer('down', 100, 100);
    d.host.pointer('move', 200, 120);
    expect(d.preview()?.anchors).toEqual([A(100, 100), A(200, 120)]);
    d.host.pointer('move', 300, 150);
    d.host.pointer('up', 300, 150);
    expect(d.store.list()).toEqual([{ id: 'd1', kind: 'rectangle', anchors: [A(100, 100), A(300, 150)] }]);
    expect(d.storeChanges).toBe(1);
    expect(d.history.getState().undoDepth).toBe(1);
  });

  it('puts the second anchor on the first anchor axis when the pointer is over another pane', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'trend-line' });
    d.tap(100, 100);
    d.host.pointer('move', 300, 450);
    expect(d.preview()?.anchors[1]).toEqual({ time: 300 * 6000, price: -25, yAxisId: 'price' });
    d.tap(300, 450);
    const drawing = d.store.list()[0];
    expect(drawing?.anchors.map((anchor) => anchor.yAxisId)).toEqual(['price', 'price']);
    expect(validateDrawing(drawing)).toEqual([]);
  });

  it('creates nothing when the second anchor is within a pixel of the first, in either mode', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'trend-line' });
    d.tap(100, 100);
    d.tap(100.5, 100.5);
    expect(d.store.list()).toEqual([]);
    expect(d.progress.type).toBe('anchored');
    d.tap(150, 100);
    expect(kinds(d)).toEqual(['trend-line']);

    const e = driver();
    e.apply({ type: 'activate', tool: 'trend-line' });
    e.host.pointer('down', 100, 100);
    e.host.pointer('move', 200, 100);
    e.host.pointer('move', 100.5, 100);
    e.host.pointer('up', 100.5, 100);
    expect(e.store.list()).toEqual([]);
    expect(e.progress).toBe(PLACEMENT_START);
    expect(e.state).toEqual({ type: 'placing', tool: 'trend-line' });
    expect(e.history.getState().undoDepth).toBe(0);
  });

  it.each((['trend-line', 'rectangle', 'fibonacci-retracement', 'fibonacci-arcs', 'fibonacci-fans', 'fibonacci-time-zones'] as const).map((tool) => [tool]))('%s takes two anchors', (tool) => {
    const d = driver();
    d.apply({ type: 'activate', tool });
    d.tap(100, 100);
    d.tap(300, 150);
    expect(d.store.list()[0]?.anchors).toHaveLength(ANCHOR_COUNT[tool]);
  });
});

describe('cancelling and the pane rules (FR-INT-011, FR-INT-012)', () => {
  function halfPlaced() {
    const d = driver();
    d.apply({ type: 'activate', tool: 'trend-line' });
    d.tap(100, 100);
    d.host.pointer('move', 200, 120);
    expect(d.preview()).not.toBeNull();
    return d;
  }
  const expectCancelled = (d: ReturnType<typeof driver>): void => {
    expect(d.store.list()).toEqual([]);
    expect(d.history.getState().undoDepth).toBe(0);
    expect(d.storeChanges).toBe(0);
    expect(d.progress).toBe(PLACEMENT_START);
    expect(d.log).toContainEqual({ type: 'cancel-placement' });
  };

  it('Escape removes the preview and changes nothing', () => {
    const d = halfPlaced();
    d.host.key('Escape');
    expect(d.state).toEqual({ type: 'idle', hover: null });
    expect(d.preview()).toBeNull();
    expectCancelled(d);
  });

  it('the right button removes the preview and changes nothing, and does not place', () => {
    const d = halfPlaced();
    d.tap(300, 150, 2);
    expect(d.state).toEqual({ type: 'idle', hover: null });
    expectCancelled(d);
  });

  it('deactivating the tool cancels the same way', () => {
    const d = halfPlaced();
    d.apply({ type: 'deactivate' });
    expect(d.state).toEqual({ type: 'idle', hover: null });
    expectCancelled(d);
  });

  it('a pointer cancel during a drag starts over and keeps the tool', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'trend-line' });
    d.host.pointer('down', 100, 100);
    d.host.pointer('move', 200, 120);
    expect(d.progress.type).toBe('anchored');
    d.host.pointer('cancel', 200, 120);
    expect(d.progress).toBe(PLACEMENT_START);
    expect(d.state).toEqual({ type: 'placing', tool: 'trend-line' });
    expect(d.store.list()).toEqual([]);
  });

  it('a click outside every pane does nothing and keeps the tool active', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'trend-line' });
    d.tap(100, 550);
    expect(d.progress).toBe(PLACEMENT_START);
    expect(d.state).toEqual({ type: 'placing', tool: 'trend-line' });
    d.apply({ type: 'activate', tool: 'horizontal-line' });
    d.tap(200, 560);
    expect(d.store.list()).toEqual([]);
    expect(d.state).toEqual({ type: 'placing', tool: 'horizontal-line' });
  });

  it('activating another tool half way cancels the placement', () => {
    const d = halfPlaced();
    d.apply({ type: 'activate', tool: 'rectangle' });
    expect(d.state).toEqual({ type: 'placing', tool: 'rectangle' });
    expectCancelled(d);
  });
});

describe('stay in tool (FR-INT-013)', () => {
  it('keeps the tool active and selects nothing when stayInTool is on', () => {
    const d = driver({ stay: true });
    d.apply({ type: 'activate', tool: 'horizontal-line' });
    d.tap(200, 100);
    d.tap(400, 200);
    d.tap(600, 300);
    expect(d.store.list().map((drawing) => drawing.id)).toEqual(['d1', 'd2', 'd3']);
    expect(d.state).toEqual({ type: 'placing', tool: 'horizontal-line' });
    expect(d.history.getState().undoDepth).toBe(3);
  });

  it('deactivates and selects the new drawing when stayInTool is off', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'horizontal-line' });
    d.tap(200, 100);
    expect(d.state).toEqual({ type: 'selected', ids: ['d1'], hover: null });
    d.tap(400, 200);
    expect(d.store.list()).toHaveLength(1);
  });

  it('follows a change at runtime from the next placement on', () => {
    const d = driver();
    d.apply({ type: 'activate', tool: 'horizontal-line' });
    d.tap(200, 100);
    expect(d.state.type).toBe('selected');
    d.settings.stay = true;
    d.apply({ type: 'activate', tool: 'horizontal-line' });
    d.tap(400, 200);
    d.tap(500, 250);
    expect(d.store.list()).toHaveLength(3);
    expect(d.state).toEqual({ type: 'placing', tool: 'horizontal-line' });
    d.settings.stay = false;
    d.tap(600, 300);
    expect(d.state).toEqual({ type: 'selected', ids: ['d4'], hover: null });
  });

  it('stays in the tool after a two-anchor drawing too', () => {
    const d = driver({ stay: true });
    d.apply({ type: 'activate', tool: 'trend-line' });
    d.tap(100, 100);
    d.tap(300, 150);
    d.tap(100, 200);
    d.tap(300, 250);
    expect(kinds(d)).toEqual(['trend-line', 'trend-line']);
    expect(d.state).toEqual({ type: 'placing', tool: 'trend-line' });
  });

  it('returns to the note tool after the editor closes when staying', () => {
    const d = driver({ stay: true });
    d.apply({ type: 'activate', tool: 'text-note' });
    d.tap(300, 200);
    expect(d.state).toEqual({ type: 'editing-text', drawingId: 'd1', resume: 'text-note' });
    d.apply({ type: 'edit-result', text: 'a' });
    expect(d.state).toEqual({ type: 'placing', tool: 'text-note' });
    d.tap(400, 250);
    expect(kinds(d)).toEqual(['text-note', 'text-note']);
  });
});
