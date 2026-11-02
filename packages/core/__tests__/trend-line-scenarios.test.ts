import { describe, expect, it } from 'vitest';
import type { Point } from '../src/host';
import type { SceneItem } from '../src/scene/types';
import type { Anchor, Drawing } from '../src/types';
import { A, LINE, previewEnd, rig } from './controller-rig';

// E05-F01: the trend line tool through the controller, on the mock host (QA-005). The pane is
// `price`, 800 px wide and 400 px high with prices 0 to 200 (y = (200 - p) * 2); time is x * 6000, so a
// pixel is 6 000 ms and a price pane pixel is half a price. The last bar is at x = 400: everything to
// the right of it is future space. LINE runs from (100, 200) to (300, 100).
const TREND = 'trend-line';
const anchorsOf = (store: { get(id: string): { anchors: readonly Anchor[] } | undefined }, id: string): readonly Anchor[] => store.get(id)?.anchors ?? [];

/** The ends of the body line of drawing `id` in the scene, left end first. */
function bodyEnds(items: readonly SceneItem[], id: string): readonly [Point, Point] {
  for (const item of items) {
    if (item.type !== 'shape' || item.drawingId !== id) continue;
    for (const shape of item.shapes) {
      if (shape.type === 'line' && shape.part === 'body') return shape.from.x <= shape.to.x ? [shape.from, shape.to] : [shape.to, shape.from];
    }
  }
  throw new Error(`No body line for ${id}.`);
}

/** The first anchor is at (100, 200), the pointer 200 px right and 10 px below it: Shift puts it on the horizontal, at the same distance. */
const LOCKED_X = 100 + Math.hypot(200, 10);

describe('placing a trend line (FR-INT-010)', () => {
  it('places by click, move, click', () => {
    const { host, store, tools, click } = rig();
    tools.activate(TREND);
    click(100, 200);
    expect(store.list()).toHaveLength(0);
    host.pointer('move', 300, 100);
    click(300, 100);
    expect(store.list()).toEqual([{ id: 'd1', kind: TREND, anchors: [A(100, 200), A(300, 100)] }]);
    expect(tools.getState().selection).toEqual(['d1']);
    expect(tools.getState().activeTool).toBeNull();
  });

  it('places by pressing, dragging and releasing', () => {
    const { store, tools, drag } = rig();
    tools.activate(TREND);
    drag([100, 200], [300, 100], [[200, 150]]);
    expect(store.list()).toEqual([{ id: 'd1', kind: TREND, anchors: [A(100, 200), A(300, 100)] }]);
  });

  it('is one history entry that undo removes and redo brings back', () => {
    const { store, tools, drag } = rig();
    tools.activate(TREND);
    drag([100, 200], [300, 100], [[200, 150]]);
    expect(tools.getState().canUndo).toBe(true);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().canUndo).toBe(false);
    expect(tools.redo()).toBe(true);
    expect(store.get('d1')?.anchors).toEqual([A(100, 200), A(300, 100)]);
  });

  it('creates nothing from a zero-length drag and starts over', () => {
    const { store, tools, drag } = rig();
    tools.activate(TREND);
    drag([100, 200], [100, 200], [[140, 200]]);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBe(TREND);
  });

  it('cancels with Escape without a store change', () => {
    const { host, store, tools, click } = rig();
    tools.activate(TREND);
    click(100, 200);
    expect(host.key('Escape')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBeNull();
  });
});

