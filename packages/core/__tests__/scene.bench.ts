import { test } from 'vitest';
import { GeometryCache } from '../src/hit/geometry-cache';
import { buildScene } from '../src/scene/build';
import { SceneCache } from '../src/scene/scene-cache';
import { createMockHost } from '../src/testing/mock-host';
import type { Anchor, Drawing, DrawingKind } from '../src/types';
import { seeded } from './random';

// NFR-PERF-001: the scene of 500 visible drawings takes at most 2 ms (geometry cache warm).
const host = createMockHost();
const random = seeded(7);
const anchor = (): Anchor => ({ time: Math.floor(random() * 4_800_000), price: random() * 200, yAxisId: 'price' });
const KINDS: readonly DrawingKind[] = ['trend-line', 'horizontal-line', 'rectangle', 'text-note', 'fibonacci-retracement', 'fibonacci-fans', 'fibonacci-arcs', 'fibonacci-time-zones'];

function drawingOf(index: number): Drawing {
  const kind = KINDS[index % KINDS.length];
  const anchors = kind === 'horizontal-line' || kind === 'text-note' ? [anchor()] : [anchor(), anchor()];
  return { id: `d${index}`, kind, anchors, ...(kind === 'text-note' ? { text: 'note' } : {}), zIndex: index % 7 };
}

const drawings = Array.from({ length: 500 }, (_, index) => drawingOf(index));
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
