import { describe, expect, it } from 'vitest';
import { DEFAULT_KEY_PREFIX, scopeKey } from '../src/scope';

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
