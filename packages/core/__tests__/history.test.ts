import { afterEach, describe, expect, it, vi } from 'vitest';
import { History } from '../src/history';
import { importDocument } from '../src/import';
import { DrawingStore } from '../src/store';
import type { Drawing, DrawingIssue } from '../src/types';
import { horizontalLine, trendLine } from './fixtures';
import { randomChange, seeded } from './random';

const ids = (store: DrawingStore): string[] => store.list().map((d) => d.id);

function setup(initial: readonly Drawing[] = [], options: ConstructorParameters<typeof History>[1] = {}): { store: DrawingStore; history: History; errors: DrawingIssue[] } {
  const store = new DrawingStore(initial);
  const history = new History(store, options);
  const errors: DrawingIssue[] = [];
  history.onError((issue) => errors.push(issue));
  return { store, history, errors };
}

function clock(start = 1000): { now: () => number; advance: (ms: number) => void } {
  let time = start;
  return { now: () => time, advance: (ms) => (time += ms) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('History: undo and redo (FR-HI-001, FR-HI-002)', () => {
  it('starts with nothing to undo or redo', () => {
    const { history } = setup([trendLine('a')]);
    expect(history.getState()).toEqual({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  it('records each store change and undoes and redoes it exactly', () => {
    const { store, history } = setup([trendLine('a')]);
    store.add(horizontalLine('b'));
    store.update('a', { text: 'x' });
    expect(history.getState()).toEqual({ canUndo: true, canRedo: false, undoDepth: 2, redoDepth: 0 });

    expect(history.undo()).toBe(true);
    expect(store.list()).toEqual([trendLine('a'), horizontalLine('b')]);
    expect(history.undo()).toBe(true);
    expect(store.list()).toEqual([trendLine('a')]);
    expect(history.getState()).toEqual({ canUndo: false, canRedo: true, undoDepth: 0, redoDepth: 2 });
    expect(history.canRedo).toBe(true);

    expect(history.redo()).toBe(true);
    expect(history.redo()).toBe(true);
    expect(store.list()).toEqual([{ ...trendLine('a'), text: 'x' }, horizontalLine('b')]);
    expect(history.canUndo).toBe(true);
    expect(history.redo()).toBe(false);
  });

  it('records a batch, a z-order command and an import as one entry each', () => {
    const { store, history } = setup([trendLine('a'), trendLine('b')]);
    store.batch(() => {
      store.add(trendLine('c'));
      store.remove('a');
    });
    store.bringForward('b');
    importDocument(store, { version: 2, drawings: [horizontalLine('d'), horizontalLine('e')] });
    expect(history.getState().undoDepth).toBe(3);
    history.undo();
    history.undo();
    history.undo();
    expect(store.list()).toEqual([trendLine('a'), trendLine('b')]);
  });

  it('keeps the drawing order right for changes recorded after an undo', () => {
    const { store, history } = setup([trendLine('a'), trendLine('b')]);
    store.batch(() => {
      store.remove('a');
      store.add({ ...trendLine('a'), text: 'moved' });
    });
    expect(ids(store)).toEqual(['b', 'a']);
    history.undo();
    expect(ids(store)).toEqual(['a', 'b']);
    store.update('b', { text: 'x' });
    history.undo();
    expect(store.list()).toEqual([trendLine('a'), trendLine('b')]);
  });

  it('clears the redo stack when a new change is recorded', () => {
    const { store, history } = setup();
    store.add(trendLine('a'));
    history.undo();
    store.add(trendLine('b'));
    expect(history.getState()).toEqual({ canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 });
    expect(history.redo()).toBe(false);
  });

  it('notifies with a new state only when it changes, and keeps the same state object otherwise', () => {
    const { store, history } = setup();
    const states: unknown[] = [];
    const stop = history.subscribe((state) => states.push(state));
    const initial = history.getState();
    store.add(trendLine('a'));
    history.undo();
    history.redo();
    expect(states).toEqual([
      { canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 },
      { canUndo: false, canRedo: true, undoDepth: 0, redoDepth: 1 },
      { canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 },
    ]);
    expect(states[2]).toBe(history.getState());
    expect(initial).not.toBe(history.getState());
    history.redo();
    expect(states).toHaveLength(3);
    stop();
    store.add(trendLine('b'));
    expect(states).toHaveLength(3);
  });

  it('forgets every entry on clear', () => {
    const { store, history } = setup();
    store.add(trendLine('a'));
    store.add(trendLine('b'));
    history.undo();
    const states: unknown[] = [];
    history.subscribe((state) => states.push(state));
    history.clear();
    expect(history.getState()).toEqual({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
    expect(states).toHaveLength(1);
    expect(history.undo()).toBe(false);
  });
});

describe('History: depth limit (FR-HI-004)', () => {
  it('keeps the newest 100 entries by default', () => {
    const { store, history } = setup();
    for (let i = 0; i < 101; i++) store.add(trendLine(`d${i}`));
    expect(history.getState().undoDepth).toBe(100);
    while (history.undo());
    expect(ids(store)).toEqual(['d0']);
  });

  it('accepts limits from 1 to 1000', () => {
    const { store, history } = setup([], { limit: 1 });
    store.add(trendLine('a'));
    store.add(trendLine('b'));
    expect(history.getState().undoDepth).toBe(1);
    expect(() => new History(store, { limit: 1000 })).not.toThrow();
  });

  it('rejects a limit outside 1 to 1000 or not an integer', () => {
    for (const limit of [0, 1001, 1.5, Number.NaN]) {
      expect(() => new History(new DrawingStore(), { limit })).toThrow(new RangeError('The history limit must be an integer from 1 to 1000.'));
    }
  });

  it('rejects a coalescing window that is negative or not finite', () => {
    for (const coalesceMs of [-1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() => new History(new DrawingStore(), { coalesceMs })).toThrow(new RangeError('The coalescing window must be a finite number of milliseconds, 0 or more.'));
    }
    expect(() => new History(new DrawingStore(), { coalesceMs: 0 })).not.toThrow();
  });
});

describe('History: untracked changes and stale entries (FR-HI-005)', () => {
  it('does not record changes made with { history: false } and clears the redo stack', () => {
    const { store, history } = setup();
    store.add(trendLine('a'));
    store.add(trendLine('b'));
    history.undo();
    const states: unknown[] = [];
    history.subscribe((state) => states.push(state));
    store.add(horizontalLine('remote'), { history: false });
    expect(history.getState()).toEqual({ canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 });
    expect(states).toHaveLength(1);
    store.update('remote', { text: 'x' }, { history: false });
    expect(states).toHaveLength(1);
    history.undo();
    expect(ids(store)).toEqual(['remote']);
  });

  it('does not record an import made with { history: false }', () => {
    const { store, history } = setup();
    importDocument(store, { version: 2, drawings: [trendLine('a')] }, { history: false });
    expect(history.canUndo).toBe(false);
  });

  it('drops an entry that no longer fits the store and reports it instead of throwing', () => {
    const { store, history, errors } = setup([trendLine('a')]);
    store.update('a', { text: 'x' });
    store.add(trendLine('b'));
    store.remove('a', { history: false });
    const before = store.list();
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(false);
    expect(errors).toEqual([{ code: 'KFT-E-MISSING', message: 'Drawing a no longer exists.' }]);
    expect(store.list()).toEqual(before.filter((d) => d.id !== 'b'));
    expect(history.getState()).toEqual({ canUndo: false, canRedo: true, undoDepth: 0, redoDepth: 1 });
  });

  it('stops reporting errors to a listener that unsubscribed', () => {
    const { store, history } = setup([trendLine('a')]);
    const issues: DrawingIssue[] = [];
    const stop = history.onError((issue) => issues.push(issue));
    stop();
    store.update('a', { text: 'x' });
    store.remove('a', { history: false });
    history.undo();
    expect(issues).toEqual([]);
  });
});

describe('History: transactions and coalescing (FR-HI-003)', () => {
  it('groups the changes of a transaction into one entry', () => {
    const { store, history } = setup([trendLine('a')]);
    const drag = history.transaction('drag');
    expect(drag.key).toBe('drag');
    store.update('a', { text: '1' });
    store.update('a', { text: '2' });
    store.add(trendLine('b'));
    expect(history.canUndo).toBe(false);
    drag.commit();
    expect(history.getState().undoDepth).toBe(1);
    history.undo();
    expect(store.list()).toEqual([trendLine('a')]);
  });

  it('adds no entry for a transaction without changes', () => {
    const { history } = setup();
    history.transaction().commit();
    expect(history.canUndo).toBe(false);
  });

  it('reverts the changes of a cancelled transaction without an entry', () => {
    const { store, history, errors } = setup([trendLine('a')]);
    store.add(trendLine('b'));
    const states: unknown[] = [];
    history.subscribe((state) => states.push(state));
    const drag = history.transaction('drag');
    store.update('a', { text: '1' });
    store.remove('b');
    drag.cancel();
    expect(store.list()).toEqual([trendLine('a'), trendLine('b')]);
    expect(history.getState().undoDepth).toBe(1);
    expect(states).toEqual([]);
    expect(errors).toEqual([]);
    history.transaction().cancel();
    expect(store.list()).toEqual([trendLine('a'), trendLine('b')]);
  });

  it('reports a cancel that no longer fits the store', () => {
    const { store, history, errors } = setup([trendLine('a')]);
    const drag = history.transaction();
    store.update('a', { text: '1' });
    store.remove('a', { history: false });
    drag.cancel();
    expect(errors).toEqual([{ code: 'KFT-E-MISSING', message: 'Drawing a no longer exists.' }]);
  });

  it('ignores a second commit or cancel and allows a new transaction afterwards', () => {
    const { store, history } = setup();
    const first = history.transaction();
    store.add(trendLine('a'));
    first.commit();
    first.commit();
    first.cancel();
    expect(ids(store)).toEqual(['a']);
    expect(history.getState().undoDepth).toBe(1);
    const second = history.transaction();
    store.add(trendLine('b'));
    second.cancel();
    second.commit();
    expect(ids(store)).toEqual(['a']);
    expect(history.getState().undoDepth).toBe(1);
  });

  it('allows one transaction at a time and no undo or redo while it is open', () => {
    const { store, history } = setup();
    store.add(trendLine('a'));
    history.undo();
    store.add(trendLine('b'));
    history.undo();
    const open = history.transaction();
    expect(() => history.transaction()).toThrow('A history transaction is already open.');
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
    open.commit();
    expect(history.redo()).toBe(true);
  });

  it('leaves untracked changes out of a transaction', () => {
    const { store, history } = setup();
    const t = history.transaction();
    store.add(trendLine('a'));
    store.add(horizontalLine('remote'), { history: false });
    t.commit();
    history.undo();
    expect(ids(store)).toEqual(['remote']);
  });

  it('merges nudge transactions committed within 500 ms of the previous one', () => {
    const time = clock();
    const { store, history } = setup([trendLine('a')], { now: time.now });
    const nudge = (text: string): void => {
      const t = history.transaction('nudge');
      store.update('a', { text });
      t.commit();
    };
    nudge('1');
    time.advance(300);
    nudge('2');
    time.advance(500);
    nudge('3');
    expect(history.getState().undoDepth).toBe(1);
    time.advance(501);
    nudge('4');
    expect(history.getState().undoDepth).toBe(2);
    history.undo();
    expect(store.get('a')?.text).toBe('3');
    history.undo();
    expect(store.get('a')).toEqual(trendLine('a'));
  });

  it('does not merge other keys, plain changes or a nudge after a different entry', () => {
    const time = clock();
    const { store, history } = setup([trendLine('a')], { now: time.now });
    const run = (key: string | undefined, text: string): void => {
      const t = history.transaction(key);
      store.update('a', { text });
      t.commit();
    };
    run('drag', '1');
    run('drag', '2');
    run(undefined, '3');
    run(undefined, '4');
    run('nudge', '5');
    store.update('a', { text: '6' });
    run('nudge', '7');
    expect(history.getState().undoDepth).toBe(7);
  });

  it('uses the configured keys and window', () => {
    const time = clock();
    const { store, history } = setup([trendLine('a')], { now: time.now, coalesceKeys: ['rotate'], coalesceMs: 0 });
    const run = (key: string, text: string): void => {
      const t = history.transaction(key);
      store.update('a', { text });
      t.commit();
    };
    run('rotate', '1');
    run('rotate', '2');
    time.advance(1);
    run('rotate', '3');
    run('nudge', '4');
    run('nudge', '5');
    expect(history.getState().undoDepth).toBe(4);
  });

  it('uses Date.now by default', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(10);
    const { store, history } = setup([trendLine('a')]);
    for (const text of ['1', '2']) {
      const t = history.transaction('nudge');
      store.update('a', { text });
      t.commit();
    }
    now.mockReturnValue(1000);
    const t = history.transaction('nudge');
    store.update('a', { text: '3' });
    t.commit();
    expect(history.getState().undoDepth).toBe(2);
  });
});

describe('History: destroy', () => {
  it('stops recording, forgets entries and listeners, and can be called twice', () => {
    const { store, history } = setup();
    const states: unknown[] = [];
    history.subscribe((state) => states.push(state));
    store.add(trendLine('a'));
    history.destroy();
    history.destroy();
    store.add(trendLine('b'));
    expect(history.getState()).toEqual({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
    expect(history.undo()).toBe(false);
    expect(ids(store)).toEqual(['a', 'b']);
    expect(states).toHaveLength(1);
  });

  it('no longer reports errors after destroy', () => {
    const { store, history, errors } = setup([trendLine('a')]);
    const drag = history.transaction();
    store.update('a', { text: 'x' });
    store.remove('a', { history: false });
    history.destroy();
    drag.cancel();
    expect(errors).toEqual([]);
  });
});

describe('History property (QA-004): undoing everything restores the start, redoing everything the end', () => {
  it.each([3, 11, 512, 8080])('holds for 80 random changes (seed %i)', (seed) => {
    const random = seeded(seed);
    let counter = 0;
    const next = (): string => `d${counter++}`;
    const { store, history } = setup([trendLine(next()), horizontalLine(next())], { limit: 1000 });
    const start = store.list();
    for (let step = 0; step < 80; step++) randomChange(store, random, next);
    const end = store.list();
    while (history.undo());
    expect(store.list()).toEqual(start);
    while (history.redo());
    expect(store.list()).toEqual(end);
  });
});
