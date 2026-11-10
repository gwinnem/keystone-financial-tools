import { describe, expect, it } from 'vitest';
import { BOX_CORNERS, boundsOf, boxHandles } from '../src/geometry/handles';
import { geometryOf } from '../src/geometry/index';
import type { Point } from '../src/host';
import { cursorFor } from '../src/interaction/cursor';
import { dragHandle, dragPatch, handleSnap, moveDrawings } from '../src/interaction/move';
import { registerKind, type KindDefinition } from '../src/kinds';
import { createMockHost } from '../src/testing/mock-host';
import type { Anchor, Drawing, DrawingKind } from '../src/types';
import { A, rig } from './controller-rig';

// E12-F01-S06 (FR-TOOL-035): handles, move and edit for drawings with many anchors, through the controller on the mock host. The pane is
// `price`, 800 px wide and 400 px high; time is x * 6000, price (400 - y) / 2. The kinds are made up for the test (the registry of this
// file only): polylines with 3, 5 and 64 anchors, a freehand `ink` kind and `pitch`, three anchors with a handle of its own.
const polyline = (id: string, min: number, max: number, extra: Partial<KindDefinition> = {}): KindDefinition => ({
  id: id as DrawingKind,
  anchors: { min, max },
  defaults: {},
  group: 'lines',
  geometry: ({ points }) => points.slice(1).map((to, index) => ({ type: 'line', part: 'body', from: points[index] as Point, to })),
  ...extra,
});
registerKind(polyline('tri3', 3, 3));
registerKind(polyline('pent5', 5, 5));
registerKind(polyline('sixty4', 64, 64));
registerKind(polyline('ink', 2, 512, { placement: 'freehand' }));
// The centre of the three anchors is a fourth handle, `handle:3`, that is not an anchor.
registerKind(
  polyline('pitch', 3, 3, {
    handles: (points) => [
      ...points.map((p, index) => ({ id: `handle:${index}` as const, x: p.x, y: p.y })),
      { id: 'handle:3', x: (points[0].x + points[1].x + points[2].x) / 3, y: (points[0].y + points[1].y + points[2].y) / 3 },
    ],
  })
);
const INK = 'ink' as DrawingKind;

const P = (x: number, y: number): Point => ({ x, y });
const host = createMockHost();
const pixelsOf = (anchors: readonly Anchor[]): Point[] => anchors.map((anchor) => P(anchor.time / 6000, 400 - anchor.price * 2));
const anchorsAt = (points: readonly Point[]): Anchor[] => points.map((point) => A(point.x, point.y));

