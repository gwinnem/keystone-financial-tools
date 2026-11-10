import { describe, expect, it } from 'vitest';
import type { Point } from '../src/host';
import { enterInput, PLACEMENT_START, placedCount, reducePlacement, type PlacementInput, type PlacementProgress } from '../src/interaction/placement';
import { reduceInteraction } from '../src/interaction/machine';
import { IDLE_STATE } from '../src/interaction/types';
import { registerKind, type KindDefinition } from '../src/kinds';
import type { SceneItem } from '../src/scene/types';
import { DrawingStore } from '../src/store';
import { createMockHost } from '../src/testing/mock-host';
import type { Anchor, DrawingKind } from '../src/types';
import { A, record, rig } from './controller-rig';

// E12-F01-S04 (FR-TOOL-033): a kind with `min < max` anchors is placed point by point and finished when the trader decides.
// The kind is made up for the test (the registry of this file only): a polyline of 3 to 5 anchors.
const PATTERN = 'pattern' as DrawingKind;
const definition: KindDefinition = {
  id: PATTERN,
  anchors: { min: 3, max: 5 },
  defaults: {},
  group: 'lines',
  geometry: ({ points }) => points.slice(1).map((to, index) => ({ type: 'line', part: 'body', from: points[index] as Point, to })),
};
registerKind(definition);

const host = createMockHost();
const P = (x: number, y: number): Point => ({ x, y });
const click = (x: number, y: number, button = 0): PlacementInput => ({ type: 'click', point: P(x, y), button });
const FINISH: PlacementInput = { type: 'finish' };
const REMOVE: PlacementInput = { type: 'remove-anchor' };
const spot = (n: number): [number, number] => [100 + 40 * n, 100 + 10 * n];

function run(tool: DrawingKind, inputs: readonly PlacementInput[], from: PlacementProgress = PLACEMENT_START) {
  let progress = from;
  let anchors: readonly Anchor[] | null = null;
  let ignored = false;
  for (const input of inputs) {
    const result = reducePlacement(tool, progress, input, host);
    progress = result.progress;
    anchors = result.anchors;
    ignored = result.ignored;
  }
  return { progress, anchors, ignored };
}
const clicks = (n: number): PlacementInput[] => Array.from({ length: n }, (_, i) => click(...spot(i)));

describe('finishing a tool with a variable number of anchors', () => {
  it('is ignored before the first anchor, and the keyboard does not finish either', () => {
    const result = reducePlacement(PATTERN, PLACEMENT_START, FINISH, host);
    expect(result).toEqual({ progress: PLACEMENT_START, anchors: null, ignored: true });
    expect(enterInput(PATTERN, PLACEMENT_START, null, 'off', host)).toBeNull();
  });

  it('is ignored for a tool with a fixed number of anchors, whatever it was handed', () => {
    const full: PlacementProgress = { type: 'anchored', first: A(100, 100), more: [A(200, 150)], pointer: A(200, 150), dragging: false };
    expect(reducePlacement('trend-line', full, FINISH, host)).toEqual({ progress: full, anchors: null, ignored: true });
    expect(enterInput('trend-line', full, null, 'off', host)).toBeNull();
  });

  it('needs the fewest anchors: fewer creates nothing and changes nothing', () => {
    for (let n = 1; n < 3; n++) {
      const before = run(PATTERN, clicks(n)).progress;
      const result = reducePlacement(PATTERN, before, FINISH, host);
      expect(result).toEqual({ progress: before, anchors: null, ignored: true });
      expect(result.progress).toBe(before);
    }
  });

  it.each([3, 4])('creates the drawing from the %i anchors placed, one result, and starts over', (n) => {
    const { progress, anchors, ignored } = run(PATTERN, [...clicks(n), FINISH]);
    expect(anchors).toEqual(Array.from({ length: n }, (_, i) => A(...spot(i))));
    expect(ignored).toBe(false);
    expect(progress).toBe(PLACEMENT_START);
  });

  it('leaves the anchor under the pointer out', () => {
    const { anchors } = run(PATTERN, [...clicks(3), { type: 'move', point: P(500, 300) }, FINISH]);
    expect(anchors).toHaveLength(3);
  });

  it('completes by itself at the most anchors', () => {
    const early = run(PATTERN, clicks(4));
    expect(early.anchors).toBeNull();
    const { anchors, progress } = run(PATTERN, clicks(5));
    expect(anchors).toHaveLength(5);
    expect(progress).toBe(PLACEMENT_START);
  });

  it('is ignored by a tool with a fixed count and before the first anchor', () => {
    const one = run('trend-line', [click(100, 100)]).progress;
    expect(reducePlacement('trend-line', one, FINISH, host)).toEqual({ progress: one, anchors: null, ignored: true });
    expect(reducePlacement(PATTERN, PLACEMENT_START, FINISH, host)).toEqual({ progress: PLACEMENT_START, anchors: null, ignored: true });
  });
});

