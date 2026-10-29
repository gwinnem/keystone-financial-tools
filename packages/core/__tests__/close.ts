import { expect } from 'vitest';

/**
 * Asserts that `actual` has the shape of `expected` with every number within `tolerance`. Object
 * keys must match exactly; strings, booleans and null must be equal. NaN never matches.
 */
export function expectClose(actual: unknown, expected: unknown, tolerance = 1e-9, path = '$'): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(tolerance);
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((item, index) => expectClose((actual as unknown[])[index], item, tolerance, `${path}[${index}]`));
  } else if (expected !== null && typeof expected === 'object') {
    expect(actual !== null && typeof actual === 'object', path).toBe(true);
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) expectClose((actual as Record<string, unknown>)[key], value, tolerance, `${path}.${key}`);
  } else {
    expect(actual, path).toBe(expected);
  }
}
