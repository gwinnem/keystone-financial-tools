import { describe, expect, it } from 'vitest';
import { geometryOf } from '../src/geometry/index';
import type { LineShape } from '../src/geometry/types';
import { FIBONACCI_PARITY, FIBONACCI_PARITY_VERSION } from '../src/testing/fibonacci-parity';
import { createMockHost } from '../src/testing/mock-host';
import { validateDrawing } from '../src/validate';
import { expectClose } from './close';

const { scales, cases } = FIBONACCI_PARITY;
const host = createMockHost({ width: scales.width, panes: [scales.pane], startTime: scales.startTime, barInterval: scales.barInterval, pxPerBar: scales.pxPerBar });

describe('Fibonacci parity fixture (QA-007, D-3)', () => {
  it('is version 1', () => {
    expect(FIBONACCI_PARITY.version).toBe(FIBONACCI_PARITY_VERSION);
    expect(FIBONACCI_PARITY_VERSION).toBe(1);
  });

  it('covers all four Fibonacci kinds', () => {
    expect([...new Set(cases.map((c) => c.drawing.kind))].sort()).toEqual(['fibonacci-arcs', 'fibonacci-fans', 'fibonacci-retracement', 'fibonacci-time-zones']);
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

    it('has a level for each shape, in the same order', () => {
      expect(fixture.levels.map((level) => level.part)).toEqual(fixture.shapes.map((shape) => shape.part));
    });

    it('has level values that agree with the pixels', () => {
      fixture.levels.forEach((level, index) => {
        const shape = fixture.shapes[index];
        if (level.price !== undefined && fixture.drawing.kind === 'fibonacci-retracement') {
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
