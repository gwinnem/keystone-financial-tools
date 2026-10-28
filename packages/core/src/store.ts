import { DrawingError } from './errors';
import type { Drawing, DrawingDocument, DrawingListener, DrawingPatch, StoreChange, StoreOperation } from './types';
import { validateDrawing } from './validate';

/** The version `toJSON` writes and `fromJSON` accepts. */
export const DOCUMENT_VERSION = 1;

function assertValid(drawing: unknown): void {
  const issues = validateDrawing(drawing);
  if (issues.length > 0) throw new DrawingError(issues);
}

function missing(id: string): DrawingError {
  return new DrawingError([{ code: 'KFT-E-MISSING', message: `No drawing with id ${id}.` }]);
}

/**
 * Folds `next` into `previous` (both for the same drawing) so a batch reports one operation per
 * drawing. Returns null when they cancel out (add, then remove). The other pairs cannot happen:
 * the store rejects a second add of an id and an update or remove of a missing one.
 */
function fold(previous: StoreOperation, next: StoreOperation): StoreOperation | null {
  if (next.type === 'remove') {
    return previous.type === 'add' ? null : { type: 'remove', id: next.id, before: previous.before };
  }
  if (previous.type === 'add') return { type: 'add', id: next.id, after: next.after };
  return { type: 'update', id: next.id, before: previous.before, after: next.after };
}

function zIndexOf(drawing: Drawing): number {
  return drawing.zIndex ?? 0;
}

interface Placement {
  readonly id: string;
  readonly z: number;
  /** Insertion index; for `lower` both values are negated. */
  readonly i: number;
}

/**
 * Gives every item a zIndex so that sorting by (zIndex, insertion index) yields `sequence`, keeping
 * each current zIndex unless the item would sort before the one placed below it; then it moves to
 * the lowest zIndex that puts it above. Others therefore keep their value where possible.
 */
function raise(sequence: readonly Placement[]): Map<string, number> {
  const result = new Map<string, number>();
  let previous: { z: number; i: number } | undefined;
  for (const item of sequence) {
    let z = item.z;
    if (previous !== undefined) {
      // Stryker disable next-line EqualityOperator: two drawings never share an insertion index, so > and >= agree.
      const later = item.i > previous.i;
      // A tie with a later insertion index is already in order; the fix below leaves it unchanged.
      if (z <= previous.z) z = later ? previous.z : previous.z + 1;
    }
    result.set(item.id, z);
    previous = { z, i: item.i };
  }
  return result;
}

type Arrange = (order: readonly Drawing[], selected: ReadonlySet<string>) => Drawing[];

const toFront: Arrange = (order, selected) => [...order.filter((d) => !selected.has(d.id)), ...order.filter((d) => selected.has(d.id))];

const toBack: Arrange = (order, selected) => [...order.filter((d) => selected.has(d.id)), ...order.filter((d) => !selected.has(d.id))];

/** Moves every selected drawing one step up, past the next unselected drawing above it. */
const forward: Arrange = (order, selected) => {
  const next = [...order];
  for (let index = next.length - 2; index >= 0; index--) {
    if (selected.has(next[index].id) && !selected.has(next[index + 1].id)) {
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
    }
  }
  return next;
};

/** Moves every selected drawing one step down, past the next unselected drawing below it. */
const backward: Arrange = (order, selected) => {
  const next = [...order];
  for (let index = 1; index < next.length; index++) {
    if (selected.has(next[index].id) && !selected.has(next[index - 1].id)) {
      [next[index], next[index - 1]] = [next[index - 1], next[index]];
    }
  }
  return next;
};

/**
 * Holds the drawings of one chart. Every change replaces the list (the previous list is never
 * mutated) and notifies the listeners with the new list and the operations, so framework adapters
 * can compare by reference and persistence can save incrementally. A failed change leaves the store
 * and the listeners untouched.
 *
 * @example
 * ```ts
 * const store = new DrawingStore();
 * store.subscribe((drawings, change) => save(change.operations));
 * store.batch(() => {
 *   store.add(line);
 *   store.update(line.id, { locked: true });
 * }); // one notification: [{ type: 'add', id, after: { ...line, locked: true } }]
 * ```
 */
export class DrawingStore {
  private items: readonly Drawing[] = [];
  private readonly listeners = new Set<DrawingListener>();
  private batching = false;
  private pending = new Map<string, StoreOperation>();

  constructor(initial: readonly Drawing[] = []) {
    for (const drawing of initial) this.insert(drawing);
  }

  /** Reads a saved document; throws `DrawingError` when it is not a version 1 document. */
  static fromJSON(value: unknown): DrawingStore {
    const doc = value as Partial<DrawingDocument> | null | undefined;
    if (doc?.version !== DOCUMENT_VERSION || !Array.isArray(doc.drawings)) {
      throw new DrawingError([{ code: 'KFT-E-JSON', message: `Expected a drawing document of version ${DOCUMENT_VERSION}.` }]);
    }
    return new DrawingStore(doc.drawings);
  }

  /** The drawings in insertion order. */
  list(): readonly Drawing[] {
    return this.items;
  }