describe('Shift locks the angle to 45 degree steps (FR-INT-031)', () => {
  it('moves the preview and the second anchor of a click-click placement', () => {
    const { host, store, tools, click } = rig();
    tools.activate(TREND);
    click(100, 200);
    host.pointer('move', 300, 210, { shiftKey: true });
    const end = previewEnd(tools.getScene());
    expect(end?.x).toBeCloseTo(LOCKED_X, 9);
    expect(end?.y).toBeCloseTo(200, 9);
    click(300, 210, { shiftKey: true });
    const [first, second] = anchorsOf(store, 'd1');
    expect(first).toEqual(A(100, 200));
    expect(second?.time).toBeCloseTo(LOCKED_X * 6000, 4);
    expect(second?.price).toBeCloseTo(100, 9);
  });

  it('puts a dragged placement on the nearest 45 degree direction', () => {
    const { store, tools, drag } = rig();
    tools.activate(TREND);
    drag([100, 200], [200, 290], [[150, 245]], { shiftKey: true });
    const reach = Math.hypot(100, 90) * Math.SQRT1_2;
    const second = anchorsOf(store, 'd1')[1];
    expect(second?.time).toBeCloseTo((100 + reach) * 6000, 4);
    expect(second?.price).toBeCloseTo((400 - (200 + reach)) / 2, 9);
  });

  it('is free again when Shift is released', () => {
    const { host, tools, click } = rig();
    tools.activate(TREND);
    click(100, 200);
    host.pointer('move', 300, 210, { shiftKey: true });
    host.pointer('move', 300, 210);
    const end = previewEnd(tools.getScene());
    expect(end?.x).toBeCloseTo(300, 9);
    expect(end?.y).toBeCloseTo(210, 9);
  });

  it('does not lock the other tools', () => {
    const { store, tools, drag } = rig();
    tools.activate('rectangle');
    drag([100, 200], [200, 290], [[150, 245]], { shiftKey: true });
    expect(anchorsOf(store, 'd1')[1]).toEqual(A(200, 290));
  });

  it('does not snap the locked anchor to a bar, even with the magnet on', () => {
    const { store, tools, click } = rig({ magnet: 'strong' });
    tools.activate(TREND);
    click(100, 200);
    click(300, 210, { shiftKey: true });
    const second = anchorsOf(store, 'd1')[1];
    // The bar at x = 300 is at time 1 800 000: the locked anchor is where Shift put it.
    expect(second?.time).toBeCloseTo(LOCKED_X * 6000, 4);
    expect(second?.price).toBeCloseTo(100, 9);
  });

  it('does not apply to the keyboard, where Shift makes a step ten times as long', () => {
    const { host, tools } = rig();
    tools.activate(TREND);
    host.key('Enter');
    host.key('ArrowRight');
    host.key('ArrowDown');
    host.key('ArrowRight', { shiftKey: true });
    // The cursor started at the centre (400, 200): one bar and one pixel down, then ten bars: 110 px right and 1 px down, not locked.
    const end = previewEnd(tools.getScene());
    expect(end?.x).toBeCloseTo(510, 9);
    expect(end?.y).toBeCloseTo(201, 9);
  });

  it.each([false, true])('places the second anchor with Enter where the keyboard cursor is, not locked (Shift held: %s)', (shiftKey) => {
    const { host, store, tools } = rig();
    tools.activate(TREND);
    host.key('Enter');
    host.key('ArrowRight');
    host.key('ArrowDown');
    host.key('Enter', { shiftKey });
    // One bar and one pixel down of the centre (400, 200): 1 px off the horizontal, which a lock would remove.
    const [first, second] = anchorsOf(store, 'd1');
    expect(first).toEqual(A(400, 200));
    expect(second?.time).toBe(410 * 6000);
    expect(second?.price).toBeCloseTo(99.5, 9);
  });

  it('locks the angle of an endpoint being dragged', () => {
    const { store, click, drag } = rig({}, {}, [LINE]);
    click(200, 150);
    // The handle at (300, 100) goes 100 px right and 40 px down; the other end is at (100, 200): 11 degrees up, so horizontal.
    drag([300, 100], [400, 140], [[350, 120]], { shiftKey: true });
    const reach = Math.hypot(300, 60);
    const second = anchorsOf(store, 'l')[1];
    expect(anchorsOf(store, 'l')[0]).toEqual(LINE.anchors[0]);
    expect(second?.time).toBeCloseTo((100 + reach) * 6000, 4);
    expect(second?.price).toBeCloseTo(100, 9);
  });
});

describe('selecting, resizing and moving a trend line (FR-INT-030)', () => {
  it('shows two handles on the ends of a selected line', () => {
    const { tools, click } = rig({}, {}, [LINE]);
    click(200, 150);
    expect(tools.getState().selection).toEqual(['l']);
    const handles = tools.getScene().find((item) => item.type === 'handles');
    expect(handles?.type === 'handles' ? handles.points : []).toEqual([
      { x: 100, y: 200 },
      { x: 300, y: 100 },
    ]);
  });

  it('resizes with the handle at the second end, as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [LINE]);
    click(200, 150);
    drag([300, 100], [350, 60], [[320, 80]]);
    const [first, second] = anchorsOf(store, 'l');
    expect(first).toEqual(LINE.anchors[0]);
    expect(second?.time).toBe(350 * 6000);
    expect(second?.price).toBeCloseTo(170, 9);
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'l')).toEqual(LINE.anchors);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('resizes with the handle at the first end', () => {
    const { store, click, drag } = rig({}, {}, [LINE]);
    click(200, 150);
    drag([100, 200], [60, 240], [[80, 220]]);
    const [first, second] = anchorsOf(store, 'l');
    expect(first?.time).toBe(60 * 6000);
    expect(first?.price).toBeCloseTo(80, 9);
    expect(second).toEqual(LINE.anchors[1]);
  });

  it('moves with a drag on the body, as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [LINE]);
    click(200, 150);
    drag([200, 150], [250, 170], [[225, 160]]);
    const [first, second] = anchorsOf(store, 'l');
    expect(first?.time).toBe(150 * 6000);
    expect(first?.price).toBeCloseTo(90, 9);
    expect(second?.time).toBe(350 * 6000);
    expect(second?.price).toBeCloseTo(140, 9);
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'l')).toEqual(LINE.anchors);
  });

  it('puts a drag back with Escape', () => {
    const { host, store, tools, click } = rig({}, {}, [LINE]);
    click(200, 150);
    host.pointer('down', 300, 100);
    host.pointer('move', 350, 60);
    expect(anchorsOf(store, 'l')[1]?.time).toBe(350 * 6000);
    host.key('Escape');
    expect(anchorsOf(store, 'l')).toEqual(LINE.anchors);
    expect(tools.getState().canUndo).toBe(false);
  });
});

