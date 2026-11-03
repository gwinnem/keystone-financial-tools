import { describe, expect, it } from 'vitest';
import { geometryOf } from '../src/geometry/index';
import type { LineShape, Shape } from '../src/geometry/types';
import type { SceneItem } from '../src/scene/types';
import type { DrawingStore } from '../src/store';
import { createMockHost } from '../src/testing/mock-host';
import type { Anchor, Drawing, KindOptions } from '../src/types';
import { A, rig } from './controller-rig';

// E05-F07: the Fibonacci fans tool through the controller, on the mock host (QA-005). The pane is
// `price`, 800 px wide and 400 px high with prices 0 to 200 (y = (200 - p) * 2); time is x * 6000.
// FA runs from (200, 300) to (400, 100). For each level a ray starts at anchor 1 and passes through
// (x2, y2 + (y1 - y2) * ratio), here (400, 100 + 200 * ratio), so the ray of the ratio r has the slope
// r - 1 on the screen: 0 goes through anchor 2, 1 runs horizontally. The rays end at the pane edge.
const FANS = 'fibonacci-fans';
const FA: Drawing = { id: 'a', kind: FANS, anchors: [A(200, 300), A(400, 100)] };
const RATIOS = [0.382, 0.5, 0.618];
const anchorsOf = (store: { get(id: string): { anchors: readonly Anchor[] } | undefined }, id: string): readonly Anchor[] => store.get(id)?.anchors ?? [];
const host = createMockHost();

type FansSceneItem = Extract<SceneItem, { type: 'fibonacci'; kind: 'fibonacci-fans' }>;

function fansItem(items: readonly SceneItem[], id: string): FansSceneItem {
  for (const item of items) {
    if (item.type === 'fibonacci' && item.kind === FANS && item.drawingId === id) return item;
  }
  throw new Error(`No fans item for ${id}.`);
}

/** The shapes of the placement preview: the preview item with levels (the snap indicator is a preview item too). */
function previewShapes(items: readonly SceneItem[]): readonly Shape[] {
  for (const item of items) {
    if (item.type === 'preview' && item.shapes.some((shape) => shape.part.startsWith('level:'))) return item.shapes;
  }
  throw new Error('No preview item.');
}

const rays = (shapes: readonly Shape[]): LineShape[] => shapes.filter((shape): shape is LineShape => shape.type === 'line');
const raysOf = (drawing: Drawing): LineShape[] => rays(geometryOf(drawing, host)?.shapes ?? []);

/** Changes some options of drawing `a`, keeping the others (an update replaces the options object). */
function setOptions(store: DrawingStore, patch: KindOptions): void {
  store.update('a', { options: { ...store.get('a')?.options, ...patch } });
}

