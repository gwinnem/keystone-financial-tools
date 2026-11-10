import type { Shape } from '../geometry/types';
import type { Drawing } from '../types';

/**
 * The version of `FIBONACCI_PARITY`. It goes up when a case, a scale or an expected value changes, so a repo that
 * copies or pins the fixture knows when to look again.
 */
export const FIBONACCI_PARITY_VERSION = 2;

/** The linear scales the fixture is expressed in (the defaults of `createMockHost`): any host with these scales must produce the expected pixels. */
export interface FibonacciParityScales {
  /** Plot width, CSS px. */
  readonly width: number;
  /** Epoch ms at x = 0. */
  readonly startTime: number;
  /** Epoch ms per bar. */
  readonly barInterval: number;
  /** CSS px per bar: `x = (time - startTime) / barInterval * pxPerBar`. */
  readonly pxPerBar: number;
  /** The one pane: `y = top + (max - price) / (max - min) * height`. */
  readonly pane: { readonly yAxisId: string; readonly top: number; readonly height: number; readonly min: number; readonly max: number };
}

/**
 * What a level is worth, by kind. Retracement and trend-based extension: the `price` of the level line. Fans: the `price` the ray has at the time of
 * anchor 2. Arcs, circles and wedge: the `radius` of the arc in CSS px. Time zones and time extension: the `time` of the vertical line. Channel: the
 * `distance` in CSS px of the level line from the base line, towards anchor 3. A spiral has no levels.
 */
export interface FibonacciParityLevel {
  /** The part of the expected shape: `level:<ratio>`, `level:<sequence value>`. */
  readonly part: `level:${number}`;
  readonly price?: number;
  readonly radius?: number;
  readonly time?: number;
  readonly distance?: number;
}

/** One case: the drawing, the values of its levels and the pixel shapes a host must produce for it. Shapes are compared with a tolerance of `1e-9`. */
export interface FibonacciParityCase {
  readonly name: string;
  readonly drawing: Drawing;
  readonly levels: readonly FibonacciParityLevel[];
  /**
   * The shapes in drawing order (no labels: the label text is the renderer's business). Angles are radians, canvas convention. The shapes
   * with a `level:<ratio>` part match `levels` one to one; a shape with the part `body` (the rays of a wedge, a spiral) has no level.
   */
  readonly shapes: readonly Shape[];
}

/** The fixture. */
export interface FibonacciParityFixture {
  readonly version: typeof FIBONACCI_PARITY_VERSION;
  readonly scales: FibonacciParityScales;
  readonly cases: readonly FibonacciParityCase[];
}

const PRICE = 'price';
const FIRST = { time: 600_000, price: 50, yAxisId: PRICE };
const SECOND = { time: 1_800_000, price: 150, yAxisId: PRICE };
/** The pixel distance between the anchors (100, 300) and (300, 100). */
const SPAN = 200 * Math.SQRT2;

const THIRD = { time: 1_200_000, price: 20, yAxisId: PRICE };
/** The golden ratio. */
const PHI = (1 + Math.sqrt(5)) / 2;

/** The points of a golden spiral of one turn around `center`, from `start` (an angle), 32 segments per quarter turn. */
function spiral(center: { x: number; y: number }, from: { x: number; y: number }, direction: 1 | -1): { x: number; y: number }[] {
  const radius = Math.hypot(from.x - center.x, from.y - center.y);
  const start = Math.atan2(from.y - center.y, from.x - center.x);
  return Array.from({ length: 4 * 32 + 1 }, (_, k) => ({
    x: center.x + radius * PHI ** (k / 32) * Math.cos(start + (direction * Math.PI * k) / 64),
    y: center.y + radius * PHI ** (k / 32) * Math.sin(start + (direction * Math.PI * k) / 64),
  }));
}

const visible = (...ratios: readonly number[]): { ratio: number; visible: boolean }[] => ratios.map((ratio) => ({ ratio, visible: true }));

