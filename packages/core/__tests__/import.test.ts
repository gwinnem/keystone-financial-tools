import { describe, expect, it, vi } from 'vitest';
import v1Basic from '../__fixtures__/documents/v1-basic.json';
import v2Basic from '../__fixtures__/documents/v2-basic.json';
import { DrawingError } from '../src/errors';
import { importDocument } from '../src/import';
import { DrawingStore } from '../src/store';
import type { Drawing, StoreChange } from '../src/types';
import { anchor, horizontalLine, trendLine } from './fixtures';

function issuesOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DrawingError);
    return (error as DrawingError).issues;
  }
  throw new Error('Expected a DrawingError');
}

const doc = (...drawings: unknown[]): { version: 2; drawings: unknown[] } => ({ version: 2, drawings });
const sequence = (...ids: string[]): (() => string) => {
  let next = 0;
  return () => ids[next++];
};
const broken = { id: 'x', kind: 'trend-line', anchors: [anchor(1)] };
const ANCHORS_ISSUE = { code: 'KFT-E-ANCHORS', message: 'A trend-line needs 2 anchor(s).' };

describe('importDocument: merge', () => {
  it('adds the drawings in one change and reports their ids (merge is the default)', () => {
    const store = new DrawingStore([trendLine('a')]);
    const listener = vi.fn();
    store.subscribe(listener);
    const report = importDocument(store, doc(trendLine('b'), horizontalLine('c')));
    expect(report).toEqual({ added: ['b', 'c'], renamed: [], skipped: [] });
    expect(store.list()).toEqual([trendLine('a'), trendLine('b'), horizontalLine('c')]);
    expect(listener).toHaveBeenCalledTimes(1);
    const change = listener.mock.calls[0][1] as StoreChange;
    expect(change.operations.map((op) => `${op.type}:${op.id}`)).toEqual(['add:b', 'add:c']);
  });

  it('gives taken ids a new one, retrying until the id is free, and lists the renames', () => {
    const store = new DrawingStore([trendLine('a')]);
    const relabelled = { ...trendLine('a'), text: 'from file' };
    const report = importDocument(store, doc(relabelled, horizontalLine('b'), horizontalLine('b')), { mode: 'merge', createId: sequence('a', 'n1', 'n2') });
    expect(report).toEqual({
      added: ['n1', 'b', 'n2'],
      renamed: [
        { from: 'a', to: 'n1' },
        { from: 'b', to: 'n2' },
      ],
      skipped: [],
    });
    expect(store.list()).toEqual([trendLine('a'), { ...relabelled, id: 'n1' }, horizontalLine('b'), horizontalLine('n2')]);
  });

  it('renames with createId by default', () => {
    const store = new DrawingStore([trendLine('a')]);
    const report = importDocument(store, doc(trendLine('a')));
    expect(report.renamed).toHaveLength(1);
    const renamedTo = report.renamed[0].to;
    expect(renamedTo).not.toBe('a');
    expect(store.get(renamedTo)).toEqual(trendLine(renamedTo));
  });
});

describe('importDocument: replace', () => {
  it('swaps the store contents in one change', () => {
    const store = new DrawingStore([trendLine('a'), trendLine('b')]);
    const listener = vi.fn();
    store.subscribe(listener);
    const replacement = { ...trendLine('b'), text: 'new' };
    const report = importDocument(store, doc(replacement, horizontalLine('c')), { mode: 'replace' });
    expect(report).toEqual({ added: ['b', 'c'], renamed: [], skipped: [] });
    expect(store.list()).toEqual([replacement, horizontalLine('c')]);
    expect(listener).toHaveBeenCalledTimes(1);
    const change = listener.mock.calls[0][1] as StoreChange;
    expect(change.operations).toEqual([
      { type: 'remove', id: 'a', before: trendLine('a') },
      { type: 'update', id: 'b', before: trendLine('b'), after: replacement },
      { type: 'add', id: 'c', after: horizontalLine('c') },
    ]);
  });

  it('skips a repeated id in the document instead of renaming it', () => {
    const store = new DrawingStore([trendLine('a')]);
    const report = importDocument(store, doc(horizontalLine('c'), trendLine('c')), { mode: 'replace', createId: sequence('never') });
    expect(report).toEqual({ added: ['c'], renamed: [], skipped: [{ index: 1, issues: [{ code: 'KFT-E-ID', message: 'Duplicate drawing id c.' }] }] });
    expect(store.list()).toEqual([horizontalLine('c')]);
  });

  it('empties the store when no drawing in the document is valid', () => {
    const store = new DrawingStore([trendLine('a')]);
    const report = importDocument(store, doc(broken), { mode: 'replace' });
    expect(report).toEqual({ added: [], renamed: [], skipped: [{ index: 0, issues: [ANCHORS_ISSUE] }] });
    expect(store.list()).toEqual([]);
  });
});

describe('importDocument: partial validity and unreadable documents', () => {
  it('keeps the valid drawings and lists every invalid one by index', () => {
    const store = new DrawingStore();
    const report = importDocument(store, doc(trendLine('a'), broken, null, horizontalLine('b')));
    expect(report).toEqual({
      added: ['a', 'b'],
      renamed: [],
      skipped: [
        { index: 1, issues: [ANCHORS_ISSUE] },
        { index: 2, issues: [{ code: 'KFT-E-SHAPE', message: 'A drawing must be an object.' }] },
      ],
    });
    expect(store.list()).toEqual([trendLine('a'), horizontalLine('b')]);
  });

  it('reads a JSON string', () => {
    const store = new DrawingStore();
    expect(importDocument(store, JSON.stringify(doc(trendLine('a')))).added).toEqual(['a']);
  });

  it('reads and migrates a version 1 document', () => {
    const store = new DrawingStore();
    const report = importDocument(store, JSON.stringify(v1Basic), { mode: 'replace' });
    expect(report.skipped).toEqual([]);
    expect(store.list()).toEqual(v2Basic.drawings as Drawing[]);
  });

  it('throws KFT-E-JSON and changes nothing when the text is not JSON or the value not a document', () => {
    for (const mode of ['merge', 'replace'] as const) {
      const store = new DrawingStore([trendLine('a')]);
      const listener = vi.fn();
      store.subscribe(listener);
      expect(issuesOf(() => importDocument(store, '{oops', { mode }))).toEqual([{ code: 'KFT-E-JSON', message: 'The document is not valid JSON.' }]);
      expect(issuesOf(() => importDocument(store, { version: 9, drawings: [] }, { mode }))).toEqual([{ code: 'KFT-E-JSON', message: 'Expected a drawing document of version 1 or 2.' }]);
      expect(issuesOf(() => importDocument(store, '"text"', { mode }))).toEqual([{ code: 'KFT-E-JSON', message: 'Expected a drawing document of version 1 or 2.' }]);
      expect(store.list()).toEqual([trendLine('a')]);
      expect(listener).not.toHaveBeenCalled();
    }
  });

  it('leaves the store scope alone', () => {
    const store = new DrawingStore([], { scope: { symbol: 'EURUSD' } });
    importDocument(store, { version: 2, scope: { symbol: 'AAPL' }, drawings: [trendLine('a')] }, { mode: 'replace' });
    expect(store.scope).toEqual({ symbol: 'EURUSD' });
  });
});
