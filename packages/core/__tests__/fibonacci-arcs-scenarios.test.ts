import { describe, expect, it } from 'vitest';
import { geometryOf } from '../src/geometry/index';
import type { ArcShape, Shape } from '../src/geometry/types';
import type { DrawingHost, Point } from '../src/host';
import type { SceneItem } from '../src/scene/types';
import type { DrawingStore } from '../src/store';
import { createMockHost, type MockPane } from '../src/testing/mock-host';
import type { Anchor, Drawing, KindOptions } from '../src/types';
import { A, rig } from './controller-rig';

// E05-F06: the Fibonacci arcs tool through the controller, on the mock host (QA-005). The pane is
// `price`, 800 px wide and 400 px high with prices 0 to 200 (y = (200 - p) * 2); time is x * 6000.
// AR runs from (200, 200) to (400, 200): the arcs are centred on anchor 2 with the radius `ratio`
// times 200 px, so the default levels 0.382, 0.5 and 0.618 have the radii 76.4, 100 and 123.6. The half
// circles open away from anchor 1 (the curve faces it): they cover the left side, from the top (400,
// 100 for 0.5) over the left point (300, 200) to the bottom (400, 300).
const ARCS = 'fibonacci-arcs';
const AR: Drawing = { id: 'a', kind: ARCS, anchors: [A(200, 200), A(400, 200)] };
const RATIOS = [0.382, 0.5, 0.618];
const anchorsOf = (store: { get(id: string): { anchors: readonly Anchor[] } | undefined }, id: string): readonly Anchor[] => store.get(id)?.anchors ?? [];
const host = createMockHost();

type ArcsSceneItem = Extract<SceneItem, { type: 'fibonacci'; kind: 'fibonacci-arcs' }>;

function arcsItem(items: readonly SceneItem[], id: string): ArcsSceneItem {
  for (const item of items) {
    if (item.type === 'fibonacci' && item.kind === ARCS && item.drawingId === id) return item;
  }
  throw new Error(`No arcs item for ${id}.`);
}

/** The shapes of the placement preview: the preview item with levels (the snap indicator is a preview item too). */
function previewShapes(items: readonly SceneItem[]): readonly Shape[] {
  for (const item of items) {
    if (item.type === 'preview' && item.shapes.some((shape) => shape.part.startsWith('level:'))) return item.shapes;
  }
  throw new Error('No preview item.');
}

const arcsOf = (drawing: Drawing, onHost: DrawingHost = host): ArcShape[] => (geometryOf(drawing, onHost)?.shapes ?? []).filter((shape): shape is ArcShape => shape.type === 'arc');

/** Changes some options of drawing `a`, keeping the others (an update replaces the options object). */
function setOptions(store: DrawingStore, patch: KindOptions): void {
  store.update('a', { options: { ...store.get('a')?.options, ...patch } });
}

describe('placing arcs by two anchors (FR-INT-010)', () => {
  it('places by click, move, click, anchor 2 being the centre, and selects it', () => {
    const { host: mock, store, tools, click } = rig();
    tools.activate(ARCS);
    click(200, 200);
    expect(store.list()).toHaveLength(0);
    mock.pointer('move', 400, 200);
    click(400, 200);
    expect(store.list()).toEqual([{ id: 'd1', kind: ARCS, anchors: [A(200, 200), A(400, 200)] }]);
    expect(tools.getState().selection).toEqual(['d1']);
    expect(tools.getState().activeTool).toBeNull();
  });

  it('places by pressing, dragging and releasing', () => {
    const { store, tools, drag } = rig();
    tools.activate(ARCS);
    drag([200, 200], [400, 200], [[300, 200]]);
    expect(store.list()).toEqual([{ id: 'd1', kind: ARCS, anchors: [A(200, 200), A(400, 200)] }]);
  });

  it('is one history entry that undo removes and redo brings back', () => {
    const { store, tools, drag } = rig();
    tools.activate(ARCS);
    drag([200, 200], [400, 200], [[300, 200]]);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().canUndo).toBe(false);
    expect(tools.redo()).toBe(true);
    expect(anchorsOf(store, 'd1')).toEqual([A(200, 200), A(400, 200)]);
  });

  it('creates nothing from a second anchor on the first one, and stays in the tool', () => {
    const { store, tools, drag } = rig();
    tools.activate(ARCS);
    drag([200, 200], [200, 200], [[240, 200]]);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBe(ARCS);
  });

  it('cancels with Escape without a store change', () => {
    const { host: mock, store, tools, click } = rig();
    tools.activate(ARCS);
    click(200, 200);
    expect(mock.key('Escape')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBeNull();
  });

  it('shows the arcs while it is placed', () => {
    const { host: mock, tools, click } = rig();
    tools.activate(ARCS);
    click(200, 200);
    mock.pointer('move', 400, 200);
    const arcs = previewShapes(tools.getScene()).filter((shape): shape is ArcShape => shape.type === 'arc');
    expect(arcs.map((arc) => arc.part)).toEqual(RATIOS.map((ratio) => `level:${ratio}`));
    expect(arcs.map((arc) => arc.radius)).toEqual([76.4, 100, 123.6].map((radius) => expect.closeTo(radius, 9)));
    expect(arcs[0]?.center).toEqual({ x: 400, y: 200 });
  });
});

