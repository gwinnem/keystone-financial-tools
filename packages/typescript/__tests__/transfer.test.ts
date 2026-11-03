import { describe, expect, it, vi } from 'vitest';
import { DrawingStore, type Drawing, type StoreChange } from 'keystone-financial-tools-core';
import { exportDrawings, importDrawings, importSafely } from '../src/transfer';
import { line } from './repository-contract';

const broken = { id: 'x', kind: 'trend-line', anchors: [{ time: 1, price: 10, yAxisId: 'price' }] };
const textOf = (...drawings: unknown[]): string => JSON.stringify({ version: 2, drawings });
const sequence = (...ids: string[]): (() => string) => {
  let next = 0;
  return () => ids[next++];
};
const NOT_JSON = { code: 'KFT-E-JSON', message: 'The document is not valid JSON.' };
const NOT_A_DOCUMENT = { code: 'KFT-E-JSON', message: 'Expected a drawing document of version 1 or 2.' };

describe('exportDrawings', () => {
  it('is the compact JSON of the current document version', () => {
    const store = new DrawingStore([line('a'), line('b')]);
    expect(exportDrawings(store)).toBe(JSON.stringify(store.toJSON()));
    expect(exportDrawings(store, {})).toBe(JSON.stringify(store.toJSON()));
    expect(exportDrawings(store, { pretty: false })).toBe(JSON.stringify(store.toJSON()));
    expect((JSON.parse(exportDrawings(store)) as { version: number }).version).toBe(2);
  });

  it('indents with two spaces when pretty is set', () => {
    const store = new DrawingStore([line('a')]);
    const text = exportDrawings(store, { pretty: true });
    expect(text).toBe(JSON.stringify(store.toJSON(), null, 2));
    expect(text).toContain('\n  "version": 2');
  });

  it('exports an empty store as a document without drawings', () => {
    expect(exportDrawings(new DrawingStore())).toBe('{"version":2,"drawings":[]}');
  });

  it('writes the scope of the store, and none when the store has none', () => {
    const scoped = new DrawingStore([], { scope: { symbol: 'AAPL', timeframe: '1h' } });
    expect((JSON.parse(exportDrawings(scoped)) as { scope: unknown }).scope).toStrictEqual({ symbol: 'AAPL', timeframe: '1h' });
    expect(JSON.parse(exportDrawings(new DrawingStore()))).not.toHaveProperty('scope');
  });
});

describe('importDrawings', () => {
  it('round-trips an export into another store and reports the added ids', () => {
    const source = new DrawingStore([line('a'), line('b')]);
    const target = new DrawingStore();
    const report = importDrawings(target, exportDrawings(source, { pretty: true }));
    expect(report).toStrictEqual({ added: ['a', 'b'], renamed: [], skipped: [] });
    expect(target.list()).toStrictEqual(source.list());
  });

  it('merges by default and renames ids that are taken', () => {
    const store = new DrawingStore([line('a')]);
    const report = importDrawings(store, textOf(line('a'), line('b')), { createId: sequence('n1') });
    expect(report).toStrictEqual({ added: ['n1', 'b'], renamed: [{ from: 'a', to: 'n1' }], skipped: [] });
    expect(store.list().map((d) => d.id)).toStrictEqual(['a', 'n1', 'b']);
  });

  it('replaces the contents in replace mode', () => {
    const store = new DrawingStore([line('a'), line('c')]);
    const report = importDrawings(store, textOf(line('a'), line('b')), { mode: 'replace' });
    expect(report).toStrictEqual({ added: ['a', 'b'], renamed: [], skipped: [] });
    expect(store.list().map((d) => d.id)).toStrictEqual(['a', 'b']);
  });

  it('passes options on: history false keeps the import out of the undo history', () => {
    const store = new DrawingStore();
    const listener = vi.fn();
    store.subscribe(listener);
    importDrawings(store, textOf(line('a')), { history: false });
    expect((listener.mock.calls[0][1] as StoreChange).history).toBe(false);
    importDrawings(store, textOf(line('b')));
    expect((listener.mock.calls[1][1] as StoreChange).history).toBe(true);
  });

  it('imports a version 1 document', () => {
    const store = new DrawingStore();
    const report = importDrawings(store, JSON.stringify({ version: 1, drawings: [line('a')] }));
    expect(report.added).toStrictEqual(['a']);
    expect(store.list()).toStrictEqual([line('a')]);
  });

  it('keeps the valid drawings of a partly broken document and lists the others', () => {
    const store = new DrawingStore();
    const report = importDrawings(store, textOf(line('a'), broken, line('b')));
    expect(report.added).toStrictEqual(['a', 'b']);
    expect(report.skipped.map((entry) => [entry.index, entry.issues.map((issue) => issue.code)])).toStrictEqual([[1, ['KFT-E-ANCHORS']]]);
    expect(report).not.toHaveProperty('issue');
    expect(store.list().map((d) => d.id)).toStrictEqual(['a', 'b']);
  });

  it('imports a document that is empty without an issue', () => {
    const store = new DrawingStore([line('a')]);
    expect(importDrawings(store, textOf())).toStrictEqual({ added: [], renamed: [], skipped: [] });
    expect(store.list()).toStrictEqual([line('a')]);
  });

  it('does not change the scope of the store', () => {
    const store = new DrawingStore([], { scope: { symbol: 'AAPL' } });
    importDrawings(store, JSON.stringify({ version: 2, scope: { symbol: 'MSFT' }, drawings: [line('a')] }));
    expect(store.scope).toStrictEqual({ symbol: 'AAPL' });
  });

  it.each([
    ['text that is not JSON', '{oops', NOT_JSON],
    ['empty text', '', NOT_JSON],
    ['JSON null', 'null', NOT_A_DOCUMENT],
    ['a JSON array', '[]', NOT_A_DOCUMENT],
    ['a newer version', '{"version":3,"drawings":[]}', NOT_A_DOCUMENT],
    ['a document without drawings', '{"version":2}', NOT_A_DOCUMENT],
  ])('reports %s with KFT-E-JSON and changes nothing', (_name, text, issue) => {
    const store = new DrawingStore([line('a')]);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(importDrawings(store, text, { mode: 'replace' })).toStrictEqual({ added: [], renamed: [], skipped: [], issue });
    expect(store.list()).toStrictEqual([line('a')]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('rethrows what is not about the text: a listener that throws', () => {
    const store = new DrawingStore();
    store.subscribe(() => {
      throw new Error('listener failed');
    });
    expect(() => importDrawings(store, textOf(line('a')))).toThrow('listener failed');
    expect(store.list().map((d) => d.id)).toStrictEqual(['a']);
  });
});

describe('importSafely', () => {
  it('takes an already parsed document too', () => {
    const store = new DrawingStore();
    expect(importSafely(store, { version: 2, drawings: [line('a')] })).toStrictEqual({ added: ['a'], renamed: [], skipped: [] });
  });

  it('reports a parsed value that is not a document', () => {
    const store = new DrawingStore();
    expect(importSafely(store, { drawings: [] as Drawing[] })).toStrictEqual({ added: [], renamed: [], skipped: [], issue: NOT_A_DOCUMENT });
  });
});
