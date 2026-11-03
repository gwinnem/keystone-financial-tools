import { describe, expect, it } from 'vitest';
import { geometryOf } from '../src/geometry/index';
import type { LabelShape, Shape } from '../src/geometry/types';
import type { SceneItem } from '../src/scene/types';
import type { DrawingStore } from '../src/store';
import { createMockHost, DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import type { Anchor, Drawing, FibonacciLevel, KindOptions } from '../src/types';
import { A, rig } from './controller-rig';

// E05-F05: the Fibonacci retracement tool through the controller, on the mock host (QA-005). The pane
// is `price`, 800 px wide and 400 px high with prices 0 to 200 (y = (200 - p) * 2); time is x * 6000.
// F runs from the swing low at (100, 300), price 50, to the swing high at (300, 100), price 150, so
// the level of a ratio r is at price 50 + 100 * r, that is y = 300 - 200 * r: level 0 at y = 300,
// 0.5 at 200 and 1 at 100. Its level lines run from x = 100 to x = 300.
const RETRACEMENT = 'fibonacci-retracement';
const F: Drawing = { id: 'f', kind: RETRACEMENT, anchors: [A(100, 300), A(300, 100)] };
const DEFAULT_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const HIDDEN_RATIOS = [1.272, 1.618, 2.618, 4.236];
const anchorsOf = (store: { get(id: string): { anchors: readonly Anchor[] } | undefined }, id: string): readonly Anchor[] => store.get(id)?.anchors ?? [];
const host = createMockHost();

type FibonacciSceneItem = Extract<SceneItem, { type: 'fibonacci'; kind: 'fibonacci-retracement' }>;

function fibonacciItem(items: readonly SceneItem[], id: string): FibonacciSceneItem {
  for (const item of items) {
    if (item.type === 'fibonacci' && item.kind === RETRACEMENT && item.drawingId === id) return item;
  }
  throw new Error(`No Fibonacci item for ${id}.`);
}

/** The shapes of the placement preview of the scene (the one with lines: the snap indicator is a preview item too). */
function previewShapes(items: readonly SceneItem[]): readonly Shape[] {
  for (const item of items) {
    if (item.type === 'preview' && item.shapes.some((shape) => shape.type === 'line')) return item.shapes;
  }
  throw new Error('No preview item.');
}

const shapesOf = (drawing: Drawing, options?: Parameters<typeof geometryOf>[2], onHost = host): readonly Shape[] => geometryOf(drawing, onHost, options)?.shapes ?? [];
const labelsOf = (shapes: readonly Shape[]): LabelShape[] => shapes.filter((shape): shape is LabelShape => shape.type === 'label');
const levelParts = (shapes: readonly Shape[]): string[] => shapes.filter((shape) => shape.type === 'line').map((shape) => shape.part);

/** Changes some options of drawing `f`, keeping the others (an update replaces the options object). */
function setOptions(store: DrawingStore, patch: KindOptions): void {
  store.update('f', { options: { ...store.get('f')?.options, ...patch } });
}

const ALL_VISIBLE: FibonacciLevel[] = [...DEFAULT_RATIOS, ...HIDDEN_RATIOS].map((ratio) => ({ ratio, visible: true }));

describe('placing a retracement by two anchors (FR-INT-010)', () => {
  it('places by click, move, click from swing low to swing high, and selects it', () => {
    const { host: mock, store, tools, click } = rig();
    tools.activate(RETRACEMENT);
    click(100, 300);
    expect(store.list()).toHaveLength(0);
    mock.pointer('move', 300, 100);
    click(300, 100);
    expect(store.list()).toEqual([{ id: 'd1', kind: RETRACEMENT, anchors: [A(100, 300), A(300, 100)] }]);
    expect(tools.getState().selection).toEqual(['d1']);
    expect(tools.getState().activeTool).toBeNull();
  });

  it('places by pressing, dragging and releasing, in either direction', () => {
    const up = rig();
    up.tools.activate(RETRACEMENT);
    up.drag([100, 300], [300, 100], [[200, 200]]);
    expect(up.store.list()).toEqual([{ id: 'd1', kind: RETRACEMENT, anchors: [A(100, 300), A(300, 100)] }]);
    const down = rig();
    down.tools.activate(RETRACEMENT);
    down.drag([300, 100], [100, 300], [[200, 200]]);
    expect(down.store.list()).toEqual([{ id: 'd1', kind: RETRACEMENT, anchors: [A(300, 100), A(100, 300)] }]);
  });

  it('is one history entry that undo removes and redo brings back', () => {
    const { store, tools, drag } = rig();
    tools.activate(RETRACEMENT);
    drag([100, 300], [300, 100], [[200, 200]]);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().canUndo).toBe(false);
    expect(tools.redo()).toBe(true);
    expect(anchorsOf(store, 'd1')).toEqual([A(100, 300), A(300, 100)]);
  });

  it('creates nothing from a second anchor on the first one, and stays in the tool', () => {
    const { store, tools, drag } = rig();
    tools.activate(RETRACEMENT);
    drag([100, 300], [100, 300], [[140, 300]]);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBe(RETRACEMENT);
  });

  it('cancels with Escape without a store change', () => {
    const { host: mock, store, tools, click } = rig();
    tools.activate(RETRACEMENT);
    click(100, 300);
    expect(mock.key('Escape')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.getState().activeTool).toBeNull();
  });

  it('shows the levels of the retracement while it is placed', () => {
    const { host: mock, tools, click } = rig();
    tools.activate(RETRACEMENT);
    click(100, 300);
    mock.pointer('move', 300, 100);
    const lines = previewShapes(tools.getScene()).filter((shape) => shape.type === 'line');
    expect(lines.map((shape) => shape.part)).toEqual(DEFAULT_RATIOS.map((ratio) => `level:${ratio}`));
    expect(lines[3]).toEqual({ type: 'line', part: 'level:0.5', from: { x: 100, y: 200 }, to: { x: 300, y: 200 } });
  });
});

