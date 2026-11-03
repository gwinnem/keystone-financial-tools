import { describe, expect, it } from 'vitest';
import { DrawingError } from '../src/errors';
import { geometryOf } from '../src/geometry/index';
import type { LineShape, Shape } from '../src/geometry/types';
import type { HitResult } from '../src/hit/hit-test';
import { cursorFor } from '../src/interaction/cursor';
import type { SceneItem } from '../src/scene/types';
import type { DrawingStore } from '../src/store';
import { createMockHost } from '../src/testing/mock-host';
import type { Anchor, Drawing, KindOptions } from '../src/types';
import { A, rig } from './controller-rig';

// E05-F08: the Fibonacci time zones tool through the controller, on the mock host (QA-005). The pane is
// `price`, 800 px wide and 400 px high with prices 0 to 200 (y = (200 - p) * 2); time is x * 6000.
// TZ has its anchors at x = 100 and x = 130, so the unit is 30 px: with the default sequence 0, 1, 2, 3, 5,
// 8, 13, 21, 34, 55, 89 the lines stand at x = 100 + 30 * n, that is 100, 130, 160, 190, 250, 340, 490 and
// 730 (the rest is right of the pane). A line spans the pane from y = 0 to 400; the handles sit at the
// anchor times, vertically centred (y = 200). The prices of the anchors play no part (D-5).
const ZONES = 'fibonacci-time-zones';
const TZ: Drawing = { id: 'a', kind: ZONES, anchors: [A(100, 300), A(130, 100)] };
const DEFAULT_SEQUENCE = [0, 1, 2, 3, 5, 8, 13, 21];
const anchorsOf = (store: { get(id: string): { anchors: readonly Anchor[] } | undefined }, id: string): readonly Anchor[] => store.get(id)?.anchors ?? [];
const host = createMockHost();

type ZonesSceneItem = Extract<SceneItem, { type: 'fibonacci'; kind: 'fibonacci-time-zones' }>;

function zonesItem(items: readonly SceneItem[], id: string): ZonesSceneItem {
  for (const item of items) {
    if (item.type === 'fibonacci' && item.kind === ZONES && item.drawingId === id) return item;
  }
  throw new Error(`No time zones item for ${id}.`);
}

/** The shapes of the placement preview: the preview item with levels (the snap indicator is a preview item too). */
function previewShapes(items: readonly SceneItem[]): readonly Shape[] {
  for (const item of items) {
    if (item.type === 'preview' && item.shapes.some((shape) => shape.part.startsWith('level:'))) return item.shapes;
  }
  throw new Error('No preview item.');
}

const lines = (shapes: readonly Shape[]): LineShape[] => shapes.filter((shape): shape is LineShape => shape.type === 'line');
const linesOf = (drawing: Drawing, onHost = host): LineShape[] => lines(geometryOf(drawing, onHost)?.shapes ?? []);
const partsOf = (shapes: readonly LineShape[]): string[] => shapes.map((shape) => shape.part);
const levelParts = (sequence: readonly number[]): string[] => sequence.map((n) => `level:${n}`);
const xs = (shapes: readonly LineShape[]): number[] => shapes.map((shape) => shape.from.x);

/** Changes some options of drawing `a`, keeping the others (an update replaces the options object). */
function setOptions(store: DrawingStore, patch: KindOptions): void {
  store.update('a', { options: { ...store.get('a')?.options, ...patch } });
}

