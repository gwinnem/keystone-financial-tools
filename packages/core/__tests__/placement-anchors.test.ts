import { describe, expect, it } from 'vitest';
import type { Point } from '../src/host';
import { PLACEMENT_START, placedCount, placementPreview, reducePlacement, ZERO_LENGTH_PX, type PlacementInput, type PlacementProgress } from '../src/interaction/placement';
import { registerKind, type KindDefinition } from '../src/kinds';
import type { SceneItem } from '../src/scene/types';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import { DrawingStore } from '../src/store';
import type { Anchor, DrawingKind } from '../src/types';
import { A, record, rig } from './controller-rig';

// E12-F01-S03 (FR-TOOL-032): a tool with three or more anchors takes one click per anchor. The kinds are made up for the test
// (the registry of this file only): a polyline through its anchors with 3, 5 and 7 of them.
const polyline = (id: string, count: number): KindDefinition => ({
  id: id as DrawingKind,
  anchors: { min: count, max: count },
  defaults: {},
  group: 'lines',
  geometry: ({ points }) => points.slice(1).map((to, index) => ({ type: 'line', part: 'body', from: points[index] as Point, to })),
});
const KINDS = [
  ['triangle', 3],
  ['pentagon', 5],
  ['heptagon', 7],
] as const;
for (const [id, count] of KINDS) registerKind(polyline(id, count));
const TRIANGLE = 'triangle' as DrawingKind;
const PENTAGON = 'pentagon' as DrawingKind;

const host = createMockHost({ panes: [DEFAULT_MOCK_PANE, { yAxisId: 'volume', top: 400, height: 100, min: 0, max: 1000 }] });
const P = (x: number, y: number): Point => ({ x, y });
const click = (x: number, y: number, button = 0): PlacementInput => ({ type: 'click', point: P(x, y), button });
const move = (x: number, y: number): PlacementInput => ({ type: 'move', point: P(x, y) });
const dragStart = (x: number, y: number): PlacementInput => ({ type: 'drag-start', origin: P(x, y), button: 0 });
const drag = (x: number, y: number): PlacementInput => ({ type: 'drag', point: P(x, y) });
const dragEnd = (x: number, y: number): PlacementInput => ({ type: 'drag-end', point: P(x, y) });
// Points well apart from each other: the nth is at x = 100 + 40 n.
const spot = (n: number): [number, number] => [100 + 40 * n, 100 + 10 * n];

function run(tool: DrawingKind, inputs: readonly PlacementInput[], from: PlacementProgress = PLACEMENT_START) {
  let progress = from;
  let anchors: readonly Anchor[] | null = null;
  for (const input of inputs) {
    const result = reducePlacement(tool, progress, input, host);
    progress = result.progress;
    anchors = result.anchors;
  }
  return { progress, anchors };
}