describe('the scene for the host renderer (FR-SC-004)', () => {
  it('has a fibonacci item in data space with every option resolved: half circles by default', () => {
    const { tools } = rig({}, {}, [AR]);
    const item = arcsItem(tools.getScene(), 'a');
    expect(item.anchors).toEqual(AR.anchors);
    expect(item.options).toEqual({ levels: RATIOS.map((ratio) => ({ ratio, visible: true })), fullCircles: false, showLabels: true });
    expect('shapes' in item).toBe(false);
  });

  it('has the core handles on both anchors of a selected drawing, anchor 2 being the centre', () => {
    const { tools } = rig({}, {}, [AR]);
    tools.select(['a']);
    const items = tools.getScene();
    expect(items.map((item) => item.type)).toEqual(['fibonacci', 'handles']);
    const handles = items[1];
    expect(handles?.type === 'handles' ? handles.points : []).toEqual([
      { x: 200, y: 200 },
      { x: 400, y: 200 },
    ]);
  });
});

describe('half circles and full circles (FR-GEO-005)', () => {
  it('draws half circles that open away from anchor 1, so the curve faces it', () => {
    const arcs = arcsOf(AR);
    expect(arcs.map((arc) => arc.part)).toEqual(RATIOS.map((ratio) => `level:${ratio}`));
    for (const arc of arcs) {
      expect(arc.center).toEqual({ x: 400, y: 200 });
      expect(arc.startAngle).toBeCloseTo(Math.PI / 2, 9);
      expect(arc.endAngle).toBeCloseTo((3 * Math.PI) / 2, 9);
    }
  });

  it('turns the half circles with the direction of anchor 1', () => {
    const above: Drawing = { ...AR, anchors: [A(400, 100), A(400, 200)] };
    const [arc] = arcsOf(above);
    expect(arc?.startAngle).toBeCloseTo(-Math.PI, 9);
    expect(arc?.endAngle).toBeCloseTo(0, 9);
  });

  it('hits the half circle on the side of anchor 1 and not on the other side', () => {
    const { tools } = rig({}, {}, [AR]);
    expect(tools.hitTest(300, 200)).toEqual({ id: 'a', part: 'level:0.5', locked: false });
    expect(tools.hitTest(500, 200)).toBeNull();
  });

  it('hits the ends of a half circle, on the vertical through the centre', () => {
    const { tools } = rig({}, {}, [AR]);
    expect(tools.hitTest(400, 100)?.part).toBe('level:0.5');
    expect(tools.hitTest(400, 300)?.part).toBe('level:0.5');
  });

  it('makes full circles with fullCircles, and the other side can then be hit', () => {
    const { store, tools } = rig({}, {}, [AR]);
    setOptions(store, { fullCircles: true });
    expect(arcsItem(tools.getScene(), 'a').options.fullCircles).toBe(true);
    for (const arc of arcsOf(store.get('a') as Drawing)) {
      expect(arc.startAngle).toBe(0);
      expect(arc.endAngle).toBeCloseTo(2 * Math.PI, 9);
    }
    expect(tools.hitTest(500, 200)).toEqual({ id: 'a', part: 'level:0.5', locked: false });
    expect(tools.hitTest(300, 200)?.part).toBe('level:0.5');
  });

  it('makes the change of fullCircles one history entry', () => {
    const { store, tools } = rig({}, {}, [AR]);
    setOptions(store, { fullCircles: true });
    expect(tools.undo()).toBe(true);
    expect(tools.hitTest(500, 200)).toBeNull();
    expect(tools.undo()).toBe(false);
    expect(tools.redo()).toBe(true);
    expect(tools.hitTest(500, 200)?.part).toBe('level:0.5');
  });
});

