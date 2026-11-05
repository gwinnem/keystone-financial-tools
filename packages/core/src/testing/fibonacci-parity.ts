import type { Shape } from '../geometry/types';
import type { Drawing } from '../types';

/**
 * The version of `FIBONACCI_PARITY`. It goes up when a case, a scale or an expected value changes, so a repo that
 * copies or pins the fixture knows when to look again.
 */
export const FIBONACCI_PARITY_VERSION = 1;

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
 * What a level is worth, by kind. Retracement: the `price` of the level line. Fans: the `price` the ray has at the time of anchor 2.
 * Arcs: the `radius` of the arc in CSS px. Time zones: the `time` of the vertical line.
 */
export interface FibonacciParityLevel {
  /** The part of the expected shape: `level:<ratio>`, `level:<sequence value>`. */
  readonly part: `level:${number}`;
  readonly price?: number;
  readonly radius?: number;
  readonly time?: number;
}

/** One case: the drawing, the values of its levels and the pixel shapes a host must produce for it. Shapes are compared with a tolerance of `1e-9`. */
export interface FibonacciParityCase {
  readonly name: string;
  readonly drawing: Drawing;
  readonly levels: readonly FibonacciParityLevel[];
  /** The level shapes in drawing order (no labels: the label text is the renderer's business). Angles are radians, canvas convention. */
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

const visible = (...ratios: readonly number[]): { ratio: number; visible: boolean }[] => ratios.map((ratio) => ({ ratio, visible: true }));

/**
 * One versioned fixture for the four Fibonacci tools (QA-007, D-3): anchors, the scales, the value of every level and the pixel
 * lines and arcs. The interactive tools of this package and any programmatic Fibonacci (the chart's own) must agree with it. Use
 * it by building a host with `scales` and comparing `geometryOf` (this package) or your own renderer's output with `shapes`.
 *
 * | Kind | Cases |
 * |---|---|
 * | `fibonacci-retracement` | up move; `reverse` |
 * | `fibonacci-fans` | rays from anchor 1 through each level at the time of anchor 2, clipped to the pane |
 * | `fibonacci-arcs` | half circles; `fullCircles` |
 * | `fibonacci-time-zones` | a sequence from a one bar unit; a negative unit |
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
  ],
};