describe.each(KINDS)('%s, a tool with %i anchors', (tool, count) => {
  const kind = tool as DrawingKind;
  const clicks = (n: number): PlacementInput[] => Array.from({ length: n }, (_, i) => click(...spot(i)));

  it('keeps every anchor until the last one, one click each', () => {
    for (let n = 1; n < count; n++) {
      const { progress, anchors } = run(kind, clicks(n));
      expect(anchors).toBeNull();
      expect(progress).toMatchObject({ type: 'anchored', first: A(...spot(0)), dragging: false });
      expect((progress as { more: readonly Anchor[] }).more).toEqual(Array.from({ length: n - 1 }, (_, i) => A(...spot(i + 1))));
      expect(placedCount(progress)).toBe(n);
    }
  });

  it('completes on the last click with every anchor in order and starts over', () => {
    const { progress, anchors } = run(kind, clicks(count));
    expect(anchors).toEqual(Array.from({ length: count }, (_, i) => A(...spot(i))));
    expect(progress).toBe(PLACEMENT_START);
  });

  it('shows the anchors so far and the pointer as the next anchor', () => {
    const { progress } = run(kind, [...clicks(2), move(500, 300)]);
    expect(placementPreview(kind, progress, 'p')).toEqual({ id: 'p', kind, anchors: [A(...spot(0)), A(...spot(1)), A(500, 300)] });
    expect(placementPreview(kind, PLACEMENT_START, 'p')).toBeNull();
  });

  it('keeps the placed anchors while the pointer moves, projected onto the first anchor axis over another pane', () => {
    const { progress } = run(kind, [...clicks(2), move(500, 450)]);
    expect(progress).toMatchObject({ pointer: A(500, 450) });
    expect(placedCount(progress)).toBe(2);
  });

  it('ignores a click within a pixel of the previous anchor and waits for another', () => {
    const [x, y] = spot(1);
    const before = run(kind, clicks(2));
    for (const [dx, dy] of [
      [0, 0],
      [ZERO_LENGTH_PX, 0],
      [-ZERO_LENGTH_PX, 0],
      [0, 0.5],
    ] as const) {
      const result = reducePlacement(kind, before.progress, click(x + dx, y + dy), host);
      expect(result).toEqual({ progress: before.progress, anchors: null, ignored: true });
      expect(result.progress).toBe(before.progress);
    }
    // Two pixels away is a new anchor, in either direction.
    // The third anchor of a three-anchor tool completes the drawing.
    for (const next of [click(x + ZERO_LENGTH_PX + 1, y), click(x, y + ZERO_LENGTH_PX + 1)]) {
      const result = run(kind, [next], before.progress);
      if (count === 3) expect(result.anchors).toHaveLength(3);
      else expect(placedCount(result.progress)).toBe(3);
    }
  });

  it('measures from the previous anchor only: the first anchor may be hit again', () => {
    const { progress, anchors } = run(kind, [...clicks(2), click(...spot(0))]);
    if (count === 3) expect(anchors).toHaveLength(3);
    else expect(placedCount(progress)).toBe(3);
  });

  it('ignores the right button', () => {
    const before = run(kind, clicks(2)).progress;
    expect(reducePlacement(kind, before, click(400, 150, 2), host)).toEqual({ progress: before, anchors: null, ignored: true });
  });

  it('is dropped by a cancel, whatever has been placed', () => {
    const { progress } = run(kind, clicks(2));
    expect(reducePlacement(kind, progress, { type: 'cancel' }, host)).toEqual({ progress: PLACEMENT_START, anchors: null, ignored: false });
  });

  it('takes the first two anchors by a drag and goes on with clicks', () => {
    const { progress, anchors } = run(kind, [dragStart(...spot(0)), drag(...spot(1)), dragEnd(...spot(1))]);
    expect(anchors).toBeNull();
    expect(progress).toMatchObject({ type: 'anchored', first: A(...spot(0)), more: [A(...spot(1))], pointer: A(...spot(1)), dragging: false });
    const done = run(
      kind,
      Array.from({ length: count - 2 }, (_, i) => click(...spot(i + 2))),
      progress
    );
    expect(done.anchors).toHaveLength(count);
    expect(done.progress).toBe(PLACEMENT_START);
  });

  it('takes a later anchor by a drag too', () => {
    const { progress, anchors } = run(kind, [...clicks(2), dragStart(...spot(2)), drag(...spot(2)), dragEnd(...spot(2))]);
    if (count === 3) expect(anchors).toHaveLength(3);
    else {
      expect(progress).toMatchObject({ dragging: false });
      expect(placedCount(progress)).toBe(3);
    }
  });

  it('starts over when the first drag ends where it began', () => {
    expect(run(kind, [dragStart(...spot(0)), dragEnd(...spot(0))]).progress).toBe(PLACEMENT_START);
  });

  it('only lets go when a later drag ends on the previous anchor, and keeps what is placed', () => {
    const held = run(kind, [...clicks(2), dragStart(...spot(1))]);
    expect(held.progress).toMatchObject({ dragging: true });
    const { progress, anchors } = run(kind, [dragEnd(...spot(1))], held.progress);
    expect(anchors).toBeNull();
    expect(progress).toMatchObject({ dragging: false });
    expect(placedCount(progress)).toBe(2);
  });

  it('ignores a second press while one is held', () => {
    const held = run(kind, [...clicks(2), dragStart(...spot(1))]).progress;
    expect(reducePlacement(kind, held, dragStart(...spot(2)), host).ignored).toBe(true);
  });
});

