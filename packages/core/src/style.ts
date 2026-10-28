import { hasOwn, isPlainObject } from './object';
import type { DrawingIssue, DrawingStyle, LineStyle } from './types';

/** The line styles a drawing can use. */
export const LINE_STYLES: readonly LineStyle[] = Object.freeze(['solid', 'dashed', 'dotted']);

/** Inclusive ranges of the numeric style fields. */
export const STYLE_LIMITS = Object.freeze({
  lineWidth: Object.freeze({ min: 1, max: 10 }),
  fillOpacity: Object.freeze({ min: 0, max: 1 }),
  fontSize: Object.freeze({ min: 8, max: 72 }),
});

interface FieldRule {
  readonly valid: (value: unknown) => boolean;
  readonly rule: string;
}

const COLOR: FieldRule = {
  valid: (value) => typeof value === 'string' && value !== '',
  rule: 'must be a non-empty string',
};

function between(limits: { readonly min: number; readonly max: number }): FieldRule {
  return {
    valid: (value) => typeof value === 'number' && value >= limits.min && value <= limits.max,
    rule: `must be a number from ${limits.min} to ${limits.max}`,
  };
}

/** One rule per style field, in the order issues are reported. */
const STYLE_RULES: Readonly<Record<keyof DrawingStyle, FieldRule>> = {
  color: COLOR,
  lineWidth: between(STYLE_LIMITS.lineWidth),
  lineStyle: { valid: (value) => (LINE_STYLES as readonly unknown[]).includes(value), rule: 'must be solid, dashed or dotted' },
  fillColor: COLOR,
  fillOpacity: between(STYLE_LIMITS.fillOpacity),
  textColor: COLOR,
  fontSize: between(STYLE_LIMITS.fontSize),
};

function styleIssue(message: string): DrawingIssue {
  return { code: 'KFT-E-STYLE', message };
}

/**
 * Lists what is wrong with a drawing style (`KFT-E-STYLE`); an empty list means it is valid. Fields
 * set to `undefined` count as absent. Field issues come first in field order, then one issue per
 * unknown key. Colors only need to be non-empty strings: the host checks CSS syntax.
 *
 * @example
 * ```ts
 * validateStyle({ lineWidth: 12, dash: true });
 * // [{ code: 'KFT-E-STYLE', message: 'The style.lineWidth must be a number from 1 to 10.' },
 * //  { code: 'KFT-E-STYLE', message: 'Unknown style key: dash.' }]
 * ```
 */
export function validateStyle(value: unknown): DrawingIssue[] {
  if (!isPlainObject(value)) return [styleIssue('The style must be a plain object.')];
  const issues: DrawingIssue[] = [];
  for (const [key, field] of Object.entries(STYLE_RULES)) {
    const item = value[key];
    if (item !== undefined && !field.valid(item)) issues.push(styleIssue(`The style.${key} ${field.rule}.`));
  }
  for (const key of Object.keys(value)) {
    if (!hasOwn(STYLE_RULES, key)) issues.push(styleIssue(`Unknown style key: ${key}.`));
  }
  return issues;
}
