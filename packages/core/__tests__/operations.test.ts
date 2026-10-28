import { describe, expect, it } from 'vitest';
import { addOperation, composeOperations, foldOperation, invertOperation } from '../src/operations';
import type { Drawing, StoreOperation } from '../src/types';
import { trendLine } from './fixtures';

const a0: Drawing = trendLine('a');
const a1: Drawing = { ...a0, text: 'one' };
const a2: Drawing = { ...a0, text: 'two' };
const add = (after: Drawing = a0): StoreOperation => ({ type: 'add', id: 'a', after });
const update = (before: Drawing = a0, after: Drawing = a1): StoreOperation => ({ type: 'update', id: 'a', before, after });
const remove = (before: Drawing = a0): StoreOperation => ({ type: 'remove', id: 'a', before });

describe('foldOperation', () => {
  it('folds the pairs a store can produce', () => {
    expect(foldOperation(add(a0), update(a0, a1))).toEqual(add(a1));
    expect(foldOperation(add(a0), remove(a0))).toBeNull();
    expect(foldOperation(update(a0, a1), update(a1, a2))).toEqual(update(a0, a2));
    expect(foldOperation(update(a0, a1), remove(a1))).toEqual(remove(a0));
    expect(foldOperation(remove(a0), add(a1))).toEqual(update(a0, a1));
  });
});

describe('addOperation', () => {
  it('keeps one operation per drawing, in first-change order, and drops pairs that cancel out', () => {
    const pending = new Map<string, StoreOperation>();
    const b: StoreOperation = { type: 'add', id: 'b', after: trendLine('b') };
    addOperation(pending, update(a0, a1));
    addOperation(pending, b);
    addOperation(pending, update(a1, a2));
    expect([...pending.values()]).toEqual([update(a0, a2), b]);
    addOperation(pending, { type: 'remove', id: 'b', before: trendLine('b') });
    expect([...pending.values()]).toEqual([update(a0, a2)]);
  });
});

describe('composeOperations', () => {
  it('folds the second list onto the first', () => {
    const b: StoreOperation = { type: 'add', id: 'b', after: trendLine('b') };
    expect(composeOperations([add(a0)], [update(a0, a1), b])).toEqual([add(a1), b]);
    expect(composeOperations([add(a0)], [remove(a0)])).toEqual([]);
    expect(composeOperations([], [remove(a0)])).toEqual([remove(a0)]);
  });
});

describe('invertOperation', () => {
  it('turns add into remove, remove into add and swaps an update', () => {
    expect(invertOperation(add(a1))).toEqual(remove(a1));
    expect(invertOperation(remove(a1))).toEqual(add(a1));
    expect(invertOperation(update(a0, a1))).toEqual(update(a1, a0));
  });
});
