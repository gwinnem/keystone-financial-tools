import { DrawingError } from './errors';
import { HOST_API_VERSION, type DrawingHost } from './host';
import type { DrawingIssue } from './types';

/** The members every host must have, all functions. */
export const REQUIRED_HOST_MEMBERS: readonly (keyof DrawingHost)[] = Object.freeze([
  'timeToX',
  'xToTime',
  'priceToY',
  'yToPrice',
  'yAxisAt',
  'paneRect',
  'nearestBar',
  'barInterval',
  'onPointer',
  'onKey',
  'onViewportChange',
  'setCursor',
  'requestRender',
] as const);

function hostIssue(message: string): DrawingIssue {
  return { code: 'KFT-E-HOST', message };
}

/**
 * Lists what is wrong with a host (`KFT-E-HOST`); an empty list means it satisfies contract version 2.
 * The api version is checked first, then every required member in one issue that names the missing
 * ones. `editText` is optional, but must be a function when present.
 *
 * @example
 * ```ts
 * validateHost({ apiVersion: 1 });
 * // [{ code: 'KFT-E-HOST', message: 'The host apiVersion must be 2, got 1.' },
 * //  { code: 'KFT-E-HOST', message: 'The host is missing these functions: timeToX, xToTime, ...' }]
 * ```
 */
export function validateHost(value: unknown): DrawingIssue[] {
  if (typeof value !== 'object' || value === null) return [hostIssue('The host must be an object.')];
  const host = value as Record<string, unknown>;
  const issues: DrawingIssue[] = [];
  if (host.apiVersion !== HOST_API_VERSION) {
    issues.push(hostIssue(`The host apiVersion must be ${HOST_API_VERSION}, got ${String(host.apiVersion)}.`));
  }
  const missing = REQUIRED_HOST_MEMBERS.filter((name) => typeof host[name] !== 'function');
  if (host.editText !== undefined && typeof host.editText !== 'function') missing.push('editText');
  if (missing.length > 0) issues.push(hostIssue(`The host is missing these functions: ${missing.join(', ')}.`));
  return issues;
}

/**
 * Throws `DrawingError` with the `validateHost` issues unless `value` satisfies host contract
 * version 2. Called once when the tools are created, never per event.
 *
 * @example
 * ```ts
 * assertHost(host); // host is a DrawingHost from here on
 * ```
 */
export function assertHost(value: unknown): asserts value is DrawingHost {
  const issues = validateHost(value);
  if (issues.length > 0) throw new DrawingError(issues);
}