describe('the scene for the host renderer (FR-SC-004)', () => {
  it('has a fibonacci item in data space with every option resolved, and no shapes', () => {
    const { tools } = rig({}, {}, [F]);
    const item = fibonacciItem(tools.getScene(), 'f');
    expect(item.kind).toBe(RETRACEMENT);
    expect(item.anchors).toEqual(F.anchors);
    expect(item.state).toBe('normal');
    expect('shapes' in item).toBe(false);
    expect(item.options).toEqual({
      levels: [...DEFAULT_RATIOS.map((ratio) => ({ ratio, visible: true })), ...HIDDEN_RATIOS.map((ratio) => ({ ratio, visible: false }))],
      reverse: false,
      extendLeft: false,
      extendRight: false,
      showLabels: true,
      showPrices: true,
    });
  });

  it('has the core handles on both anchors of a selected retracement', () => {
    const { tools } = rig({}, {}, [F]);
    tools.select(['f']);
    const items = tools.getScene();
    expect(items.map((item) => item.type)).toEqual(['fibonacci', 'handles']);
    const handles = items[1];
    expect(handles?.type === 'handles' ? handles.points : []).toEqual([
      { x: 100, y: 300 },
      { x: 300, y: 100 },
    ]);
  });

  it('puts the state on the item: selected after a click on a level, hover over a level', () => {
    const { host: mock, tools, click } = rig({}, {}, [F]);
    mock.pointer('move', 200, 200);
    expect(fibonacciItem(tools.getScene(), 'f').state).toBe('hover');
    click(200, 200);
    expect(fibonacciItem(tools.getScene(), 'f').state).toBe('selected');
  });
});

