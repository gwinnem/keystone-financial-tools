import type { DocumentScope, DrawingDocument, DrawingIssue } from 'keystone-financial-tools-core';
import type { DrawingScope } from './repository';

/** The prefix of every storage key unless a repository is given another one. */
export const DEFAULT_KEY_PREFIX = 'keystone-drawings';

/**
 * The storage key of a scope: `keystone-drawings:<symbol>[:<timeframe>]`, with the symbol and the
 * timeframe URL-encoded so that `:` and `/` in a symbol cannot make two scopes collide. A different
 * `prefix` replaces `keystone-drawings`.
 *
 * @example
 * ```ts
 * scopeKey({ symbol: 'AAPL' }); // 'keystone-drawings:AAPL'
 * scopeKey({ symbol: 'BTC/USD', timeframe: '1h' }); // 'keystone-drawings:BTC%2FUSD:1h'
 * ```
 */
export function scopeKey(scope: DrawingScope, prefix: string = DEFAULT_KEY_PREFIX): string {
  const key = `${prefix}:${encodeURIComponent(scope.symbol)}`;
  return scope.timeframe === undefined ? key : `${key}:${encodeURIComponent(scope.timeframe)}`;
}

/** The scope a document and a store carry for `scope`: the symbol and, only when given, the timeframe. */
export function documentScope(scope: DrawingScope): DocumentScope {
  return scope.timeframe === undefined ? { symbol: scope.symbol } : { symbol: scope.symbol, timeframe: scope.timeframe };
}

function label(scope: DocumentScope): string {
  return [scope.symbol, scope.timeframe].filter((part): part is string => part !== undefined).join(':');
}

/**
 * Checks that a loaded document belongs to the scope it was loaded for. A document without a scope
 * (version 1, or written by hand) matches every scope; otherwise the symbol and the timeframe that
 * the document names must equal the ones asked for. A document that names no timeframe is timeframe
 * independent and matches every timeframe. Returns the `KFT-E-SCOPE` issue on a mismatch.
 *
 * The repositories of this package call it in `load`; use it in your own repository, or pass the
 * scope to `readStored`, which calls it.
 *
 * @example
 * ```ts
 * checkScope({ version: 2, scope: { symbol: 'MSFT' }, drawings: [] }, { symbol: 'AAPL' });
 * // { code: 'KFT-E-SCOPE', message: 'The document belongs to MSFT, not to AAPL.' }
 * checkScope({ version: 2, scope: { symbol: 'AAPL' }, drawings: [] }, { symbol: 'AAPL', timeframe: '1h' }); // undefined
 * ```
 */
export function checkScope(document: DrawingDocument, scope: DrawingScope): DrawingIssue | undefined {
  const stored = document.scope;
  if (stored === undefined) return undefined;
  const differs = (stored.symbol !== undefined && stored.symbol !== scope.symbol) || (stored.timeframe !== undefined && stored.timeframe !== scope.timeframe);
  return differs ? { code: 'KFT-E-SCOPE', message: `The document belongs to ${label(stored)}, not to ${label(scope)}.` } : undefined;
}