describe('placing fans by two anchors (FR-INT-010)', () => {
  it('places by click, move, click and selects it', () => {
    const { host: mock, store, tools, click } = rig();
    tools.activate(FANS);
    click(200, 300);
    expect(store.list()).toHaveLength(0);
    mock.pointer('move', 400, 100);
    click(400, 100);
    expect(store.list()).toEqual([{ id: 'd1', kind: FANS, anchors: [A(200, 300), A(400, 100)] }]);
    expect(tools.getState().selection).toEqual(['d1']);
    expect(tools.getState().activeTool).toBeNull();
  });

  it('places by pressing, dragging and releasing', () => {
    const { store, tools, drag } = rig();
    tools.activate(FANS);
    drag([200, 300], [400, 100], [[300, 200]]);
    expect(store.list()).toEqual([{ id: 'd1', kind: FANS, anchors: [A(200, 300), A(400, 100)] }]);
  });

  it('places in every direction: left of and below anchor 1 too', () => {
    const { store, tools, drag } = rig();
    tools.activate(FANS);
    drag([400, 100], [200, 300], [[300, 200]]);
    expect(store.get('d1')?.anchors).toEqual([A(400, 100), A(200, 300)]);
  });

  it('is one history entry that undo removes and redo brings back', () => {
    const { store, tools, drag } = rig();
    tools.activate(FANS);
    drag([200, 300], [400, 100], [[300, 200]]);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().canUndo).toBe(false);
    expect(tools.redo()).toBe(true);
    expect(anchorsOf(store, 'd1')).toEqual([A(200, 300), A(400, 100)]);
  });

  it('creates nothing from a second anchor on the first one, and stays in the tool', () => {
    const { store, tools, drag } = rig();
    tools.activate(FANS);
    drag([200, 300], [200, 300], [[240, 300]]);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBe(FANS);
  });

  it('cancels with Escape without a store change', () => {
    const { host: mock, store, tools, click } = rig();
    tools.activate(FANS);
    click(200, 300);
    expect(mock.key('Escape')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBeNull();
  });

  it('shows the rays while it is placed, clipped to the pane', () => {
    const { host: mock, tools, click } = rig();
    tools.activate(FANS);
    click(200, 300);
    mock.pointer('move', 400, 100);
    const preview = rays(previewShapes(tools.getScene()));
    expect(preview.map((ray) => ray.part)).toEqual(RATIOS.map((ratio) => `level:${ratio}`));
    expect(preview.every((ray) => ray.from.x === 200 && ray.from.y === 300)).toBe(true);
    const half = preview[1];
    expect(half?.to.x).toBeCloseTo(800, 9);
    expect(half?.to.y).toBeCloseTo(0, 9);
  });
});

describe('Shift locks the angle of anchor 2 to 45 degree steps (FR-INT-031)', () => {
  // Anchor 1 is at (200, 300), the pointer 200 px right and 180 px above it: the nearest 45 degree direction is up
  // and right, and the locked anchor keeps the distance of the pointer.
  const REACH = Math.hypot(200, 180) * Math.SQRT1_2;

  it('locks the preview and the second anchor of a click-click placement', () => {
    const { host: mock, store, tools, click } = rig();
    tools.activate(FANS);
    click(200, 300);
    mock.pointer('move', 400, 120, { shiftKey: true });
    const half = rays(previewShapes(tools.getScene()))[1];
    // The ray of the ratio 0.5 goes through (200 + reach, 300 - 0.5 * reach): the slope -0.5, to the top right corner.
    // Without the lock the pointer at (400, 120) would give the slope -0.45 and the end (800, 30).
    expect(half?.from).toEqual({ x: 200, y: 300 });
    expect(half?.to.x).toBeCloseTo(800, 6);
    expect(half?.to.y).toBeCloseTo(0, 6);
    click(400, 120, { shiftKey: true });
    const [first, second] = anchorsOf(store, 'd1');
    expect(first).toEqual(A(200, 300));
    expect(second?.time).toBeCloseTo((200 + REACH) * 6000, 4);
    expect(second?.price).toBeCloseTo((400 - (300 - REACH)) / 2, 9);
  });

  it('puts a dragged placement on the nearest 45 degree direction', () => {
    const { store, tools, drag } = rig();
    tools.activate(FANS);
    drag([200, 300], [400, 120], [[300, 210]], { shiftKey: true });
    const second = anchorsOf(store, 'd1')[1];
    expect(second?.time).toBeCloseTo((200 + REACH) * 6000, 4);
    expect(second?.price).toBeCloseTo((400 - (300 - REACH)) / 2, 9);
  });

  it('is free again when Shift is released', () => {
    const { store, tools, click } = rig();
    tools.activate(FANS);
    click(200, 300);
    click(400, 120);
    expect(anchorsOf(store, 'd1')[1]).toEqual(A(400, 120));
  });

  it('locks the handle of anchor 2 of a placed fan, keeping anchor 1 fixed', () => {
    const { store, click, drag } = rig({}, {}, [FA]);
    click(500, 150);
    // The handle at (400, 100) goes to (500, 130): from anchor 1 at (200, 300) that is up and right at 29.5 degrees, so 45.
    drag([400, 100], [500, 130], [[450, 115]], { shiftKey: true });
    const reach = Math.hypot(300, 170) * Math.SQRT1_2;
    const [first, second] = anchorsOf(store, 'a');
    expect(first).toEqual(FA.anchors[0]);
    expect(second?.time).toBeCloseTo((200 + reach) * 6000, 4);
    expect(second?.price).toBeCloseTo((400 - (300 - reach)) / 2, 9);
  });
});

