import { DrawingError, importDocument, type DrawingIssue, type DrawingStore, type ImportOptions, type ImportReport } from 'keystone-financial-tools-core';
import { serializeDocument } from './repository';

/** Options of `exportDrawings`. */
export interface ExportOptions {
  /** Indent the text with two spaces, for files people read or diff. Default false (compact). */
  readonly pretty?: boolean;
}

/**
 * What an import or a load did: the core `ImportReport`, plus `issue` when the document itself could
 * not be used (`KFT-E-JSON`: not a drawing document; `KFT-E-SCOPE`: it belongs to another scope).
 * In that case nothing was added and nothing else is listed.
 */
export interface DrawingsReport extends ImportReport {
  /** Why the whole document was not used; absent when it was read (individual bad drawings are in `skipped`). */
  readonly issue?: DrawingIssue;
}

/**
 * `importDocument` that reports an unreadable document instead of throwing it. A `DrawingError` is
 * the only thing turned into a report; anything else (a store listener that throws, say) is rethrown,
 * because the store has changed by then.
 */
export function importSafely(store: DrawingStore, json: unknown, options?: ImportOptions): DrawingsReport {
  try {
    return importDocument(store, json, options);
  } catch (error) {
    if (!(error instanceof DrawingError)) throw error;
    return { added: [], renamed: [], skipped: [], issue: error.issues[0] };
  }
}

/**
 * The store's drawings as JSON text of the current document version (with the store's scope, when it
 * has one), ready to be written to a file or sent to a server.
 *
 * @example Download as a file in the browser
 * ```ts
 * const blob = new Blob([exportDrawings(store, { pretty: true })], { type: 'application/json' });
 * const link = document.createElement('a');
 * link.href = URL.createObjectURL(blob);
 * link.download = 'drawings.json';
 * link.click();
 * URL.revokeObjectURL(link.href);
 * ```
 */
export function exportDrawings(store: DrawingStore, options?: ExportOptions): string {
  return serializeDocument(store.toJSON(), options?.pretty);
}

/**
 * Imports JSON text made by `exportDrawings` (version 1 or 2) into `store` as one change, with
 * `importDocument`: `merge` (the default) adds the drawings and renames taken ids, `replace` swaps the
 * contents. Invalid drawings are left out and listed in `skipped`. Never throws for the text: text that
 * is not JSON, or not a drawing document, changes nothing and returns a report with the `KFT-E-JSON`
 * issue. The store's scope is not changed by the document's.
 *
 * @example Upload from a file input in the browser
 * ```ts
 * input.addEventListener('change', async () => {
 *   const file = input.files?.[0];
 *   if (file === undefined) return;
 *   const report = importDrawings(store, await file.text(), { mode: 'merge' });
 *   if (report.issue !== undefined) alert(report.issue.message);
 *   else if (report.skipped.length > 0) alert(`${report.skipped.length} drawings could not be read`);
 * });
 * ```
 */
export function importDrawings(store: DrawingStore, text: string, options?: ImportOptions): DrawingsReport {
  return importSafely(store, text, options);
}
