import { DrawingStore } from 'keystone-financial-tools-core';
import type { DrawingRepository, DrawingScope } from './repository';
import { documentScope } from './scope';
import { importSafely, type DrawingsReport } from './transfer';

/** What `loadStore` resolves to. */
export interface LoadedStore {
  /** The drawings of the scope; empty when nothing is stored or the entry could not be used. Its `scope` is the one asked for. */
  readonly store: DrawingStore;
  /** What was skipped (`skipped`) or why the whole entry was not used (`issue`); empty when everything was loaded. */
  readonly report: DrawingsReport;
}

/**
 * Loads the drawings of `scope` from `repository` into a new store. Resolves in every case where the
 * backend works, and never throws for what is stored (FR-PER-004):
 *
 * - Nothing stored: an empty store and an empty report.
 * - A corrupt entry or one of another scope: an empty store, and the repository's `KFT-E-JSON` or
 *   `KFT-E-SCOPE` issue in `report.issue`. The entry is left in place.
 * - A partly broken document: the valid drawings are loaded, the others are listed in
 *   `report.skipped` (a repeated id is skipped with `KFT-E-ID`).
 *
 * The store's `scope` is the one asked for, so saving it (`autoSave`) stamps the document with it. A
 * backend that fails still rejects with the `RepositoryError`: an empty store there would hide that
 * the saved drawings exist and be saved over them.
 *
 * @example
 * ```ts
 * const repository = new WebStorageRepository(localStorage);
 * const { store, report } = await loadStore(repository, { symbol: 'AAPL' });
 * if (report.issue !== undefined) console.warn(report.issue.message);
 * const saver = autoSave(store, repository, { symbol: 'AAPL' });
 * ```
 */
export async function loadStore(repository: DrawingRepository, scope: DrawingScope): Promise<LoadedStore> {
  const { document, issue } = await repository.load(scope);
  const store = new DrawingStore([], { scope: documentScope(scope) });
  const report = importSafely(store, document, { mode: 'replace' });
  return { store, report: issue === undefined ? report : { ...report, issue } };
}