describe('taking the last anchor back', () => {
  it('removes the last placed anchor and keeps the others', () => {
    const { progress, anchors } = run(PATTERN, [...clicks(4), REMOVE]);
    expect(anchors).toBeNull();
    expect(placedCount(progress)).toBe(3);
    expect(progress).toMatchObject({ first: A(...spot(0)), more: [A(...spot(1)), A(...spot(2))] });
    expect(placedCount(run(PATTERN, [REMOVE], progress).progress)).toBe(2);
  });

  it('goes back to waiting when the first anchor is taken back, and ignores the key before it', () => {
    expect(run(PATTERN, [...clicks(1), REMOVE]).progress).toBe(PLACEMENT_START);
    const result = reducePlacement(PATTERN, PLACEMENT_START, REMOVE, host);
    expect(result).toEqual({ progress: PLACEMENT_START, anchors: null, ignored: true });
    expect(result.progress).toBe(PLACEMENT_START);
  });

  it('works for a tool with a fixed count too', () => {
    expect(run('trend-line', [click(100, 100), REMOVE]).progress).toBe(PLACEMENT_START);
  });

  it('lets go of a press that is held', () => {
    const held = run(PATTERN, [...clicks(2), { type: 'drag-start', origin: P(...spot(1)), button: 0 }]).progress;
    expect(held).toMatchObject({ dragging: true });
    expect(run(PATTERN, [REMOVE], held).progress).toMatchObject({ dragging: false, more: [] });
  });

  it('lets a finish count the anchors again: back to two is too few, a new click makes three', () => {
    const { progress } = run(PATTERN, [...clicks(3), REMOVE]);
    expect(run(PATTERN, [FINISH], progress).ignored).toBe(true);
    expect(run(PATTERN, [click(...spot(2)), FINISH], progress).anchors).toHaveLength(3);
  });
});

describe('Enter while placing (enterInput)', () => {
  const three = run(PATTERN, clicks(3)).progress;
  const last = P(...spot(2));

  it('finishes when the pointer is in use (no keyboard cursor)', () => {
    expect(enterInput(PATTERN, three, null, 'off', host)).toEqual(FINISH);
  });

  it('finishes when the keyboard cursor sits on the last anchor, within a pixel', () => {
    expect(enterInput(PATTERN, three, last, 'off', host)).toEqual(FINISH);
    expect(enterInput(PATTERN, three, P(last.x + 1, last.y), 'off', host)).toEqual(FINISH);
  });

  it('places another anchor when the cursor has moved: the caller places at the cursor', () => {
    expect(enterInput(PATTERN, three, P(last.x + 5, last.y), 'off', host)).toBeNull();
    expect(enterInput(PATTERN, three, P(last.x, last.y + 5), 'off', host)).toBeNull();
  });

  it('is nothing before the fewest anchors, before the first one and for a fixed tool', () => {
    expect(enterInput(PATTERN, run(PATTERN, clicks(2)).progress, null, 'off', host)).toBeNull();
    expect(enterInput(PATTERN, PLACEMENT_START, null, 'off', host)).toBeNull();
    expect(enterInput('trend-line', run('trend-line', [click(100, 100)]).progress, null, 'off', host)).toBeNull();
  });

  it('is nothing for a tool with the fewest equal to the most, however many are placed', () => {
    const rectangle = run('rectangle', [click(100, 100)]).progress;
    expect(enterInput('rectangle', rectangle, null, 'off', host)).toBeNull();
  });
});

