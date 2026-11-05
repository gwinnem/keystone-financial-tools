import { describe, expect, it } from 'vitest';
import { LIVE_REGION_ATTRIBUTES, liveRegionText, VISUALLY_HIDDEN_STYLE } from '../src/live-region';

// NFR-A11Y-001: what the adapters share to show the `announce` events in a live region.
const NBSP = String.fromCharCode(160);

describe('LIVE_REGION_ATTRIBUTES', () => {
  it('make a polite region that is read as a whole, with no role of its own', () => {
    expect(LIVE_REGION_ATTRIBUTES).toStrictEqual({ 'aria-live': 'polite', 'aria-atomic': 'true' });
    expect(LIVE_REGION_ATTRIBUTES).not.toHaveProperty('role');
  });

  it('are frozen', () => {
    expect(Object.isFrozen(LIVE_REGION_ATTRIBUTES)).toBe(true);
  });
});

describe('VISUALLY_HIDDEN_STYLE', () => {
  it('takes the region out of the layout and out of sight but not out of the accessibility tree', () => {
    expect(VISUALLY_HIDDEN_STYLE).toStrictEqual({
      position: 'absolute',
      width: '1px',
      height: '1px',
      margin: '-1px',
      padding: '0',
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap',
      border: '0',
    });
    expect(Object.values(VISUALLY_HIDDEN_STYLE)).not.toContain('none');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(VISUALLY_HIDDEN_STYLE)).toBe(true);
  });
});

describe('liveRegionText', () => {
  it('is the message while it differs from the text the region has', () => {
    expect(liveRegionText('', 'Trend line placed')).toBe('Trend line placed');
    expect(liveRegionText('Trend line placed', 'Undone')).toBe('Undone');
  });

  it('adds a no-break space to a message that repeats, so the text changes and is read again', () => {
    expect(liveRegionText('Undone', 'Undone')).toBe(`Undone${NBSP}`);
    expect(NBSP).toHaveLength(1);
    expect(NBSP.trim()).toBe('');
  });

  it('takes the space off again the time after, so the text changes every time', () => {
    let text = liveRegionText('', 'Redone');
    const seen = [text];
    for (let i = 0; i < 4; i++) {
      text = liveRegionText(text, 'Redone');
      seen.push(text);
    }
    expect(seen).toStrictEqual(['Redone', `Redone${NBSP}`, 'Redone', `Redone${NBSP}`, 'Redone']);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('gives the message as it is after a different one', () => {
    expect(liveRegionText(`Redone${NBSP}`, 'Undone')).toBe('Undone');
  });

  it('treats an empty message like any other', () => {
    expect(liveRegionText('', '')).toBe(NBSP);
    expect(liveRegionText('', 'Undone')).toBe('Undone');
  });
});