describe('the scene for the host renderer (FR-SC-004)', () => {
  it('has a fibonacci item in data space with every option resolved', () => {
    const { tools } = rig({}, {}, [FA]);
    const item = fansItem(tools.getScene(), 'a');
    expect(item.anchors).toEqual(FA.anchors);
    expect(item.options).toEqual({ levels: RATIOS.map((ratio) => ({ ratio, visible: true })), showLabels: true });
    expect('shapes' in item).toBe(false);
  });

  it('has the core handles on both anchors of a selected drawing', () => {
    const { tools } = rig({}, {}, [FA]);
    tools.select(['a']);
    const items = tools.getScene();
    expect(items.map((item) => item.type)).toEqual(['fibonacci', 'handles']);
    const handles = items[1];
    expect(handles?.type === 'handles' ? handles.points : []).toEqual([
      { x: 200, y: 300 },
      { x: 400, y: 100 },
    ]);
  });
});

describe('the rays (FR-GEO-004)', () => {
  it('starts every ray at anchor 1 and ends it on the pane edge', () => {
    const [low, half, high] = raysOf(FA);
    for (const ray of [low, half, high]) expect(ray?.from).toEqual({ x: 200, y: 300 });
    // 0.382: slope -0.618, up to the top edge at x = 200 + 300 / 0.618.
    expect(low?.to.x).toBeCloseTo(200 + 300 / 0.618, 6);
    expect(low?.to.y).toBeCloseTo(0, 6);
    // 0.5: slope -0.5, which reaches the top right corner.
    expect(half?.to.x).toBeCloseTo(800, 6);
    expect(half?.to.y).toBeCloseTo(0, 6);
    // 0.618: slope -0.382, right edge at y = 300 - 0.382 * 600.
    expect(high?.to.x).toBeCloseTo(800, 6);
    expect(high?.to.y).toBeCloseTo(70.8, 6);
  });

  it('goes through the point (t2, p2 + (p1 - p2) * ratio) for every level', () => {
    const ray = raysOf({ ...FA, options: { levels: [{ ratio: 0.5, visible: true }] } })[0];
    // At x = 400 the ray of 0.5 is at y = 200: the price 100, halfway between 150 (anchor 2) and 50 (anchor 1).
    const t = (400 - 200) / ((ray?.to.x ?? 0) - 200);
    expect(300 + t * ((ray?.to.y ?? 0) - 300)).toBeCloseTo(200, 9);
  });

  it('turns to the left when anchor 2 is left of anchor 1', () => {
    const left: Drawing = { id: 'a', kind: FANS, anchors: [A(400, 300), A(200, 100)], options: { levels: [{ ratio: 0.5, visible: true }] } };
    const [ray] = raysOf(left);
    expect(ray?.from).toEqual({ x: 400, y: 300 });
    // Through (200, 200), left to the left edge at y = 300 - 0.5 * 400 = 100.
    expect(ray?.to.x).toBeCloseTo(0, 9);
    expect(ray?.to.y).toBeCloseTo(100, 9);
  });

  it('draws the level 1 as a horizontal ray at the price of anchor 1 and the level 0 through anchor 2', () => {
    const rayOf = (ratio: number): LineShape | undefined => raysOf({ ...FA, options: { levels: [{ ratio, visible: true }] } })[0];
    expect(rayOf(1)?.to.x).toBeCloseTo(800, 9);
    expect(rayOf(1)?.to.y).toBeCloseTo(300, 9);
    // The ray of 0 rises one px per px, through (400, 100), and leaves the pane at the top, at x = 500.
    expect(rayOf(0)?.to.x).toBeCloseTo(500, 9);
    expect(rayOf(0)?.to.y).toBeCloseTo(0, 9);
  });
});

