import { describe, expect, it } from 'vitest';
import { TOOL_CATALOG } from '../src/catalog';
import { geometryOf } from '../src/geometry/index';
import { GOLDEN_RATIO, SPIRAL_SEGMENTS_PER_QUARTER } from '../src/geometry/fibonacci';
import type { ArcShape, LabelShape, LineShape, PolylineShape, Shape } from '../src/geometry/types';
import { GeometryCache } from '../src/hit/geometry-cache';
import { ANCHOR_COUNT, DEFAULT_TOOLS, DRAWING_KINDS, isDrawingKind, kindDefinition } from '../src/kinds';
import { MAX_TURNS, defaultOptions, resolveOptions, validateOptions } from '../src/options';
import { buildScene } from '../src/scene/build';
import type { FibonacciItem } from '../src/scene/types';
import { createMockHost } from '../src/testing/mock-host';
import type { Anchor, Drawing, DrawingKind } from '../src/types';
import { validateDrawing } from '../src/validate';
import { expectClose } from './close';

// E12-F02-S03 (FR-TOOL-018, FR-TOOL-140..144, FR-SC-004): the six new Fibonacci kinds. The default mock host: x = time / 6000, y = 400 - 2 * price.
const host = createMockHost();
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
const NEW_KINDS = ['fibonacci-trend-based', 'fibonacci-channel', 'fibonacci-time-extension', 'fibonacci-circles', 'fibonacci-spiral', 'fibonacci-wedge'] as const;
const make = (kind: DrawingKind, anchors: Anchor[], options?: Drawing['options']): Drawing => ({ id: 'd', kind, anchors, ...(options === undefined ? {} : { options }) });
const shapesOf = (drawing: Drawing): readonly Shape[] => geometryOf(drawing, host)?.shapes ?? [];
const visible = (...ratios: number[]) => ratios.map((ratio) => ({ ratio, visible: true }));
const P = (x: number, y: number) => ({ x, y });

describe('the registry (D-8)', () => {
  it('has the six kinds after the eight of 1.0, with 3, 3, 3, 2, 2 and 3 anchors, in the group fibonacci', () => {
    expect(DRAWING_KINDS.slice(8)).toEqual([...NEW_KINDS]);
    expect(NEW_KINDS.map((kind) => ANCHOR_COUNT[kind])).toEqual([3, 3, 3, 2, 2, 3]);
    for (const kind of NEW_KINDS) {
      expect(isDrawingKind(kind)).toBe(true);
      expect(kindDefinition(kind)?.group).toBe('fibonacci');
    }
  });

  it('keeps them out of the default tools and the catalog until their tool stories', () => {
    for (const kind of NEW_KINDS) {
      expect(DEFAULT_TOOLS).not.toContain(kind);
      expect(TOOL_CATALOG.map((entry) => entry.id)).not.toContain(kind);
    }
    expect(DEFAULT_TOOLS).toHaveLength(8);
  });
});

