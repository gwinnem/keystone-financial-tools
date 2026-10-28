import { describe, expect, it, vi } from 'vitest';
import { Disposables } from '../src/disposables';

describe('Disposables', () => {
  it('runs every clean-up function once, newest first', () => {
    const calls: string[] = [];
    const subscriptions = new Disposables();
    subscriptions.add(() => calls.push('a'));
    subscriptions.add(() => calls.push('b'));
    expect(subscriptions.disposed).toBe(false);
    expect(subscriptions.dispose()).toEqual([]);
    expect(calls).toEqual(['b', 'a']);
    expect(subscriptions.disposed).toBe(true);
    expect(subscriptions.dispose()).toEqual([]);
    expect(calls).toEqual(['b', 'a']);
  });

  it('runs the rest when one throws and returns the errors', () => {
    const first = new Error('first');
    const second = new Error('second');
    const after = vi.fn();
    const subscriptions = new Disposables();
    subscriptions.add(after);
    subscriptions.add(() => {
      throw first;
    });
    subscriptions.add(() => {
      throw second;
    });
    expect(subscriptions.dispose()).toEqual([second, first]);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('runs a clean-up function added after dispose at once', () => {
    const subscriptions = new Disposables();
    subscriptions.dispose();
    const late = vi.fn();
    subscriptions.add(late);
    expect(late).toHaveBeenCalledTimes(1);
    subscriptions.dispose();
    expect(late).toHaveBeenCalledTimes(1);
  });
});
