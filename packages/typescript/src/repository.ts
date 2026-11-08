import { DOCUMENT_VERSION, readDocument, type DrawingDocument, type DrawingError, type DrawingIssue } from 'keystone-financial-tools-core';
import { checkScope } from './scope';

/**
 * What a document is stored for: a symbol and, optionally, a timeframe. Drawings are timeframe
 * independent by default, so leave `timeframe` out unless an application keeps separate markup per
 * timeframe (FR-PER-003).
 */
export interface DrawingScope {
  readonly symbol: string;
  readonly timeframe?: string;
}

/** What `DrawingRepository.load` resolves to. */
export interface RepositoryLoad {
  /** The stored document (version 2, older versions are migrated); an empty document when nothing is stored or the entry is unreadable. */
  readonly document: DrawingDocument;
  /** Why the stored entry was not used (`KFT-E-JSON`: not a drawing document; `KFT-E-SCOPE`: it belongs to another scope); absent when it was read or nothing was stored. */
  readonly issue?: DrawingIssue;
}

/**
 * Where drawings live. All three methods are asynchronous and take the scope of the document.
 *
 * - `load` resolves in every case where the backend itself works: an empty document when nothing is
 *   stored, and an empty document plus the issue when the stored entry is corrupt or belongs to
 *   another scope (`checkScope`). It does not validate the drawings; `loadStore` and `importDocument`
 *   do that and report the ones they skip.
 * - `save` replaces the document of the scope as a whole.
 * - `remove` deletes it; removing a scope that was never saved resolves too.
 *
 * A backend that fails (storage full, database unavailable) rejects with a `RepositoryError`.
 *
 * @example A repository on top of a REST API
 * ```ts
 * class RestRepository implements DrawingRepository {
 *   private url = (scope: DrawingScope) => `/api/drawings/${encodeURIComponent(scopeKey(scope))}`;
 *
 *   async load(scope: DrawingScope): Promise<RepositoryLoad> {
 *     const response = await fetch(this.url(scope));
 *     return response.status === 404 ? readStored(undefined) : readStored(await response.json());
 *   }
 *   async save(scope: DrawingScope, document: DrawingDocument): Promise<void> {
 *     await fetch(this.url(scope), { method: 'PUT', body: JSON.stringify(document) });
 *   }
 *   async remove(scope: DrawingScope): Promise<void> {
 *     await fetch(this.url(scope), { method: 'DELETE' });
 *   }
 * }
 * ```
 */
export interface DrawingRepository {
  load(scope: DrawingScope): Promise<RepositoryLoad>;
  save(scope: DrawingScope, document: DrawingDocument): Promise<void>;
  remove(scope: DrawingScope): Promise<void>;
}

/** What a repository was doing when it failed. */
export type RepositoryAction = 'read' | 'save' | 'remove';

/** A backend failed (storage full, database unavailable, ...). `reason` is what the backend threw. */
export class RepositoryError extends Error {
  readonly reason: unknown;

  constructor(message: string, reason: unknown) {
    super(message);
    this.name = 'RepositoryError';
    this.reason = reason;
  }
}

/** The error a repository rejects with: names the action, the key and what the backend said. */
export function repositoryFailure(action: RepositoryAction, key: string, reason: unknown): RepositoryError {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return new RepositoryError(`Could not ${action} the drawings under ${key}: ${detail}`, reason);
}

/**
 * The text a document is stored and exported as. The repositories, the 0.1 helpers and
 * `exportDrawings` share it, so what one writes the others read. `pretty` indents with two spaces.
 */
export function serializeDocument(document: DrawingDocument, pretty?: boolean): string {
  return JSON.stringify(document, null, pretty ? 2 : undefined);
}

/** The issue for stored text that is not JSON. The repositories and the 0.1 helpers report it the same way. */
export function invalidJsonIssue(key: string): DrawingIssue {
  return { code: 'KFT-E-JSON', message: `The drawings saved under ${key} are not valid JSON.` };
}

/** A document without drawings; a new object on every call. */
export function emptyDocument(): DrawingDocument {
  return { version: DOCUMENT_VERSION, drawings: [] };
}

/**
 * Turns what a backend stored (`undefined` when nothing is stored, otherwise the parsed value) into
 * the result of `load`: the document, migrated to the current version, or an empty document plus the
 * `KFT-E-JSON` issue when the value is not a drawing document. Never throws. Use it in your own
 * repository so that it follows the same rules.
 *
 * Pass the `scope` that was loaded to also have the document checked against it (`checkScope`): a
 * document of another scope gives an empty document plus the `KFT-E-SCOPE` issue.
 *
 * @example
 * ```ts
 * return readStored(await response.json(), scope);
 * ```
 */
export function readStored(value: unknown, scope?: DrawingScope): RepositoryLoad {
  if (value === undefined) return { document: emptyDocument() };
  let document: DrawingDocument;
  try {
    document = readDocument(value);
  } catch (error) {
    return { document: emptyDocument(), issue: (error as DrawingError).issues[0] };
  }
  const issue = scope === undefined ? undefined : checkScope(document, scope);
  return issue === undefined ? { document } : { document: emptyDocument(), issue };
}

/** Like `readStored` for stored text: `null` means nothing is stored, text that is not JSON is reported as `KFT-E-JSON`. */
export function parseStored(text: string | null, key: string, scope?: DrawingScope): RepositoryLoad {
  if (text === null) return readStored(undefined);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { document: emptyDocument(), issue: invalidJsonIssue(key) };
  }
  return readStored(value, scope);
}

/** The repositories of this package. */
export type RepositoryKind = 'memory' | 'web-storage' | 'indexeddb';

/** The license tiers a repository can belong to (FR-LIC-002). */
export type RepositoryTier = 'community' | 'professional-plus';

/**
 * The tier each repository belongs to (FR-LIC-002): persistence, that is saving and restoring drawings, is
 * Professional Plus, so the Web Storage and IndexedDB repositories are. The memory repository keeps nothing
 * between sessions, so it is not persistence: it is Community, for tests and server-side rendering. A
 * repository of your own is the Enterprise feature `storage-adapters`.
 */
export const REPOSITORY_TIERS: Readonly<Record<RepositoryKind, RepositoryTier>> = Object.freeze({
  memory: 'community',
  'web-storage': 'professional-plus',
  indexeddb: 'professional-plus',
});
