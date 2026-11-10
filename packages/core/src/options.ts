import { kindDefinition } from './kinds';
import { deepFreeze, definedOnly, hasOwn, isPlainObject } from './object';
import { BUILT_IN_DEFAULTS } from './option-defaults';
import type { DrawingIssue, DrawingKind, FibonacciLevel, KindOptions } from './types';

export { DEFAULT_ARC_FAN_LEVELS, DEFAULT_RETRACEMENT_LEVELS, DEFAULT_TIME_ZONE_SEQUENCE } from './option-defaults';

/** The most Fibonacci levels one drawing can have. */
export const MAX_LEVELS = 24;
/** The most values a time-zone sequence can have. */
export const MAX_SEQUENCE = 32;

/** The defaults of a registered kind; empty for a kind that is not registered. */
function defaultsOf(kind: DrawingKind): KindOptions {
  return kindDefinition(kind)?.defaults ?? {};
}

/** The option keys each of the eight kinds of 1.0 accepts. */
export const KIND_OPTION_KEYS: Readonly<Record<DrawingKind, readonly (keyof KindOptions)[]>> = deepFreeze(
  Object.fromEntries(Object.entries(BUILT_IN_DEFAULTS).map(([kind, defaults]) => [kind, Object.keys(defaults)])) as Record<DrawingKind, (keyof KindOptions)[]>
);

/**
 * Every option of a kind with its default value (frozen). Empty for kinds without options.
 *
 * @example
 * ```ts
 * defaultOptions('fibonacci-fans'); // { levels: [0.382, 0.5, 0.618 visible], showLabels: true }
 * ```
 */
export function defaultOptions(kind: DrawingKind): KindOptions {
  return defaultsOf(kind);
}

/**
 * The options a drawing is drawn with: its own values over the kind defaults. Values set to
 * `undefined` do not override. Assumes `options` passed `validateOptions`.
 *
 * @example
 * ```ts
 * resolveOptions('trend-line', { extendRight: true }); // { extendLeft: false, extendRight: true }
 * ```
 */
export function resolveOptions(kind: DrawingKind, options?: KindOptions): KindOptions {
  return { ...defaultsOf(kind), ...definedOnly(options) };
}

function optionsIssue(message: string): DrawingIssue {
  return { code: 'KFT-E-OPTIONS', message };
}

const inUnit = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

function validatePosition(value: unknown): DrawingIssue[] {
  if (isPlainObject(value) && Object.keys(value).length === 2 && inUnit(value.x) && inUnit(value.y)) return [];
  return [optionsIssue('The position must be an object with x and y, both between 0 and 1.')];
}

const LEVEL_KEYS: readonly string[] = ['ratio', 'visible', 'color'];

function isValidLevel(value: unknown): value is FibonacciLevel {
  return (
    isPlainObject(value) &&
    Number.isFinite(value.ratio) &&
    typeof value.visible === 'boolean' &&
    (value.color === undefined || (typeof value.color === 'string' && value.color !== '')) &&
    Object.keys(value).every((key) => LEVEL_KEYS.includes(key))
  );
}

function validateLevels(value: unknown): DrawingIssue[] {
  if (!Array.isArray(value) || value.length > MAX_LEVELS) {
    return [optionsIssue(`The option levels must be an array of at most ${MAX_LEVELS} levels.`)];
  }
  const issues: DrawingIssue[] = [];
  const seen = new Set<number>();
  value.forEach((level: unknown, index: number) => {
    if (!isValidLevel(level)) {
      issues.push(optionsIssue(`Level ${index} needs a finite ratio, a boolean visible flag and an optional non-empty color, and nothing else.`));
    } else if (seen.has(level.ratio)) {
      issues.push(optionsIssue(`Level ${index} repeats ratio ${level.ratio}.`));
    } else {
      seen.add(level.ratio);
    }
  });
  return issues;
}

function validateSequence(value: unknown): DrawingIssue[] {
  if (!Array.isArray(value) || value.length > MAX_SEQUENCE) {
    return [optionsIssue(`The option sequence must be an array of at most ${MAX_SEQUENCE} values.`)];
  }
  const issues: DrawingIssue[] = [];
  let previous = -1;
  value.forEach((step: unknown, index: number) => {
    if (Number.isInteger(step) && (step as number) > previous) {
      previous = step as number;
    } else {
      issues.push(optionsIssue(`Sequence value ${index} must be a non-negative integer above the value before it.`));
    }
  });
  return issues;
}

/**
 * Lists what is wrong with the options of a drawing of `kind` (`KFT-E-OPTIONS`); an empty list
 * means they are valid. Keys set to `undefined` count as absent. Keys are checked in input order.
 *
 * @example
 * ```ts
 * validateOptions('rectangle', { levels: [] });
 * // [{ code: 'KFT-E-OPTIONS', message: 'The option levels is not allowed on a rectangle.' }]
 * ```
 */
export function validateOptions(kind: DrawingKind, value: unknown): DrawingIssue[] {
  if (!isPlainObject(value)) return [optionsIssue('The options must be a plain object.')];
  const allowed = defaultsOf(kind);
  const issues: DrawingIssue[] = [];
  for (const [key, option] of Object.entries(value)) {
    if (option === undefined) continue;
    if (!hasOwn(allowed, key)) {
      issues.push(optionsIssue(`The option ${key} is not allowed on a ${kind}.`));
    } else if (key === 'position') {
      issues.push(...validatePosition(option));
    } else if (key === 'levels') {
      issues.push(...validateLevels(option));
    } else if (key === 'sequence') {
      issues.push(...validateSequence(option));
    } else if (typeof option !== 'boolean') {
      issues.push(optionsIssue(`The option ${key} must be a boolean.`));
    }
  }
  return issues;
}
