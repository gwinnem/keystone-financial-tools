import type { StoreOperation } from './types';

/**
 * Folds `next` into `previous` (both for the same drawing) so a change reports one operation per
 * drawing. Returns null when they cancel out (add, then remove). The other pairs cannot happen:
 * a store rejects a second add of an id and an update or remove of a missing one.
 */
export function foldOperation(previous: StoreOperation, next: StoreOperation): StoreOperation | null {
  if (next.type === 'remove') {
    return previous.type === 'add' ? null : { type: 'remove', id: next.id, before: previous.before };
  }
  if (previous.type === 'add') return { type: 'add', id: next.id, after: next.after };
  return { type: 'update', id: next.id, before: previous.before, after: next.after };
}

/**
 * Adds `operation` to `pending` (keyed by drawing id, in the order each drawing first changed),
 * folding it into an earlier operation on the same drawing.
 */
export function addOperation(pending: Map<string, StoreOperation>, operation: StoreOperation): void {
  const previous = pending.get(operation.id);
  const folded = previous === undefined ? operation : foldOperation(previous, operation);
  if (folded === null) pending.delete(operation.id);
  else pending.set(operation.id, folded);
}

/** The operations of `first` followed by `second`, folded to one operation per drawing. */
export function composeOperations(first: readonly StoreOperation[], second: readonly StoreOperation[]): StoreOperation[] {
  const pending = new Map<string, StoreOperation>();
  for (const operation of [...first, ...second]) addOperation(pending, operation);
  return [...pending.values()];
}

/** The operation that undoes `operation`. */
export function invertOperation(operation: StoreOperation): StoreOperation {
  if (operation.type === 'add') return { type: 'remove', id: operation.id, before: operation.after };
  if (operation.type === 'remove') return { type: 'add', id: operation.id, after: operation.before };
  return { type: 'update', id: operation.id, before: operation.after, after: operation.before };
}
