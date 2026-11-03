import { describe, expect, it } from 'vitest';
import { DrawingStore, type Drawing, type DrawingDocument, type DrawingIssue } from 'keystone-financial-tools-core';
import { autoSave } from '../src/auto-save';
import { loadStore } from '../src/load-store';
import { MemoryRepository } from '../src/memory-repository';
import { RepositoryError, emptyDocument, type DrawingRepository, type DrawingScope, type RepositoryLoad } from '../src/repository';
import { scopeKey } from '../src/scope';
import { WebStorageRepository, type RepositoryStorage } from '../src/web-storage-repository';
import { AAPL, AAPL_1H, line } from './repository-contract';

class MemoryStorage implements RepositoryStorage {
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

const broken = { id: 'x', kind: 'trend-line', anchors: [{ time: 1, price: 10, yAxisId: 'price' }] } as unknown as Drawing;
const returning = (loaded: RepositoryLoad, scopes: DrawingScope[] = []): DrawingRepository => ({
  load: (scope) => {
    scopes.push(scope);
    return Promise.resolve(loaded);
  },
  save: () => Promise.resolve(),
  remove: () => Promise.resolve(),
});
const ids = (store: DrawingStore): string[] => store.list().map((d) => d.id);

describe('loadStore', () => {
  it('resolves an empty store and an empty report when nothing is stored', async () => {
    const { store, report } = await loadStore(new MemoryRepository(), AAPL);
    expect(store).toBeInstanceOf(DrawingStore);
    expect(store.list()).toStrictEqual([]);
    expect(report).toStrictEqual({ added: [], renamed: [], skipped: [] });
  });

  it('loads the saved drawings and reports their ids', async () => {
    const repository = new MemoryRepository();
    await repository.save(AAPL, { version: 2, scope: { symbol: 'AAPL' }, drawings: [line('a'), line('b')] });
    const { store, report } = await loadStore(repository, AAPL);
    expect(store.list()).toStrictEqual([line('a'), line('b')]);
    expect(report).toStrictEqual({ added: ['a', 'b'], renamed: [], skipped: [] });
  });

  it('loads a version 1 document', async () => {
    const storage = new MemoryStorage();
    storage.setItem(scopeKey(AAPL), JSON.stringify({ version: 1, drawings: [line('a')] }));
    const { store, report } = await loadStore(new WebStorageRepository(storage), AAPL);
    expect(ids(store)).toStrictEqual(['a']);
    expect(report).not.toHaveProperty('issue');
  });

  it('asks the repository for the scope it was given', async () => {
    const scopes: DrawingScope[] = [];
    await loadStore(returning({ document: emptyDocument() }, scopes), AAPL_1H);
    expect(scopes).toStrictEqual([AAPL_1H]);
  });

  describe('the scope of the store', () => {
    it('is the scope asked for, without a timeframe when none was asked for', async () => {
      const { store } = await loadStore(new MemoryRepository(), AAPL);
      expect(store.scope).toStrictEqual({ symbol: 'AAPL' });
      expect(Object.keys(store.scope ?? {})).toStrictEqual(['symbol']);
    });

    it('includes the timeframe asked for', async () => {
      const { store } = await loadStore(new MemoryRepository(), AAPL_1H);
      expect(store.scope).toStrictEqual({ symbol: 'AAPL', timeframe: '1h' });
    });

    it('is set even when the stored document has no scope, so the next save stamps it', async () => {
      const repository = new MemoryRepository();
      await repository.save(AAPL, { version: 2, drawings: [line('a')] });
      const { store } = await loadStore(repository, AAPL);
      expect(store.toJSON().scope).toStrictEqual({ symbol: 'AAPL' });
    });

    it('is kept when nothing could be loaded', async () => {
      const storage = new MemoryStorage();
      storage.setItem(scopeKey(AAPL), '{oops');
      const { store } = await loadStore(new WebStorageRepository(storage), AAPL);
      expect(store.scope).toStrictEqual({ symbol: 'AAPL' });
    });
  });

  describe('unreadable entries', () => {
    it('gives an empty store and the KFT-E-JSON issue for text that is not JSON, leaving the entry in place', async () => {
      const storage = new MemoryStorage();
      storage.setItem(scopeKey(AAPL), '{oops');
      const { store, report } = await loadStore(new WebStorageRepository(storage), AAPL);
      expect(store.list()).toStrictEqual([]);
      expect(report).toStrictEqual({
        added: [],
        renamed: [],
        skipped: [],
        issue: { code: 'KFT-E-JSON', message: 'The drawings saved under keystone-drawings:AAPL are not valid JSON.' },
      });
      expect(storage.getItem(scopeKey(AAPL))).toBe('{oops');
    });

    it('gives an empty store and the KFT-E-JSON issue for JSON that is not a drawing document', async () => {
      const storage = new MemoryStorage();
      storage.setItem(scopeKey(AAPL), '{"version":9,"drawings":[]}');
      const { store, report } = await loadStore(new WebStorageRepository(storage), AAPL);
      expect(store.list()).toStrictEqual([]);
      expect(report.issue).toStrictEqual({ code: 'KFT-E-JSON', message: 'Expected a drawing document of version 1 or 2.' });
    });

    it('gives an empty store and the KFT-E-SCOPE issue for a document of another symbol', async () => {
      const storage = new MemoryStorage();
      storage.setItem(scopeKey(AAPL), JSON.stringify({ version: 2, scope: { symbol: 'MSFT' }, drawings: [line('a')] }));
      const { store, report } = await loadStore(new WebStorageRepository(storage), AAPL);
      expect(store.list()).toStrictEqual([]);
      expect(report).toStrictEqual({ added: [], renamed: [], skipped: [], issue: { code: 'KFT-E-SCOPE', message: 'The document belongs to MSFT, not to AAPL.' } });
    });

    it('reports a document the repository handed over that is not readable, instead of throwing', async () => {
      const garbage = { version: 9, drawings: [] } as unknown as DrawingDocument;
      const { store, report } = await loadStore(returning({ document: garbage }), AAPL);
      expect(store.list()).toStrictEqual([]);
      expect(report).toStrictEqual({ added: [], renamed: [], skipped: [], issue: { code: 'KFT-E-JSON', message: 'Expected a drawing document of version 1 or 2.' } });
    });

    it('keeps the issue the repository gave', async () => {
      const issue: DrawingIssue = { code: 'KFT-E-JSON', message: 'The drawings saved under k are not valid JSON.' };
      const { report } = await loadStore(returning({ document: emptyDocument(), issue }), AAPL);
      expect(report).toStrictEqual({ added: [], renamed: [], skipped: [], issue });
    });
  });

  describe('partly valid documents', () => {
    it('loads the valid drawings and lists the skipped ones', async () => {
      const repository = new MemoryRepository();
      await repository.save(AAPL, { version: 2, drawings: [line('a'), broken, line('b')] });
      const { store, report } = await loadStore(repository, AAPL);
      expect(ids(store)).toStrictEqual(['a', 'b']);
      expect(report.added).toStrictEqual(['a', 'b']);
      expect(report.skipped.map((entry) => [entry.index, entry.issues.map((issue) => issue.code)])).toStrictEqual([[1, ['KFT-E-ANCHORS']]]);
      expect(report).not.toHaveProperty('issue');
    });

    it('skips a repeated id instead of renaming it', async () => {
      const repository = new MemoryRepository();
      await repository.save(AAPL, { version: 2, drawings: [line('a'), line('a')] });
      const { store, report } = await loadStore(repository, AAPL);
      expect(ids(store)).toStrictEqual(['a']);
      expect(report).toStrictEqual({ added: ['a'], renamed: [], skipped: [{ index: 1, issues: [{ code: 'KFT-E-ID', message: 'Duplicate drawing id a.' }] }] });
    });

    it('loads nothing, and says so in skipped, when every drawing is broken', async () => {
      const repository = new MemoryRepository();
      await repository.save(AAPL, { version: 2, drawings: [broken] });
      const { store, report } = await loadStore(repository, AAPL);
      expect(store.list()).toStrictEqual([]);
      expect(report.skipped).toHaveLength(1);
    });
  });

  it('rejects when the backend fails, so an empty store is never saved over the stored drawings', async () => {
    const failure = new RepositoryError('Could not read the drawings under k: down', new Error('down'));
    const repository: DrawingRepository = { ...returning({ document: emptyDocument() }), load: () => Promise.reject(failure) };
    await expect(loadStore(repository, AAPL)).rejects.toBe(failure);
  });

  it('returns a store that autoSave saves with the scope, so it loads again', async () => {
    const repository = new MemoryRepository();
    const { store } = await loadStore(repository, AAPL_1H);
    const saver = autoSave(store, repository, AAPL_1H);
    store.add(line('a'));
    await saver.stop();
    expect(await repository.load(AAPL_1H)).toStrictEqual({ document: { version: 2, scope: { symbol: 'AAPL', timeframe: '1h' }, drawings: [line('a')] } });
    const again = await loadStore(repository, AAPL_1H);
    expect(ids(again.store)).toStrictEqual(['a']);
    expect(again.report).toStrictEqual({ added: ['a'], renamed: [], skipped: [] });
  });
});