/**
 * One versioned fixture for the ten Fibonacci kinds (QA-007, D-3): anchors, the scales, the value of every level and the pixel
 * lines and arcs. The interactive tools of this package and any programmatic Fibonacci (the chart's own) must agree with it. Use
 * it by building a host with `scales` and comparing `geometryOf` (this package) or your own renderer's output with `shapes`.
 *
 * | Kind | Cases |
 * |---|---|
 * | `fibonacci-retracement` | up move; `reverse` |
 * | `fibonacci-fans` | rays from anchor 1 through each level at the time of anchor 2, clipped to the pane |
 * | `fibonacci-arcs` | half circles; `fullCircles` |
 * | `fibonacci-time-zones` | a sequence from a one bar unit; a negative unit |
 * | `fibonacci-trend-based` | levels projected from anchor 3; extended on both sides |
 * | `fibonacci-channel` | parallels by the distance to anchor 3; extended to the right |
 * | `fibonacci-time-extension` | lines at `t3 + ratio * (t2 - t1)`, those outside the pane left out |
 * | `fibonacci-circles` | full circles around the midpoint |
 * | `fibonacci-spiral` | one turn, clockwise and counter-clockwise |
 * | `fibonacci-wedge` | two rays and arcs between them, in either order of the rays |
 *
 * @example
 * ```ts
 * import { createMockHost, FIBONACCI_PARITY } from 'keystone-financial-tools-core/testing';
 *
 * const { scales, cases } = FIBONACCI_PARITY;
 * const host = createMockHost({ width: scales.width, panes: [scales.pane], startTime: scales.startTime, barInterval: scales.barInterval, pxPerBar: scales.pxPerBar });
 * for (const { drawing, shapes } of cases) expect(myRenderer.shapesOf(drawing, host)).toCloseTo(shapes);
 * ```
 */
