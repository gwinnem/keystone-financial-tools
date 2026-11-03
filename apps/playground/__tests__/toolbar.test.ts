import { describe, expect, it } from 'vitest';
import { DRAWING_KINDS } from 'keystone-financial-tools-core';
import { statusText, toolLabel } from '../src/toolbar';

describe('toolLabel', () => {
  it('capitalises the kind and replaces its hyphens with spaces', () => {
    expect(toolLabel('trend-line')).toBe('Trend line');
    expect(toolLabel('fibonacci-retracement')).toBe('Fibonacci retracement');
    expect(toolLabel('rectangle')).toBe('Rectangle');
  });

  it('gives every kind a different label', () => {
    expect(new Set(DRAWING_KINDS.map(toolLabel)).size).toBe(DRAWING_KINDS.length);
  });
});

describe('statusText', () => {
  it('names the tool, the drawings and the selection', () => {
    expect(statusText({ activeTool: 'trend-line', selection: ['a'] }, 2)).toBe('Tool: trend-line · 2 drawings · 1 selected');
  });

  it('says none for no tool, and uses the singular for one drawing', () => {
    expect(statusText({ activeTool: null, selection: [] }, 1)).toBe('Tool: none · 1 drawing · 0 selected');
    expect(statusText({ activeTool: null, selection: [] }, 0)).toBe('Tool: none · 0 drawings · 0 selected');
  });
});