describe('selecting by a level line (FR-HIT-003)', () => {
  it('selects the retracement with a click on a level line', () => {
    const { tools, click } = rig({}, {}, [F]);
    click(200, 200);
    expect(tools.getState().selection).toEqual(['f']);
  });

  it.each<[string, number, number]>([
    ['level:0', 200, 300],
    ['level:0.5', 200, 200],
    ['level:1', 200, 100],
  ])('reports the part %s for a point on the line', (part, x, y) => {
    const { tools } = rig({}, {}, [F]);
    expect(tools.hitTest(x, y)).toEqual({ id: 'f', part, locked: false });
  });

  it('hits a level line within 6 px and misses it beyond', () => {
    const { tools } = rig({}, {}, [F]);
    expect(tools.hitTest(200, 206)).toEqual({ id: 'f', part: 'level:0.5', locked: false });
    expect(tools.hitTest(200, 194)).toEqual({ id: 'f', part: 'level:0.5', locked: false });
    expect(tools.hitTest(200, 207)).toBeNull();
    expect(tools.hitTest(200, 193)).toBeNull();
  });

  it('hits a level line only between its ends', () => {
    const { tools } = rig({}, {}, [F]);
    expect(tools.hitTest(306, 200)).toEqual({ id: 'f', part: 'level:0.5', locked: false });
    expect(tools.hitTest(307, 200)).toBeNull();
    expect(tools.hitTest(94, 250)).toBeNull();
  });

  it('finds nothing between the level lines', () => {
    const { tools } = rig({}, {}, [F]);
    expect(tools.hitTest(200, 150)).toBeNull();
  });

  it('hits the label at the left end of a level before the line', () => {
    const { tools } = rig({}, {}, [F]);
    expect(tools.hitTest(100, 200)).toEqual({ id: 'f', part: 'label', locked: false });
  });

  it('shows the handle, not the level, on the handle of a selected retracement', () => {
    const { tools } = rig({}, {}, [F]);
    tools.select(['f']);
    expect(tools.hitTest(300, 100)?.part).toBe('handle:1');
    expect(tools.hitTest(100, 300)?.part).toBe('handle:0');
  });
});

