import { describe, expect, it } from 'vitest';
import { LINE_STYLES, STYLE_LIMITS, validateStyle } from '../src/style';

const styleIssue = (message: string): { code: string; message: string } => ({ code: 'KFT-E-STYLE', message });

describe('LINE_STYLES and STYLE_LIMITS', () => {
  it('lists the line styles and the numeric ranges', () => {
    expect(LINE_STYLES).toEqual(['solid', 'dashed', 'dotted']);
    expect(STYLE_LIMITS).toEqual({ lineWidth: { min: 1, max: 10 }, fillOpacity: { min: 0, max: 1 }, fontSize: { min: 8, max: 72 } });
    expect(Object.isFrozen(LINE_STYLES)).toBe(true);
    expect(Object.isFrozen(STYLE_LIMITS.lineWidth)).toBe(true);
  });
});

describe('validateStyle', () => {
  it('accepts an empty style and a style with every field', () => {
    expect(validateStyle({})).toEqual([]);
    expect(validateStyle({ color: '#fff', lineWidth: 2.5, lineStyle: 'dotted', fillColor: 'red', fillOpacity: 0.5, textColor: 'rgb(0 0 0)', fontSize: 13 })).toEqual([]);
  });

  it('treats fields set to undefined as absent', () => {
    expect(validateStyle({ color: undefined, lineWidth: undefined, lineStyle: undefined })).toEqual([]);
  });

  it('rejects a style that is not a plain object', () => {
    for (const value of [undefined, null, 'red', 1, [], new Date(0)]) {
      expect(validateStyle(value)).toEqual([styleIssue('The style must be a plain object.')]);
    }
  });

  it.each([
    ['lineWidth', 1, 10],
    ['fillOpacity', 0, 1],
    ['fontSize', 8, 72],
  ] as const)('accepts %s at both ends of its range and rejects values just outside', (field, min, max) => {
    const message = [styleIssue(`The style.${field} must be a number from ${min} to ${max}.`)];
    expect(validateStyle({ [field]: min })).toEqual([]);
    expect(validateStyle({ [field]: max })).toEqual([]);
    expect(validateStyle({ [field]: min - 0.001 })).toEqual(message);
    expect(validateStyle({ [field]: max + 0.001 })).toEqual(message);
    expect(validateStyle({ [field]: Number.NaN })).toEqual(message);
    expect(validateStyle({ [field]: Number.POSITIVE_INFINITY })).toEqual(message);
    expect(validateStyle({ [field]: String(max) })).toEqual(message);
    expect(validateStyle({ [field]: null })).toEqual(message);
  });

  it.each(['color', 'fillColor', 'textColor'])('rejects an empty or non-string %s', (field) => {
    const message = [styleIssue(`The style.${field} must be a non-empty string.`)];
    expect(validateStyle({ [field]: '' })).toEqual(message);
    expect(validateStyle({ [field]: 0xffffff })).toEqual(message);
    expect(validateStyle({ [field]: null })).toEqual(message);
  });

  it('accepts the three line styles only', () => {
    for (const lineStyle of LINE_STYLES) expect(validateStyle({ lineStyle })).toEqual([]);
    const message = [styleIssue('The style.lineStyle must be solid, dashed or dotted.')];
    expect(validateStyle({ lineStyle: 'dash-dot' })).toEqual(message);
    expect(validateStyle({ lineStyle: 'Solid' })).toEqual(message);
    expect(validateStyle({ lineStyle: 1 })).toEqual(message);
  });

  it('reports every unknown key, including inherited names', () => {
    expect(validateStyle({ dash: [4, 2], toString: 'x' })).toEqual([styleIssue('Unknown style key: dash.'), styleIssue('Unknown style key: toString.')]);
    expect(validateStyle({ opacity: undefined })).toEqual([styleIssue('Unknown style key: opacity.')]);
  });

  it('reports field issues in field order, then unknown keys', () => {
    expect(validateStyle({ shadow: 1, fontSize: 4, color: '', lineStyle: 'wavy' })).toEqual([
      styleIssue('The style.color must be a non-empty string.'),
      styleIssue('The style.lineStyle must be solid, dashed or dotted.'),
      styleIssue('The style.fontSize must be a number from 8 to 72.'),
      styleIssue('Unknown style key: shadow.'),
    ]);
  });
});