describe('selecting by an arc line (FR-HIT-003)', () => {
  it('selects the drawing with a click on an arc', () => {
    const { tools, click } = rig({}, {}, [AR]);
    click(300, 200);
    expect(tools.getState().selection).toEqual(['a']);
  });

  it.each<[string, number, number]>([
    ['level:0.382', 323.6, 200],
    ['level:0.5', 300, 200],
    ['level:0.618', 276.4, 200],
  ])('reports the part %s for a point on the arc', (part, x, y) => {
    const { tools } = rig({}, {}, [AR]);
    expect(tools.hitTest(x, y)).toEqual({ id: 'a', part, locked: false });
  });

  it('hits an arc within 6 px of the circle and misses it beyond', () => {
    const { tools } = rig({}, {}, [AR]);
    expect(tools.hitTest(306, 200)).toEqual({ id: 'a', part: 'level:0.5', locked: false });
    expect(tools.hitTest(294, 200)).toEqual({ id: 'a', part: 'level:0.5', locked: false });
    expect(tools.hitTest(307, 200)).toBeNull();
    expect(tools.hitTest(293, 200)).toBeNull();
  });

  it('measures to the circle, not to the straight line: a point off the line on the circle hits', () => {
    const { tools } = rig({}, {}, [AR]);
    // 60 degrees away from the left point, on the circle of the radius 100 around (400, 200).
    const turned = { x: 400 - 100 * Math.cos(Math.PI / 3), y: 200 - 100 * Math.sin(Math.PI / 3) };
    expect(tools.hitTest(turned.x, turned.y)?.part).toBe('level:0.5');
  });

  it('finds nothing in the middle of the circles', () => {
    const { tools } = rig({}, {}, [AR]);
    expect(tools.hitTest(380, 200)).toBeNull();
    expect(tools.hitTest(400, 200)).toBeNull();
  });

  it('hits the handle of a selected drawing in the centre, where no arc is', () => {
    const { tools } = rig({}, {}, [AR]);
    tools.select(['a']);
    expect(tools.hitTest(400, 200)?.part).toBe('handle:1');
    expect(tools.hitTest(200, 200)?.part).toBe('handle:0');
  });
});

