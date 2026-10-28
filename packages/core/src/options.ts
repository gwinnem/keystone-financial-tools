import { deepFreeze, definedOnly, hasOwn, isPlainObject } from './object';
import type { DrawingIssue, DrawingKind, FibonacciLevel, KindOptions } from './types';

/** The most Fibonacci levels one drawing can have. */
export const MAX_LEVELS = 24;
/** The most values a time-zone sequence can have. */
export const MAX_SEQUENCE = 32;

function levels(visible: readonly number[], hidden: readonly number[] = []): readonly FibonacciLevel[] {
  return [...visible.map((ratio) => ({ ratio, visible: true })), ...hidden.map((ratio) => ({ ratio, visible: false }))];
}

/** Retracement levels: 0 to 1 visible, the extension levels 1.272 to 4.236 present but hidden. */
export const DEFAULT_RETRACEMENT_LEVELS: readonly FibonacciLevel[] = deepFreeze(levels([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1], [1.272, 1.618, 2.618, 4.236]));
/** Arcs and fans levels. */
export const DEFAULT_ARC_FAN_LEVELS: readonly FibonacciLevel[] = deepFreeze(levels([0.382, 0.5, 0.618]));
/** Time-zone bar multiples (Fibonacci numbers). */
export const DEFAULT_TIME_ZONE_SEQUENCE: readonly number[] = deepFreeze([0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]);

/** Every option a kind accepts, with its default. A kind without options has an empty object. */
const KIND_DEFAULTS: Readonly<Record<DrawingKind, KindOptions>> = deepFreeze<Record<DrawingKind, KindOptions>>({
  'trend-line': { extendLeft: false, extendRight: false },
  'horizontal-line': {},
  rectangle: {},
  'fibonacci-retracement': { levels: DEFAULT_RETRACEMENT_LEVELS, reverse: false, extendLeft: false, extendRight: false, showLabels: true, showPrices: true },
  'fibonacci-arcs': { levels: DEFAULT_ARC_FAN_LEVELS, fullCircles: false, showLabels: true },
  'fibonacci-fans': { levels: DEFAULT_ARC_FAN_LEVELS, showLabels: true },
  'fibonacci-time-zones': { sequence: DEFAULT_TIME_ZONE_SEQUENCE, showLabels: true },
  'text-note': {},
});

/** The option keys each kind accepts. */
export const KIND_OPTION_KEYS: Readonly<Record<DrawingKind, readonly (keyof KindOptions)[]>> = deepFreeze(
  Object.fromEntries(Object.entries(KIND_DEFAULTS).map(([kind, defaults]) => [kind, Object.keys(defaults)])) as Record<DrawingKind, (keyof KindOptions)[]>
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
  return KIND_DEFAULTS[kind];
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
  return { ...KIND_DEFAULTS[kind], ...definedOnly(options) };
}

function optionsIssue(message: string): DrawingIssue {
  return { code: 'KFT-E-OPTIONS', message };
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
  const allowed = KIND_DEFAULTS[kind];
  const issues: DrawingIssue[] = [];
  for (const [key, option] of Object.entries(value)) {
    if (option === undefined) continue;
    if (!hasOwn(allowed, key)) {
      issues.push(optionsIssue(`The option ${key} is not allowed on a ${kind}.`));
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
