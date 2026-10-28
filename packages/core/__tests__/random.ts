import type { DrawingStore } from '../src/store';
import type { Drawing } from '../src/types';
import { horizontalLine, trendLine } from './fixtures';

/** Seeded pseudo-random numbers in [0, 1) (mulberry32), so property tests are reproducible. */
export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Makes one random change to `store`: add, update, remove, reorder, remove and re-add in a batch,
 * or a batch of several of these. Ids come from `next`, so they never repeat.
 */
export function randomChange(store: DrawingStore, random: () => number, next: () => string): void {
  const pick = (): string | undefined => {
    const list = store.list();
    return list.length === 0 ? undefined : list[Math.floor(random() * list.length)].id;
  };
  const simple = (): void => {
    const id = pick();
    const choice = Math.floor(random() * 6);
    if (choice === 0 || id === undefined) {
      const fresh = next();
      store.add(random() < 0.5 ? trendLine(fresh) : horizontalLine(fresh));
    } else if (choice === 1) {
      store.update(id, { text: next() });
    } else if (choice === 2) {
      store.remove(id);
    } else if (choice === 3) {
      store.bringToFront(id);
    } else if (choice === 4) {
      store.sendBackward(id);
    } else {
      const drawing = store.get(id) as Drawing;
      store.batch(() => {
        store.remove(id);
        store.add({ ...drawing, text: next() });
      });
    }
  };
  if (random() < 0.25) {
    store.batch(() => {
      const count = 2 + Math.floor(random() * 3);
      for (let i = 0; i < count; i++) simple();
    });
  } else {
    simple();
  }
}