describe('placing time zones by two anchors (FR-INT-010)', () => {
  it('places by click, move, click, the second anchor setting the unit, and selects it', () => {
    const { host: mock, store, tools, click } = rig();
    tools.activate(ZONES);
    click(100, 300);
    expect(store.list()).toHaveLength(0);
    mock.pointer('move', 130, 100);
    click(130, 100);
    expect(store.list()).toEqual([{ id: 'd1', kind: ZONES, anchors: [A(100, 300), A(130, 100)] }]);
    expect(tools.getState().selection).toEqual(['d1']);
    expect(tools.getState().activeTool).toBeNull();
  });

  it('places by pressing, dragging and releasing', () => {
    const { store, tools, drag } = rig();
    tools.activate(ZONES);
    drag([100, 300], [130, 100], [[115, 200]]);
    expect(store.list()).toEqual([{ id: 'd1', kind: ZONES, anchors: [A(100, 300), A(130, 100)] }]);
  });

  it('is one history entry that undo removes and redo brings back', () => {
    const { store, tools, drag } = rig();
    tools.activate(ZONES);
    drag([100, 300], [130, 100], [[115, 200]]);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().canUndo).toBe(false);
    expect(tools.redo()).toBe(true);
    expect(anchorsOf(store, 'd1')).toEqual([A(100, 300), A(130, 100)]);
  });

  it('creates nothing from a second anchor on the first one, and stays in the tool', () => {
    const { store, tools, drag } = rig();
    tools.activate(ZONES);
    drag([100, 300], [100, 300], [[140, 300]]);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBe(ZONES);
  });

  it('cancels with Escape without a store change', () => {
    const { host: mock, store, tools, click } = rig();
    tools.activate(ZONES);
    click(100, 300);
    expect(mock.key('Escape')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBeNull();
  });

  it('shows the lines while it is placed, across the pane', () => {
    const { host: mock, tools, click } = rig();
    tools.activate(ZONES);
    click(100, 300);
    mock.pointer('move', 130, 100);
    const preview = lines(previewShapes(tools.getScene()));
    expect(partsOf(preview)).toEqual(levelParts(DEFAULT_SEQUENCE));
    expect(xs(preview)).toEqual([100, 130, 160, 190, 250, 340, 490, 730]);
    expect(preview.every((line) => line.from.y === 0 && line.to.y === 400)).toBe(true);
  });

  it('turns a second anchor straight above the first into a unit of 0: the drawing exists and draws nothing', () => {
    const { store, tools, drag } = rig();
    tools.activate(ZONES);
    drag([200, 300], [200, 100], [[200, 200]]);
    expect(store.list()).toHaveLength(1);
    expect(linesOf(store.get('d1') as Drawing)).toEqual([]);
  });
});

describe('the scene for the host renderer (FR-SC-004)', () => {
  it('has a fibonacci item in data space with the default sequence resolved', () => {
    const { tools } = rig({}, {}, [TZ]);
    const item = zonesItem(tools.getScene(), 'a');
    expect(item.anchors).toEqual(TZ.anchors);
    expect(item.options).toEqual({ sequence: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89], showLabels: true });
    expect('shapes' in item).toBe(false);
  });

  it('has the core handles at the anchor times, centred vertically, of a selected drawing', () => {
    const { tools } = rig({}, {}, [TZ]);
    tools.select(['a']);
    const items = tools.getScene();
    expect(items.map((item) => item.type)).toEqual(['fibonacci', 'handles']);
    const handles = items[1];
    expect(handles?.type === 'handles' ? handles.points : []).toEqual([
      { x: 100, y: 200 },
      { x: 130, y: 200 },
    ]);
  });
});

