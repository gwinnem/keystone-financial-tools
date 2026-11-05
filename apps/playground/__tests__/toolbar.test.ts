import { describe, expect, it } from 'vitest';
import { nextMagnet, statusText } from '../src/toolbar';

describe('nextMagnet', () => {
  it('switches the magnet on (weak) when it is off', () => {
    expect(nextMagnet('off')).toBe('weak');
  });

  it('switches the magnet off when it is on', () => {
    expect(nextMagnet('weak')).toBe('off');
    expect(nextMagnet(nextMagnet('off'))).toBe('off');
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
