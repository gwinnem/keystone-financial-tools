import type { Anchor, Drawing, DrawingKind } from '../src/types';
import { seeded } from './random';

/** The kinds the benches draw, in turn. */
export const BENCH_KINDS: readonly DrawingKind[] = ['trend-line', 'horizontal-line', 'rectangle', 'text-note', 'fibonacci-retracement', 'fibonacci-fans', 'fibonacci-arcs', 'fibonacci-time-zones'];

/**
 * `count` drawings of every kind in turn, with seeded random anchors inside the default pane of the mock host (800 x 400 px, 10 px per bar:
 * time 0 to 4 800 000 ms, price 0 to 200) and a zIndex from 0 to 6, so the same seed gives the same drawings in every run.
 */
export function benchDrawings(count: number, seed: number): Drawing[] {
  const random = seeded(seed);
  const anchor = (): Anchor => ({ time: Math.floor(random() * 4_800_000), price: random() * 200, yAxisId: 'price' });
  return Array.from({ length: count }, (_, index): Drawing => {
    const kind = BENCH_KINDS[index % BENCH_KINDS.length];
    const anchors = kind === 'horizontal-line' || kind === 'text-note' ? [anchor()] : [anchor(), anchor()];
    return { id: `d${index}`, kind, anchors, ...(kind === 'text-note' ? { text: 'note' } : {}), zIndex: index % 7 };
  });
}
