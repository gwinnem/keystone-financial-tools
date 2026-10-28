import { describe, expect, it } from 'vitest';
import { DrawingError, DrawingStore, type Drawing } from 'keystone-financial-tools-core';
import { autoSave, loadDrawings, saveDrawings, type DrawingStorage } from '../src/persistence';

class MemoryStorage implements DrawingStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const line = (id: string): Drawing => ({
  id,
  kind: 'trend-line',
  anchors: [
    { time: 1, price: 10, yAxisId: 'price' },
    { time: 2, price: 11, yAxisId: 'price' },
  ],
});

describe('saveDrawings and loadDrawings', () => {
  it('round-trips the drawings under the key', () => {
    const storage = new MemoryStorage();
    const store = new DrawingStore([line('a'), line('b')]);
    saveDrawings(store, storage, 'chart-1');
    expect(JSON.parse(storage.items.get('chart-1') ?? '')).toEqual(store.toJSON());
    expect(loadDrawings(storage, 'chart-1').list()).toEqual(store.list());
  });

  it('loads an empty store when nothing is saved', () => {
    const store = loadDrawings(new MemoryStorage(), 'missing');
    expect(store).toBeInstanceOf(DrawingStore);
    expect(store.list()).toEqual([]);
  });

  it('throws KFT-E-JSON when the saved text is not JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem('chart-1', '{oops');
    let caught: unknown;
    try {
      loadDrawings(storage, 'chart-1');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DrawingError);
    expect((caught as DrawingError).issues).toEqual([{ code: 'KFT-E-JSON', message: 'The drawings saved under chart-1 are not valid JSON.' }]);
  });

  it('throws when the saved JSON is not a drawing document', () => {
    const storage = new MemoryStorage();
    storage.setItem('chart-1', '{"version":9}');
    expect(() => loadDrawings(storage, 'chart-1')).toThrow(DrawingError);
  });
});

describe('autoSave', () => {
  it('saves after every change until stopped', () => {
    const storage = new MemoryStorage();
    const store = new DrawingStore();
    const stop = autoSave(store, storage, 'chart-1');
    expect(storage.items.has('chart-1')).toBe(false);

    store.add(line('a'));
    expect(loadDrawings(storage, 'chart-1').list()).toEqual([line('a')]);

    stop();
    store.add(line('b'));
    expect(loadDrawings(storage, 'chart-1').list()).toEqual([line('a')]);
  });
});