describe('deleting a trend line', () => {
  it('removes the selected line, and undo and redo bring it back and remove it again', () => {
    const { host, store, tools, click } = rig({}, {}, [LINE]);
    click(200, 150);
    expect(host.key('Delete')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().selection).toEqual([]);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([LINE]);
    expect(tools.redo()).toBe(true);
    expect(store.list()).toHaveLength(0);
  });
});

describe('extensions (FR-GEO-002, FR-DM-020)', () => {
  const extended = (extendLeft: boolean, extendRight: boolean) => ({ ...LINE, options: { extendLeft, extendRight } });

  it('draws only the segment without an extension', () => {
    const { tools } = rig({}, {}, [LINE]);
    const [left, right] = bodyEnds(tools.getScene(), 'l');
    expect(left).toEqual({ x: 100, y: 200 });
    expect(right).toEqual({ x: 300, y: 100 });
  });

  it('draws a ray to the top of the pane with extendRight, through the future space right of the last bar', () => {
    const { tools } = rig({}, {}, [extended(false, true)]);
    const [left, right] = bodyEnds(tools.getScene(), 'l');
    expect(left).toEqual({ x: 100, y: 200 });
    // The line rises half a pixel per pixel: from (300, 100) it leaves the pane at (500, 0), 100 px past the last bar at x = 400.
    expect(right.x).toBeCloseTo(500, 9);
    expect(right.y).toBeCloseTo(0, 9);
  });

  it('draws a ray to the left edge of the pane with extendLeft', () => {
    const { tools } = rig({}, {}, [extended(true, false)]);
    const [left, right] = bodyEnds(tools.getScene(), 'l');
    expect(left.x).toBeCloseTo(0, 9);
    expect(left.y).toBeCloseTo(250, 9);
    expect(right).toEqual({ x: 300, y: 100 });
  });

  it('draws both rays with both extensions', () => {
    const { tools } = rig({}, {}, [extended(true, true)]);
    const [left, right] = bodyEnds(tools.getScene(), 'l');
    expect(left.x).toBeCloseTo(0, 9);
    expect(right.y).toBeCloseTo(0, 9);
  });

  it('finds the line along the extension and nowhere else', () => {
    const { tools } = rig({}, {}, [extended(true, true)]);
    // On the right extension (400, 50), on the left one (50, 225); 20 px off the line is a miss.
    expect(tools.hitTest(400, 50)).toEqual({ id: 'l', part: 'body', locked: false });
    expect(tools.hitTest(50, 225)).toEqual({ id: 'l', part: 'body', locked: false });
    expect(tools.hitTest(400, 70)).toBeNull();
  });

  it('does not find the line beyond the segment without an extension', () => {
    const { tools } = rig({}, {}, [LINE]);
    expect(tools.hitTest(200, 150)).toEqual({ id: 'l', part: 'body', locked: false });
    expect(tools.hitTest(400, 50)).toBeNull();
    expect(tools.hitTest(50, 225)).toBeNull();
  });

  it('toggles an extension as one history entry', () => {
    const { store, tools } = rig({}, {}, [LINE]);
    store.update('l', { options: { extendRight: true } });
    expect(tools.hitTest(400, 50)?.id).toBe('l');
    expect(bodyEnds(tools.getScene(), 'l')[1].y).toBeCloseTo(0, 9);
    expect(tools.getState().canUndo).toBe(true);
    expect(tools.undo()).toBe(true);
    expect(store.get('l')?.options?.extendRight).not.toBe(true);
    expect(tools.hitTest(400, 50)).toBeNull();
    expect(tools.getState().canUndo).toBe(false);
    expect(tools.redo()).toBe(true);
    expect(store.get('l')?.options).toEqual({ extendRight: true });
  });

  it('keeps the ray correct for a line that lies in future space, right of the last bar', () => {
    // Both anchors are right of the last bar (x = 400): the host extrapolates time to x.
    const future: Drawing = { id: 'f', kind: TREND, anchors: [A(500, 300), A(600, 250)], options: { extendRight: true } };
    const { tools } = rig({}, {}, [future]);
    const [left, right] = bodyEnds(tools.getScene(), 'f');
    expect(left).toEqual({ x: 500, y: 300 });
    // Slope -0.5: it leaves the pane on the right edge, x = 800, at y = 250 - 0.5 * 200 = 150.
    expect(right.x).toBeCloseTo(800, 9);
    expect(right.y).toBeCloseTo(150, 9);
  });
});
