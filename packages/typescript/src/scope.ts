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