function expectAnchors(actual: readonly Anchor[] | null | undefined, expected: readonly Anchor[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((anchor, index) => {
    expect(actual?.[index]?.time).toBeCloseTo(anchor.time, 4);
    expect(actual?.[index]?.price).toBeCloseTo(anchor.price, 9);
    expect(actual?.[index]?.yAxisId).toBe(anchor.yAxisId);
  });
}

/** A zigzag of `count` anchors `step` px apart, from x = 20, between y = 100 and y = 160. */
const zigzag = (count: number, step: number): Anchor[] => Array.from({ length: count }, (_, i) => A(20 + step * i, 100 + (i % 2) * 60));

const CASES = [
  ['tri3', 3, 150],
  ['pent5', 5, 100],
  ['sixty4', 64, 12],
] as const;

describe.each(CASES)('%s, a drawing with %i anchors (FR-TOOL-035)', (kind, count, step) => {
  const anchors = zigzag(count, step);
  const drawing: Drawing = { id: 'p', kind: kind as DrawingKind, anchors };
  const points = pixelsOf(anchors);

  it('has a handle on every anchor of a selected drawing, and none while it is not selected', () => {
    const { tools } = rig({}, {}, [drawing]);
    expect(tools.getScene().some((item) => item.type === 'handles')).toBe(false);
    tools.select(['p']);
    const handles = tools.getScene().find((item) => item.type === 'handles');
    expect(handles?.type === 'handles' ? handles.points : []).toEqual(points);
    expect(geometryOf(drawing, host)?.handles.map((handle) => handle.id)).toEqual(points.map((_, index) => `handle:${index}`));
  });

  it.each([0, Math.floor(count / 2), count - 1])('moves only the anchor of handle %i when it is dragged, as one history entry', (index) => {
    const { store, tools, drag } = rig({}, {}, [drawing]);
    tools.select(['p']);
    const { x, y } = points[index] as Point;
    expect(tools.hitTest(x, y)?.part).toBe(`handle:${index}`);
    drag([x, y], [x + 20, y + 30], [[x + 10, y + 15]]);
    // 20 px right is 120 000 ms and 30 px down is 15 price.
    expectAnchors(
      store.get('p')?.anchors,
      anchors.map((anchor, at) => (at === index ? { ...anchor, time: anchor.time + 120_000, price: anchor.price - 15 } : anchor))
    );
    expect(tools.undo()).toBe(true);
    expect(store.get('p')?.anchors).toEqual(anchors);
    expect(tools.undo()).toBe(false);
  });

  it('is nudged by an arrow key: every anchor moves one bar or one pixel, as one history entry', () => {
    const { host: rigHost, store, tools } = rig({}, {}, [drawing]);
    tools.select(['p']);
    expect(rigHost.key('ArrowRight')).toBe(true);
    expectAnchors(
      store.get('p')?.anchors,
      anchors.map((anchor) => ({ ...anchor, time: anchor.time + 60_000 }))
    );
    expect(tools.undo()).toBe(true);
    expect(store.get('p')?.anchors).toEqual(anchors);
    expect(rigHost.key('ArrowDown')).toBe(true);
    expectAnchors(
      store.get('p')?.anchors,
      anchors.map((anchor) => ({ ...anchor, price: anchor.price - 0.5 }))
    );
  });

  it('moves every anchor by the same travel with moveDrawings, and a handle drag never changes the others', () => {
    const moved = moveDrawings([drawing], P(100, 100), P(140, 120), false, host);
    expect(moved).toHaveLength(1);
    expectAnchors(
      moved[0]?.anchors,
      anchors.map((anchor) => ({ ...anchor, time: anchor.time + 240_000, price: anchor.price - 10 }))
    );
    const first = dragHandle(drawing, 0, P(20, 100), P(30, 100), false, host);
    expect(first?.slice(1)).toEqual(anchors.slice(1));
  });

  it('refuses every change while it is locked: no handle drag, no move, no nudge, no history entry', () => {
    const { host: rigHost, store, tools, drag } = rig({}, {}, [{ ...drawing, locked: true }]);
    tools.select(['p']);
    const { x, y } = points[0] as Point;
    drag([x, y], [x + 20, y + 30]);
    rigHost.key('ArrowRight');
    expect(store.get('p')?.anchors).toEqual(anchors);
    expect(tools.undo()).toBe(false);
  });
});

describe.each([CASES[0], CASES[1]])('%s, moved by its body', (kind, count, step) => {
  it('moves every anchor when a segment is dragged, as one history entry', () => {
    const anchors = zigzag(count, step);
    const { store, tools, drag } = rig({}, {}, [{ id: 'p', kind: kind as DrawingKind, anchors }]);
    tools.select(['p']);
    // The middle of the first segment, from (20, 100) to (20 + step, 160), far from both handles.
    const from: [number, number] = [20 + step / 2, 130];
    expect(tools.hitTest(from[0], from[1])?.part).toBe('body');
    drag(from, [from[0] + 40, from[1] + 20], [[from[0] + 20, from[1] + 10]]);
    expectAnchors(
      store.get('p')?.anchors,
      anchors.map((anchor) => ({ ...anchor, time: anchor.time + 240_000, price: anchor.price - 10 }))
    );
    expect(tools.undo()).toBe(true);
    expect(store.get('p')?.anchors).toEqual(anchors);
    expect(tools.undo()).toBe(false);
  });
});

describe('a handle a kind adds through the registry', () => {
  const anchors = [A(100, 100), A(300, 100), A(200, 280)];
  const pitch: Drawing = { id: 'k', kind: 'pitch' as DrawingKind, anchors };

  it('is a grab point of the drawing next to the handles of its anchors', () => {
    const { tools } = rig({}, {}, [pitch]);
    tools.select(['k']);
    const handles = tools.getScene().find((item) => item.type === 'handles');
    expect(handles?.type === 'handles' ? handles.points : []).toEqual([P(100, 100), P(300, 100), P(200, 280), P(200, 160)]);
    expect(tools.hitTest(200, 160)?.part).toBe('handle:3');
  });

  it('changes nothing when it is dragged, as it is not an anchor', () => {
    expect(dragHandle(pitch, 3, P(200, 160), P(250, 200), false, host)).toBeNull();
    expect(dragPatch(pitch, 3, P(200, 160), P(250, 200), false, host)).toBeNull();
    const { store, tools, drag } = rig({}, {}, [pitch]);
    tools.select(['k']);
    drag([200, 160], [250, 200]);
    expect(store.get('k')?.anchors).toEqual(anchors);
    expect(tools.undo()).toBe(false);
  });

  it('leaves the handles of the anchors working', () => {
    const { store, drag, tools } = rig({}, {}, [pitch]);
    tools.select(['k']);
    drag([300, 100], [320, 140]);
    expectAnchors(store.get('k')?.anchors, [A(100, 100), A(320, 140), A(200, 280)]);
  });
});

describe('the bounding box of points', () => {
  it('is the smallest rectangle around them', () => {
    expect(boundsOf([P(10, 50), P(40, 20), P(25, 90)])).toEqual({ x: 10, y: 20, width: 30, height: 70 });
    expect(boundsOf([P(5, 7)])).toEqual({ x: 5, y: 7, width: 0, height: 0 });
    expect(boundsOf([P(-10, -20), P(-30, -5)])).toEqual({ x: -30, y: -20, width: 20, height: 15 });
  });

  it('has its corners from the top left clockwise as handles 0 to 3', () => {
    expect(BOX_CORNERS).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    expect(boxHandles([P(10, 50), P(40, 20), P(25, 90)])).toEqual([
      { id: 'handle:0', x: 10, y: 20 },
      { id: 'handle:1', x: 40, y: 20 },
      { id: 'handle:2', x: 40, y: 90 },
      { id: 'handle:3', x: 10, y: 90 },
    ]);
  });
});

describe('a freehand drawing has four bounding-box handles that scale it (FR-TOOL-035)', () => {
  // A box from (100, 100) to (300, 260): anchor 0 to 3 are its corners in handle order, anchor 4 is inside.
  const STROKE = [P(100, 100), P(300, 100), P(300, 260), P(100, 260), P(200, 180)];
  const ink: Drawing = { id: 'i', kind: INK, anchors: anchorsAt(STROKE) };

  it('has the four corners of the box as handles, however many anchors it has', () => {
    expect(geometryOf(ink, host)?.handles).toEqual([
      { id: 'handle:0', x: 100, y: 100 },
      { id: 'handle:1', x: 300, y: 100 },
      { id: 'handle:2', x: 300, y: 260 },
      { id: 'handle:3', x: 100, y: 260 },
    ]);
    const long: Drawing = { id: 'long', kind: INK, anchors: Array.from({ length: 100 }, (_, i) => A(100 + i * 5, 100 + (i % 2) * 60)) };
    const { tools } = rig({}, {}, [long]);
    tools.select(['long']);
    const handles = tools.getScene().find((item) => item.type === 'handles');
    expect(handles?.type === 'handles' ? handles.points : []).toEqual([P(100, 100), P(595, 100), P(595, 160), P(100, 160)]);
  });

  // [handle, grabbed corner, where the corner goes, where the middle point goes] for a drag of 30 px right and 20 px up.
  it.each([
    [0, P(100, 100), P(130, 80), P(215, 170), 2],
    [1, P(300, 100), P(330, 80), P(215, 170), 3],
    [2, P(300, 260), P(330, 240), P(215, 170), 0],
    [3, P(100, 260), P(130, 240), P(215, 170), 1],
  ])('scales about the opposite corner when handle %i is dragged', (handle, from, corner, middle, opposite) => {
    const result = dragHandle(ink, handle, from, P(from.x + 30, from.y - 20), false, host);
    expect(result).toHaveLength(5);
    expectAnchors([result?.[handle] as Anchor], [A(corner.x, corner.y)]);
    expectAnchors([result?.[opposite] as Anchor], [ink.anchors[opposite] as Anchor]);
    expectAnchors([result?.[4] as Anchor], [A(middle.x, middle.y)]);
  });

  it('scales every point on each axis by how far the corner moved from the opposite corner', () => {
    // Corner 2 from (300, 260) to (400, 360), about (100, 100): 300 / 200 = 1.5 on x and 260 / 160 = 1.625 on y.
    const result = dragHandle(ink, 2, P(300, 260), P(400, 360), false, host);
    expectAnchors(result, anchorsAt([P(100, 100), P(400, 100), P(400, 360), P(100, 360), P(250, 230)]));
  });

  it('mirrors the drawing when the corner is dragged past the opposite corner', () => {
    // From (300, 260) to (50, 50), about the corner (100, 100); the box is 200 wide and 160 high.
    const result = dragHandle(ink, 2, P(300, 260), P(50, 50), false, host);
    // x scale (300 - 250 - 100) / 200 = -0.25, y scale (260 - 210 - 100) / 160 = -0.3125.
    expectAnchors(result, anchorsAt([P(100, 100), P(50, 100), P(50, 50), P(100, 50), P(75, 75)]));
  });

  it('does not scale along an axis where the box has no size', () => {
    const vertical = { id: 'v', kind: INK, anchors: anchorsAt([P(200, 100), P(200, 200), P(200, 300)]) };
    // Corner 2 is (200, 300); the box is 200 high, so 100 px up halves it, while 50 px right changes nothing.
    expectAnchors(dragHandle(vertical, 2, P(200, 300), P(250, 200), false, host), anchorsAt([P(200, 100), P(200, 150), P(200, 200)]));
    const horizontal = { id: 'h', kind: INK, anchors: anchorsAt([P(100, 200), P(200, 200), P(300, 200)]) };
    expectAnchors(dragHandle(horizontal, 2, P(300, 200), P(400, 250), false, host), anchorsAt([P(100, 200), P(250, 200), P(400, 200)]));
    const dot = { id: 'd', kind: INK, anchors: anchorsAt([P(150, 150), P(150, 150)]) };
    expectAnchors(dragHandle(dot, 0, P(150, 150), P(200, 200), false, host), dot.anchors);
  });

  it('is one patch of anchors, never snaps and ignores Shift and the magnet', () => {
    const plain = dragHandle(ink, 2, P(300, 260), P(340, 300), false, host);
    expect(dragHandle(ink, 2, P(300, 260), P(340, 300), true, host, 'strong')).toEqual(plain);
    expect(dragPatch(ink, 2, P(300, 260), P(340, 300), false, host)).toEqual({ anchors: plain });
    expect(handleSnap(ink, 2, P(300, 260), P(340, 300), false, host, 'strong')).toBeNull();
  });

  it('changes nothing for a handle that is not a corner or when a pane is gone', () => {
    expect(dragHandle(ink, 4, P(200, 180), P(250, 200), false, host)).toBeNull();
    expect(dragPatch(ink, -1, P(200, 180), P(250, 200), false, host)).toBeNull();
    const gone: Anchor = { time: 0, price: 1, yAxisId: 'gone' };
    expect(dragHandle({ id: 'g', kind: INK, anchors: [gone, gone] }, 0, P(0, 0), P(10, 10), false, host)).toBeNull();
    expect(dragHandle({ id: 'g', kind: INK, anchors: [ink.anchors[0] as Anchor, gone] }, 0, P(100, 100), P(110, 110), false, host)).toBeNull();
  });

  it('scales through the controller as one history entry, and Escape puts it back', () => {
    const { host: rigHost, store, tools, drag } = rig({}, {}, [ink]);
    tools.select(['i']);
    expect(tools.hitTest(300, 260)?.part).toBe('handle:2');
    drag([300, 260], [400, 360], [[350, 300]]);
    expectAnchors(store.get('i')?.anchors, anchorsAt([P(100, 100), P(400, 100), P(400, 360), P(100, 360), P(250, 230)]));
    expect(tools.undo()).toBe(true);
    expect(store.get('i')?.anchors).toEqual(ink.anchors);
    expect(tools.undo()).toBe(false);
    rigHost.pointer('down', 300, 260);
    rigHost.pointer('move', 400, 360);
    expect(store.get('i')?.anchors).not.toEqual(ink.anchors);
    expect(rigHost.key('Escape')).toBe(true);
    expect(store.get('i')?.anchors).toEqual(ink.anchors);
    expect(tools.undo()).toBe(false);
  });

  it('moves with its body and with the arrow keys like any other drawing', () => {
    const { host: rigHost, store, tools, drag } = rig({}, {}, [ink]);
    tools.select(['i']);
    expect(tools.hitTest(200, 100)?.part).toBe('body');
    drag([200, 100], [240, 120], [[220, 110]]);
    expectAnchors(
      store.get('i')?.anchors,
      ink.anchors.map((anchor) => ({ ...anchor, time: anchor.time + 240_000, price: anchor.price - 10 }))
    );
    rigHost.key('ArrowLeft');
    expect(store.get('i')?.anchors[0]?.time).toBeCloseTo(100 * 6000 + 240_000 - 60_000, 4);
  });

  it('refuses the scale while locked', () => {
    const { store, tools, drag } = rig({}, {}, [{ ...ink, locked: true }]);
    tools.select(['i']);
    drag([300, 260], [400, 360]);
    expect(store.get('i')?.anchors).toEqual(ink.anchors);
    expect(tools.undo()).toBe(false);
  });

  it('shows the resize cursor of the diagonal each corner is on, and no resize cursor when locked', () => {
    const hit = (part: `handle:${number}` | 'body', locked = false) => ({ id: 'i', part, locked });
    expect(cursorFor(null, hit('handle:0'), ink, host)).toBe('nwse-resize');
    expect(cursorFor(null, hit('handle:1'), ink, host)).toBe('nesw-resize');
    expect(cursorFor(null, hit('handle:2'), ink, host)).toBe('nwse-resize');
    expect(cursorFor(null, hit('handle:3'), ink, host)).toBe('nesw-resize');
    expect(cursorFor(null, hit('handle:2', true), ink, host)).toBe('not-allowed');
    expect(cursorFor(null, hit('body'), ink, host)).toBe('pointer');
    // The handles of a kind that is not freehand keep the move cursor.
    expect(cursorFor(null, hit('handle:1'), { id: 'p', kind: 'pent5' as DrawingKind, anchors: zigzag(5, 100) }, host)).toBe('move');
  });
});
