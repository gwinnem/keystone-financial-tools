import { composeOperations, invertOperation } from './operations';
import type { DrawingStore } from './store';
import type { Drawing, DrawingIssue, StoreChange, StoreOperation } from './types';

/**
 * One undoable change, as plain data (JSON-serialisable, so it can be sent for sync). The
 * operations say what happened to each drawing (`add`, `update`, `remove`; several of them make a
 * batch), `before` and `after` are the drawing ids in list order around the change, so applying the
 * inverse restores the exact list.
 *
 * @example
 * ```ts
 * const command = createCommand(idsBefore, change);
 * applyCommand(store, invertCommand(command)); // undo
 * applyCommand(store, command); // redo
 * ```
 */
export interface DrawingCommand {
  readonly operations: readonly StoreOperation[];
  readonly before: readonly string[];
  readonly after: readonly string[];
}

/** The command for a store change; `before` lists the drawing ids before it, in list order. */
export function createCommand(before: readonly string[], change: StoreChange): DrawingCommand {
  return { operations: change.operations, before, after: change.drawings.map((d) => d.id) };
}

/** The command that undoes `command`: inverse operations in reverse order, `before` and `after` swapped. */
export function invertCommand(command: DrawingCommand): DrawingCommand {
  return { operations: [...command.operations].reverse().map(invertOperation), before: command.after, after: command.before };
}

/** One command that does `first`, then `second`; operations on the same drawing are folded. */
export function composeCommands(first: DrawingCommand, second: DrawingCommand): DrawingCommand {
  return { operations: composeOperations(first.operations, second.operations), before: first.before, after: second.after };
}

/**
 * Applies `command` to the current contents of `store` as one change (through `store.restore`).
 * Returns null when it was applied, or an issue when the store no longer fits the command (a
 * drawing to update or remove is gone, `KFT-E-MISSING`, or a drawing to add already exists,
 * `KFT-E-ID`); then nothing changes. Drawings the command does not touch keep their values;
 * ones that are not in `command.after` (added outside the history) stay, after the listed ones.
 *
 * @example
 * ```ts
 * const issue = applyCommand(store, invertCommand(command));
 * if (issue !== null) console.warn(issue.message);
 * ```
 */
export function applyCommand(store: DrawingStore, command: DrawingCommand): DrawingIssue | null {
  const current = new Map(store.list().map((d) => [d.id, d] as const));
  for (const operation of command.operations) {
    const exists = current.has(operation.id);
    if (operation.type === 'add' && exists) return { code: 'KFT-E-ID', message: `Drawing ${operation.id} already exists.` };
    if (operation.type !== 'add' && !exists) return { code: 'KFT-E-MISSING', message: `Drawing ${operation.id} no longer exists.` };
  }
  const values = new Map(current);
  for (const operation of command.operations) {
    if (operation.type === 'remove') values.delete(operation.id);
    else values.set(operation.id, operation.after);
  }
  const listed = command.after.filter((id) => values.has(id));
  const rest = store.list().filter((d) => values.has(d.id) && !listed.includes(d.id));
  store.restore([...listed.map((id) => values.get(id) as Drawing), ...rest]);
  return null;
}
