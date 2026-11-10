import { DrawingError } from './errors';
import { HOST_API_VERSION, MIN_HOST_API_VERSION, type DrawingHost } from './host';
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

/** The members a version 3 host has in addition: version 2 hosts are not asked for them. */
export const REQUIRED_HOST_MEMBERS_V3: readonly (keyof DrawingHost)[] = Object.freeze(['paneIds', 'barsBetween'] as const);

/**
 * Lists what is wrong with a host (`KFT-E-HOST`); an empty list means it satisfies contract version 2 or 3.
 * The api version is checked first (2 or 3), then every required member in one issue that names the
 * missing ones: a version 3 host also needs `paneIds` and `barsBetween`. `editText` and `volumeBetween`
 * are optional, but must be functions when present; `paneIds` and `barsBetween` too, on a version 2 host.
 *
 * @example
 * ```ts
 * validateHost({ apiVersion: 1 });
 * // [{ code: 'KFT-E-HOST', message: 'The host apiVersion must be 2 or 3, got 1.' },
 * //  { code: 'KFT-E-HOST', message: 'The host is missing these functions: timeToX, xToTime, ...' }]
 * ```
 */
export function validateHost(value: unknown): DrawingIssue[] {
  if (typeof value !== 'object' || value === null) return [hostIssue('The host must be an object.')];
  const host = value as Record<string, unknown>;
  const issues: DrawingIssue[] = [];
  if (host.apiVersion !== MIN_HOST_API_VERSION && host.apiVersion !== HOST_API_VERSION) {
    issues.push(hostIssue(`The host apiVersion must be ${MIN_HOST_API_VERSION} or ${HOST_API_VERSION}, got ${String(host.apiVersion)}.`));
  }
  const missing = REQUIRED_HOST_MEMBERS.filter((name) => typeof host[name] !== 'function');
  const version3 = host.apiVersion === HOST_API_VERSION;
  for (const name of REQUIRED_HOST_MEMBERS_V3) {
    if (version3 ? typeof host[name] !== 'function' : host[name] !== undefined && typeof host[name] !== 'function') missing.push(name);
  }
  for (const name of ['volumeBetween', 'editText'] as const) {
    if (host[name] !== undefined && typeof host[name] !== 'function') missing.push(name);
  }
  if (missing.length > 0) issues.push(hostIssue(`The host is missing these functions: ${missing.join(', ')}.`));
  return issues;
}

/**
 * Throws `DrawingError` with the `validateHost` issues unless `value` satisfies host contract
 * version 3 (or 2). Called once when the tools are created, never per event.
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
