import { test } from 'vitest';
import { GeometryCache } from '../src/hit/geometry-cache';
import { buildScene } from '../src/scene/build';
import { SceneCache } from '../src/scene/scene-cache';
import { createMockHost } from '../src/testing/mock-host';
import { benchDrawings } from './bench-drawings';

// buildScene of 500 visible drawings with a warm geometry cache, below the controller (perf.bench.ts has the NFR-PERF-001 budget bench).
const host = createMockHost();
const drawings = benchDrawings(500, 7);
const selected = new Set(drawings.filter((_, index) => index % 10 === 0).map((drawing) => drawing.id));
const cache = new GeometryCache(host);
for (const drawing of drawings) cache.get(drawing);

test('buildScene with 500 drawings and a warm cache', async ({ bench }) => {
  await bench('no state', () => {
    buildScene(host, { drawings, cache });
  }).run();
  await bench('50 selected, one hovered, a preview and a snap', () => {
    buildScene(host, { drawings, cache, selected, hover: 'd3', preview: drawings[1], snap: { x: 10, y: 10 } });
  }).run();
  const scenes = new SceneCache(host);
  await bench('SceneCache with unchanged options', () => {
    scenes.get({ drawings, cache, selected });
  }).run();
});