describe('selecting by a ray (FR-HIT-003)', () => {
  it('selects the drawing with a click on a ray', () => {
    const { tools, click } = rig({}, {}, [FA]);
    click(500, 150);
    expect(tools.getState().selection).toEqual(['a']);
  });

  it.each<[string, number, number]>([
    ['level:0.382', 600, 52.8],
    ['level:0.5', 500, 150],
    ['level:0.618', 600, 147.2],
  ])('reports the part %s for a point on the ray', (part, x, y) => {
    const { tools } = rig({}, {}, [FA]);
    expect(tools.hitTest(x, y)).toEqual({ id: 'a', part, locked: false });
  });

  it('hits a ray within 6 px and misses it beyond', () => {
    const { tools } = rig({}, {}, [FA]);
    // The ray of 0.5 rises 0.5 px per px, so 6 px across it is 6 / cos(atan 0.5) = 6.71 px vertically.
    expect(tools.hitTest(500, 156)).toEqual({ id: 'a', part: 'level:0.5', locked: false });
    expect(tools.hitTest(500, 144)).toEqual({ id: 'a', part: 'level:0.5', locked: false });
    expect(tools.hitTest(500, 157)).toBeNull();
    expect(tools.hitTest(500, 143)).toBeNull();
  });

  it('hits a ray in the future space, far right of anchor 2 and the last bar', () => {
    const { tools } = rig({}, {}, [FA]);
    expect(tools.hitTest(700, 50)?.part).toBe('level:0.5');
  });

  it('finds nothing beyond the end of a clipped ray, nor behind anchor 1', () => {
    const { tools } = rig({}, {}, [FA]);
    expect(tools.hitTest(700, 2)).toBeNull();
    expect(tools.hitTest(100, 350)).toBeNull();
    expect(tools.hitTest(150, 300)).toBeNull();
  });

  it('finds nothing between the rays', () => {
    const { tools } = rig({}, {}, [FA]);
    expect(tools.hitTest(500, 100)).toBeNull();
    expect(tools.hitTest(500, 250)).toBeNull();
  });

  it('reports the first level where all the rays meet, at anchor 1', () => {
    const { tools } = rig({}, {}, [FA]);
    expect(tools.hitTest(200, 300)).toEqual({ id: 'a', part: 'level:0.382', locked: false });
  });

  it('hits the handles of a selected drawing first', () => {
    const { tools } = rig({}, {}, [FA]);
    tools.select(['a']);
    expect(tools.hitTest(200, 300)?.part).toBe('handle:0');
    expect(tools.hitTest(400, 100)?.part).toBe('handle:1');
  });
});

