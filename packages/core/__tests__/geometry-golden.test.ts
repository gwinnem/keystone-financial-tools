import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { geometryOf } from '../src/geometry/index';
import type { DrawingGeometry } from '../src/geometry/types';
import { createMockHost } from '../src/testing/mock-host';
import type { Drawing } from '../src/types';
import { validateDrawing } from '../src/validate';
import { expectClose } from './close';

interface GoldenCase {
  readonly name: string;
  readonly drawing: Drawing;
  readonly expected: Pick<DrawingGeometry, 'shapes' | 'handles'>;
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../__fixtures__/geometry');
const files = readdirSync(dir).filter((file) => file.endsWith('.json'));

describe('geometry golden fixtures (QA-003)', () => {
  it('has a fixture file per group of kinds', () => {
    expect(files.sort()).toEqual(['fibonacci-fans-arcs.json', 'fibonacci-retracement.json', 'fibonacci-time-zones.json', 'lines-and-boxes.json', 'trend-line.json']);
  });

  describe.each(files)('%s', (file) => {
    const { cases } = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { cases: GoldenCase[] };

    it.each(cases.map((golden) => [golden.name, golden] as const))('%s', (_name, golden) => {
      expect(validateDrawing(golden.drawing)).toEqual([]);
      const geometry = geometryOf(golden.drawing, createMockHost());
      expectClose(geometry, { drawingId: golden.drawing.id, kind: golden.drawing.kind, ...golden.expected });
    });
  });
});
