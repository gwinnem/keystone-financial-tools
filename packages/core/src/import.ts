import { DrawingError } from './errors';
import { createId } from './ids';
import { readDocument } from './migrations';
import type { DrawingStore } from './store';
import type { Drawing, DrawingIssue } from './types';
import { validateDrawing } from './validate';

/** `replace` swaps the store contents for the document's drawings; `merge` adds them. */
export type ImportMode = 'replace' | 'merge';

export interface ImportOptions {
  /** Default `merge`. */
  readonly mode?: ImportMode;
  /** Id source for renamed drawings in `merge` mode. Default `createId`. */
  readonly createId?: () => string;
}

/** What an import did. Ids are the ids the drawings have in the store after the import. */
export interface ImportReport {
  /** Ids of the imported drawings, in document order. */
  readonly added: readonly string[];
  /** Drawings that got a new id because theirs was taken (merge mode). */
  readonly renamed: readonly { readonly from: string; readonly to: string }[];
  /** Drawings that were left out, by their index in the document, with what is wrong. */
  readonly skipped: readonly { readonly index: number; readonly issues: readonly DrawingIssue[] }[];
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DrawingError([{ code: 'KFT-E-JSON', message: 'The document is not valid JSON.' }]);
  }
}

/**
 * Imports a saved document (a JSON string or a parsed value, version 1 or 2) into `store` as one
 * change, keeping every valid drawing even when others are broken.
 *
 * - Invalid drawings are left out and listed in `skipped` with their index and issues.
 * - `merge` adds the drawings; an id that is already taken (in the store or earlier in the
 *   document) gets a new one, listed in `renamed`.
 * - `replace` removes everything and adds the drawings; a repeated id in the document is skipped
 *   with `KFT-E-ID`.
 *
 * Throws `DrawingError` with `KFT-E-JSON`, and changes nothing, when the document itself is not
 * readable. The store's scope is not changed.
 *
 * @example
 * ```ts
 * const report = importDocument(store, fileText, { mode: 'merge' });
 * if (report.skipped.length > 0) warn(`${report.skipped.length} drawings could not be read`);
 * ```
 */
export function importDocument(store: DrawingStore, json: unknown, options: ImportOptions = {}): ImportReport {
  const doc = readDocument(typeof json === 'string' ? parse(json) : json);
  const mode = options.mode ?? 'merge';
  const nextId = options.createId ?? createId;
  // Ids a drawing from the document cannot keep. In replace mode the store is emptied first, so
  // only ids earlier in the document count; in merge mode the store's ids count too.
  const taken = new Set<string>();
  if (mode === 'merge') {
    for (const drawing of store.list()) taken.add(drawing.id);
  }
  const accepted: Drawing[] = [];
  const renamed: { from: string; to: string }[] = [];
  const skipped: { index: number; issues: readonly DrawingIssue[] }[] = [];

  doc.drawings.forEach((value: unknown, index: number) => {
    const issues = validateDrawing(value);
    if (issues.length > 0) {
      skipped.push({ index, issues });
      return;
    }
    let drawing = value as Drawing;
    if (taken.has(drawing.id)) {
      if (mode === 'replace') {
        skipped.push({ index, issues: [{ code: 'KFT-E-ID', message: `Duplicate drawing id ${drawing.id}.` }] });
        return;
      }
      let id: string;
      do {
        id = nextId();
      } while (taken.has(id));
      renamed.push({ from: drawing.id, to: id });
      drawing = { ...drawing, id };
    }
    taken.add(drawing.id);
    accepted.push(drawing);
  });

  store.batch(() => {
    if (mode === 'replace') store.clear();
    for (const drawing of accepted) store.add(drawing);
  });
  return { added: accepted.map((d) => d.id), renamed, skipped };
}