describe('resizing, moving and deleting fans', () => {
  it('resizes with the handle at anchor 2 as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [FA]);
    click(500, 150);
    drag([400, 100], [450, 60], [[420, 80]]);
    const [first, second] = anchorsOf(store, 'a');
    expect(first).toEqual(A(200, 300));
    expect(second?.time).toBe(450 * 6000);
    expect(second?.price).toBeCloseTo(170, 9);
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'a')).toEqual(FA.anchors);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('resizes with the handle at anchor 1, where the rays start', () => {
    const { store, click, drag } = rig({}, {}, [FA]);
    click(500, 150);
    drag([200, 300], [150, 330], [[170, 310]]);
    const [first, second] = anchorsOf(store, 'a');
    expect(first?.time).toBe(150 * 6000);
    expect(first?.price).toBeCloseTo(35, 9);
    expect(second).toEqual(A(400, 100));
  });

  it('moves with a drag on a ray, as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [FA]);
    click(500, 150);
    drag([500, 150], [550, 170], [[520, 160]]);
    const [first, second] = anchorsOf(store, 'a');
    expect(first?.time).toBe(250 * 6000);
    expect(first?.price).toBeCloseTo(40, 9);
    expect(second?.time).toBe(450 * 6000);
    expect(second?.price).toBeCloseTo(140, 9);
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'a')).toEqual(FA.anchors);
  });

  it('puts a drag back with Escape', () => {
    const { host: mock, store, tools, click } = rig({}, {}, [FA]);
    click(500, 150);
    mock.pointer('down', 400, 100);
    mock.pointer('move', 450, 60);
    expect(anchorsOf(store, 'a')[1]?.time).toBe(450 * 6000);
    mock.key('Escape');
    expect(anchorsOf(store, 'a')).toEqual(FA.anchors);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('removes the selected fans with Delete, and undo and redo bring them back and remove them again', () => {
    const { host: mock, store, tools, click } = rig({}, {}, [FA]);
    click(500, 150);
    expect(mock.key('Delete')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([FA]);
    expect(tools.redo()).toBe(true);
    expect(store.list()).toHaveLength(0);
  });
});

describe('levels of fans (FR-DM-021)', () => {
  it('draws the levels 0.382, 0.5 and 0.618 by default', () => {
    expect(raysOf(FA).map((ray) => ray.part)).toEqual(RATIOS.map((ratio) => `level:${ratio}`));
  });

  it('neither draws nor hits a hidden level', () => {
    const hidden: Drawing = {
      ...FA,
      options: {
        levels: [
          { ratio: 0.5, visible: true },
          { ratio: 0.618, visible: false },
        ],
      },
    };
    const { tools } = rig({}, {}, [hidden]);
    expect(raysOf(hidden).map((ray) => ray.part)).toEqual(['level:0.5']);
    expect(tools.hitTest(600, 147.2)).toBeNull();
    expect(tools.hitTest(500, 150)?.part).toBe('level:0.5');
  });

  it('follows a change of the levels at once, as one history entry', () => {
    const { store, tools } = rig({}, {}, [FA]);
    expect(tools.hitTest(300, 200)).toBeNull();
    const levels = [
      { ratio: 0, visible: true },
      { ratio: 1, visible: true },
    ];
    setOptions(store, { levels });
    expect(fansItem(tools.getScene(), 'a').options.levels).toEqual(levels);
    // The ray of 0 goes through anchor 2, the ray of 1 is horizontal at the price of anchor 1.
    expect(tools.hitTest(300, 200)).toEqual({ id: 'a', part: 'level:0', locked: false });
    expect(tools.hitTest(500, 300)).toEqual({ id: 'a', part: 'level:1', locked: false });
    expect(tools.hitTest(500, 150)).toBeNull();
    expect(tools.undo()).toBe(true);
    expect(tools.hitTest(500, 150)?.part).toBe('level:0.5');
    expect(tools.hitTest(300, 200)).toBeNull();
    expect(tools.getState().canUndo).toBe(false);
    expect(tools.redo()).toBe(true);
    expect(tools.hitTest(300, 200)?.part).toBe('level:0');
  });

  it('keeps showLabels in the resolved item for the host overlay', () => {
    const { store, tools } = rig({}, {}, [FA]);
    expect(fansItem(tools.getScene(), 'a').options.showLabels).toBe(true);
    setOptions(store, { showLabels: false });
    expect(fansItem(tools.getScene(), 'a').options.showLabels).toBe(false);
  });
});

describe('fans that leave the pane', () => {
  it('draws nothing, and hits nothing, when the rays miss the pane', () => {
    // Anchor 1 right of the pane, anchor 2 further right: the rays point away from it.
    const away: Drawing = { id: 'a', kind: FANS, anchors: [A(900, 300), A(1000, 100)] };
    const { tools } = rig({}, {}, [away]);
    expect(raysOf(away)).toEqual([]);
    expect(tools.hitTest(700, 200)).toBeNull();
  });

  it('starts the ray at the left edge when anchor 1 is left of the pane', () => {
    const outside: Drawing = { id: 'a', kind: FANS, anchors: [A(-100, 300), A(100, 100)], options: { levels: [{ ratio: 1, visible: true }] } };
    const [ray] = raysOf(outside);
    expect(ray?.from).toEqual({ x: 0, y: 300 });
    expect(ray?.to.x).toBeCloseTo(800, 9);
  });
});
