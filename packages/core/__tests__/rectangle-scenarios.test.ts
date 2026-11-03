import { describe, expect, it } from 'vitest';
import type { SceneItem } from '../src/scene/types';
import type { Anchor, Drawing } from '../src/types';
import { A, rig } from './controller-rig';

// E05-F03: the rectangle tool through the controller, on the mock host (QA-005). The pane is `price`,
// 800 px wide and 400 px high with prices 0 to 200 (y = (200 - p) * 2); time is x * 6000. R runs from
// (100, 100) to (300, 200), so its handles are 0 (100, 100), 1 (300, 200), 2 (100, 200), 3 (300, 100),
// the edge midpoints 4 (100, 150), 5 (300, 150), 6 (200, 100) and 7 (200, 200).
const RECTANGLE = 'rectangle';
const R: Drawing = { id: 'r', kind: RECTANGLE, anchors: [A(100, 100), A(300, 200)] };
const anchorsOf = (store: { get(id: string): { anchors: readonly Anchor[] } | undefined }, id: string): readonly Anchor[] => store.get(id)?.anchors ?? [];

function shapeItem(items: readonly SceneItem[], id: string): Extract<SceneItem, { type: 'shape' }> {
  for (const item of items) {
    if (item.type === 'shape' && item.drawingId === id) return item;
  }
  throw new Error(`No shape item for ${id}.`);
}

/** The box of drawing `id` in the scene as `[x, y, width, height]`. */
function boxOf(items: readonly SceneItem[], id: string): readonly number[] {
  for (const shape of shapeItem(items, id).shapes) {
    if (shape.type === 'rect') return [shape.x, shape.y, shape.width, shape.height];
  }
  throw new Error(`No rect for ${id}.`);
}

describe('placing a rectangle by two opposite corners (FR-INT-010)', () => {
  it.each<[string, [number, number], [number, number]]>([
    ['down and right', [100, 100], [300, 200]],
    ['up and right', [100, 200], [300, 100]],
    ['down and left', [300, 100], [100, 200]],
    ['up and left', [300, 200], [100, 100]],
  ])('places by click, move, click, %s, and draws the same box', (_name, first, second) => {
    const { host, store, tools, click } = rig();
    tools.activate(RECTANGLE);
    click(first[0], first[1]);
    expect(store.list()).toHaveLength(0);
    host.pointer('move', second[0], second[1]);
    click(second[0], second[1]);
    expect(store.list()).toEqual([{ id: 'd1', kind: RECTANGLE, anchors: [A(first[0], first[1]), A(second[0], second[1])] }]);
    expect(tools.getState().selection).toEqual(['d1']);
    expect(boxOf(tools.getScene(), 'd1')).toEqual([100, 100, 200, 100]);
  });

  it.each<[string, [number, number], [number, number]]>([
    ['down and right', [100, 100], [300, 200]],
    ['up and left', [300, 200], [100, 100]],
  ])('places by pressing, dragging and releasing, %s', (_name, from, to) => {
    const { store, tools, drag } = rig();
    tools.activate(RECTANGLE);
    drag(from, to, [[200, 150]]);
    expect(store.list()).toEqual([{ id: 'd1', kind: RECTANGLE, anchors: [A(from[0], from[1]), A(to[0], to[1])] }]);
  });

  it('is one history entry that undo removes and redo brings back', () => {
    const { store, tools, drag } = rig();
    tools.activate(RECTANGLE);
    drag([100, 100], [300, 200], [[200, 150]]);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.redo()).toBe(true);
    expect(anchorsOf(store, 'd1')).toEqual([A(100, 100), A(300, 200)]);
  });

  it('creates nothing from a second corner on the first one', () => {
    const { store, tools, drag } = rig();
    tools.activate(RECTANGLE);
    drag([100, 100], [100, 100], [[140, 100]]);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBe(RECTANGLE);
  });
});

