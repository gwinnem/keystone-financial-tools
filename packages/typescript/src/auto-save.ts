import type { DrawingStore } from 'keystone-financial-tools-core';
import { autoSave as saveToStorage, type DrawingStorage } from './persistence';
import type { DrawingRepository, DrawingScope } from './repository';

/** How long changes must stay quiet before `autoSave` saves, unless `debounceMs` says otherwise. */
export const DEFAULT_DEBOUNCE_MS = 500;

/**
 * The timer `autoSave` uses. Replace it in tests to run time by hand; the default is the global
 * `setTimeout` and `clearTimeout`. The handle is whatever `setTimeout` returns.
 */
export interface AutoSaveScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Options of `autoSave` with a repository. */
export interface AutoSaveOptions {
  /** Milliseconds without a change before the store is saved. Default 500. */
  readonly debounceMs?: number;
  /** Called with whatever a failed save rejected with. Errors it throws itself are ignored. */
  readonly onError?: (error: unknown) => void;
  /** The timer; default the global `setTimeout` and `clearTimeout`. */
  readonly scheduler?: AutoSaveScheduler;
}

/** What `autoSave` with a repository returns. */
export interface AutoSaver {
  /**
   * Saves pending changes now instead of waiting for the debounce, and resolves once they are written
   * (after any save still running). Resolves, and reports through `onError`, when the save fails.
   */
  flush(): Promise<void>;
  /** Flushes, then stops watching the store: later changes are not saved. Safe to call twice. */
  stop(): Promise<void>;
}

const ignore = (): void => {
  // Nobody asked to hear about failed saves.
};

const TIMERS: AutoSaveScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function saveWhenSettled(store: DrawingStore, repository: DrawingRepository, scope: DrawingScope, options: AutoSaveOptions | undefined): AutoSaver {
  const scheduler = options?.scheduler ?? TIMERS;
  const delay = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const onError = options?.onError ?? ignore;
  let timer: unknown;
  let dirty = false;
  // Saves run one after the other, so an older document never lands after a newer one.
  let queue: Promise<void> = Promise.resolve();

  const report = (error: unknown): void => {
    try {
      onError(error);
    } catch {
      // A failing handler must not stop later saves.
    }
  };

  // Never rejects. A failed save leaves the store dirty, so the next change or `flush` tries again.
  const persist = async (): Promise<void> => {
    if (!dirty) return;
    const document = store.toJSON();
    dirty = false;
    try {
      await repository.save(scope, document);
    } catch (error) {
      dirty = true;
      report(error);
    }
  };

  const enqueue = (): Promise<void> => {
    queue = queue.then(persist);
    return queue;
  };

  const cancel = (): void => {
    if (timer === undefined) return;
    scheduler.clearTimeout(timer);
    timer = undefined;
  };

  const unsubscribe = store.subscribe(() => {
    dirty = true;
    cancel();
    timer = scheduler.setTimeout(() => {
      timer = undefined;
      void enqueue();
    }, delay);
  });

  const flush = (): Promise<void> => {
    cancel();
    return enqueue();
  };

  return {
    flush,
    stop: () => {
      const done = flush();
      unsubscribe();
      return done;
    },
  };
}

/**
 * Saves the store to a Web Storage `storage` under `key` after every change; returns the function
 * that stops saving.
 *
 * @deprecated Use `autoSave(store, repository, scope)`, which saves once changes settle, reports
 * failures and can be flushed.
 *
 * @example Migrating
 * ```ts
 * // before
 * const stop = autoSave(store, localStorage, 'chart-1');
 * // after
 * const saver = autoSave(store, new WebStorageRepository(localStorage), { symbol: 'AAPL' });
 * ```
 */
export function autoSave(store: DrawingStore, storage: DrawingStorage, key: string): () => void;
/**
 * Saves the store to `repository` under `scope` once changes have settled: every change restarts a
 * timer of `debounceMs` (default 500), so dragging a drawing writes once, not on every frame.
 *
 * - Nothing is saved until the store changes.
 * - Saves run one after the other; a change made while a save runs is saved afterwards.
 * - A failed save calls `onError` and never throws into the store. The changes stay pending: the next
 *   change, `flush()` or `stop()` tries again.
 * - `flush()` saves pending changes now and resolves when they are written; `stop()` flushes, then
 *   stops watching the store.
 *
 * @example
 * ```ts
 * const saver = autoSave(store, new WebStorageRepository(localStorage), { symbol: 'AAPL' }, {
 *   debounceMs: 300,
 *   onError: (error) => console.warn('Drawings were not saved', error),
 * });
 * // ... when the chart is destroyed or the symbol changes:
 * await saver.stop();
 * ```
 */
export function autoSave(store: DrawingStore, repository: DrawingRepository, scope: DrawingScope, options?: AutoSaveOptions): AutoSaver;
export function autoSave(store: DrawingStore, target: DrawingStorage | DrawingRepository, scopeOrKey: DrawingScope | string, options?: AutoSaveOptions): (() => void) | AutoSaver {
  return typeof scopeOrKey === 'string' ? saveToStorage(store, target as DrawingStorage, scopeOrKey) : saveWhenSettled(store, target as DrawingRepository, scopeOrKey, options);
}