  /**
   * The drawings in paint order: by `zIndex` (default 0), ties in insertion order. The first is
   * painted first (bottom), the last is on top.
   */
  ordered(): readonly Drawing[] {
    // Array.prototype.sort is stable, so equal zIndex values keep insertion order.
    return [...this.items].sort((a, b) => zIndexOf(a) - zIndexOf(b));
  }

  get(id: string): Drawing | undefined {
    return this.items.find((d) => d.id === id);
  }

  add(drawing: Drawing): void {
    this.insert(drawing);
    this.record({ type: 'add', id: drawing.id, after: drawing });
  }

  update(id: string, patch: DrawingPatch): Drawing {
    const current = this.get(id);
    if (current === undefined) throw missing(id);
    const next: Drawing = { ...current, ...patch, id };
    assertValid(next);
    this.items = this.items.map((d) => (d.id === id ? next : d));
    this.record({ type: 'update', id, before: current, after: next });
    return next;
  }

  remove(id: string): boolean {
    const current = this.get(id);
    if (current === undefined) return false;
    this.items = this.items.filter((d) => d.id !== id);
    this.record({ type: 'remove', id, before: current });
    return true;
  }

  /** Removes every drawing: one notification with one `remove` per drawing, none when already empty. */
  clear(): void {
    this.batch(() => {
      for (const drawing of this.items) this.remove(drawing.id);
    });
  }

  /**
   * Runs `fn` as one change: listeners are notified once, after `fn` returns, with the folded
   * operations (none when nothing changed). When `fn` throws, every change it made is rolled back,
   * nobody is notified and the error is rethrown. A `batch` inside a batch joins the outer one.
   * Returns what `fn` returns.
   */
  batch<T>(fn: () => T): T {
    if (this.batching) return fn();
    const snapshot = this.items;
    this.batching = true;
    let result: T;
    try {
      result = fn();
    } catch (error) {
      this.items = snapshot;
      this.pending = new Map();
      throw error;
    } finally {
      this.batching = false;
    }
    this.flush();
    return result;
  }

  /** Puts the drawings on top of all others, keeping their relative order. Returns false when nothing moved. */
  bringToFront(ids: string | readonly string[]): boolean {
    return this.reorder(ids, toFront, true);
  }

  /** Puts the drawings below all others, keeping their relative order. Returns false when nothing moved. */
  sendToBack(ids: string | readonly string[]): boolean {
    return this.reorder(ids, toBack, false);
  }

  /** Moves each drawing one step up in paint order. Returns false when nothing moved. */
  bringForward(ids: string | readonly string[]): boolean {
    return this.reorder(ids, forward, true);
  }

  /** Moves each drawing one step down in paint order. Returns false when nothing moved. */
  sendBackward(ids: string | readonly string[]): boolean {
    return this.reorder(ids, backward, false);
  }

  /** Calls `listener` after every change; returns the unsubscribe function. */
  subscribe(listener: DrawingListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  toJSON(): DrawingDocument {
    return { version: DOCUMENT_VERSION, drawings: this.items };
  }

  private insert(drawing: Drawing): void {
    assertValid(drawing);
    if (this.get(drawing.id) !== undefined) {
      throw new DrawingError([{ code: 'KFT-E-ID', message: `Duplicate drawing id ${drawing.id}.` }]);
    }
    this.items = [...this.items, drawing];
  }

  private record(operation: StoreOperation): void {
    const previous = this.pending.get(operation.id);
    const folded = previous === undefined ? operation : fold(previous, operation);
    if (folded === null) this.pending.delete(operation.id);
    else this.pending.set(operation.id, folded);
    if (!this.batching) this.flush();
  }

  private flush(): void {
    if (this.pending.size === 0) return;
    const change: StoreChange = { drawings: this.items, operations: [...this.pending.values()] };
    this.pending = new Map();
    // A copy, so a listener that unsubscribes during the call does not change the iteration.
    for (const listener of [...this.listeners]) listener(change.drawings, change);
  }

  /**
   * Rearranges the paint order with `arrange` and writes the zIndex values that produce it, as one
   * change. Upward moves keep everything below in place and raise only what must go up; downward
   * moves do the mirror image.
   */
  private reorder(ids: string | readonly string[], arrange: Arrange, upward: boolean): boolean {
    const list = typeof ids === 'string' ? [ids] : ids;
    for (const id of list) {
      if (this.get(id) === undefined) throw missing(id);
    }
    const position = new Map(this.items.map((d, index): [string, number] => [d.id, index]));
    const target = arrange(this.ordered(), new Set(list));
    const placements = target.map((d) => ({ id: d.id, z: zIndexOf(d), i: position.get(d.id) as number }));
    // Downward moves raise the mirror image: reversed order, negated zIndex and insertion index.
    // `0 - x` rather than `-x`, so a zIndex of 0 stays 0 and never becomes -0.
    const zIndex = upward ? raise(placements) : new Map([...raise(placements.reverse().map((p) => ({ id: p.id, z: 0 - p.z, i: 0 - p.i })))].map(([id, z]): [string, number] => [id, 0 - z]));
    const changed = target.filter((d) => zIndex.get(d.id) !== zIndexOf(d));
    if (changed.length === 0) return false;
    this.batch(() => {
      for (const d of changed) this.update(d.id, { zIndex: zIndex.get(d.id) });
    });
    return true;
  }
}
