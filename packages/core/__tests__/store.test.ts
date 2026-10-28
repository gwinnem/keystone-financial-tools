import { describe, expect, it, vi } from 'vitest';
import { DrawingError } from '../src/errors';
import { DOCUMENT_VERSION, DrawingStore } from '../src/store';
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

describe('DrawingStore', () => {
  it('starts empty or with valid initial drawings, without notifying', () => {
    expect(new DrawingStore().list()).toEqual([]);
    const store = new DrawingStore([trendLine('a'), horizontalLine('b')]);
    expect(store.list()).toEqual([trendLine('a'), horizontalLine('b')]);
  });

  it('rejects invalid or duplicate initial drawings', () => {
    expect(issuesOf(() => new DrawingStore([{ ...trendLine(), id: '' }]))).toEqual([{ code: 'KFT-E-ID', message: 'The id must be a non-empty string.' }]);
    expect(issuesOf(() => new DrawingStore([trendLine('a'), horizontalLine('a')]))).toEqual([{ code: 'KFT-E-ID', message: 'Duplicate drawing id a.' }]);
  });

  it('gets a drawing by id', () => {
    const store = new DrawingStore([trendLine('a'), horizontalLine('b')]);
    expect(store.get('b')).toEqual(horizontalLine('b'));
    expect(store.get('c')).toBeUndefined();
  });

  it('adds a drawing as a new list and notifies', () => {
    const store = new DrawingStore([trendLine('a')]);
    const before = store.list();
    const listener = vi.fn();
    store.subscribe(listener);
    store.add(horizontalLine('b'));
    expect(store.list()).toEqual([trendLine('a'), horizontalLine('b')]);
    expect(store.list()).not.toBe(before);
    expect(before).toEqual([trendLine('a')]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(store.list());
  });

  it('does not add or notify for an invalid or duplicate drawing', () => {
    const store = new DrawingStore([trendLine('a')]);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(issuesOf(() => store.add({ ...trendLine('b'), anchors: [] }))).toEqual([{ code: 'KFT-E-ANCHORS', message: 'A trend-line needs 2 anchor(s).' }]);
    expect(issuesOf(() => store.add(trendLine('a')))).toEqual([{ code: 'KFT-E-ID', message: 'Duplicate drawing id a.' }]);
    expect(store.list()).toEqual([trendLine('a')]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('updates a drawing in place, keeps its id and notifies', () => {
    const store = new DrawingStore([trendLine('a'), horizontalLine('b')]);
    const listener = vi.fn();
    store.subscribe(listener);
    const moved = [anchor(5), anchor(6, 120)];
    const next = store.update('a', { anchors: moved, text: 'label' });
    expect(next).toEqual({ id: 'a', kind: 'trend-line', anchors: moved, text: 'label' });
    expect(store.list()).toEqual([next, horizontalLine('b')]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(store.list());
  });

  it('ignores an id in the patch', () => {
    const store = new DrawingStore([trendLine('a')]);
    const next = store.update('a', { id: 'z' } as never);
    expect(next.id).toBe('a');
    expect(store.get('z')).toBeUndefined();
  });

  it('rejects an update of a missing drawing or one that makes it invalid', () => {
    const store = new DrawingStore([trendLine('a')]);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(issuesOf(() => store.update('x', {}))).toEqual([{ code: 'KFT-E-MISSING', message: 'No drawing with id x.' }]);
    expect(issuesOf(() => store.update('a', { kind: 'horizontal-line' }))).toEqual([{ code: 'KFT-E-ANCHORS', message: 'A horizontal-line needs 1 anchor(s).' }]);
    expect(store.list()).toEqual([trendLine('a')]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('removes a drawing and notifies, or returns false when it is not there', () => {
    const store = new DrawingStore([trendLine('a'), horizontalLine('b')]);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.remove('x')).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(store.remove('a')).toBe(true);
    expect(store.list()).toEqual([horizontalLine('b')]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith([horizontalLine('b')]);
  });

  it('clears the drawings and notifies only when there were some', () => {
    const empty = new DrawingStore();
    const quiet = vi.fn();
    empty.subscribe(quiet);
    empty.clear();
    expect(quiet).not.toHaveBeenCalled();

    const store = new DrawingStore([trendLine('a')]);
    const listener = vi.fn();
    store.subscribe(listener);
    store.clear();
    expect(store.list()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith([]);
  });

  it('stops notifying after unsubscribe', () => {
    const store = new DrawingStore();
    const kept = vi.fn();
    const dropped = vi.fn();
    store.subscribe(kept);
    const unsubscribe = store.subscribe(dropped);
    unsubscribe();
    store.add(trendLine('a'));
    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });

  it('notifies every listener even when one unsubscribes another during the call', () => {
    const store = new DrawingStore();
    const second = vi.fn();
    let stopSecond = (): void => {};
    store.subscribe(() => stopSecond());
    stopSecond = store.subscribe(second);
    store.add(trendLine('a'));
    expect(second).toHaveBeenCalledTimes(1);
    store.add(trendLine('b'));
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('round-trips through JSON', () => {
    const store = new DrawingStore([trendLine('a'), horizontalLine('b')]);
    expect(DOCUMENT_VERSION).toBe(1);
    expect(store.toJSON()).toEqual({ version: 1, drawings: store.list() });
    const copy = DrawingStore.fromJSON(JSON.parse(JSON.stringify(store)));
    expect(copy.list()).toEqual(store.list());
  });

  it('round-trips locked, hidden, zIndex and meta unchanged', () => {
    const flagged = { ...trendLine('a'), locked: true, hidden: true, zIndex: -3, meta: { owner: 'desk-7', tags: ['swing', 1, null], nested: { ok: false } } };
    const store = new DrawingStore([flagged, horizontalLine('b')]);
    const copy = DrawingStore.fromJSON(JSON.parse(JSON.stringify(store.toJSON())));
    expect(copy.list()).toEqual([flagged, horizontalLine('b')]);
    expect(copy.get('b')).not.toHaveProperty('locked');
  });

  it('rejects an add or update with invalid flags or meta', () => {
    const store = new DrawingStore([trendLine('a')]);
    expect(issuesOf(() => store.add({ ...trendLine('b'), meta: { bad: Number.NaN } }))).toEqual([{ code: 'KFT-E-META', message: 'The value at meta.bad is not JSON-safe.' }]);
    expect(issuesOf(() => store.update('a', { zIndex: 0.5 }))).toEqual([{ code: 'KFT-E-SHAPE', message: 'The zIndex must be a finite integer.' }]);
    expect(issuesOf(() => store.update('a', { anchors: [anchor(1), anchor(2, 1, 'rsi')] }))).toEqual([{ code: 'KFT-E-AXIS', message: 'All anchors of a drawing must be on the same y-axis.' }]);
    expect(store.list()).toEqual([trendLine('a')]);
  });

  it('rejects anything that is not a version 1 document', () => {
    const json = [{ code: 'KFT-E-JSON', message: 'Expected a drawing document of version 1.' }];
    expect(issuesOf(() => DrawingStore.fromJSON(null))).toEqual(json);
    expect(issuesOf(() => DrawingStore.fromJSON(undefined))).toEqual(json);
    expect(issuesOf(() => DrawingStore.fromJSON({ version: 2, drawings: [] }))).toEqual(json);
    expect(issuesOf(() => DrawingStore.fromJSON({ version: 1, drawings: 'ab' }))).toEqual(json);
    expect(issuesOf(() => DrawingStore.fromJSON({ version: 1 }))).toEqual(json);
  });

  it('rejects a document with an invalid drawing', () => {
    expect(issuesOf(() => DrawingStore.fromJSON({ version: 1, drawings: [{ ...trendLine(), id: '' }] }))).toEqual([{ code: 'KFT-E-ID', message: 'The id must be a non-empty string.' }]);
  });
});