describe('the lines (FR-GEO-006, D-5)', () => {
  it('stands at t1 + n * (t2 - t1) for every n of the sequence, across the pane, and leaves out what is right of it', () => {
    const shapes = linesOf(TZ);
    expect(partsOf(shapes)).toEqual(levelParts(DEFAULT_SEQUENCE));
    expect(xs(shapes)).toEqual([100, 130, 160, 190, 250, 340, 490, 730]);
    for (const shape of shapes) {
      expect(shape.from.x).toBe(shape.to.x);
      expect(shape.from.y).toBe(0);
      expect(shape.to.y).toBe(400);
    }
  });

  it('runs to the left when the second anchor is left of the first, and leaves out what is left of the pane', () => {
    const left: Drawing = { id: 'a', kind: ZONES, anchors: [A(130, 100), A(100, 300)] };
    const shapes = linesOf(left);
    expect(partsOf(shapes)).toEqual(levelParts([0, 1, 2, 3]));
    expect(xs(shapes)).toEqual([130, 100, 70, 40]);
  });

  it('ignores the prices of the anchors: the same times give the same lines and handles whatever the prices', () => {
    const high: Drawing = { id: 'a', kind: ZONES, anchors: [A(100, 20), A(130, 380)] };
    expect(geometryOf(high, host)).toEqual(geometryOf(TZ, host));
    expect(geometryOf(high, host)?.handles.map((handle) => handle.y)).toEqual([200, 200]);
  });

  it('draws nothing for a unit of 0, whatever the sequence', () => {
    const same: Drawing = { id: 'a', kind: ZONES, anchors: [A(200, 300), A(200, 100)] };
    expect(linesOf(same)).toEqual([]);
    const { tools } = rig({}, {}, [same]);
    expect(tools.hitTest(200, 50)).toBeNull();
  });

  it('follows a zoom of the time axis: the unit is the distance of the anchors on the screen', () => {
    const zoomed = createMockHost();
    zoomed.zoom(2, 0);
    // The anchors are now at x = 200 and 260, so the unit is 60 px and the lines stand at 200 + 60 * n.
    const shapes = linesOf(TZ, zoomed);
    expect(partsOf(shapes)).toEqual(levelParts([0, 1, 2, 3, 5, 8]));
    expect(xs(shapes)).toEqual([200, 260, 320, 380, 500, 680]);
  });
});

describe('selecting by a line (FR-HIT-003)', () => {
  it('selects the drawing with a click on a line', () => {
    const { tools, click } = rig({}, {}, [TZ]);
    click(130, 50);
    expect(tools.getState().selection).toEqual(['a']);
  });

  it.each<[string, number, number]>([
    ['level:0', 100, 50],
    ['level:1', 130, 50],
    ['level:2', 160, 380],
    ['level:3', 190, 10],
    ['level:5', 250, 300],
    ['level:8', 340, 100],
    ['level:13', 490, 100],
    ['level:21', 730, 399],
  ])('reports the part %s for a point on the line', (part, x, y) => {
    const { tools } = rig({}, {}, [TZ]);
    expect(tools.hitTest(x, y)).toEqual({ id: 'a', part, locked: false });
  });

  it('hits a line within 6 px and misses it beyond', () => {
    const { tools } = rig({}, {}, [TZ]);
    expect(tools.hitTest(136, 50)).toEqual({ id: 'a', part: 'level:1', locked: false });
    expect(tools.hitTest(124, 50)).toEqual({ id: 'a', part: 'level:1', locked: false });
    expect(tools.hitTest(137, 50)).toBeNull();
    expect(tools.hitTest(123, 50)).toBeNull();
  });

  it('finds nothing between the lines, right of the last one or left of the first', () => {
    const { tools } = rig({}, {}, [TZ]);
    expect(tools.hitTest(115, 50)).toBeNull();
    expect(tools.hitTest(600, 50)).toBeNull();
    expect(tools.hitTest(790, 50)).toBeNull();
    expect(tools.hitTest(50, 50)).toBeNull();
  });

  it('hits the handles of a selected drawing first, and the lines elsewhere', () => {
    const { tools } = rig({}, {}, [TZ]);
    tools.select(['a']);
    expect(tools.hitTest(100, 200)?.part).toBe('handle:0');
    expect(tools.hitTest(130, 200)?.part).toBe('handle:1');
    expect(tools.hitTest(130, 50)?.part).toBe('level:1');
  });

  it('reports the line at the first anchor for a drawing that is not selected', () => {
    const { tools } = rig({}, {}, [TZ]);
    expect(tools.hitTest(100, 200)).toEqual({ id: 'a', part: 'level:0', locked: false });
  });
});

