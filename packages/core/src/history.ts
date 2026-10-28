import { applyCommand, composeCommands, createCommand, invertCommand, type DrawingCommand } from './commands';
import type { DrawingStore } from './store';
import type { DrawingIssue, StoreChange } from './types';

export interface HistoryOptions {
  /** How many entries undo can go back, 1 to 1000. Default 100; the oldest entries are dropped. */
  readonly limit?: number;
  /** Transactions with one of these keys merge into the previous entry with the same key. Default `['nudge']`. */
  readonly coalesceKeys?: readonly string[];
  /** How close (ms) a coalescing transaction must follow the previous one to merge. Default 500. */
  readonly coalesceMs?: number;
  /** Clock for coalescing. Default `Date.now`. */
  readonly now?: () => number;
}

/** What `History` can do right now. A new object only when something changed. */
export interface HistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
}

/** An open group of changes that becomes one history entry on `commit()`. */
export interface HistoryTransaction {
  readonly key: string | undefined;
  /** Records the changes made since the transaction opened as one entry (none when nothing changed). */
  commit(): void;
  /** Reverts the changes made since the transaction opened; no entry. */
  cancel(): void;
}

interface Entry {
  readonly command: DrawingCommand;
  readonly key: string | undefined;
  readonly time: number;
}

interface OpenTransaction {
  command: DrawingCommand | null;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * Undo and redo for a `DrawingStore`. Every store change becomes one entry (a batch, a z-order
 * command or an import is one change), except changes made with `{ history: false }`: those are
 * not recorded and clear the redo stack. Undo and redo are applied with `store.restore` as one
 * change each. An entry that no longer fits the store (a drawing it touches was removed or re-added
 * outside the history) is dropped with an error instead of throwing.
 *
 * @example
 * ```ts
 * const history = new History(store, { limit: 200 });
 * history.subscribe((state) => toolbar.setUndoEnabled(state.canUndo));
 * history.onError((issue) => console.warn(issue.message));
 *
 * const drag = history.transaction('drag');
 * store.update(id, { anchors: moved });
 * store.update(id, { anchors: movedAgain });
 * drag.commit(); // one undo step
 * history.undo();
 * ```
 */
export class History {
  private readonly limit: number;
  private readonly coalesceKeys: ReadonlySet<string | undefined>;
  private readonly coalesceMs: number;
  private readonly now: () => number;
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private ids: readonly string[];
  private applying = false;
  private open: OpenTransaction | null = null;
  private state: HistoryState = { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 };
  private readonly listeners = new Set<(state: HistoryState) => void>();
  private readonly errorListeners = new Set<(issue: DrawingIssue) => void>();
  private readonly stop: () => void;

  constructor(
    private readonly store: DrawingStore,
    options: HistoryOptions = {}
  ) {
    const limit = options.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new RangeError(`The history limit must be an integer from 1 to ${MAX_LIMIT}.`);
    const coalesceMs = options.coalesceMs ?? 500;
    if (!Number.isFinite(coalesceMs) || coalesceMs < 0) throw new RangeError('The coalescing window must be a finite number of milliseconds, 0 or more.');
    this.limit = limit;
    this.coalesceMs = coalesceMs;
    this.coalesceKeys = new Set<string | undefined>(options.coalesceKeys ?? ['nudge']);
    this.now = options.now ?? Date.now;
    this.ids = store.list().map((d) => d.id);
    this.stop = store.subscribe((_drawings, change) => this.onChange(change));
  }

  get canUndo(): boolean {
    return this.state.canUndo;
  }

  get canRedo(): boolean {
    return this.state.canRedo;
  }

  /** The current state; the same object until something changes. */
  getState(): HistoryState {
    return this.state;
  }

  /**
   * Undoes the newest entry. Returns false when there is nothing to undo, a transaction is open, or
   * the entry no longer fits the store (it is dropped and an error is reported).
   */
  undo(): boolean {
    return this.step(this.undoStack, this.redoStack, invertCommand);
  }

  /** Redoes the newest undone entry. Returns false like `undo`. */
  redo(): boolean {
    return this.step(this.redoStack, this.undoStack, (command) => command);
  }

  /**
   * Opens a transaction: the store changes until `commit()` become one entry, `cancel()` reverts
   * them. Only one transaction can be open at a time. A transaction whose `key` is in
   * `coalesceKeys` merges into the previous entry with the same key when it commits within
   * `coalesceMs` of it (for example a burst of arrow-key nudges).
   */
  transaction(key?: string): HistoryTransaction {
    if (this.open !== null) throw new Error('A history transaction is already open.');
    const open: OpenTransaction = { command: null };
    this.open = open;
    let done = false;
    const close = (): DrawingCommand | null => {
      if (done) return null;
      done = true;
      this.open = null;
      return open.command;
    };
    return {
      key,
      commit: () => {
        const command = close();
        if (command !== null) this.push(command, key);
      },
      cancel: () => {
        const command = close();
        if (command === null) return;
        const issue = this.apply(invertCommand(command));
        if (issue !== null) this.report(issue);
      },
    };
  }

  /** Forgets every entry. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  /** Calls `listener` with the new state after every change of it; returns the unsubscribe function. */
  subscribe(listener: (state: HistoryState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Calls `listener` when an entry had to be dropped; returns the unsubscribe function. */
  onError(listener: (issue: DrawingIssue) => void): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  /** Stops following the store and forgets entries and listeners. Calling it again does nothing. */
  destroy(): void {
    this.stop();
    this.listeners.clear();
    this.errorListeners.clear();
    this.clear();
  }

  private onChange(change: StoreChange): void {
    const before = this.ids;
    this.ids = change.drawings.map((d) => d.id);
    if (this.applying) return;
    if (!change.history) {
      // emit() notifies only when the redo stack was not already empty.
      this.redoStack = [];
      this.emit();
      return;
    }
    const command = createCommand(before, change);
    if (this.open !== null) {
      this.open.command = this.open.command === null ? command : composeCommands(this.open.command, command);
      return;
    }
    this.push(command, undefined);
  }

  private push(command: DrawingCommand, key: string | undefined): void {
    const time = this.now();
    const top = this.undoStack[this.undoStack.length - 1] as Entry | undefined;
    if (this.coalesceKeys.has(key) && top !== undefined && top.key === key && time - top.time <= this.coalesceMs) {
      this.undoStack[this.undoStack.length - 1] = { command: composeCommands(top.command, command), key, time };
    } else {
      this.undoStack.push({ command, key, time });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.redoStack = [];
    this.emit();
  }

  private step(from: Entry[], to: Entry[], direction: (command: DrawingCommand) => DrawingCommand): boolean {
    if (this.open !== null) return false;
    const entry = from.pop();
    if (entry === undefined) return false;
    const issue = this.apply(direction(entry.command));
    if (issue === null) to.push(entry);
    this.emit();
    if (issue === null) return true;
    this.report(issue);
    return false;
  }

  private apply(command: DrawingCommand): DrawingIssue | null {
    this.applying = true;
    try {
      return applyCommand(this.store, command);
    } finally {
      this.applying = false;
    }
  }

  private emit(): void {
    const next: HistoryState = {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
    };
    const current = this.state;
    if (next.undoDepth === current.undoDepth && next.redoDepth === current.redoDepth) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener(next);
  }

  private report(issue: DrawingIssue): void {
    for (const listener of [...this.errorListeners]) listener(issue);
  }
}