describe('the number of anchors fixed so far', () => {
  it('is 0 while waiting and 1 plus the further anchors once anchored', () => {
    expect(placedCount(PLACEMENT_START)).toBe(0);
    const first = A(1, 1);
    expect(placedCount({ type: 'anchored', first, more: [], pointer: first, dragging: false })).toBe(1);
    expect(placedCount({ type: 'anchored', first, more: [first, first], pointer: first, dragging: false })).toBe(3);
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
  const setup = (stayInTool = false, messages = {}) => rig({ tools: [...KINDS.map(([id]) => id as DrawingKind), 'trend-line'], stayInTool, messages, store: new DrawingStore() });
  const points = (count: number): [number, number][] => Array.from({ length: count }, (_, i) => [100 + 50 * i, 300 - 30 * i]);

  it('places with one click per anchor and one history entry (mouse)', () => {
    const { tools, click: c, store } = setup();
    let changes = 0;
    store.subscribe(() => changes++);
    tools.activate(PENTAGON);
    for (const [x, y] of points(4)) c(x, y);
    expect(store.list()).toHaveLength(0);
    c(...(points(5)[4] as [number, number]));
    expect(changes).toBe(1);
    expect(store.list()[0]).toMatchObject({ id: 'd1', kind: 'pentagon', anchors: points(5).map(([x, y]) => A(x, y)) });
    expect(tools.undo()).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.redo()).toBe(true);
    expect(store.list()).toHaveLength(1);
  });

  it('places by touch with a tap per anchor', () => {
    const { host: h, tools, store } = setup();
    tools.activate(TRIANGLE);
    for (const [x, y] of points(3)) {
      h.pointer('down', x, y, { pointerType: 'touch' });
      h.pointer('up', x, y, { pointerType: 'touch' });
    }
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.anchors).toEqual(points(3).map(([x, y]) => A(x, y)));
  });

  it('takes the first two anchors by a drag', () => {
    const { tools, click: c, drag: d, store } = setup();
    tools.activate(TRIANGLE);
    d([100, 300], [200, 250]);
    expect(store.list()).toHaveLength(0);
    c(300, 100);
    expect(store.list()[0]?.anchors).toEqual([A(100, 300), A(200, 250), A(300, 100)]);
  });

  it('shows the anchors so far in the preview, with the pointer as the next one', () => {
    const { host: h, tools, click: c } = setup();
    tools.activate(PENTAGON);
    expect(previewPoints(tools.getScene())).toBeNull();
    c(100, 300);
    c(150, 270);
    h.pointer('move', 400, 200);
    expect(previewPoints(tools.getScene())).toEqual([
      { x: 100, y: 300 },
      { x: 150, y: 270 },
      { x: 400, y: 200 },
    ]);
  });

  it('is cancelled by Escape and by the right button without a store change', () => {
    const { host: h, tools, click: c, store } = setup();
    let changes = 0;
    store.subscribe(() => changes++);
    tools.activate(PENTAGON);
    c(100, 300);
    c(150, 270);
    h.key('Escape');
    expect(previewPoints(tools.getScene())).toBeNull();
    tools.activate(PENTAGON);
    c(100, 300);
    c(150, 270);
    c(200, 240, { button: 2 });
    expect(previewPoints(tools.getScene())).toBeNull();
    expect(changes).toBe(0);
    // The next click starts a new drawing.
    tools.activate(PENTAGON);
    c(100, 300);
    expect(previewPoints(tools.getScene())).toHaveLength(2);
  });

  it('ignores a click on the previous anchor and waits for another', () => {
    const { tools, click: c, store } = setup();
    tools.activate(TRIANGLE);
    c(100, 300);
    c(200, 250);
    c(200, 250);
    c(201, 250);
    expect(store.list()).toHaveLength(0);
    c(300, 100);
    expect(store.list()).toHaveLength(1);
  });

  it('places each anchor with Enter at the keyboard cursor (FR-INT-035)', () => {
    const { host: h, tools, store } = setup();
    tools.activate(PENTAGON);
    h.key('Enter');
    for (let i = 0; i < 3; i++) {
      h.key('ArrowRight');
      h.key('Enter');
    }
    expect(store.list()).toHaveLength(0);
    h.key('ArrowRight');
    h.key('Enter');
    const drawing = store.list()[0];
    expect(drawing?.kind).toBe('pentagon');
    const times = drawing?.anchors.map((anchor) => anchor.time) ?? [];
    expect(times).toHaveLength(5);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(5);
  });

  it('repeats the tool with stayInTool', () => {
    const { tools, click: c, store } = setup(true);
    tools.activate(TRIANGLE);
    for (const [x, y] of points(3)) c(x, y);
    for (const [x, y] of points(3)) c(x + 7, y + 11);
    expect(store.list()).toHaveLength(2);
    expect(tools.getState().activeTool).toBe('triangle');
  });

  it('deactivates after the drawing and selects it without stayInTool', () => {
    const { tools, click: c } = setup();
    tools.activate(TRIANGLE);
    for (const [x, y] of points(3)) c(x, y);
    expect(tools.getState().activeTool).toBeNull();
    expect(tools.getState().selection).toEqual(['d1']);
  });

  it('announces which anchor comes next and then the drawing placed', () => {
    const { tools, click: c } = setup();
    const said = record(tools, 'announce');
    tools.activate(PENTAGON);
    for (const [x, y] of points(5)) c(x, y);
    expect(said).toEqual(['Place anchor 2 of 5', 'Place anchor 3 of 5', 'Place anchor 4 of 5', 'Place anchor 5 of 5', 'pentagon placed']);
  });

  it('announces a drag as it goes: the first anchor on the press, the second on the release', () => {
    const { tools, drag: d } = setup();
    tools.activate(TRIANGLE);
    const said = record(tools, 'announce');
    d([100, 300], [200, 250]);
    expect(said).toEqual(['Place anchor 2 of 3', 'Place anchor 3 of 3']);
  });

  it('says nothing for a move or a click that is ignored', () => {
    const { host: h, tools, click: c } = setup();
    tools.activate(TRIANGLE);
    c(100, 300);
    const said = record(tools, 'announce');
    h.pointer('move', 150, 280);
    c(100, 300);
    expect(said).toEqual([]);
  });

  it('says nothing about anchors for a tool with two anchors', () => {
    const { tools, click: c } = setup();
    const said = record(tools, 'announce');
    tools.activate('trend-line');
    c(100, 200);
    c(300, 100);
    expect(said).toEqual(['Trend line placed']);
  });

  it('uses the translated message', () => {
    const { tools, click: c } = setup(false, { 'announce.placeAnchor': 'Punkt {index} av {count}' });
    const said = record(tools, 'announce');
    tools.activate(TRIANGLE);
    c(100, 300);
    expect(said.slice(-1)).toEqual(['Punkt 2 av 3']);
  });
});