describe('the options (FR-DM-020, FR-SC-004)', () => {
  it('has the defaults of the SDS', () => {
    expect(defaultOptions('fibonacci-trend-based')).toEqual({
      levels: [...visible(0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618), { ratio: 2.618, visible: false }, { ratio: 4.236, visible: false }],
      extendLeft: false,
      extendRight: false,
      showLabels: true,
      showPrices: true,
    });
    expect(defaultOptions('fibonacci-channel')).toEqual({ levels: visible(0, 0.236, 0.382, 0.5, 0.618, 0.786, 1), extendLeft: false, extendRight: false, showLabels: true });
    expect(defaultOptions('fibonacci-time-extension')).toEqual({ levels: visible(0, 0.618, 1, 1.618, 2.618, 4.236), showLabels: true });
    expect(defaultOptions('fibonacci-circles')).toEqual({ levels: visible(0.382, 0.5, 0.618, 1, 1.618), showLabels: true });
    expect(defaultOptions('fibonacci-spiral')).toEqual({ turns: 4, clockwise: true });
    expect(defaultOptions('fibonacci-wedge')).toEqual({ levels: visible(0.382, 0.5, 0.618, 1), showLabels: true });
  });

  it('resolves the options of each kind in the fibonacci scene item, none left to default', () => {
    const anchors = [A(100, 300), A(300, 100), A(200, 360)];
    const resolved = (drawing: Drawing): FibonacciItem => buildScene(host, { drawings: [drawing], cache: new GeometryCache(host) })[0] as FibonacciItem;
    for (const kind of NEW_KINDS) {
      const item = resolved(make(kind, anchors.slice(0, ANCHOR_COUNT[kind])));
      expect(item.type).toBe('fibonacci');
      expect(item.kind).toBe(kind);
      expect(item.options).toEqual(defaultOptions(kind));
      expect(item.anchors).toHaveLength(ANCHOR_COUNT[kind]);
    }
    expect(resolved(make('fibonacci-spiral', anchors.slice(0, 2), { turns: 2 })).options).toEqual({ turns: 2, clockwise: true });
    expect(resolved(make('fibonacci-channel', anchors, { extendRight: true })).options).toMatchObject({ extendLeft: false, extendRight: true, showLabels: true });
  });

  it('accepts turns from 1 to 8, whole numbers only', () => {
    expect(MAX_TURNS).toBe(8);
    for (const turns of [1, 4, 8]) expect(validateOptions('fibonacci-spiral', { turns })).toEqual([]);
    for (const turns of [0, 9, 2.5, -1, Number.NaN, '4', null, true]) {
      expect(validateOptions('fibonacci-spiral', { turns })).toEqual([{ code: 'KFT-E-OPTIONS', message: 'The option turns must be a whole number from 1 to 8.' }]);
    }
  });

  it('allows turns on the spiral only, and clockwise as a boolean', () => {
    expect(validateOptions('fibonacci-circles', { turns: 4 })).toEqual([{ code: 'KFT-E-OPTIONS', message: 'The option turns is not allowed on a fibonacci-circles.' }]);
    expect(validateOptions('fibonacci-spiral', { clockwise: 'yes' })).toEqual([{ code: 'KFT-E-OPTIONS', message: 'The option clockwise must be a boolean.' }]);
    expect(validateOptions('fibonacci-spiral', { levels: [] })).toEqual([{ code: 'KFT-E-OPTIONS', message: 'The option levels is not allowed on a fibonacci-spiral.' }]);
    expect(resolveOptions('fibonacci-spiral', { clockwise: false })).toEqual({ turns: 4, clockwise: false });
  });

  it('makes a drawing of each kind valid with the right number of anchors only', () => {
    const anchors = [A(100, 300), A(300, 100), A(200, 360)];
    for (const kind of NEW_KINDS) {
      expect(validateDrawing(make(kind, anchors.slice(0, ANCHOR_COUNT[kind])))).toEqual([]);
      expect(validateDrawing(make(kind, anchors.slice(0, ANCHOR_COUNT[kind] - 1))).length).toBeGreaterThan(0);
    }
  });
});

describe('fibonacci-trend-based (FR-TOOL-018)', () => {
  const base = [A(100, 300), A(300, 100), A(300, 360)];
  const lines = (options: Drawing['options'], anchors = base) => shapesOf(make('fibonacci-trend-based', anchors, { showLabels: false, showPrices: false, ...options })) as LineShape[];

  it('projects the move from anchor 1 to anchor 2 from anchor 3, between the outer anchors', () => {
    expectClose(lines({ levels: visible(0, 1, -1) }), [
      { type: 'line', part: 'level:0', from: P(100, 360), to: P(300, 360) },
      { type: 'line', part: 'level:1', from: P(100, 160), to: P(300, 160) },
      { type: 'line', part: 'level:-1', from: P(100, 560), to: P(300, 560) },
    ]);
  });

  it('follows a falling move below anchor 3', () => {
    expectClose(lines({ levels: visible(1) }, [A(100, 100), A(300, 300), A(300, 360)]), [{ type: 'line', part: 'level:1', from: P(100, 560), to: P(300, 560) }]);
  });

  it('leaves out hidden levels and extends to the pane edge on the sides asked for', () => {
    const levels = [
      { ratio: 0, visible: true },
      { ratio: 1, visible: false },
    ];
    expect(lines({ levels })).toHaveLength(1);
    expectClose(lines({ levels, extendLeft: true }), [{ type: 'line', part: 'level:0', from: P(0, 360), to: P(300, 360) }]);
    expectClose(lines({ levels, extendRight: true }), [{ type: 'line', part: 'level:0', from: P(100, 360), to: P(800, 360) }]);
    expectClose(lines({ levels, extendLeft: true, extendRight: true }), [{ type: 'line', part: 'level:0', from: P(0, 360), to: P(800, 360) }]);
  });

  it('puts a label after each line: the ratio, the price, or both', () => {
    const labels = (options: Drawing['options']) => (shapesOf(make('fibonacci-trend-based', base, { levels: visible(0.5), ...options })) as (LineShape | LabelShape)[]).slice(1);
    const label = (text: string, showRatio: boolean, showPrice: boolean): LabelShape => ({ type: 'label', part: 'label', x: 100, y: 260, ratio: 0.5, price: 70, showRatio, showPrice, text });
    expectClose(labels({ showLabels: true, showPrices: true }), [label('0.5 (70.00)', true, true)]);
    expectClose(labels({ showLabels: true, showPrices: false }), [label('0.5', true, false)]);
    expectClose(labels({ showLabels: false, showPrices: true }), [label('70.00', false, true)]);
    expect(labels({ showLabels: false, showPrices: false })).toEqual([]);
  });
});

