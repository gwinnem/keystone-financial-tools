import { describe, expect, it } from 'vitest';
import { DEFAULT_TOOLS, DRAWING_KINDS } from 'keystone-financial-tools-core';
import { toolFromSearch, unknownToolMessage } from '../src/embed-params';

describe('toolFromSearch', () => {
  it.each(DRAWING_KINDS)('returns %s for ?tool=%s', (kind) => {
    expect(toolFromSearch(`?tool=${kind}`)).toBe(kind);
  });

  it('finds the parameter among others and without the question mark', () => {
    expect(toolFromSearch('?theme=dark&tool=rectangle&x=1')).toBe('rectangle');
    expect(toolFromSearch('tool=text-note')).toBe('text-note');
  });

  it('returns null without the parameter or with an empty search', () => {
    expect(toolFromSearch('')).toBeNull();
    expect(toolFromSearch('?')).toBeNull();
    expect(toolFromSearch('?other=trend-line')).toBeNull();
  });

  it('returns null for an empty value or a value that is not a drawing kind', () => {
    expect(toolFromSearch('?tool=')).toBeNull();
    expect(toolFromSearch('?tool=circle')).toBeNull();
    expect(toolFromSearch('?tool=Trend-Line')).toBeNull();
    expect(toolFromSearch('?tool=trend-line%20')).toBeNull();
  });

  it('takes the first of two tool parameters', () => {
    expect(toolFromSearch('?tool=rectangle&tool=trend-line')).toBe('rectangle');
  });

  it('does not take a prototype property for a tool', () => {
    expect(toolFromSearch('?tool=constructor')).toBeNull();
    expect(toolFromSearch('?tool=__proto__')).toBeNull();
  });
});

describe('unknownToolMessage', () => {
  it('lists the tools of 1.0, not the Fibonacci kinds that have no tool yet', () => {
    const message = unknownToolMessage();
    expect(message.startsWith('Add ?tool= with one of: ')).toBe(true);
    for (const kind of DEFAULT_TOOLS) expect(message).toContain(kind);
    expect(message).not.toContain('fibonacci-channel');
    expect(message.endsWith('.')).toBe(true);
  });
});
