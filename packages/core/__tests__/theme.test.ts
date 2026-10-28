import { describe, expect, it } from 'vitest';
import { validateStyle } from '../src/style';
import { DARK_THEME, LIGHT_THEME, resolveStyle } from '../src/theme';
import type { DrawingTheme } from '../src/theme';
import type { Drawing } from '../src/types';
import { DRAWING_KINDS } from '../src/kinds';
import { trendLine } from './fixtures';

describe('LIGHT_THEME and DARK_THEME', () => {
  it('have the documented light values', () => {
    expect(LIGHT_THEME).toEqual({
      name: 'light',
      defaults: { color: '#2962ff', lineWidth: 2, lineStyle: 'solid', fillColor: '#2962ff', fillOpacity: 0, textColor: '#131722', fontSize: 12 },
      kinds: {
        rectangle: { fillOpacity: 0.15 },
        'text-note': { fontSize: 14 },
        'fibonacci-retracement': { color: '#787b86', lineWidth: 1 },
        'fibonacci-arcs': { color: '#787b86', lineWidth: 1 },
        'fibonacci-fans': { color: '#787b86', lineWidth: 1 },
        'fibonacci-time-zones': { color: '#787b86', lineWidth: 1 },
      },
      states: {
        hover: { lineWidthDelta: 1, opacity: 1 },
        selected: { lineWidthDelta: 1, opacity: 1 },
        locked: { lineWidthDelta: 0, opacity: 0.6 },
        handles: { size: 8, fillColor: '#ffffff', strokeColor: '#2962ff', lineWidth: 1 },
      },
    });
  });

  it('have the documented dark values', () => {
    expect(DARK_THEME).toEqual({
      name: 'dark',
      defaults: { color: '#5b8cff', lineWidth: 2, lineStyle: 'solid', fillColor: '#5b8cff', fillOpacity: 0, textColor: '#d1d4dc', fontSize: 12 },
      kinds: {
        rectangle: { fillOpacity: 0.2 },
        'text-note': { fontSize: 14 },
        'fibonacci-retracement': { color: '#868993', lineWidth: 1 },
        'fibonacci-arcs': { color: '#868993', lineWidth: 1 },
        'fibonacci-fans': { color: '#868993', lineWidth: 1 },
        'fibonacci-time-zones': { color: '#868993', lineWidth: 1 },
      },
      states: {
        hover: { lineWidthDelta: 1, opacity: 1 },
        selected: { lineWidthDelta: 1, opacity: 1 },
        locked: { lineWidthDelta: 0, opacity: 0.6 },
        handles: { size: 8, fillColor: '#131722', strokeColor: '#5b8cff', lineWidth: 1 },
      },
    });
  });

  it('are deeply frozen', () => {
    for (const theme of [LIGHT_THEME, DARK_THEME]) {
      expect(Object.isFrozen(theme)).toBe(true);
      expect(Object.isFrozen(theme.defaults)).toBe(true);
      expect(Object.isFrozen(theme.kinds.rectangle)).toBe(true);
      expect(Object.isFrozen(theme.states.handles)).toBe(true);
    }
  });

  it('only hold style values that pass validation', () => {
    for (const theme of [LIGHT_THEME, DARK_THEME]) {
      expect(validateStyle(theme.defaults)).toEqual([]);
      for (const kind of DRAWING_KINDS) expect(validateStyle(theme.kinds[kind] ?? {})).toEqual([]);
    }
  });
});

describe('resolveStyle', () => {
  it('uses the global defaults for a kind without overrides', () => {
    expect(resolveStyle(trendLine(), LIGHT_THEME)).toEqual(LIGHT_THEME.defaults);
    expect(resolveStyle(trendLine(), LIGHT_THEME)).not.toBe(LIGHT_THEME.defaults);
  });

  it('uses the light theme by default', () => {
    expect(resolveStyle({ kind: 'horizontal-line' })).toEqual(LIGHT_THEME.defaults);
  });

  it('merges drawing style over kind defaults over global defaults', () => {
    expect(resolveStyle({ kind: 'rectangle' }, LIGHT_THEME)).toEqual({ ...LIGHT_THEME.defaults, fillOpacity: 0.15 });
    expect(resolveStyle({ kind: 'rectangle', style: { fillOpacity: 0.5, color: '#e91e63' } }, LIGHT_THEME)).toEqual({ ...LIGHT_THEME.defaults, fillOpacity: 0.5, color: '#e91e63' });
    expect(resolveStyle({ kind: 'fibonacci-fans', style: { lineWidth: 3 } }, LIGHT_THEME)).toEqual({ ...LIGHT_THEME.defaults, color: '#787b86', lineWidth: 3 });
  });

  it('ignores undefined values at both override levels', () => {
    const theme: DrawingTheme = { ...LIGHT_THEME, kinds: { 'trend-line': { color: undefined, lineWidth: 4 } } };
    expect(resolveStyle({ kind: 'trend-line', style: { lineWidth: undefined, lineStyle: 'dashed' } }, theme)).toEqual({ ...LIGHT_THEME.defaults, lineWidth: 4, lineStyle: 'dashed' });
  });

  it('restyles a drawing when the theme changes, without modifying it', () => {
    const drawing: Drawing = { ...trendLine(), style: { lineStyle: 'dotted' } };
    const before = JSON.stringify(drawing);
    expect(resolveStyle(drawing, LIGHT_THEME)).toEqual({ ...LIGHT_THEME.defaults, lineStyle: 'dotted' });
    expect(resolveStyle(drawing, DARK_THEME)).toEqual({ ...DARK_THEME.defaults, lineStyle: 'dotted' });
    expect(JSON.stringify(drawing)).toBe(before);
  });
});