describe('fibonacci-channel (FR-TOOL-140)', () => {
  const channel = (anchors: Anchor[], options: Drawing['options']) => shapesOf(make('fibonacci-channel', anchors, { showLabels: false, ...options })) as LineShape[];

  it('moves the base line by the ratio times the perpendicular vector to anchor 3, also to the other side', () => {
    expectClose(channel([A(100, 300), A(300, 100), A(200, 360)], { levels: visible(0, 1, -1) }), [
      { type: 'line', part: 'level:0', from: P(100, 300), to: P(300, 100) },
      { type: 'line', part: 'level:1', from: P(180, 380), to: P(380, 180) },
      { type: 'line', part: 'level:-1', from: P(20, 220), to: P(220, 20) },
    ]);
  });

  it('works for a vertical base line: the offset is horizontal', () => {
    expectClose(channel([A(100, 300), A(100, 100), A(200, 200)], { levels: visible(1) }), [{ type: 'line', part: 'level:1', from: P(200, 300), to: P(200, 100) }]);
  });

  it('runs from left to right whichever way the anchors are given', () => {
    expectClose(channel([A(300, 100), A(100, 300), A(200, 360)], { levels: visible(1) }), [{ type: 'line', part: 'level:1', from: P(180, 380), to: P(380, 180) }]);
  });

  it('leaves out hidden levels and extends each line on the sides asked for', () => {
    const levels = [
      { ratio: 0, visible: true },
      { ratio: 1, visible: false },
    ];
    const anchors = [A(100, 300), A(300, 100), A(200, 360)];
    expect(channel(anchors, { levels })).toHaveLength(1);
    expectClose(channel(anchors, { levels, extendLeft: true }), [{ type: 'line', part: 'level:0', from: P(0, 400), to: P(300, 100) }]);
    expectClose(channel(anchors, { levels, extendRight: true }), [{ type: 'line', part: 'level:0', from: P(100, 300), to: P(400, 0) }]);
  });

  it('is the anchor point moved by the ratio when anchors 1 and 2 are on one point', () => {
    expectClose(channel([A(100, 300), A(100, 300), A(200, 360)], { levels: visible(0, 1) }), [
      { type: 'line', part: 'level:0', from: P(100, 300), to: P(100, 300) },
      { type: 'line', part: 'level:1', from: P(200, 360), to: P(200, 360) },
    ]);
  });
});