describe('the eight handles (FR-INT-032)', () => {
  it('has a handle on every corner and every edge midpoint of a selected rectangle', () => {
    const { tools } = rig({}, {}, [R]);
    tools.select(['r']);
    const handles = tools.getScene().find((item) => item.type === 'handles');
    expect(handles?.type === 'handles' ? handles.points : []).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 200 },
      { x: 100, y: 200 },
      { x: 300, y: 100 },
      { x: 100, y: 150 },
      { x: 300, y: 150 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
    ]);
  });

  it.each<[number, [number, number], string]>([
    [0, [100, 100], 'nwse-resize'],
    [1, [300, 200], 'nwse-resize'],
    [2, [100, 200], 'nesw-resize'],
    [3, [300, 100], 'nesw-resize'],
    [4, [100, 150], 'ew-resize'],
    [5, [300, 150], 'ew-resize'],
    [6, [200, 100], 'ns-resize'],
    [7, [200, 200], 'ns-resize'],
  ])('shows the resize cursor over handle %s', (handle, [x, y], cursor) => {
    const { host, tools } = rig({}, {}, [R]);
    tools.select(['r']);
    host.pointer('move', x, y);
    expect(host.cursors[host.cursors.length - 1]).toBe(cursor);
    expect(tools.hitTest(x, y)?.part).toBe(`handle:${handle}`);
  });

  it('resizes with a corner handle, changing time and price of that corner only', () => {
    const { store, click, drag } = rig({}, {}, [R]);
    click(200, 150);
    drag([300, 200], [350, 260], [[320, 230]]);
    const [first, second] = anchorsOf(store, 'r');
    expect(first).toEqual(A(100, 100));
    expect(second?.time).toBe(350 * 6000);
    expect(second?.price).toBeCloseTo(70, 9);
  });

  it('changes one coordinate with an x edge handle: the time of that anchor only', () => {
    const { store, click, drag } = rig({}, {}, [R]);
    click(200, 150);
    drag([100, 150], [120, 180], [[110, 165]]);
    const [first, second] = anchorsOf(store, 'r');
    expect(first?.time).toBe(120 * 6000);
    expect(first?.price).toBe(A(100, 100).price);
    expect(second).toEqual(A(300, 200));
  });

  it('changes one coordinate with a y edge handle: the price of that anchor only', () => {
    const { store, click, drag } = rig({}, {}, [R]);
    click(200, 150);
    drag([200, 200], [230, 240], [[215, 220]]);
    const [first, second] = anchorsOf(store, 'r');
    expect(first).toEqual(A(100, 100));
    expect(second?.time).toBe(A(300, 200).time);
    expect(second?.price).toBeCloseTo(80, 9);
  });

  it('is one history entry per resize, and undo puts the corners back', () => {
    const { store, tools, click, drag } = rig({}, {}, [R]);
    click(200, 150);
    drag([300, 200], [350, 260], [[320, 230]]);
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'r')).toEqual(R.anchors);
    expect(tools.getState().canUndo).toBe(false);
  });
});

describe('moving and deleting a rectangle', () => {
  it('moves with a drag inside the filled box, as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [R]);
    click(200, 150);
    drag([200, 150], [250, 170], [[225, 160]]);
    const [first, second] = anchorsOf(store, 'r');
    expect(first?.time).toBe(150 * 6000);
    // 20 px down is 10 price: from 150 to 140 and from 100 to 90.
    expect(first?.price).toBeCloseTo(140, 9);
    expect(second?.time).toBe(350 * 6000);
    expect(second?.price).toBeCloseTo(90, 9);
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'r')).toEqual(R.anchors);
  });

  it('removes the selected rectangle with Delete, and undo and redo bring it back and remove it again', () => {
    const { host, store, tools, click } = rig({}, {}, [R]);
    click(200, 150);
    expect(host.key('Delete')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([R]);
    expect(tools.redo()).toBe(true);
    expect(store.list()).toHaveLength(0);
  });
});

describe('fill and border hit rules (FR-HIT-003)', () => {
  it('has a fill opacity of 0.15 by default, so a point inside hits', () => {
    const { tools } = rig({}, {}, [R]);
    expect(shapeItem(tools.getScene(), 'r').style.fillOpacity).toBe(0.15);
    expect(tools.hitTest(200, 150)).toEqual({ id: 'r', part: 'body', locked: false });
  });

  it('hits only the border within the tolerance when fillOpacity is 0', () => {
    const { tools } = rig({}, {}, [{ ...R, style: { fillOpacity: 0 } }]);
    expect(tools.hitTest(200, 150)).toBeNull();
    expect(tools.hitTest(200, 105)).toEqual({ id: 'r', part: 'body', locked: false });
    expect(tools.hitTest(200, 94)).toEqual({ id: 'r', part: 'body', locked: false });
    expect(tools.hitTest(200, 93)).toBeNull();
  });

  it('lets a click inside an empty box select what lies inside it instead', () => {
    const inner: Drawing = { id: 'i', kind: 'trend-line', anchors: [A(150, 150), A(250, 150)] };
    const { tools, click } = rig({}, {}, [{ ...R, style: { fillOpacity: 0 } }, inner]);
    click(200, 150);
    expect(tools.getState().selection).toEqual(['i']);
    click(200, 105);
    expect(tools.getState().selection).toEqual(['r']);
  });
});
