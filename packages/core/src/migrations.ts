import { DrawingError } from './errors';
import { isPlainObject } from './object';
import type { DocumentScope, DrawingDocument, DrawingDocumentV1 } from './types';

/** The version `toJSON` writes. */
export const DOCUMENT_VERSION = 2;

/** Every version `fromJSON` and `importDocument` can read; older ones are migrated in memory. */
export const SUPPORTED_DOCUMENT_VERSIONS: readonly number[] = Object.freeze([1, 2]);

/**
 * Upgrades a version 1 document to version 2. Pure: returns a new document and leaves the input
 * untouched. Version 1 has no scope; the drawings carry over as they are (every field added since
 * is optional).
 *
 * @example
 * ```ts
 * migrateV1ToV2({ version: 1, drawings }); // { version: 2, drawings }
 * ```
 */
export function migrateV1ToV2(doc: DrawingDocumentV1): DrawingDocument {
  return { version: 2, drawings: doc.drawings };
}

type Migration = (doc: never) => { readonly version: number };

/** Migration from each old version to the next; `readDocument` chains them up to `DOCUMENT_VERSION`. */
const MIGRATIONS: Readonly<Record<number, Migration>> = { 1: migrateV1ToV2 };

const SCOPE_KEYS: readonly string[] = ['symbol', 'timeframe'];

function isValidScope(value: unknown): value is DocumentScope {
  return (
    isPlainObject(value) && Object.keys(value).every((key) => SCOPE_KEYS.includes(key)) && SCOPE_KEYS.every((key) => value[key] === undefined || (typeof value[key] === 'string' && value[key] !== ''))
  );
}

function jsonError(message: string): DrawingError {
  return new DrawingError([{ code: 'KFT-E-JSON', message }]);
}

/**
 * Checks the envelope of a saved document (an object with a supported `version`, a `drawings`
 * array and, from version 2, an optional `scope`) and migrates it to the current version. Throws
 * `DrawingError` with `KFT-E-JSON` otherwise. The drawings themselves are not validated here:
 * `DrawingStore.fromJSON` rejects the document on the first invalid one, `importDocument` skips it.
 *
 * @example
 * ```ts
 * const doc = readDocument(JSON.parse(text)); // always version 2
 * ```
 */
export function readDocument(value: unknown): DrawingDocument {
  if (!isPlainObject(value) || !SUPPORTED_DOCUMENT_VERSIONS.includes(value.version as number) || !Array.isArray(value.drawings)) {
    throw jsonError(`Expected a drawing document of version ${SUPPORTED_DOCUMENT_VERSIONS.join(' or ')}.`);
  }
  if (value.version === 2 && value.scope !== undefined && !isValidScope(value.scope)) {
    throw jsonError('The document scope must be an object with an optional non-empty symbol and timeframe, and nothing else.');
  }
  let doc = value as { readonly version: number };
  while (doc.version < DOCUMENT_VERSION) doc = MIGRATIONS[doc.version](doc as never);
  return doc as DrawingDocument;
}