describe('resizing, moving and deleting arcs', () => {
  it('resizes with the handle at anchor 2, which moves the centre, as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [AR]);
    click(300, 200);
    drag([400, 200], [450, 240], [[420, 220]]);
    const [first, second] = anchorsOf(store, 'a');
    expect(first).toEqual(A(200, 200));
    expect(second?.time).toBe(450 * 6000);
    expect(second?.price).toBeCloseTo(80, 9);
    expect(arcsOf(store.get('a') as Drawing)[0]?.center.x).toBeCloseTo(450, 9);
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'a')).toEqual(AR.anchors);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('resizes with the handle at anchor 1, which changes the radius', () => {
    const { store, click, drag } = rig({}, {}, [AR]);
    click(300, 200);
    drag([200, 200], [100, 200], [[150, 200]]);
    const [first, second] = anchorsOf(store, 'a');
    expect(first?.time).toBe(100 * 6000);
    expect(first?.price).toBeCloseTo(100, 9);
    expect(second).toEqual(A(400, 200));
    expect(arcsOf(store.get('a') as Drawing).map((arc) => arc.radius)).toEqual([114.6, 150, 185.4].map((radius) => expect.closeTo(radius, 9)));
  });

  it('moves with a drag on an arc, as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [AR]);
    click(300, 200);
    drag([300, 200], [350, 220], [[320, 210]]);
    const [first, second] = anchorsOf(store, 'a');
    expect(first?.time).toBe(250 * 6000);
    // 20 px down is 10 price.
    expect(first?.price).toBeCloseTo(90, 9);
    expect(second?.time).toBe(450 * 6000);
    expect(second?.price).toBeCloseTo(90, 9);
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'a')).toEqual(AR.anchors);
  });

  it('puts a drag back with Escape', () => {
    const { host: mock, store, tools, click } = rig({}, {}, [AR]);
    click(300, 200);
    mock.pointer('down', 400, 200);
    mock.pointer('move', 450, 240);
    expect(anchorsOf(store, 'a')[1]?.time).toBe(450 * 6000);
    mock.key('Escape');
    expect(anchorsOf(store, 'a')).toEqual(AR.anchors);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('removes the selected arcs with Delete, and undo and redo bring them back and remove them again', () => {
    const { host: mock, store, tools, click } = rig({}, {}, [AR]);
    click(300, 200);
    expect(mock.key('Delete')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([AR]);
    expect(tools.redo()).toBe(true);
    expect(store.list()).toHaveLength(0);
  });
});

describe('levels of arcs (FR-DM-021)', () => {
  it('draws the levels 0.382, 0.5 and 0.618 by default', () => {
    expect(arcsOf(AR).map((arc) => arc.radius)).toEqual([76.4, 100, 123.6].map((radius) => expect.closeTo(radius, 9)));
  });

  it('neither draws nor hits a hidden level', () => {
    const hidden: Drawing = {
      ...AR,
      options: {
        levels: [
          { ratio: 0.5, visible: true },
          { ratio: 0.618, visible: false },
        ],
      },
    };
    const { tools } = rig({}, {}, [hidden]);
    expect(arcsOf(hidden).map((arc) => arc.part)).toEqual(['level:0.5']);
    expect(tools.hitTest(276.4, 200)).toBeNull();
    expect(tools.hitTest(300, 200)?.part).toBe('level:0.5');
  });

  it('leaves out levels with a ratio of 0 or less', () => {
    const odd: Drawing = {
      ...AR,
      options: {
        levels: [
          { ratio: 0, visible: true },
          { ratio: -0.5, visible: true },
          { ratio: 0.5, visible: true },
        ],
      },
    };
    expect(arcsOf(odd).map((arc) => arc.part)).toEqual(['level:0.5']);
  });

  it('follows a change of the levels at once, also for a level beyond anchor 1', () => {
    const { store, tools } = rig({}, {}, [AR]);
    expect(tools.hitTest(76.4, 200)).toBeNull();
    const levels = [
      { ratio: 0.5, visible: true },
      { ratio: 1.618, visible: true },
    ];
    setOptions(store, { levels });
    expect(arcsItem(tools.getScene(), 'a').options.levels).toEqual(levels);
    expect(tools.hitTest(76.4, 200)).toEqual({ id: 'a', part: 'level:1.618', locked: false });
    expect(tools.hitTest(276.4, 200)).toBeNull();
  });

  it('keeps showLabels in the resolved item for the host overlay', () => {
    const { store, tools } = rig({}, {}, [AR]);
    expect(arcsItem(tools.getScene(), 'a').options.showLabels).toBe(true);
    setOptions(store, { showLabels: false });
    expect(arcsItem(tools.getScene(), 'a').options.showLabels).toBe(false);
  });
});

describe('arcs when the chart is zoomed (FR-GEO-005)', () => {
  // SLOPE rises from (100, 300), price 50, to (300, 100), price 150: its anchors are 200 px apart in both
  // directions on the default pane, so the pixel distance is about 282.84 and the arc 0.5 has the radius 141.42.
  const SLOPE: Drawing = { id: 's', kind: ARCS, anchors: [A(100, 300), A(300, 100)] };
  // The same prices on a pane that shows 25 to 125: a price is 4 px high instead of 2, so SLOPE is 400 px high.
  const ZOOMED_PANE: MockPane = { yAxisId: 'price', top: 0, height: 400, min: 25, max: 125 };

  const pixel = (onHost: DrawingHost, anchor: Anchor): Point => ({ x: onHost.timeToX(anchor.time), y: onHost.priceToY(anchor.price, anchor.yAxisId) });

  /** The point of the arc `ratio` of `drawing`, `turn` radians from the middle of its half circle (0: on the line between the anchors). */
  function onArc(onHost: DrawingHost, drawing: Drawing, ratio: number, turn = 0): Point {
    const [p1, p2] = drawing.anchors.map((anchor) => pixel(onHost, anchor)) as [Point, Point];
    const facing = Math.atan2(p1.y - p2.y, p1.x - p2.x) + turn;
    const radius = ratio * Math.hypot(p1.x - p2.x, p1.y - p2.y);
    return { x: p2.x + radius * Math.cos(facing), y: p2.y + radius * Math.sin(facing) };
  }

  it('has the radius ratio times the pixel distance between the anchors', () => {
    const distance = Math.hypot(200, 200);
    arcsOf(SLOPE).forEach((arc, index) => expect(arc.radius).toBeCloseTo((RATIOS[index] as number) * distance, 9));
  });

  it('keeps the shape of a circle on the screen: the same radius in every direction of the half circle', () => {
    const { tools } = rig({}, {}, [SLOPE]);
    for (const turn of [-1.2, -0.6, 0, 0.6, 1.2]) {
      expect(tools.hitTest(onArc(host, SLOPE, 0.5, turn).x, onArc(host, SLOPE, 0.5, turn).y)?.part).toBe('level:0.5');
    }
  });

  it('changes the radius when the price axis is zoomed, and the circle stays a circle', () => {
    const zoomed = createMockHost({ panes: [ZOOMED_PANE] });
    const normal = rig({}, {}, [SLOPE]);
    const vertical = rig({}, { panes: [ZOOMED_PANE] }, [SLOPE]);
    const wide = arcsOf(SLOPE, host)[1] as ArcShape;
    const tall = arcsOf(SLOPE, zoomed)[1] as ArcShape;
    expect(wide.radius).toBeCloseTo(0.5 * Math.hypot(200, 200), 9);
    expect(tall.radius).toBeCloseTo(0.5 * Math.hypot(200, 400), 9);
    expect(tall.radius).toBeGreaterThan(wide.radius);
    // The arc of each host is found where that host puts it, and not where the other one does.
    expect(normal.tools.hitTest(200, 200)?.part).toBe('level:0.5');
    expect(vertical.tools.hitTest(200, 100)?.part).toBe('level:0.5');
    expect(vertical.tools.hitTest(200, 200)).toBeNull();
    for (const turn of [-1, 0, 1]) {
      const point = onArc(zoomed, SLOPE, 0.5, turn);
      expect(vertical.tools.hitTest(point.x, point.y)?.part).toBe('level:0.5');
    }
  });

  it('changes in data space with the aspect ratio: the same turn is another time and price', () => {
    const zoomed = createMockHost({ panes: [ZOOMED_PANE] });
    const here = onArc(host, SLOPE, 0.5, 1);
    const there = onArc(zoomed, SLOPE, 0.5, 1);
    expect(Math.abs(host.xToTime(here.x) - zoomed.xToTime(there.x))).toBeGreaterThan(100_000);
    expect(Math.abs(host.yToPrice(here.y, 'price') - zoomed.yToPrice(there.y, 'price'))).toBeGreaterThan(1);
  });

  it('changes the radius when the time axis is zoomed, and follows at once', () => {
    const { host: mock, tools } = rig({}, {}, [SLOPE]);
    expect(tools.hitTest(200, 200)?.part).toBe('level:0.5');
    mock.zoom(2, 0);
    // The anchors are now at (200, 300) and (600, 100): 447.2 px apart, so the arc 0.5 has the radius 223.6 around (600, 100).
    expect(arcsOf(SLOPE, mock)[1]?.radius).toBeCloseTo(0.5 * Math.hypot(400, 200), 9);
    expect(tools.hitTest(400, 200)?.part).toBe('level:0.5');
    expect(tools.hitTest(200, 200)).toBeNull();
    for (const turn of [-1, 0, 1]) {
      const point = onArc(mock, SLOPE, 0.5, turn);
      expect(tools.hitTest(point.x, point.y)?.part).toBe('level:0.5');
    }
  });

  it('is the same arc again when the zoom is undone: the data, not the pixels, are stored', () => {
    const { host: mock, store, tools } = rig({}, {}, [SLOPE]);
    mock.zoom(2, 0);
    mock.zoom(0.5, 0);
    expect(tools.hitTest(200, 200)?.part).toBe('level:0.5');
    expect(store.get('s')?.anchors).toEqual(SLOPE.anchors);
  });

  it('keeps the arcs of a drawing with both anchors at one price correct when the price axis is zoomed', () => {
    const zoomed = createMockHost({ panes: [ZOOMED_PANE] });
    // Only the horizontal distance counts here, so zooming the price axis leaves the radius alone.
    expect(arcsOf(AR, zoomed)[1]?.radius).toBeCloseTo(100, 9);
    expect(arcsOf(AR, host)[1]?.radius).toBeCloseTo(100, 9);
  });
});