describe('fibonacci-time-extension (FR-TOOL-141)', () => {
  const extension = (anchors: Anchor[], options: Drawing['options']) => shapesOf(make('fibonacci-time-extension', anchors, { showLabels: false, ...options })) as LineShape[];
  const vertical = (part: string, x: number): LineShape => ({ type: 'line', part: part as LineShape['part'], from: P(x, 0), to: P(x, 400) });

  it('draws vertical lines at t3 + ratio * (t2 - t1) across the pane, prices playing no part', () => {
    expectClose(extension([A(100, 300), A(300, 100), A(200, 20)], { levels: visible(0, 0.5, 1) }), [vertical('level:0', 200), vertical('level:0.5', 300), vertical('level:1', 400)]);
    expectClose(extension([A(100, 10), A(300, 390), A(200, 20)], { levels: visible(1) }), [vertical('level:1', 400)]);
  });

  it('runs to the left for a negative unit and leaves out lines outside the pane', () => {
    expectClose(extension([A(400, 100), A(200, 100), A(500, 100)], { levels: visible(0, 1, 2, 4) }), [vertical('level:0', 500), vertical('level:1', 300), vertical('level:2', 100)]);
  });

  it('keeps a line on the edge of the pane', () => {
    expectClose(extension([A(100, 100), A(200, 100), A(700, 100)], { levels: visible(0, 1, 2) }), [vertical('level:0', 700), vertical('level:1', 800)]);
    expectClose(extension([A(300, 100), A(200, 100), A(100, 100)], { levels: visible(0, 1, 2) }), [vertical('level:0', 100), vertical('level:1', 0)]);
  });

  it('leaves out hidden levels, and everything when the unit is 0', () => {
    expect(
      extension([A(100, 100), A(200, 100), A(200, 100)], {
        levels: [
          { ratio: 1, visible: false },
          { ratio: 2, visible: true },
        ],
      })
    ).toEqual([vertical('level:2', 400)]);
    expect(extension([A(100, 100), A(100, 300), A(200, 100)], { levels: visible(0, 1) })).toEqual([]);
  });
});

describe('fibonacci-circles (FR-TOOL-142)', () => {
  const circles = (anchors: Anchor[], options: Drawing['options']) => shapesOf(make('fibonacci-circles', anchors, { showLabels: false, ...options })) as ArcShape[];

  it('draws full circles around the midpoint with ratio times half the pixel distance as the radius', () => {
    expectClose(circles([A(100, 300), A(300, 100)], { levels: visible(0.5, 1, 2) }), [
      { type: 'arc', part: 'level:0.5', center: P(200, 200), radius: 100 * Math.SQRT2 * 0.5, startAngle: 0, endAngle: 2 * Math.PI },
      { type: 'arc', part: 'level:1', center: P(200, 200), radius: 100 * Math.SQRT2, startAngle: 0, endAngle: 2 * Math.PI },
      { type: 'arc', part: 'level:2', center: P(200, 200), radius: 200 * Math.SQRT2, startAngle: 0, endAngle: 2 * Math.PI },
    ]);
  });

  it('leaves out hidden levels, levels of 0 or less, and everything when the anchors are on one point', () => {
    expect(
      circles([A(100, 300), A(300, 100)], {
        levels: [
          { ratio: 1, visible: false },
          { ratio: 0, visible: true },
          { ratio: -1, visible: true },
        ],
      })
    ).toEqual([]);
    expect(circles([A(100, 300), A(100, 300)], { levels: visible(1) })).toEqual([]);
  });
});

describe('fibonacci-spiral (FR-TOOL-143)', () => {
  const spiral = (anchors: Anchor[], options: Drawing['options']): PolylineShape | undefined => shapesOf(make('fibonacci-spiral', anchors, options))[0] as PolylineShape | undefined;
  const two = [A(100, 300), A(300, 100)];
  const R = 200 * Math.SQRT2;

  it('has 32 segments per quarter turn and starts at anchor 2', () => {
    expect(SPIRAL_SEGMENTS_PER_QUARTER).toBe(32);
    for (const turns of [1, 2, 4, 8]) expect(spiral(two, { turns })?.points).toHaveLength(turns * 4 * 32 + 1);
    expect(spiral(two, { turns: 1 })?.part).toBe('body');
    expectClose(spiral(two, { turns: 1 })?.points[0], P(300, 100));
  });

  it('grows by the golden ratio every quarter turn, clockwise by default', () => {
    expect(GOLDEN_RATIO).toBeCloseTo(1.618033988749895, 12);
    const points = spiral(two, { turns: 1 })?.points ?? [];
    // Anchor 1 is the centre; the start is at -45 degrees, the first quarter turn at +45 degrees (y grows downwards: clockwise on screen).
    expectClose(points[32], P(100 + 200 * GOLDEN_RATIO, 300 + 200 * GOLDEN_RATIO));
    expectClose(points[64], P(100 - 200 * GOLDEN_RATIO ** 2, 300 + 200 * GOLDEN_RATIO ** 2));
    expectClose(points[96], P(100 - 200 * GOLDEN_RATIO ** 3, 300 - 200 * GOLDEN_RATIO ** 3));
    expect(Math.hypot((points[128]?.x ?? 0) - 100, (points[128]?.y ?? 0) - 300)).toBeCloseTo(R * GOLDEN_RATIO ** 4, 6);
  });

  it('turns the other way with clockwise false', () => {
    const points = spiral(two, { turns: 1, clockwise: false })?.points ?? [];
    expectClose(points[0], P(300, 100));
    expectClose(points[32], P(100 - 200 * GOLDEN_RATIO, 300 - 200 * GOLDEN_RATIO));
    expectClose(points[64], P(100 - 200 * GOLDEN_RATIO ** 2, 300 + 200 * GOLDEN_RATIO ** 2));
  });

  it('uses the default of 4 turns, clockwise', () => {
    expect(spiral(two, {})?.points).toHaveLength(513);
    expectClose(spiral(two, {})?.points[32], P(100 + 200 * GOLDEN_RATIO, 300 + 200 * GOLDEN_RATIO));
  });

  it('has no shape when the anchors are on one point', () => {
    expect(shapesOf(make('fibonacci-spiral', [A(100, 300), A(100, 300)]))).toEqual([]);
  });
});

