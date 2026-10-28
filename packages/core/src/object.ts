/**
 * True for an object literal (or `Object.create(null)`), false for `null`, `undefined`, primitives,
 * arrays, dates, maps, functions and class instances (their prototype is not `Object.prototype`).
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || value === undefined) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** True when `key` is an own property of `object` (inherited names such as `toString` do not count). */
export function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/** A copy of `value` without the keys whose value is `undefined`, so a spread does not erase defaults. */
export function definedOnly<T extends object>(value: T | undefined): Partial<T> {
  const result: Record<string, unknown> = {};
  if (value !== undefined) {
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) result[key] = item;
    }
  }
  return result as Partial<T>;
}

/** Freezes `value` and every object below it; returns `value`. */
export function deepFreeze<T>(value: T): T {
  if (value instanceof Object) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
