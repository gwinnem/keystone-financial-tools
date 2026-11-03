import { describe, expect, it } from 'vitest';
import { DrawingError, DrawingStore, type Drawing } from 'keystone-financial-tools-core';
import { autoSave, loadDrawings, saveDrawings, type DrawingStorage } from '../src/persistence';
import { invalidJsonIssue, serializeDocument } from '../src/repository';
import { scopeKey } from '../src/scope';
import { WebStorageRepository } from '../src/web-storage-repository';

class MemoryStorage implements DrawingStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
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

describe('shared format with WebStorageRepository (E06-F01-S02)', () => {
  const scope = { symbol: 'AAPL', timeframe: '1h' };

  it('writes the text the repository writes', async () => {
    const helper = new MemoryStorage();
    const repo = new MemoryStorage();
    const store = new DrawingStore([line('a'), line('b')]);
    saveDrawings(store, helper, scopeKey(scope));
    await new WebStorageRepository(repo).save(scope, store.toJSON());
    expect(helper.items.get(scopeKey(scope))).toBe(repo.items.get(scopeKey(scope)));
  });

  it('loads what the repository saved', async () => {
    const storage = new MemoryStorage();
    await new WebStorageRepository(storage).save(scope, new DrawingStore([line('a')]).toJSON());
    expect(loadDrawings(storage, scopeKey(scope)).list()).toEqual([line('a')]);
  });

  it('lets the repository load what saveDrawings saved', async () => {
    const storage = new MemoryStorage();
    saveDrawings(new DrawingStore([line('a')]), storage, scopeKey(scope));
    const loaded = await new WebStorageRepository(storage).load(scope);
    expect(loaded.issue).toBeUndefined();
    expect(loaded.document.drawings).toEqual([line('a')]);
  });

  it('reports corrupt text with the issue the repository reports', async () => {
    const storage = new MemoryStorage();
    const key = scopeKey(scope);
    storage.setItem(key, '{oops');
    const loaded = await new WebStorageRepository(storage).load(scope);
    let caught: unknown;
    try {
      loadDrawings(storage, key);
    } catch (error) {
      caught = error;
    }
    expect((caught as DrawingError).issues).toEqual([loaded.issue]);
  });
});

describe('serializeDocument and invalidJsonIssue', () => {
  it('serializes a document as JSON text', () => {
    const document = new DrawingStore([line('a')]).toJSON();
    expect(serializeDocument(document)).toBe(JSON.stringify(document));
    expect(JSON.parse(serializeDocument(document))).toEqual(document);
  });

  it('writes compact text unless pretty is set', () => {
    const document = new DrawingStore([line('a')]).toJSON();
    expect(serializeDocument(document)).not.toContain('\n');
    expect(serializeDocument(document, false)).toBe(JSON.stringify(document));
  });

  it('indents with two spaces when pretty is set', () => {
    const document = new DrawingStore([line('a')]).toJSON();
    expect(serializeDocument(document, true)).toBe(JSON.stringify(document, null, 2));
    expect(serializeDocument(document, true)).toContain('\n  "version": 2');
  });

  it('names the key in the invalid JSON issue', () => {
    expect(invalidJsonIssue('k:1')).toEqual({ code: 'KFT-E-JSON', message: 'The drawings saved under k:1 are not valid JSON.' });
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