describe('Backspace in the interaction machine', () => {
  const ctx = { lookup: () => undefined };
  it('asks a placing tool to take the last anchor back, and does not leave the tool', () => {
    const placing = reduceInteraction(IDLE_STATE, { type: 'activate', tool: PATTERN }, ctx).state;
    const result = reduceInteraction(placing, { type: 'key', key: 'Backspace' }, ctx);
    expect(result).toMatchObject({ state: placing, effects: [{ type: 'remove-anchor' }], ignored: false });
  });

  it('is nothing while idle', () => {
    expect(reduceInteraction(IDLE_STATE, { type: 'key', key: 'Backspace' }, ctx).effects).toEqual([]);
  });
});

/** The points of the polyline of the placement preview, or null without one. */
function previewPoints(items: readonly SceneItem[]): Point[] | null {
  for (const item of items) {
    if (item.type !== 'preview') continue;
    const points: Point[] = [];
    for (const shape of item.shapes) {
      if (shape.type !== 'line') continue;
      if (points.length === 0) points.push(shape.from);
      points.push(shape.to);
    }
    return points;
  }
  return null;
}

describe('placing through the controller', () => {
  const setup = () => rig({ tools: [PATTERN, 'trend-line'], store: new DrawingStore() });
  const points = (count: number): [number, number][] => Array.from({ length: count }, (_, i) => [100 + 50 * i, 300 - 30 * i]);
  const tap = (h: ReturnType<typeof setup>['host'], x: number, y: number, pointerType: 'mouse' | 'touch' = 'mouse'): void => {
    h.pointer('down', x, y, { pointerType });
    h.pointer('up', x, y, { pointerType });
  };

  it('finishes with Enter after a click, with one history entry (mouse)', () => {
    const { host: h, tools, click: c, store } = setup();
    let changes = 0;
    store.subscribe(() => changes++);
    tools.activate(PATTERN);
    for (const [x, y] of points(3)) c(x, y);
    expect(store.list()).toHaveLength(0);
    h.key('Enter');
    expect(changes).toBe(1);
    expect(store.list()[0]).toMatchObject({ kind: 'pattern', anchors: points(3).map(([x, y]) => A(x, y)) });
    expect(tools.getState().activeTool).toBeNull();
    expect(tools.undo()).toBe(true);
    expect(store.list()).toHaveLength(0);
  });

  it('does not finish with Enter before the fewest anchors: it places at the cursor', () => {
    const { host: h, tools, click: c, store } = setup();
    tools.activate(PATTERN);
    c(100, 300);
    h.key('Enter');
    expect(store.list()).toHaveLength(0);
    expect(previewPoints(tools.getScene())).toHaveLength(3);
  });

  it('finishes with a double click, which places the last point once', () => {
    const { host: h, tools, click: c, store } = setup();
    tools.activate(PATTERN);
    c(100, 300);
    c(150, 270);
    tap(h, 200, 240);
    expect(store.list()).toHaveLength(0);
    tap(h, 200, 240);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.anchors).toEqual([A(100, 300), A(150, 270), A(200, 240)]);
  });

  it('finishes with a double tap (touch)', () => {
    const { host: h, tools, store } = setup();
    tools.activate(PATTERN);
    for (const [x, y] of points(3)) tap(h, x, y, 'touch');
    expect(store.list()).toHaveLength(0);
    tap(h, 300, 180, 'touch');
    tap(h, 300, 180, 'touch');
    expect(store.list()[0]?.anchors).toHaveLength(4);
  });

  it('does not finish with a double click before the fewest anchors', () => {
    const { host: h, tools, click: c, store } = setup();
    tools.activate(PATTERN);
    c(100, 300);
    tap(h, 150, 270);
    tap(h, 150, 270);
    expect(store.list()).toHaveLength(0);
    expect(previewPoints(tools.getScene())).toHaveLength(3);
    expect(tools.getState().activeTool).toBe('pattern');
  });

  it('completes at the most anchors without a finish', () => {
    const { tools, click: c, store } = setup();
    tools.activate(PATTERN);
    for (const [x, y] of points(5)) c(x, y);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.anchors).toHaveLength(5);
  });

  it('is finished with the keyboard alone: Enter places, Enter again on the same spot finishes', () => {
    const { host: h, tools, store } = setup();
    tools.activate(PATTERN);
    h.key('Enter');
    for (let i = 0; i < 3; i++) {
      h.key('ArrowRight');
      h.key('Enter');
    }
    expect(store.list()).toHaveLength(0);
    h.key('Enter');
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.anchors).toHaveLength(4);
  });

  it('does not finish the keyboard placement before the fewest anchors', () => {
    const { host: h, tools, store } = setup();
    tools.activate(PATTERN);
    h.key('Enter');
    h.key('ArrowRight');
    h.key('Enter');
    h.key('Enter');
    expect(store.list()).toHaveLength(0);
    expect(previewPoints(tools.getScene())).toHaveLength(3);
  });

  it('takes the last point back with Backspace, down to nothing, and stays in the tool', () => {
    const { host: h, tools, click: c, store } = setup();
    tools.activate(PATTERN);
    for (const [x, y] of points(3)) c(x, y);
    h.key('Backspace');
    // Two placed and the pointer: three points.
    expect(previewPoints(tools.getScene())).toHaveLength(3);
    h.key('Backspace');
    expect(previewPoints(tools.getScene())).toHaveLength(2);
    h.key('Backspace');
    expect(previewPoints(tools.getScene())).toBeNull();
    h.key('Backspace');
    expect(tools.getState().activeTool).toBe('pattern');
    expect(store.list()).toHaveLength(0);
    // A new drawing can be started.
    c(300, 100);
    expect(previewPoints(tools.getScene())).toHaveLength(2);
  });

  it('can be finished after a point is taken back and another placed', () => {
    const { host: h, tools, click: c, store } = setup();
    tools.activate(PATTERN);
    for (const [x, y] of points(4)) c(x, y);
    h.key('Backspace');
    c(400, 50);
    h.key('Enter');
    expect(store.list()[0]?.anchors).toEqual([...points(3).map(([x, y]) => A(x, y)), A(400, 50)]);
  });

  it('is cancelled by Escape and by the right button without a store change', () => {
    const { host: h, tools, click: c, store } = setup();
    let changes = 0;
    store.subscribe(() => changes++);
    tools.activate(PATTERN);
    for (const [x, y] of points(4)) c(x, y);
    h.key('Escape');
    tools.activate(PATTERN);
    for (const [x, y] of points(4)) c(x, y);
    c(500, 100, { button: 2 });
    expect(changes).toBe(0);
    expect(previewPoints(tools.getScene())).toBeNull();
  });

  it('announces up to how many anchors, also after one is taken back, and then the drawing placed', () => {
    const { host: h, tools, click: c } = setup();
    const said = record(tools, 'announce');
    tools.activate(PATTERN);
    c(100, 300);
    c(150, 270);
    h.key('Backspace');
    c(150, 270);
    c(200, 240);
    h.key('Enter');
    expect(said).toEqual(['Place anchor 2 of up to 5', 'Place anchor 3 of up to 5', 'Place anchor 2 of up to 5', 'Place anchor 3 of up to 5', 'Place anchor 4 of up to 5', 'pattern placed']);
  });

  it('says nothing for a double click or a Backspace of a tool with a fixed count', () => {
    const { host: h, tools, click: c } = setup();
    const said = record(tools, 'announce');
    tools.activate('trend-line');
    c(100, 200);
    h.key('Backspace');
    c(100, 200);
    tap(h, 100, 200);
    tap(h, 100, 200);
    expect(said).toEqual([]);
  });
});
