import { describe, expect, it } from 'vitest';
import { geometryOf } from '../src/geometry/index';
import { DRAWING_KINDS } from '../src/kinds';
import type { LineShape } from '../src/geometry/types';
import { FIBONACCI_PARITY, FIBONACCI_PARITY_VERSION } from '../src/testing/fibonacci-parity';
import { createMockHost } from '../src/testing/mock-host';
import { validateDrawing } from '../src/validate';
import { expectClose } from './close';

const { scales, cases } = FIBONACCI_PARITY;
const host = createMockHost({ width: scales.width, panes: [scales.pane], startTime: scales.startTime, barInterval: scales.barInterval, pxPerBar: scales.pxPerBar });

describe('Fibonacci parity fixture (QA-007, D-3)', () => {
  it('is version 2: the version went from 1 once for the six kinds of E11 and E15', () => {
    expect(FIBONACCI_PARITY.version).toBe(FIBONACCI_PARITY_VERSION);
    expect(FIBONACCI_PARITY_VERSION).toBe(2);
  });

  it('covers all ten Fibonacci kinds', () => {
    expect([...new Set(cases.map((c) => c.drawing.kind))].sort()).toEqual([
      'fibonacci-arcs',
      'fibonacci-channel',
      'fibonacci-circles',
      'fibonacci-fans',
      'fibonacci-retracement',
      'fibonacci-spiral',
      'fibonacci-time-extension',
      'fibonacci-time-zones',
      'fibonacci-trend-based',
      'fibonacci-wedge',
    ]);
  });

  it('has a case for every Fibonacci kind of the scene item, and the item type names the same ten', () => {
    const kinds = DRAWING_KINDS.filter((kind) => kind.startsWith('fibonacci-'));
    expect([...new Set(cases.map((c) => c.drawing.kind))].sort()).toEqual([...kinds].sort());
  });

  it('has unique case names and drawing ids', () => {
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
    expect(new Set(cases.map((c) => c.drawing.id)).size).toBe(cases.length);
  });

  it('has the scales of the mock host: 800 px wide, one pane from 0 to 200 over 400 px, 6000 ms per px', () => {
    expect(scales).toEqual({ width: 800, startTime: 0, barInterval: 60_000, pxPerBar: 10, pane: { yAxisId: 'price', top: 0, height: 400, min: 0, max: 200 } });
    expect(host.timeToX(600_000)).toBe(100);
    expect(host.priceToY(50, 'price')).toBe(300);
  });

  describe.each(cases.map((c) => [c.name, c] as const))('%s', (_name, fixture) => {
    const geometry = geometryOf(fixture.drawing, host);

    it('is a valid drawing', () => {
      expect(validateDrawing(fixture.drawing)).toEqual([]);
    });

    it('has the expected pixel shapes', () => {
      expectClose(geometry?.shapes, fixture.shapes);
    });

    it('has a level for each shape of a level, in the same order', () => {
      expect(fixture.levels.map((level) => level.part)).toEqual(fixture.shapes.filter((shape) => shape.part !== 'body').map((shape) => shape.part));
    });

    it('has level values that agree with the pixels', () => {
      const shapes = fixture.shapes.filter((shape) => shape.part !== 'body');
      fixture.levels.forEach((level, index) => {
        const shape = shapes[index];
        if (level.distance !== undefined) {
          // A channel line: its distance from the base line through anchors 1 and 2, in pixels.
          const [a1, a2] = fixture.drawing.anchors;
          const from = { x: host.timeToX(a1.time), y: host.priceToY(a1.price, 'price') };
          const to = { x: host.timeToX(a2.time), y: host.priceToY(a2.price, 'price') };
          const line = shape as LineShape;
          const length = Math.hypot(to.x - from.x, to.y - from.y);
          const distance = Math.abs((to.x - from.x) * (from.y - line.from.y) - (from.x - line.from.x) * (to.y - from.y)) / length;
          expect(distance).toBeCloseTo(level.distance, 9);
        } else if (level.price !== undefined && (fixture.drawing.kind === 'fibonacci-retracement' || fixture.drawing.kind === 'fibonacci-trend-based')) {
          const line = shape as LineShape;
          expect(host.yToPrice(line.from.y, 'price')).toBeCloseTo(level.price, 9);
        } else if (level.price !== undefined) {
          // A fan ray: its height at the time of anchor 2.
          const line = shape as LineShape;
          const x2 = host.timeToX(fixture.drawing.anchors[1].time);
          const y = line.from.y + ((x2 - line.from.x) * (line.to.y - line.from.y)) / (line.to.x - line.from.x);
          expect(host.yToPrice(y, 'price')).toBeCloseTo(level.price, 9);
        } else if (level.radius !== undefined) {
          const arc = shape as { radius: number };
          expect(arc.radius).toBeCloseTo(level.radius, 9);
        } else {
          expect(host.timeToX(level.time as number)).toBeCloseTo((shape as LineShape).from.x, 9);
        }
      });
    });
  });
});
