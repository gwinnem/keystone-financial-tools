import { test } from 'vitest';
import { GeometryCache } from '../src/hit/geometry-cache';
import { hitTest } from '../src/hit/hit-test';
import { createMockHost } from '../src/testing/mock-host';
import type { Anchor, Drawing, DrawingKind } from '../src/types';
import { seeded } from './random';

// NFR-PERF-002: hitTest() over 500 drawings takes at most 0.5 ms with a warm geometry cache.
const host = createMockHost();
const random = seeded(42);
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
