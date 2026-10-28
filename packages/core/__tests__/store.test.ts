import { describe, expect, it, vi, type Mock } from 'vitest';
import { DrawingError } from '../src/errors';
import { DOCUMENT_VERSION, DrawingStore } from '../src/store';
import type { Drawing, StoreChange } from '../src/types';
import { anchor, horizontalLine, trendLine } from './fixtures';

/** The arguments of a listener's only call; checks that it was called once with (list, change). */
function onlyCall(listener: Mock, store: DrawingStore): StoreChange {
  expect(listener).toHaveBeenCalledTimes(1);
  const [drawings, change] = listener.mock.calls[0] as [readonly Drawing[], StoreChange];
  expect(drawings).toBe(store.list());
  expect(change.drawings).toBe(store.list());
  return change;
}

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
    expect(onlyCall(listener, store).operations).toEqual([{ type: 'add', id: 'b', after: horizontalLine('b') }]);
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
    expect(onlyCall(listener, store).operations).toEqual([{ type: 'update', id: 'a', before: trendLine('a'), after: next }]);
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
    expect(onlyCall(listener, store).operations).toEqual([{ type: 'remove', id: 'a', before: trendLine('a') }]);
  });

  it('clears the drawings and notifies only when there were some', () => {
    const empty = new DrawingStore();
    const quiet = vi.fn();
    empty.subscribe(quiet);
    empty.clear();
    expect(quiet).not.toHaveBeenCalled();

    const store = new DrawingStore([trendLine('a'), horizontalLine('b')]);
    const listener = vi.fn();
    store.subscribe(listener);
    store.clear();
    expect(store.list()).toEqual([]);
    expect(onlyCall(listener, store).operations).toEqual([
      { type: 'remove', id: 'a', before: trendLine('a') },
      { type: 'remove', id: 'b', before: horizontalLine('b') },
    ]);
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

  it('patches style and options and validates the result', () => {
    const store = new DrawingStore([trendLine('a')]);
    const next = store.update('a', { style: { color: '#e91e63', lineStyle: 'dotted' }, options: { extendRight: true } });
    expect(next).toEqual({ ...trendLine('a'), style: { color: '#e91e63', lineStyle: 'dotted' }, options: { extendRight: true } });
    expect(issuesOf(() => store.update('a', { style: { lineWidth: 11 } }))).toEqual([{ code: 'KFT-E-STYLE', message: 'The style.lineWidth must be a number from 1 to 10.' }]);
    expect(issuesOf(() => store.update('a', { options: { levels: [] } }))).toEqual([{ code: 'KFT-E-OPTIONS', message: 'The option levels is not allowed on a trend-line.' }]);
    expect(store.list()).toEqual([next]);
  });

  it('round-trips style and options unchanged', () => {
    const fib = {
      id: 'f',
      kind: 'fibonacci-retracement' as const,
      anchors: [anchor(1), anchor(2, 120)],
      style: { color: '#787b86', fillOpacity: 0.1 },
      options: { levels: [{ ratio: 0.5, visible: true, color: '#f00' }], reverse: true, showPrices: false },
    };
    const copy = DrawingStore.fromJSON(JSON.parse(JSON.stringify(new DrawingStore([fib]))));
    expect(copy.list()).toEqual([fib]);
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

describe('DrawingStore.batch (FR-ST-003, FR-DM-041)', () => {
  it('applies every change and notifies once, returning what fn returns', () => {
    const store = new DrawingStore([trendLine('a')]);
    const listener = vi.fn();
    store.subscribe(listener);
    const result = store.batch(() => {
      store.add(horizontalLine('b'));
      store.remove('a');
      return 42;
    });
    expect(result).toBe(42);
    expect(store.list()).toEqual([horizontalLine('b')]);
    expect(onlyCall(listener, store).operations).toEqual([
      { type: 'add', id: 'b', after: horizontalLine('b') },
      { type: 'remove', id: 'a', before: trendLine('a') },
    ]);
  });

  it('rolls every change back and notifies nobody when fn throws', () => {
    const store = new DrawingStore([trendLine('a')]);
    const before = store.list();
    const listener = vi.fn();
    store.subscribe(listener);
    const failure = new Error('boom');
    expect(() =>
      store.batch(() => {
        store.add(horizontalLine('b'));
        store.update('a', { text: 'x' });
        throw failure;
      })
    ).toThrow(failure);
    expect(store.list()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('rolls back when a store call inside the batch fails', () => {
    const store = new DrawingStore([trendLine('a')]);
    expect(
      issuesOf(() =>
        store.batch(() => {
          store.remove('a');
          store.update('a', {});
        })
      )
    ).toEqual([{ code: 'KFT-E-MISSING', message: 'No drawing with id a.' }]);
    expect(store.list()).toEqual([trendLine('a')]);
  });

  it('forgets the operations of a failed batch', () => {
    const store = new DrawingStore();
    expect(() =>
      store.batch(() => {
        store.add(trendLine('a'));
        throw new Error('boom');
      })
    ).toThrow('boom');
    const listener = vi.fn();
    store.subscribe(listener);
    store.add(horizontalLine('b'));
    expect(onlyCall(listener, store).operations).toEqual([{ type: 'add', id: 'b', after: horizontalLine('b') }]);
  });

  it('notifies after each change again once a batch is over, also after a failed one', () => {
    const store = new DrawingStore();
    store.batch(() => store.add(trendLine('a')));
    expect(() =>
      store.batch(() => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    const listener = vi.fn();
    store.subscribe(listener);
    store.add(horizontalLine('b'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('joins a nested batch to the outer one', () => {
    const store = new DrawingStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.batch(() => {
      store.add(trendLine('a'));
      const inner = store.batch(() => {
        store.add(horizontalLine('b'));
        return 'inner';
      });
      expect(inner).toBe('inner');
      expect(listener).not.toHaveBeenCalled();
    });
    expect(onlyCall(listener, store).operations.map((op) => op.id)).toEqual(['a', 'b']);
  });

  it('keeps the changes of a nested batch whose error the outer batch catches', () => {
    const store = new DrawingStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.batch(() => {
      try {
        store.batch(() => {
          store.add(trendLine('a'));
          throw new Error('inner');
        });
      } catch {
        // handled by the outer batch
      }
      store.add(horizontalLine('b'));
    });
    expect(store.list()).toEqual([trendLine('a'), horizontalLine('b')]);
    expect(onlyCall(listener, store).operations.map((op) => op.id)).toEqual(['a', 'b']);
  });

  it('does not notify for an empty batch or for changes that cancel out', () => {
    const store = new DrawingStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.batch(() => undefined);
    store.batch(() => {
      store.add(trendLine('a'));
      store.remove('a');
    });
    expect(listener).not.toHaveBeenCalled();
    expect(store.list()).toEqual([]);
  });
});

describe('DrawingStore change operations (FR-ST-010)', () => {
  function operationsOf(store: DrawingStore, fn: () => void): StoreChange['operations'] {
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.batch(fn);
    stop();
    return onlyCall(listener, store).operations;
  }

  it('folds an add and later updates into one add of the final value', () => {
    const store = new DrawingStore();
    const operations = operationsOf(store, () => {
      store.add(trendLine('a'));
      store.update('a', { text: 'one' });
      store.update('a', { text: 'two' });
    });
    expect(operations).toEqual([{ type: 'add', id: 'a', after: { ...trendLine('a'), text: 'two' } }]);
  });

  it('folds updates into one update from the first before to the last after', () => {
    const store = new DrawingStore([trendLine('a')]);
    const operations = operationsOf(store, () => {
      store.update('a', { text: 'one' });
      store.update('a', { locked: true });
    });
    expect(operations).toEqual([{ type: 'update', id: 'a', before: trendLine('a'), after: { ...trendLine('a'), text: 'one', locked: true } }]);
  });

  it('folds an update and a remove into a remove of the original', () => {
    const store = new DrawingStore([trendLine('a')]);
    const operations = operationsOf(store, () => {
      store.update('a', { text: 'one' });
      store.remove('a');
    });
    expect(operations).toEqual([{ type: 'remove', id: 'a', before: trendLine('a') }]);
  });

  it('folds a remove and an add of the same id into an update', () => {
    const store = new DrawingStore([trendLine('a')]);
    const replacement = { ...trendLine('a'), text: 'new' };
    const operations = operationsOf(store, () => {
      store.remove('a');
      store.add(replacement);
    });
    expect(operations).toEqual([{ type: 'update', id: 'a', before: trendLine('a'), after: replacement }]);
  });

  it('reports operations in the order each drawing first changed', () => {
    const store = new DrawingStore([trendLine('a'), trendLine('b')]);
    const operations = operationsOf(store, () => {
      store.update('b', { text: 'b1' });
      store.add(horizontalLine('c'));
      store.update('a', { text: 'a1' });
      store.update('b', { text: 'b2' });
    });
    expect(operations.map((op) => `${op.type}:${op.id}`)).toEqual(['update:b', 'add:c', 'update:a']);
  });

  it('appends a drawing that was added and removed and then added again', () => {
    const store = new DrawingStore([trendLine('b')]);
    const operations = operationsOf(store, () => {
      store.add(trendLine('a'));
      store.remove('a');
      store.update('b', { text: 'b1' });
      store.add(trendLine('a'));
    });
    expect(operations.map((op) => `${op.type}:${op.id}`)).toEqual(['update:b', 'add:a']);
  });

  it('still works for listeners that only read the list', () => {
    const store = new DrawingStore();
    const seen: number[] = [];
    store.subscribe((drawings) => seen.push(drawings.length));
    store.add(trendLine('a'));
    store.add(trendLine('b'));
    expect(seen).toEqual([1, 2]);
  });
});

describe('DrawingStore z-order (FR-ST-004)', () => {
  const line = (id: string, zIndex?: number): Drawing => (zIndex === undefined ? trendLine(id) : { ...trendLine(id), zIndex });
  const ids = (store: DrawingStore): string[] => store.ordered().map((d) => d.id);
  const zOf = (store: DrawingStore): Record<string, number | undefined> => Object.fromEntries(store.list().map((d) => [d.id, d.zIndex]));

  it('orders by zIndex, then insertion order, without changing the list', () => {
    const store = new DrawingStore([line('a', 2), line('b'), line('c', -1), line('d', 2), line('e', 0)]);
    expect(ids(store)).toEqual(['c', 'b', 'e', 'a', 'd']);
    expect(store.list().map((d) => d.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('brings one drawing to the front with the smallest zIndex that puts it on top', () => {
    const store = new DrawingStore([line('a'), line('b'), line('c')]);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.bringToFront('a')).toBe(true);
    expect(ids(store)).toEqual(['b', 'c', 'a']);
    expect(zOf(store)).toEqual({ a: 1, b: undefined, c: undefined });
    expect(onlyCall(listener, store).operations).toEqual([{ type: 'update', id: 'a', before: line('a'), after: line('a', 1) }]);
  });

  it('brings several drawings to the front, keeping their order and everyone else in place', () => {
    const store = new DrawingStore([line('a'), line('b'), line('c'), line('d')]);
    expect(store.bringToFront(['b', 'a'])).toBe(true);
    expect(ids(store)).toEqual(['c', 'd', 'a', 'b']);
    expect(zOf(store)).toEqual({ a: 1, b: 1, c: undefined, d: undefined });
  });

  it('ties a drawing brought to the front with the top zIndex when insertion order already puts it above', () => {
    const store = new DrawingStore([line('a', 5), line('b', 2), line('c')]);
    expect(store.bringToFront('b')).toBe(true);
    expect(ids(store)).toEqual(['c', 'a', 'b']);
    expect(zOf(store)).toEqual({ a: 5, b: 5, c: undefined });
  });

  it('sends drawings to the back with the largest zIndex that puts them at the bottom', () => {
    const store = new DrawingStore([line('a'), line('b'), line('c')]);
    expect(store.sendToBack('c')).toBe(true);
    expect(ids(store)).toEqual(['c', 'a', 'b']);
    expect(zOf(store)).toEqual({ a: undefined, b: undefined, c: -1 });

    const scored = new DrawingStore([line('a', -3), line('b'), line('c', 2)]);
    expect(scored.sendToBack('c')).toBe(true);
    expect(ids(scored)).toEqual(['c', 'a', 'b']);
    expect(zOf(scored)).toEqual({ a: -3, b: undefined, c: -4 });
  });

  it('sends several drawings to the back, keeping their order', () => {
    const store = new DrawingStore([line('a'), line('b'), line('c'), line('d')]);
    expect(store.sendToBack(['d', 'c'])).toBe(true);
    expect(ids(store)).toEqual(['c', 'd', 'a', 'b']);
    expect(zOf(store)).toEqual({ a: undefined, b: undefined, c: -1, d: -1 });
  });

  it('ties a drawing sent to the back with the bottom zIndex when insertion order already puts it below', () => {
    const store = new DrawingStore([line('a', 1), line('b', -2), line('c', 4)]);
    expect(store.sendToBack('a')).toBe(true);
    expect(ids(store)).toEqual(['a', 'b', 'c']);
    expect(zOf(store)).toEqual({ a: -2, b: -2, c: 4 });
  });

  it('brings a drawing forward one step, moving what is above only when it must', () => {
    const store = new DrawingStore([line('a'), line('b'), line('c')]);
    expect(store.bringForward('a')).toBe(true);
    expect(ids(store)).toEqual(['b', 'a', 'c']);
    expect(zOf(store)).toEqual({ a: 1, b: undefined, c: 1 });

    const spaced = new DrawingStore([line('a', 0), line('b', 1), line('c', 5)]);
    expect(spaced.bringForward('a')).toBe(true);
    expect(ids(spaced)).toEqual(['b', 'a', 'c']);
    expect(zOf(spaced)).toEqual({ a: 2, b: 1, c: 5 });
  });

  it('brings several drawings forward, each past the next unselected drawing', () => {
    const store = new DrawingStore([line('a'), line('b'), line('c'), line('d')]);
    expect(store.bringForward(['a', 'c'])).toBe(true);
    expect(ids(store)).toEqual(['b', 'a', 'd', 'c']);
    expect(zOf(store)).toEqual({ a: 1, b: undefined, c: 2, d: 1 });

    const grouped = new DrawingStore([line('a'), line('b'), line('c')]);
    expect(grouped.bringForward(['a', 'b'])).toBe(true);
    expect(ids(grouped)).toEqual(['c', 'a', 'b']);
    expect(zOf(grouped)).toEqual({ a: 1, b: 1, c: undefined });
  });

  it('sends a drawing backward one step, moving what is below only when it must', () => {
    const store = new DrawingStore([line('a'), line('b'), line('c')]);
    expect(store.sendBackward('c')).toBe(true);
    expect(ids(store)).toEqual(['a', 'c', 'b']);
    expect(zOf(store)).toEqual({ a: -1, b: undefined, c: -1 });

    const spaced = new DrawingStore([line('a', -5), line('b', -1), line('c', 0)]);
    expect(spaced.sendBackward('c')).toBe(true);
    expect(ids(spaced)).toEqual(['a', 'c', 'b']);
    expect(zOf(spaced)).toEqual({ a: -5, b: -1, c: -2 });
  });

  it('sends several drawings backward together', () => {
    const store = new DrawingStore([line('a'), line('b'), line('c')]);
    expect(store.sendBackward(['b', 'c'])).toBe(true);
    expect(ids(store)).toEqual(['b', 'c', 'a']);
    expect(zOf(store)).toEqual({ a: undefined, b: -1, c: -1 });
  });

  it('returns false and does not notify when nothing moves', () => {
    const store = new DrawingStore([line('a'), line('b'), line('c')]);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.bringToFront('c')).toBe(false);
    expect(store.bringToFront(['b', 'c'])).toBe(false);
    expect(store.bringForward('c')).toBe(false);
    expect(store.sendToBack('a')).toBe(false);
    expect(store.sendToBack(['a', 'b'])).toBe(false);
    expect(store.sendBackward('a')).toBe(false);
    expect(store.bringToFront([])).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('makes each command one change with one notification', () => {
    const store = new DrawingStore([line('a'), line('b'), line('c')]);
    const listener = vi.fn();
    store.subscribe(listener);
    store.bringForward('a');
    expect(onlyCall(listener, store).operations.map((op) => `${op.type}:${op.id}`)).toEqual(['update:a', 'update:c']);
  });

  it('rejects an unknown id without changing anything', () => {
    const store = new DrawingStore([line('a'), line('b')]);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(issuesOf(() => store.bringToFront(['b', 'x']))).toEqual([{ code: 'KFT-E-MISSING', message: 'No drawing with id x.' }]);
    expect(issuesOf(() => store.sendBackward('y'))).toEqual([{ code: 'KFT-E-MISSING', message: 'No drawing with id y.' }]);
    expect(ids(store)).toEqual(['a', 'b']);
    expect(listener).not.toHaveBeenCalled();
  });

  it('treats a single id string as one id, not as a list of characters', () => {
    const store = new DrawingStore([line('trend-1'), line('t'), line('r')]);
    expect(store.bringToFront('trend-1')).toBe(true);
    expect(ids(store)).toEqual(['t', 'r', 'trend-1']);
    expect(issuesOf(() => store.sendToBack('tr'))).toEqual([{ code: 'KFT-E-MISSING', message: 'No drawing with id tr.' }]);
  });

  it('also reorders locked and hidden drawings (API calls are not interaction)', () => {
    const store = new DrawingStore([
      { ...line('a'), locked: true },
      { ...line('b'), hidden: true },
    ]);
    expect(store.bringToFront('a')).toBe(true);
    expect(ids(store)).toEqual(['b', 'a']);
  });
});