export const FIBONACCI_PARITY: FibonacciParityFixture = {
  version: FIBONACCI_PARITY_VERSION,
  scales: { width: 800, startTime: 0, barInterval: 60_000, pxPerBar: 10, pane: { yAxisId: PRICE, top: 0, height: 400, min: 0, max: 200 } },
  cases: [
    {
      name: 'retracement, up move: levels from anchor 1 to anchor 2',
      drawing: {
        id: 'retracement-up',
        kind: 'fibonacci-retracement',
        anchors: [FIRST, SECOND],
        options: { levels: visible(0, 0.5, 0.618, 1), showLabels: false, showPrices: false },
      },
      levels: [
        { part: 'level:0', price: 50 },
        { part: 'level:0.5', price: 100 },
        { part: 'level:0.618', price: 111.8 },
        { part: 'level:1', price: 150 },
      ],
      shapes: [
        { type: 'line', part: 'level:0', from: { x: 100, y: 300 }, to: { x: 300, y: 300 } },
        { type: 'line', part: 'level:0.5', from: { x: 100, y: 200 }, to: { x: 300, y: 200 } },
        { type: 'line', part: 'level:0.618', from: { x: 100, y: 176.4 }, to: { x: 300, y: 176.4 } },
        { type: 'line', part: 'level:1', from: { x: 100, y: 100 }, to: { x: 300, y: 100 } },
      ],
    },
    {
      name: 'retracement, reverse: measured from anchor 2 back to anchor 1',
      drawing: {
        id: 'retracement-reverse',
        kind: 'fibonacci-retracement',
        anchors: [FIRST, SECOND],
        options: { levels: visible(0, 0.25), reverse: true, showLabels: false, showPrices: false },
      },
      levels: [
        { part: 'level:0', price: 150 },
        { part: 'level:0.25', price: 125 },
      ],
      shapes: [
        { type: 'line', part: 'level:0', from: { x: 100, y: 100 }, to: { x: 300, y: 100 } },
        { type: 'line', part: 'level:0.25', from: { x: 100, y: 150 }, to: { x: 300, y: 150 } },
      ],
    },
    {
      name: 'fans: rays from anchor 1 through each level at the time of anchor 2, clipped to the pane',
      drawing: { id: 'fans', kind: 'fibonacci-fans', anchors: [FIRST, SECOND], options: { levels: visible(0, 0.5, 1), showLabels: false } },
      levels: [
        { part: 'level:0', price: 150 },
        { part: 'level:0.5', price: 100 },
        { part: 'level:1', price: 50 },
      ],
      shapes: [
        { type: 'line', part: 'level:0', from: { x: 100, y: 300 }, to: { x: 400, y: 0 } },
        { type: 'line', part: 'level:0.5', from: { x: 100, y: 300 }, to: { x: 700, y: 0 } },
        { type: 'line', part: 'level:1', from: { x: 100, y: 300 }, to: { x: 800, y: 300 } },
      ],
    },
    {
      name: 'arcs: half circles around anchor 2, facing anchor 1, radius ratio times the pixel distance',
      drawing: { id: 'arcs', kind: 'fibonacci-arcs', anchors: [FIRST, SECOND], options: { levels: visible(0.5, 1), fullCircles: false, showLabels: false } },
      levels: [
        { part: 'level:0.5', radius: SPAN * 0.5 },
        { part: 'level:1', radius: SPAN },
      ],
      shapes: [
        { type: 'arc', part: 'level:0.5', center: { x: 300, y: 100 }, radius: SPAN * 0.5, startAngle: Math.PI / 4, endAngle: (5 * Math.PI) / 4 },
        { type: 'arc', part: 'level:1', center: { x: 300, y: 100 }, radius: SPAN, startAngle: Math.PI / 4, endAngle: (5 * Math.PI) / 4 },
      ],
    },
    {
      name: 'arcs: full circles',
      drawing: { id: 'arcs-full', kind: 'fibonacci-arcs', anchors: [FIRST, SECOND], options: { levels: visible(0.5, 1), fullCircles: true, showLabels: false } },
      levels: [
        { part: 'level:0.5', radius: SPAN * 0.5 },
        { part: 'level:1', radius: SPAN },
      ],
      shapes: [
        { type: 'arc', part: 'level:0.5', center: { x: 300, y: 100 }, radius: SPAN * 0.5, startAngle: 0, endAngle: 2 * Math.PI },
        { type: 'arc', part: 'level:1', center: { x: 300, y: 100 }, radius: SPAN, startAngle: 0, endAngle: 2 * Math.PI },
      ],
    },
    {
      name: 'time zones: a sequence from a unit of one bar to the right; prices play no part',
      drawing: {
        id: 'zones',
        kind: 'fibonacci-time-zones',
        anchors: [
          { time: 600_000, price: 10, yAxisId: PRICE },
          { time: 660_000, price: 190, yAxisId: PRICE },
        ],
        options: { sequence: [0, 1, 2, 3, 5, 8], showLabels: false },
      },
      levels: [
        { part: 'level:0', time: 600_000 },
        { part: 'level:1', time: 660_000 },
        { part: 'level:2', time: 720_000 },
        { part: 'level:3', time: 780_000 },
        { part: 'level:5', time: 900_000 },
        { part: 'level:8', time: 1_080_000 },
      ],
      shapes: [
        { type: 'line', part: 'level:0', from: { x: 100, y: 0 }, to: { x: 100, y: 400 } },
        { type: 'line', part: 'level:1', from: { x: 110, y: 0 }, to: { x: 110, y: 400 } },
        { type: 'line', part: 'level:2', from: { x: 120, y: 0 }, to: { x: 120, y: 400 } },
        { type: 'line', part: 'level:3', from: { x: 130, y: 0 }, to: { x: 130, y: 400 } },
        { type: 'line', part: 'level:5', from: { x: 150, y: 0 }, to: { x: 150, y: 400 } },
        { type: 'line', part: 'level:8', from: { x: 180, y: 0 }, to: { x: 180, y: 400 } },
      ],
    },
    {
      name: 'time zones: a negative unit mirrors the lines to the left',
      drawing: {
        id: 'zones-left',
        kind: 'fibonacci-time-zones',
        anchors: [
          { time: 4_200_000, price: 100, yAxisId: PRICE },
          { time: 4_140_000, price: 100, yAxisId: PRICE },
        ],
        options: { sequence: [0, 1, 2, 5], showLabels: false },
      },
      levels: [
        { part: 'level:0', time: 4_200_000 },
        { part: 'level:1', time: 4_140_000 },
        { part: 'level:2', time: 4_080_000 },
        { part: 'level:5', time: 3_900_000 },
      ],
      shapes: [
        { type: 'line', part: 'level:0', from: { x: 700, y: 0 }, to: { x: 700, y: 400 } },
        { type: 'line', part: 'level:1', from: { x: 690, y: 0 }, to: { x: 690, y: 400 } },
        { type: 'line', part: 'level:2', from: { x: 680, y: 0 }, to: { x: 680, y: 400 } },
        { type: 'line', part: 'level:5', from: { x: 650, y: 0 }, to: { x: 650, y: 400 } },
      ],
    },
    {
      name: 'trend-based: the move from anchor 1 to anchor 2 projected from anchor 3',
      drawing: {
        id: 'trend-based',
        kind: 'fibonacci-trend-based',
        anchors: [FIRST, SECOND, { time: 1_800_000, price: 20, yAxisId: PRICE }],
        options: { levels: visible(0, 0.5, 1, 1.618), showLabels: false, showPrices: false },
      },
      levels: [
        { part: 'level:0', price: 20 },
        { part: 'level:0.5', price: 70 },
        { part: 'level:1', price: 120 },
        { part: 'level:1.618', price: 181.8 },
      ],
      shapes: [
        { type: 'line', part: 'level:0', from: { x: 100, y: 360 }, to: { x: 300, y: 360 } },
        { type: 'line', part: 'level:0.5', from: { x: 100, y: 260 }, to: { x: 300, y: 260 } },
        { type: 'line', part: 'level:1', from: { x: 100, y: 160 }, to: { x: 300, y: 160 } },
        { type: 'line', part: 'level:1.618', from: { x: 100, y: 36.4 }, to: { x: 300, y: 36.4 } },
      ],
    },
    {
      name: 'trend-based, extended on both sides: from the left edge of the pane to the right edge',
      drawing: {
        id: 'trend-based-extended',
        kind: 'fibonacci-trend-based',
        anchors: [FIRST, SECOND, { time: 1_800_000, price: 20, yAxisId: PRICE }],
        options: { levels: visible(0), extendLeft: true, extendRight: true, showLabels: false, showPrices: false },
      },
      levels: [{ part: 'level:0', price: 20 }],
      shapes: [{ type: 'line', part: 'level:0', from: { x: 0, y: 360 }, to: { x: 800, y: 360 } }],
    },
    {
      name: 'channel: parallels of the base line, moved by the ratio times the distance to anchor 3',
      drawing: { id: 'channel', kind: 'fibonacci-channel', anchors: [FIRST, SECOND, THIRD], options: { levels: visible(0, 0.5, 1), showLabels: false } },
      levels: [
        { part: 'level:0', distance: 0 },
        { part: 'level:0.5', distance: 40 * Math.SQRT2 },
        { part: 'level:1', distance: 80 * Math.SQRT2 },
      ],
      shapes: [
        { type: 'line', part: 'level:0', from: { x: 100, y: 300 }, to: { x: 300, y: 100 } },
        { type: 'line', part: 'level:0.5', from: { x: 140, y: 340 }, to: { x: 340, y: 140 } },
        { type: 'line', part: 'level:1', from: { x: 180, y: 380 }, to: { x: 380, y: 180 } },
      ],
    },
    {
      name: 'channel, extended to the right: each parallel runs on to the edge of the pane',
      drawing: { id: 'channel-right', kind: 'fibonacci-channel', anchors: [FIRST, SECOND, THIRD], options: { levels: visible(0, 1), extendRight: true, showLabels: false } },
      levels: [
        { part: 'level:0', distance: 0 },
        { part: 'level:1', distance: 80 * Math.SQRT2 },
      ],
      shapes: [
        { type: 'line', part: 'level:0', from: { x: 100, y: 300 }, to: { x: 400, y: 0 } },
        { type: 'line', part: 'level:1', from: { x: 180, y: 380 }, to: { x: 560, y: 0 } },
      ],
    },
    {
      name: 'time extension: vertical lines at t3 + ratio * (t2 - t1); a line outside the pane is left out; prices play no part',
      drawing: {
        id: 'time-extension',
        kind: 'fibonacci-time-extension',
        anchors: [FIRST, SECOND, { time: 1_200_000, price: 100, yAxisId: PRICE }],
        options: { levels: visible(0, 0.5, 1, 2, 4), showLabels: false },
      },
      levels: [
        { part: 'level:0', time: 1_200_000 },
        { part: 'level:0.5', time: 1_800_000 },
        { part: 'level:1', time: 2_400_000 },
        { part: 'level:2', time: 3_600_000 },
      ],
      shapes: [
        { type: 'line', part: 'level:0', from: { x: 200, y: 0 }, to: { x: 200, y: 400 } },
        { type: 'line', part: 'level:0.5', from: { x: 300, y: 0 }, to: { x: 300, y: 400 } },
        { type: 'line', part: 'level:1', from: { x: 400, y: 0 }, to: { x: 400, y: 400 } },
        { type: 'line', part: 'level:2', from: { x: 600, y: 0 }, to: { x: 600, y: 400 } },
      ],
    },
    {
      name: 'circles: full circles around the midpoint, radius ratio times half the pixel distance',
      drawing: { id: 'circles', kind: 'fibonacci-circles', anchors: [FIRST, SECOND], options: { levels: visible(0.5, 1), showLabels: false } },
      levels: [
        { part: 'level:0.5', radius: SPAN * 0.25 },
        { part: 'level:1', radius: SPAN * 0.5 },
      ],
      shapes: [
        { type: 'arc', part: 'level:0.5', center: { x: 200, y: 200 }, radius: SPAN * 0.25, startAngle: 0, endAngle: 2 * Math.PI },
        { type: 'arc', part: 'level:1', center: { x: 200, y: 200 }, radius: SPAN * 0.5, startAngle: 0, endAngle: 2 * Math.PI },
      ],
    },
    {
      name: 'spiral, clockwise: one turn around anchor 1 from anchor 2, growing by the golden ratio every quarter turn',
      drawing: { id: 'spiral', kind: 'fibonacci-spiral', anchors: [FIRST, SECOND], options: { turns: 1, clockwise: true } },
      levels: [],
      shapes: [{ type: 'polyline', part: 'body', points: spiral({ x: 100, y: 300 }, { x: 300, y: 100 }, 1) }],
    },
    {
      name: 'spiral, counter-clockwise: the same start, the other way round',
      drawing: { id: 'spiral-counter', kind: 'fibonacci-spiral', anchors: [FIRST, SECOND], options: { turns: 1, clockwise: false } },
      levels: [],
      shapes: [{ type: 'polyline', part: 'body', points: spiral({ x: 100, y: 300 }, { x: 300, y: 100 }, -1) }],
    },
    {
      name: 'wedge: rays through anchors 2 and 3, arcs around anchor 1 between them',
      drawing: {
        id: 'wedge',
        kind: 'fibonacci-wedge',
        anchors: [FIRST, SECOND, { time: 1_800_000, price: 50, yAxisId: PRICE }],
        options: { levels: visible(0.5, 1), showLabels: false },
      },
      levels: [
        { part: 'level:0.5', radius: SPAN * 0.5 },
        { part: 'level:1', radius: SPAN },
      ],
      shapes: [
        { type: 'line', part: 'body', from: { x: 100, y: 300 }, to: { x: 400, y: 0 } },
        { type: 'line', part: 'body', from: { x: 100, y: 300 }, to: { x: 800, y: 300 } },
        { type: 'arc', part: 'level:0.5', center: { x: 100, y: 300 }, radius: SPAN * 0.5, startAngle: -Math.PI / 4, endAngle: 0 },
        { type: 'arc', part: 'level:1', center: { x: 100, y: 300 }, radius: SPAN, startAngle: -Math.PI / 4, endAngle: 0 },
      ],
    },
    {
      name: 'wedge, rays the other way round: the arc still runs by the shorter way, the radius follows anchor 2',
      drawing: {
        id: 'wedge-reversed',
        kind: 'fibonacci-wedge',
        anchors: [FIRST, { time: 1_800_000, price: 50, yAxisId: PRICE }, SECOND],
        options: { levels: visible(0.5, 1), showLabels: false },
      },
      levels: [
        { part: 'level:0.5', radius: 100 },
        { part: 'level:1', radius: 200 },
      ],
      shapes: [
        { type: 'line', part: 'body', from: { x: 100, y: 300 }, to: { x: 800, y: 300 } },
        { type: 'line', part: 'body', from: { x: 100, y: 300 }, to: { x: 400, y: 0 } },
        { type: 'arc', part: 'level:0.5', center: { x: 100, y: 300 }, radius: 100, startAngle: -Math.PI / 4, endAngle: 0 },
        { type: 'arc', part: 'level:1', center: { x: 100, y: 300 }, radius: 200, startAngle: -Math.PI / 4, endAngle: 0 },
      ],
    },
  ],
};