describe('fibonacci-wedge (FR-TOOL-144)', () => {
  const wedge = (anchors: Anchor[], options: Drawing['options']) => shapesOf(make('fibonacci-wedge', anchors, { showLabels: false, ...options })) as (LineShape | ArcShape)[];
  const arcsOf = (shapes: readonly Shape[]) => shapes.filter((shape): shape is ArcShape => shape.type === 'arc');
  const polar = (center: { x: number; y: number }, degrees: number, radius: number): Anchor =>
    A(center.x + radius * Math.cos((degrees * Math.PI) / 180), center.y + radius * Math.sin((degrees * Math.PI) / 180));

  it('draws the rays first, clipped to the pane, then an arc per level around anchor 1', () => {
    expectClose(wedge([A(100, 300), A(300, 100), A(300, 300)], { levels: visible(0.5) }), [
      { type: 'line', part: 'body', from: P(100, 300), to: P(400, 0) },
      { type: 'line', part: 'body', from: P(100, 300), to: P(800, 300) },
      { type: 'arc', part: 'level:0.5', center: P(100, 300), radius: 100 * Math.SQRT2, startAngle: -Math.PI / 4, endAngle: 0 },
    ]);
  });

  it('runs the arc by the shorter way, across the half turn too, whichever ray comes first', () => {
    const centre = P(400, 200);
    for (const [first, second] of [
      [170, -170],
      [-170, 170],
    ] as const) {
      const [arc] = arcsOf(wedge([A(400, 200), polar(centre, first, 100), polar(centre, second, 100)], { levels: visible(1) }));
      expect(arc?.radius).toBeCloseTo(100, 6);
      expect(arc?.startAngle).toBeCloseTo((170 * Math.PI) / 180, 6);
      expect(arc?.endAngle).toBeCloseTo((190 * Math.PI) / 180, 6);
    }
  });

  it('measures the radius to anchor 2 and leaves out hidden levels and levels of 0 or less', () => {
    const arcs = arcsOf(wedge([A(100, 300), A(300, 300), A(300, 100)], { levels: [...visible(0.5), { ratio: 1, visible: false }, { ratio: 0, visible: true }, { ratio: -1, visible: true }] }));
    expect(arcs).toHaveLength(1);
    expect(arcs[0]?.radius).toBeCloseTo(100, 9);
  });

  it('has the rays only when they coincide, and no first ray or arc when anchor 2 is on anchor 1', () => {
    expect(wedge([A(100, 300), A(200, 300), A(300, 300)], { levels: visible(1) })).toHaveLength(2);
    expect(wedge([A(100, 300), A(100, 300), A(300, 100)], { levels: visible(1) })).toEqual([{ type: 'line', part: 'body', from: P(100, 300), to: P(400, 0) }]);
  });

  it('leaves out a ray that misses the pane', () => {
    expect(wedge([A(1000, 500), A(1100, 500), A(1000, 600)], { levels: [] })).toEqual([]);
  });
});
