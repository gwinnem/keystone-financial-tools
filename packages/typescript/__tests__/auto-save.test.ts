import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingStore, type DrawingDocument } from 'keystone-financial-tools-core';
import { autoSave, DEFAULT_DEBOUNCE_MS, type AutoSaveScheduler, type AutoSaver } from '../src/auto-save';
import type { DrawingStorage } from '../src/persistence';
import { emptyDocument, type DrawingRepository, type DrawingScope, type RepositoryLoad } from '../src/repository';
import { AAPL, line } from './repository-contract';

/** Records what is saved. `gate` holds every save until it settles; `failWith` makes saves reject. */
class RecordingRepository implements DrawingRepository {
  readonly saved: DrawingDocument[] = [];
  readonly scopes: DrawingScope[] = [];
  gate: Promise<void> | undefined;
  failWith: unknown;

  async load(): Promise<RepositoryLoad> {
    return { document: emptyDocument() };
  }

  async save(scope: DrawingScope, document: DrawingDocument): Promise<void> {
    if (this.gate !== undefined) await this.gate;
    if (this.failWith !== undefined) throw this.failWith;
    this.scopes.push(scope);
    this.saved.push(document);
  }

  async remove(): Promise<void> {}
}

/** Holds saves until `release()` is called. */
function holdSaves(repository: RecordingRepository): () => void {
  let release!: () => void;
  repository.gate = new Promise<void>((resolve) => {
    release = () => {
      repository.gate = undefined;
      resolve();
    };
  });
  return release;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('autoSave with a repository: debounce', () => {
  it('saves once, after the changes have settled for 500 ms by default', async () => {
    const repository = new RecordingRepository();
    const store = new DrawingStore();
    autoSave(store, repository, AAPL);
    store.add(line('a'));
    await vi.advanceTimersByTimeAsync(499);
    expect(repository.saved).toHaveLength(0);
    store.add(line('b'));
    await vi.advanceTimersByTimeAsync(499);
    expect(repository.saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(repository.saved).toStrictEqual([store.toJSON()]);
    expect(repository.saved[0].drawings.map((d) => d.id)).toStrictEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(repository.saved).toHaveLength(1);
    expect(DEFAULT_DEBOUNCE_MS).toBe(500);
  });

  it('waits debounceMs when it is given', async () => {
    const repository = new RecordingRepository();
    const store = new DrawingStore();
    autoSave(store, repository, AAPL, { debounceMs: 50 });
    store.add(line('a'));
    await vi.advanceTimersByTimeAsync(49);
    expect(repository.saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(repository.saved).toHaveLength(1);
  });

  it('saves a batch of changes once', async () => {
    const repository = new RecordingRepository();
    const store = new DrawingStore();
    autoSave(store, repository, AAPL);
    store.batch(() => {
      store.add(line('a'));
      store.add(line('b'));
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.saved).toHaveLength(1);
  });

  it('saves under the scope it was given, the document of the store', async () => {
    const repository = new RecordingRepository();
    const store = new DrawingStore([], { scope: { symbol: 'AAPL' } });
    autoSave(store, repository, { symbol: 'AAPL', timeframe: '1h' });
    store.add(line('a'));
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.scopes).toStrictEqual([{ symbol: 'AAPL', timeframe: '1h' }]);
    expect(repository.saved).toStrictEqual([{ version: 2, scope: { symbol: 'AAPL' }, drawings: [line('a')] }]);
  });

  it('saves nothing until the store changes', async () => {
    const repository = new RecordingRepository();
    const saver = autoSave(new DrawingStore([line('a')]), repository, AAPL);
    await vi.advanceTimersByTimeAsync(10_000);
    await saver.flush();
    expect(repository.saved).toHaveLength(0);
  });

  it('saves again after the next change', async () => {
    const repository = new RecordingRepository();
    const store = new DrawingStore();
    autoSave(store, repository, AAPL);
    store.add(line('a'));
    await vi.advanceTimersByTimeAsync(500);
    store.add(line('b'));
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.saved.map((d) => d.drawings.length)).toStrictEqual([1, 2]);
  });
});

describe('autoSave with a repository: scheduler', () => {
  function manual(): { scheduler: AutoSaveScheduler; calls: string[]; fire: (handle: number) => void } {
    const calls: string[] = [];
    const callbacks = new Map<number, () => void>();
    let next = 0;
    const scheduler: AutoSaveScheduler = {
      setTimeout: (callback, delayMs) => {
        const handle = ++next;
        callbacks.set(handle, callback);
        calls.push(`set ${handle} ${delayMs}`);
        return handle;
      },
      clearTimeout: (handle) => {
        callbacks.delete(handle as number);
        calls.push(`clear ${handle}`);
      },
    };
    return { scheduler, calls, fire: (handle) => callbacks.get(handle)?.() };
  }

  it('restarts the timer on every change and saves when the scheduler fires it', async () => {
    const { scheduler, calls, fire } = manual();
    const repository = new RecordingRepository();
    const store = new DrawingStore();
    const saver = autoSave(store, repository, AAPL, { debounceMs: 20, scheduler });
    store.add(line('a'));
    store.add(line('b'));
    expect(calls).toStrictEqual(['set 1 20', 'clear 1', 'set 2 20']);
    expect(repository.saved).toHaveLength(0);
    fire(2);
    await saver.flush();
    expect(repository.saved).toHaveLength(1);
    expect(calls).toStrictEqual(['set 1 20', 'clear 1', 'set 2 20']);
  });

  it('uses 500 ms and clears the pending timer when flushed', async () => {
    const { scheduler, calls } = manual();
    const repository = new RecordingRepository();
    const store = new DrawingStore();
    const saver = autoSave(store, repository, AAPL, { scheduler });
    store.add(line('a'));
    await saver.flush();
    expect(calls).toStrictEqual(['set 1 500', 'clear 1']);
    expect(repository.saved).toHaveLength(1);
  });

  it('does not touch the timer when there is nothing pending', async () => {
    const { scheduler, calls } = manual();
    const saver = autoSave(new DrawingStore(), new RecordingRepository(), AAPL, { scheduler });
    await saver.flush();
    await saver.stop();
    expect(calls).toStrictEqual([]);
  });
});

describe('autoSave with a repository: flush and stop', () => {
  it('flush saves pending changes now, resolves when they are written, and cancels the timer', async () => {
    const repository = new RecordingRepository();
    const release = holdSaves(repository);
    const store = new DrawingStore();
    const saver = autoSave(store, repository, AAPL);
    store.add(line('a'));
    let written = false;
    const flushed = saver.flush().then(() => {
      written = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(written).toBe(false);
    release();
    await flushed;
    expect(written).toBe(true);
    expect(repository.saved).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(repository.saved).toHaveLength(1);
  });

  it('flush resolves without saving when nothing is pending, and waits for a save that is running', async () => {
    const repository = new RecordingRepository();
    const store = new DrawingStore();
    const saver = autoSave(store, repository, AAPL);
    await expect(saver.flush()).resolves.toBeUndefined();
    expect(repository.saved).toHaveLength(0);

    const release = holdSaves(repository);
    store.add(line('a'));
    await vi.advanceTimersByTimeAsync(500);
    let written = false;
    const flushed = saver.flush().then(() => {
      written = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(written).toBe(false);
    release();
    await flushed;
    expect(written).toBe(true);
    expect(repository.saved).toHaveLength(1);
  });

  it('stop flushes, then stops watching the store', async () => {
    const repository = new RecordingRepository();
    const store = new DrawingStore();
    const saver = autoSave(store, repository, AAPL);
    store.add(line('a'));
    await saver.stop();
    expect(repository.saved).toHaveLength(1);
    store.add(line('b'));
    await vi.advanceTimersByTimeAsync(5000);
    await saver.flush();
    expect(repository.saved).toHaveLength(1);
  });

  it('stop can be called twice', async () => {
    const repository = new RecordingRepository();
    const store = new DrawingStore();
    const saver = autoSave(store, repository, AAPL);
    store.add(line('a'));
    await saver.stop();
    await expect(saver.stop()).resolves.toBeUndefined();
    expect(repository.saved).toHaveLength(1);
  });

  it('stop unsubscribes at once: a change made while it waits starts no timer', async () => {
    const repository = new RecordingRepository();
    const release = holdSaves(repository);
    const store = new DrawingStore();
    const saver = autoSave(store, repository, AAPL);
    store.add(line('a'));
    const stopped = saver.stop();
    store.add(line('b'));
    release();
    await stopped;
    const savedBefore = repository.saved.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.getTimerCount()).toBe(0);
    expect(repository.saved).toHaveLength(savedBefore);
  });
});

describe('autoSave with a repository: ordering', () => {
  it('saves one document after the other, never an older one last', async () => {
    const repository = new RecordingRepository();
    const release = holdSaves(repository);
    const store = new DrawingStore();
    autoSave(store, repository, AAPL);
    store.add(line('a'));
    await vi.advanceTimersByTimeAsync(500);
    store.add(line('b'));
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.saved).toHaveLength(0);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.saved.map((d) => d.drawings.map((x) => x.id))).toStrictEqual([['a'], ['a', 'b']]);
  });

  it('saves a change made while a save is running, afterwards', async () => {
    const repository = new RecordingRepository();
    const release = holdSaves(repository);
    const store = new DrawingStore();
    autoSave(store, repository, AAPL);
    store.add(line('a'));
    await vi.advanceTimersByTimeAsync(500);
    store.add(line('b'));
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.saved).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.saved.map((d) => d.drawings.length)).toStrictEqual([1, 2]);
  });
});

describe('autoSave with a repository: errors', () => {
  it('calls onError with what the save rejected with, never throws into the store, and tries again on the next change', async () => {
    const repository = new RecordingRepository();
    const errors: unknown[] = [];
    const boom = new Error('storage is full');
    repository.failWith = boom;
    const store = new DrawingStore();
    autoSave(store, repository, AAPL, { onError: (error) => errors.push(error) });
    expect(() => store.add(line('a'))).not.toThrow();
    await vi.advanceTimersByTimeAsync(500);
    expect(errors).toStrictEqual([boom]);
    expect(repository.saved).toHaveLength(0);

    repository.failWith = undefined;
    store.add(line('b'));
    await vi.advanceTimersByTimeAsync(500);
    expect(errors).toHaveLength(1);
    expect(repository.saved).toStrictEqual([store.toJSON()]);
    expect(repository.saved[0].drawings).toHaveLength(2);
  });

  it('keeps the changes pending after a failure, so flush tries again', async () => {
    const repository = new RecordingRepository();
    repository.failWith = new Error('offline');
    const store = new DrawingStore();
    const saver = autoSave(store, repository, AAPL, { onError: () => undefined });
    store.add(line('a'));
    await vi.advanceTimersByTimeAsync(500);
    repository.failWith = undefined;
    await saver.flush();
    expect(repository.saved).toStrictEqual([store.toJSON()]);
  });

  it('works without onError: flush and stop still resolve', async () => {
    const repository = new RecordingRepository();
    repository.failWith = new Error('offline');
    const store = new DrawingStore();
    const saver = autoSave(store, repository, AAPL);
    store.add(line('a'));
    await vi.advanceTimersByTimeAsync(500);
    await expect(saver.flush()).resolves.toBeUndefined();
    await expect(saver.stop()).resolves.toBeUndefined();
  });

  it('ignores an onError that throws and keeps saving', async () => {
    const repository = new RecordingRepository();
    repository.failWith = new Error('offline');
    const store = new DrawingStore();
    const saver: AutoSaver = autoSave(store, repository, AAPL, {
      onError: () => {
        throw new Error('handler failed');
      },
    });
    store.add(line('a'));
    await vi.advanceTimersByTimeAsync(500);
    repository.failWith = undefined;
    store.add(line('b'));
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.saved).toHaveLength(1);
    await expect(saver.flush()).resolves.toBeUndefined();
  });

  it('reports a rejection that is not an error as it is', async () => {
    const repository = new RecordingRepository();
    repository.failWith = 'denied';
    const errors: unknown[] = [];
    const store = new DrawingStore();
    autoSave(store, repository, AAPL, { onError: (error) => errors.push(error) });
    store.add(line('a'));
    await vi.advanceTimersByTimeAsync(500);
    expect(errors).toStrictEqual(['denied']);
  });
});

describe('autoSave with a storage (the 0.1 form)', () => {
  class Storage implements DrawingStorage {
    readonly items = new Map<string, string>();
    getItem(key: string): string | null {
      return this.items.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
      this.items.set(key, value);
    }
  }

  it('still saves after every change, at once, until the returned function is called', () => {
    const storage = new Storage();
    const store = new DrawingStore();
    const stop = autoSave(store, storage, 'chart-1');
    expect(typeof stop).toBe('function');
    store.add(line('a'));
    expect(JSON.parse(storage.items.get('chart-1') ?? '').drawings).toHaveLength(1);
    stop();
    store.add(line('b'));
    expect(JSON.parse(storage.items.get('chart-1') ?? '').drawings).toHaveLength(1);
  });

  it('is told apart from the repository form by the key being a string', () => {
    const saver = autoSave(new DrawingStore(), new RecordingRepository(), AAPL);
    expect(Object.keys(saver).sort()).toStrictEqual(['flush', 'stop']);
  });
});
