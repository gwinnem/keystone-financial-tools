import { DrawingError } from './errors';
import type { Drawing, DrawingDocument, DrawingListener, DrawingPatch } from './types';
import { validateDrawing } from './validate';

/** The version `toJSON` writes and `fromJSON` accepts. */
export const DOCUMENT_VERSION = 1;

function assertValid(drawing: unknown): void {
  const issues = validateDrawing(drawing);
  if (issues.length > 0) throw new DrawingError(issues);
}

/**
 * Holds the drawings of one chart. Every change replaces the list (the previous list is never
 * mutated) and notifies the listeners, so framework adapters can compare by reference.
 */
export class DrawingStore {
  private items: readonly Drawing[] = [];
  private readonly listeners = new Set<DrawingListener>();

  constructor(initial: readonly Drawing[] = []) {
    for (const drawing of initial) this.insert(drawing);
  }

  /** Reads a saved document; throws `DrawingError` when it is not a version 1 document. */
  static fromJSON(value: unknown): DrawingStore {
    const doc = value as Partial<DrawingDocument> | null | undefined;
    if (doc?.version !== DOCUMENT_VERSION || !Array.isArray(doc.drawings)) {
      throw new DrawingError([
        {
          code: 'KFT-E-JSON',
          message: `Expected a drawing document of version ${DOCUMENT_VERSION}.`,
        },
      ]);
    }
    return new DrawingStore(doc.drawings);
  }

  list(): readonly Drawing[] {
    return this.items;
  }

  get(id: string): Drawing | undefined {
    return this.items.find((d) => d.id === id);
  }

  add(drawing: Drawing): void {
    this.insert(drawing);
    this.emit();
  }

  update(id: string, patch: DrawingPatch): Drawing {
    const current = this.get(id);
    if (current === undefined) {
      throw new DrawingError([{ code: 'KFT-E-MISSING', message: `No drawing with id ${id}.` }]);
    }
    const next: Drawing = { ...current, ...patch, id };
    assertValid(next);
    this.items = this.items.map((d) => (d.id === id ? next : d));
    this.emit();
    return next;
  }

  remove(id: string): boolean {
    const next = this.items.filter((d) => d.id !== id);
    if (next.length === this.items.length) return false;
    this.items = next;
    this.emit();
    return true;
  }

  clear(): void {
    if (this.items.length === 0) return;
    this.items = [];
    this.emit();
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

  private emit(): void {
    // A copy, so a listener that unsubscribes during the call does not change the iteration.
    for (const listener of [...this.listeners]) listener(this.items);
  }
}