describe('resizing, moving and deleting time zones (FR-INT-032)', () => {
  it('changes only the time with the handle at anchor 2, as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [TZ]);
    click(130, 50);
    drag([130, 200], [160, 250], [[145, 220]]);
    const [first, second] = anchorsOf(store, 'a');
    expect(first).toEqual(A(100, 300));
    // The pointer went 30 px right and 50 px down: the time follows, the price stays.
    expect(second).toEqual({ time: 160 * 6000, price: 150, yAxisId: 'price' });
    // The unit is 60 px now: the second line is at 160, the old one at 130 is gone.
    expect(tools.hitTest(160, 50)?.part).toBe('level:1');
    expect(tools.hitTest(130, 50)).toBeNull();
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'a')).toEqual(TZ.anchors);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('changes only the time with the handle at anchor 1', () => {
    const { store, click, drag } = rig({}, {}, [TZ]);
    click(130, 50);
    drag([100, 200], [70, 150], [[85, 170]]);
    const [first, second] = anchorsOf(store, 'a');
    expect(first).toEqual({ time: 70 * 6000, price: 50, yAxisId: 'price' });
    expect(second).toEqual(TZ.anchors[1]);
  });

  it('does not snap a dragged handle to a bar, even with the magnet on', () => {
    const { store, click, drag } = rig({ magnet: 'strong' }, {}, [TZ]);
    click(130, 50);
    // The bar at x = 300 is the nearest to 290: a handle that sets a whole anchor would snap to it.
    drag([130, 200], [290, 200], [[200, 200]]);
    expect(anchorsOf(store, 'a')[1]).toEqual({ time: 290 * 6000, price: 150, yAxisId: 'price' });
  });

  it('moves with a drag on a line, in time, as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [TZ]);
    click(130, 50);
    drag([130, 50], [160, 70], [[145, 60]]);
    const [first, second] = anchorsOf(store, 'a');
    expect(first?.time).toBe(130 * 6000);
    expect(second?.time).toBe(160 * 6000);
    expect(tools.hitTest(160, 300)?.part).toBe('level:1');
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'a')).toEqual(TZ.anchors);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('puts a drag back with Escape', () => {
    const { host: mock, store, tools, click } = rig({}, {}, [TZ]);
    click(130, 50);
    mock.pointer('down', 130, 200);
    mock.pointer('move', 160, 250);
    expect(anchorsOf(store, 'a')[1]?.time).toBe(160 * 6000);
    mock.key('Escape');
    expect(anchorsOf(store, 'a')).toEqual(TZ.anchors);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('removes the selected time zones with Delete, and undo and redo bring them back and remove them again', () => {
    const { host: mock, store, tools, click } = rig({}, {}, [TZ]);
    click(130, 50);
    expect(mock.key('Delete')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([TZ]);
    expect(tools.redo()).toBe(true);
    expect(store.list()).toHaveLength(0);
  });
});

describe('cursors (FR-INT-020)', () => {
  const lastCursor = (cursors: readonly string[]): string | undefined => cursors[cursors.length - 1];

  it('shows ew-resize over a handle, pointer over a line and the default cursor elsewhere', () => {
    const { host: mock, click } = rig({}, {}, [TZ]);
    click(130, 50);
    mock.pointer('move', 130, 200);
    expect(lastCursor(mock.cursors)).toBe('ew-resize');
    mock.pointer('move', 100, 200);
    expect(lastCursor(mock.cursors)).toBe('ew-resize');
    mock.pointer('move', 160, 50);
    expect(lastCursor(mock.cursors)).toBe('pointer');
    mock.pointer('move', 400, 50);
    expect(lastCursor(mock.cursors)).toBe('default');
  });

  it('shows not-allowed over a handle of locked time zones', () => {
    const { host: mock, click } = rig({}, {}, [{ ...TZ, locked: true }]);
    click(130, 50);
    mock.pointer('move', 130, 200);
    expect(lastCursor(mock.cursors)).toBe('not-allowed');
  });

  it('keeps move for a handle of a drawing it does not know, and for the other kinds', () => {
    const hit: HitResult = { id: 'a', part: 'handle:0', locked: false };
    expect(cursorFor(null, hit, undefined, host)).toBe('move');
    expect(cursorFor(null, hit, { id: 'a', kind: 'trend-line', anchors: [A(1, 1), A(2, 2)] }, host)).toBe('move');
    expect(cursorFor(null, hit, TZ, host)).toBe('ew-resize');
    expect(cursorFor(null, { ...hit, part: 'level:1' }, TZ, host)).toBe('pointer');
    expect(cursorFor(ZONES, hit, TZ, host)).toBe('crosshair');
  });
});

describe('the sequence (FR-DM-022)', () => {
  const SEQUENCE_KEYS = ['sequence', 'showLabels'];

  it('draws the lines of the sequence of the drawing', () => {
    const custom: Drawing = { ...TZ, options: { sequence: [0, 3, 6] } };
    const { tools } = rig({}, {}, [custom]);
    expect(partsOf(linesOf(custom))).toEqual(levelParts([0, 3, 6]));
    expect(zonesItem(tools.getScene(), 'a').options.sequence).toEqual([0, 3, 6]);
    expect(tools.hitTest(190, 50)?.part).toBe('level:3');
    expect(tools.hitTest(130, 50)).toBeNull();
  });

  it('follows an update of the sequence at once, as one history entry', () => {
    const { store, tools } = rig({}, {}, [TZ]);
    expect(tools.hitTest(160, 50)?.part).toBe('level:2');
    setOptions(store, { sequence: [0, 2, 4] });
    expect(zonesItem(tools.getScene(), 'a').options.sequence).toEqual([0, 2, 4]);
    // The lines are at 100, 160 and 220 now.
    expect(tools.hitTest(220, 50)).toEqual({ id: 'a', part: 'level:4', locked: false });
    expect(tools.hitTest(130, 50)).toBeNull();
    expect(tools.hitTest(190, 50)).toBeNull();
    expect(tools.undo()).toBe(true);
    expect(tools.hitTest(190, 50)?.part).toBe('level:3');
    expect(tools.getState().canUndo).toBe(false);
    expect(tools.redo()).toBe(true);
    expect(tools.hitTest(220, 50)?.part).toBe('level:4');
  });

  it('keeps the other options when the sequence is updated', () => {
    const { store, tools } = rig({}, {}, [TZ]);
    setOptions(store, { showLabels: false });
    setOptions(store, { sequence: [0, 1] });
    const options = zonesItem(tools.getScene(), 'a').options;
    expect(Object.keys(options)).toEqual(SEQUENCE_KEYS);
    expect(options).toEqual({ sequence: [0, 1], showLabels: false });
  });

  it('accepts an empty sequence, which draws nothing, and the longest one of 32 values', () => {
    const { store, tools } = rig({}, {}, [TZ]);
    setOptions(store, { sequence: [] });
    expect(linesOf(store.get('a') as Drawing)).toEqual([]);
    expect(tools.hitTest(130, 50)).toBeNull();
    const longest = Array.from({ length: 32 }, (_, index) => index);
    setOptions(store, { sequence: longest });
    expect(zonesItem(tools.getScene(), 'a').options.sequence).toEqual(longest);
  });

  it('leaves out the values whose line is outside the pane', () => {
    const far: Drawing = { ...TZ, options: { sequence: [0, 1, 100, 1000] } };
    expect(partsOf(linesOf(far))).toEqual(levelParts([0, 1]));
  });

  it.each<[string, unknown]>([
    ['values that are not increasing', [3, 2]],
    ['a repeated value', [1, 1]],
    ['a negative value', [-1, 2]],
    ['a value that is not an integer', [0, 1.5]],
    ['a value that is not a number', [0, '1']],
    ['more than 32 values', Array.from({ length: 33 }, (_, index) => index)],
    ['something that is not an array', '0,1,2'],
  ])('rejects %s with KFT-E-OPTIONS and leaves the drawing as it was', (_, sequence) => {
    const { store, tools } = rig({}, {}, [TZ]);
    const before = store.get('a');
    let error: unknown;
    try {
      setOptions(store, { sequence: sequence as readonly number[] });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DrawingError);
    expect((error as DrawingError).issues.map((issue) => issue.code)).toEqual(['KFT-E-OPTIONS']);
    expect(store.get('a')).toBe(before);
    expect(tools.getState().canUndo).toBe(false);
    expect(tools.hitTest(190, 50)?.part).toBe('level:3');
  });

  it('rejects an invalid sequence when a drawing is added', () => {
    const { store } = rig();
    expect(() => store.add({ ...TZ, options: { sequence: [2, 1] } })).toThrow(DrawingError);
    expect(store.list()).toHaveLength(0);
  });
});
