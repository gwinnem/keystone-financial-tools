import { test } from 'vitest';
import { GeometryCache } from '../src/hit/geometry-cache';
import { hitTest } from '../src/hit/hit-test';
import { createMockHost } from '../src/testing/mock-host';
import { benchDrawings } from './bench-drawings';

// hitTest over 500 drawings with a warm geometry cache, below the controller (perf.bench.ts has the NFR-PERF-002 budget bench).
const host = createMockHost();
const drawings = benchDrawings(500, 42);
const selected = new Set(drawings.filter((_, index) => index % 10 === 0).map((drawing) => drawing.id));
const cache = new GeometryCache(host);
for (const drawing of drawings) cache.get(drawing);

test('hitTest with 500 drawings and a warm cache', async ({ bench }) => {
  await bench('a point in the middle of the plot', () => {
    hitTest({ x: 400, y: 200 }, { drawings, cache });
  }).run();
  await bench('a point in the middle of the plot, 50 drawings selected', () => {
    hitTest({ x: 400, y: 200 }, { drawings, cache, selected });
  }).run();
  await bench('a point that hits nothing, touch', () => {
    hitTest({ x: 799, y: 399 }, { drawings, cache, pointerType: 'touch' });
  }).run();
});
