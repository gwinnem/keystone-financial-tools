import { describe, expect, it } from 'vitest';
import type { DocumentScope } from 'keystone-financial-tools-core';
import { DEFAULT_KEY_PREFIX, checkScope, scopeKey } from '../src/scope';

const documentFor = (scope?: DocumentScope) => (scope === undefined ? { version: 2 as const, drawings: [] } : { version: 2 as const, scope, drawings: [] });
const mismatch = (message: string) => ({ code: 'KFT-E-SCOPE', message });

describe('scopeKey', () => {
  it('is keystone-drawings:<symbol> without a timeframe', () => {
    expect(scopeKey({ symbol: 'AAPL' })).toBe('keystone-drawings:AAPL');
    expect(DEFAULT_KEY_PREFIX).toBe('keystone-drawings');
  });

  it('adds the timeframe after the symbol', () => {
    expect(scopeKey({ symbol: 'AAPL', timeframe: '1h' })).toBe('keystone-drawings:AAPL:1h');
  });

  it('URL-encodes the symbol and the timeframe', () => {
    expect(scopeKey({ symbol: 'BTC/USD', timeframe: '1h' })).toBe('keystone-drawings:BTC%2FUSD:1h');
    expect(scopeKey({ symbol: 'a:b', timeframe: 'c d' })).toBe('keystone-drawings:a%3Ab:c%20d');
  });

  it('keeps a symbol containing a colon apart from a symbol with a timeframe', () => {
    expect(scopeKey({ symbol: 'a:b' })).not.toBe(scopeKey({ symbol: 'a', timeframe: 'b' }));
  });

  it('treats an empty timeframe as a timeframe', () => {
    expect(scopeKey({ symbol: 'AAPL', timeframe: '' })).toBe('keystone-drawings:AAPL:');
  });

  it('uses the prefix it is given instead of keystone-drawings', () => {
    expect(scopeKey({ symbol: 'AAPL' }, 'my-app')).toBe('my-app:AAPL');
    expect(scopeKey({ symbol: 'AAPL', timeframe: '1d' }, 'my-app')).toBe('my-app:AAPL:1d');
  });
});

describe('checkScope', () => {
  it('accepts a document without a scope under every scope', () => {
    expect(checkScope(documentFor(), { symbol: 'AAPL' })).toBeUndefined();
    expect(checkScope(documentFor(), { symbol: 'AAPL', timeframe: '1h' })).toBeUndefined();
    expect(checkScope(documentFor({}), { symbol: 'AAPL' })).toBeUndefined();
  });

  it('accepts a document of the same symbol, with or without a timeframe', () => {
    expect(checkScope(documentFor({ symbol: 'AAPL' }), { symbol: 'AAPL' })).toBeUndefined();
    expect(checkScope(documentFor({ symbol: 'AAPL', timeframe: '1h' }), { symbol: 'AAPL', timeframe: '1h' })).toBeUndefined();
  });

  it('accepts a timeframe independent document under a timeframe scope', () => {
    expect(checkScope(documentFor({ symbol: 'AAPL' }), { symbol: 'AAPL', timeframe: '1h' })).toBeUndefined();
  });

  it('accepts a document that names only the timeframe, or only the symbol, when that one matches', () => {
    expect(checkScope(documentFor({ timeframe: '1h' }), { symbol: 'AAPL', timeframe: '1h' })).toBeUndefined();
    expect(checkScope(documentFor({ symbol: 'AAPL' }), { symbol: 'AAPL', timeframe: '4h' })).toBeUndefined();
  });

  it('reports a document of another symbol', () => {
    expect(checkScope(documentFor({ symbol: 'MSFT' }), { symbol: 'AAPL' })).toStrictEqual(mismatch('The document belongs to MSFT, not to AAPL.'));
  });

  it('reports a document of another timeframe', () => {
    expect(checkScope(documentFor({ symbol: 'AAPL', timeframe: '4h' }), { symbol: 'AAPL', timeframe: '1h' })).toStrictEqual(mismatch('The document belongs to AAPL:4h, not to AAPL:1h.'));
  });

  it('reports a timeframe document under a scope without a timeframe', () => {
    expect(checkScope(documentFor({ symbol: 'AAPL', timeframe: '1h' }), { symbol: 'AAPL' })).toStrictEqual(mismatch('The document belongs to AAPL:1h, not to AAPL.'));
  });

  it('names only what the document names', () => {
    expect(checkScope(documentFor({ timeframe: '1h' }), { symbol: 'AAPL', timeframe: '4h' })).toStrictEqual(mismatch('The document belongs to 1h, not to AAPL:4h.'));
  });

  it('reports a document that differs in both', () => {
    expect(checkScope(documentFor({ symbol: 'MSFT', timeframe: '4h' }), { symbol: 'AAPL', timeframe: '1h' })).toStrictEqual(mismatch('The document belongs to MSFT:4h, not to AAPL:1h.'));
  });
});