describe('resizing, moving and deleting a retracement', () => {
  it('resizes with the handle at the second anchor, as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [F]);
    click(200, 200);
    drag([300, 100], [350, 60], [[320, 80]]);
    const [first, second] = anchorsOf(store, 'f');
    expect(first).toEqual(A(100, 300));
    expect(second?.time).toBe(350 * 6000);
    expect(second?.price).toBeCloseTo(170, 9);
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'f')).toEqual(F.anchors);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('resizes with the handle at the first anchor', () => {
    const { store, click, drag } = rig({}, {}, [F]);
    click(200, 200);
    drag([100, 300], [60, 340], [[80, 320]]);
    const [first, second] = anchorsOf(store, 'f');
    expect(first?.time).toBe(60 * 6000);
    expect(first?.price).toBeCloseTo(30, 9);
    expect(second).toEqual(A(300, 100));
  });

  it('moves with a drag on a level line, as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [F]);
    click(200, 200);
    drag([200, 200], [250, 220], [[225, 210]]);
    const [first, second] = anchorsOf(store, 'f');
    expect(first?.time).toBe(150 * 6000);
    // 20 px down is 10 price.
    expect(first?.price).toBeCloseTo(40, 9);
    expect(second?.time).toBe(350 * 6000);
    expect(second?.price).toBeCloseTo(140, 9);
    expect(tools.undo()).toBe(true);
    expect(anchorsOf(store, 'f')).toEqual(F.anchors);
  });

  it('puts a drag back with Escape', () => {
    const { host: mock, store, tools, click } = rig({}, {}, [F]);
    click(200, 200);
    mock.pointer('down', 300, 100);
    mock.pointer('move', 350, 60);
    expect(anchorsOf(store, 'f')[1]?.time).toBe(350 * 6000);
    mock.key('Escape');
    expect(anchorsOf(store, 'f')).toEqual(F.anchors);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('removes the selected retracement with Delete, and undo and redo bring it back and remove it again', () => {
    const { host: mock, store, tools, click } = rig({}, {}, [F]);
    click(200, 200);
    expect(mock.key('Delete')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([F]);
    expect(tools.redo()).toBe(true);
    expect(store.list()).toHaveLength(0);
  });
});

describe('levels, reverse and extensions (FR-DM-020, FR-GEO-003)', () => {
  it('draws the default levels 0 to 1 and not the extension levels', () => {
    const shapes = shapesOf(F);
    expect(levelParts(shapes)).toEqual(DEFAULT_RATIOS.map((ratio) => `level:${ratio}`));
    expect(shapesOf(F).filter((shape) => shape.type === 'line')[3]).toMatchObject({ part: 'level:0.5', from: { x: 100, y: 200 }, to: { x: 300, y: 200 } });
  });

  it('neither draws nor hits a hidden level, and does both once it is shown', () => {
    const { store, tools } = rig({}, {}, [F]);
    // The level 1.272 is at y = 300 - 200 * 1.272 = 45.6.
    expect(levelParts(shapesOf(F))).not.toContain('level:1.272');
    expect(tools.hitTest(200, 45.6)).toBeNull();
    setOptions(store, { levels: ALL_VISIBLE });
    expect(levelParts(shapesOf(store.get('f') as Drawing))).toContain('level:1.272');
    expect(tools.hitTest(200, 45.6)).toEqual({ id: 'f', part: 'level:1.272', locked: false });
  });

  it('neither draws nor hits a level the drawing hides', () => {
    const hidden: Drawing = {
      ...F,
      options: {
        levels: [
          { ratio: 0.5, visible: false },
          { ratio: 1, visible: true },
        ],
      },
    };
    const { tools } = rig({}, {}, [hidden]);
    expect(levelParts(shapesOf(hidden))).toEqual(['level:1']);
    expect(tools.hitTest(200, 200)).toBeNull();
    expect(tools.hitTest(200, 100)?.part).toBe('level:1');
  });

  it('keeps the hidden levels in the item for the host, marked as not visible', () => {
    const { tools } = rig({}, {}, [F]);
    const levels = fibonacciItem(tools.getScene(), 'f').options.levels;
    expect(levels.filter((level) => !level.visible).map((level) => level.ratio)).toEqual(HIDDEN_RATIOS);
  });

  it('re-renders with new levels at once: the item and the hit-testing follow', () => {
    const { store, tools } = rig({}, {}, [F]);
    // The level 0.236 is at y = 252.8.
    expect(tools.hitTest(200, 252.8)?.part).toBe('level:0.236');
    const levels = [{ ratio: 0.5, visible: true }];
    setOptions(store, { levels });
    expect(fibonacciItem(tools.getScene(), 'f').options.levels).toEqual(levels);
    expect(tools.hitTest(200, 252.8)).toBeNull();
    expect(tools.hitTest(200, 200)?.part).toBe('level:0.5');
  });

  it('measures the levels from the second anchor with reverse', () => {
    const { store, tools } = rig({}, {}, [F]);
    expect(tools.hitTest(200, 300)?.part).toBe('level:0');
    expect(tools.hitTest(200, 100)?.part).toBe('level:1');
    setOptions(store, { reverse: true });
    expect(fibonacciItem(tools.getScene(), 'f').options.reverse).toBe(true);
    expect(tools.hitTest(200, 300)?.part).toBe('level:1');
    expect(tools.hitTest(200, 100)?.part).toBe('level:0');
    expect(tools.hitTest(200, 200)?.part).toBe('level:0.5');
  });

  it('extends the lines to the right pane edge with extendRight', () => {
    const { store, tools } = rig({}, {}, [F]);
    expect(tools.hitTest(500, 200)).toBeNull();
    setOptions(store, { extendRight: true });
    expect(fibonacciItem(tools.getScene(), 'f').options.extendRight).toBe(true);
    expect(tools.hitTest(500, 200)?.part).toBe('level:0.5');
    expect(tools.hitTest(800, 200)?.part).toBe('level:0.5');
    expect(tools.hitTest(50, 200)).toBeNull();
  });

  it('extends the lines to the left pane edge with extendLeft, and the label goes with them', () => {
    const { store, tools } = rig({}, {}, [F]);
    expect(tools.hitTest(50, 200)).toBeNull();
    setOptions(store, { extendLeft: true });
    expect(fibonacciItem(tools.getScene(), 'f').options.extendLeft).toBe(true);
    expect(tools.hitTest(50, 200)?.part).toBe('level:0.5');
    expect(tools.hitTest(0, 200)?.part).toBe('label');
    expect(tools.hitTest(500, 200)).toBeNull();
  });

  it('makes every change of levels, reverse, extendLeft and extendRight one history entry', () => {
    const { store, tools } = rig({}, {}, [F]);
    const steps: KindOptions[] = [{ levels: [{ ratio: 0.5, visible: true }] }, { reverse: true }, { extendLeft: true }, { extendRight: true }];
    for (const step of steps) setOptions(store, step);
    for (let kept = steps.length - 1; kept >= 0; kept--) {
      expect(tools.undo()).toBe(true);
      expect(store.get('f')?.options ?? {}).toEqual(Object.assign({}, ...steps.slice(0, kept)));
    }
    expect(tools.undo()).toBe(false);
    for (let done = 1; done <= steps.length; done++) {
      expect(tools.redo()).toBe(true);
      expect(store.get('f')?.options).toEqual(Object.assign({}, ...steps.slice(0, done)));
    }
    expect(tools.redo()).toBe(false);
  });
});

describe('level labels and prices (FR-GEO-003, FR-SC-001)', () => {
  const two = (options: KindOptions = {}): Drawing => ({
    ...F,
    options: {
      levels: [
        { ratio: 0.5, visible: true },
        { ratio: 0.618, visible: true },
      ],
      ...options,
    },
  });

  it('puts a label after each level line, at the left end of the line', () => {
    const shapes = shapesOf(two());
    expect(shapes.map((shape) => shape.type)).toEqual(['line', 'label', 'line', 'label']);
    const [first, second] = labelsOf(shapes);
    expect(first).toMatchObject({ part: 'label', x: 100, y: 200, ratio: 0.5, price: 100 });
    expect(second?.x).toBe(100);
    expect(second?.y).toBeCloseTo(176.4, 9);
    expect(second?.price).toBeCloseTo(111.8, 9);
  });

  it('says the ratio and the price, in 2 decimals, by default', () => {
    expect(labelsOf(shapesOf(two())).map((label) => label.text)).toEqual(['0.5 (100.00)', '0.618 (111.80)']);
    expect(labelsOf(shapesOf(two())).map((label) => [label.showRatio, label.showPrice])).toEqual([
      [true, true],
      [true, true],
    ]);
  });

  it('says only the ratio with showPrices off', () => {
    const labels = labelsOf(shapesOf(two({ showPrices: false })));
    expect(labels.map((label) => label.text)).toEqual(['0.5', '0.618']);
    expect(labels.map((label) => [label.showRatio, label.showPrice])).toEqual([
      [true, false],
      [true, false],
    ]);
  });

  it('says only the price with showLabels off', () => {
    const labels = labelsOf(shapesOf(two({ showLabels: false })));
    expect(labels.map((label) => label.text)).toEqual(['100.00', '111.80']);
    expect(labels.map((label) => [label.showRatio, label.showPrice])).toEqual([
      [false, true],
      [false, true],
    ]);
  });

  it('has no labels with showLabels and showPrices both off', () => {
    const shapes = shapesOf(two({ showLabels: false, showPrices: false }));
    expect(shapes.map((shape) => shape.type)).toEqual(['line', 'line']);
  });

  it('has no label for a hidden level', () => {
    const shapes = shapesOf({ ...F, options: { levels: [{ ratio: 0.5, visible: false }] } });
    expect(shapes).toEqual([]);
  });

  it('formats the price with the priceFormatter, giving it the price and the y-axis, like the label of a horizontal line', () => {
    const calls: [number, string][] = [];
    const priceFormatter = (price: number, yAxisId: string): string => {
      calls.push([price, yAxisId]);
      return `${yAxisId}=${price}`;
    };
    const labels = labelsOf(shapesOf(two(), { priceFormatter }));
    expect(labels[0]?.text).toBe('0.5 (price=100)');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([100, 'price']);
    expect(calls[1]?.[0]).toBeCloseTo(111.8, 9);
    expect(calls[1]?.[1]).toBe('price');
  });

  it('formats only the labels that show a price', () => {
    const calls: number[] = [];
    const priceFormatter = (price: number): string => {
      calls.push(price);
      return 'x';
    };
    expect(labelsOf(shapesOf(two({ showPrices: false }), { priceFormatter })).map((label) => label.text)).toEqual(['0.5', '0.618']);
    expect(calls).toEqual([]);
    expect(labelsOf(shapesOf(two({ showLabels: false }), { priceFormatter })).map((label) => label.text)).toEqual(['x', 'x']);
    expect(calls).toHaveLength(2);
  });

  it('passes the y-axis of the pane the retracement is in', () => {
    const rsi = { yAxisId: 'rsi', top: 400, height: 100, min: 0, max: 100 };
    const onRsi = createMockHost({ panes: [DEFAULT_MOCK_PANE, rsi] });
    const drawing: Drawing = {
      id: 'r',
      kind: RETRACEMENT,
      anchors: [
        { time: 0, price: 20, yAxisId: 'rsi' },
        { time: 60_000, price: 80, yAxisId: 'rsi' },
      ],
      options: { levels: [{ ratio: 0.5, visible: true }], showLabels: false },
    };
    const calls: [number, string][] = [];
    const priceFormatter = (price: number, yAxisId: string): string => {
      calls.push([price, yAxisId]);
      return `${yAxisId}:${price}`;
    };
    const labels = labelsOf(shapesOf(drawing, { priceFormatter }, onRsi));
    expect(labels[0]?.text).toBe('rsi:50');
    expect(calls).toEqual([[50, 'rsi']]);
  });

  it('labels the prices of a reversed retracement from the second anchor', () => {
    const labels = labelsOf(shapesOf(two({ reverse: true })));
    expect(labels.map((label) => label.text)).toEqual(['0.5 (100.00)', '0.618 (88.20)']);
  });

  it('uses the priceFormatter of the tools in the placement preview', () => {
    const { host: mock, tools, click } = rig({ priceFormatter: (price, yAxisId) => `${yAxisId}=${price}` });
    tools.activate(RETRACEMENT);
    click(100, 300);
    mock.pointer('move', 300, 100);
    const labels = labelsOf(previewShapes(tools.getScene()));
    expect(labels.find((label) => label.ratio === 0.5)?.text).toBe('0.5 (price=100)');
    expect(labels.find((label) => label.ratio === 0)?.text).toBe('0 (price=50)');
  });

  it('puts the label options in the resolved item for the host, and follows a change at once', () => {
    const { store, tools } = rig({}, {}, [F]);
    expect(fibonacciItem(tools.getScene(), 'f').options).toMatchObject({ showLabels: true, showPrices: true });
    setOptions(store, { showPrices: false });
    expect(fibonacciItem(tools.getScene(), 'f').options).toMatchObject({ showLabels: true, showPrices: false });
    setOptions(store, { showLabels: false, showPrices: true });
    expect(fibonacciItem(tools.getScene(), 'f').options).toMatchObject({ showLabels: false, showPrices: true });
    expect(tools.undo()).toBe(true);
    expect(tools.undo()).toBe(true);
    expect(fibonacciItem(tools.getScene(), 'f').options).toMatchObject({ showLabels: true, showPrices: true });
  });
});
