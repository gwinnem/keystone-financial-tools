import { describe, expect, it } from 'vitest';
import { deepFreeze, definedOnly, hasOwn, isPlainObject } from '../src/object';

describe('isPlainObject', () => {
  it('accepts object literals and null-prototype objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it('rejects null, undefined, primitives, arrays and class instances', () => {
    for (const value of [null, undefined, 0, 'x', true, [], new Date(0), new Map(), () => 1, new (class Point {})()]) {
      expect(isPlainObject(value)).toBe(false);
    }
  });
});

describe('hasOwn', () => {
  it('sees own keys only', () => {
    expect(hasOwn({ a: undefined }, 'a')).toBe(true);
    expect(hasOwn({}, 'a')).toBe(false);
    expect(hasOwn({}, 'toString')).toBe(false);
  });
});

describe('definedOnly', () => {
  it('drops undefined values and copies the rest', () => {
    const source = { a: 1, b: undefined, c: null, d: false };
    const copy = definedOnly(source);
    expect(copy).toEqual({ a: 1, c: null, d: false });
    expect(copy).not.toHaveProperty('b');
    expect(copy).not.toBe(source);
  });

  it('returns an empty object for undefined', () => {
    expect(definedOnly(undefined)).toEqual({});
  });
});

describe('deepFreeze', () => {
  it('freezes the value and every nested object and array', () => {
    const value = { a: { b: [{ c: 1 }] }, d: 'x' };
    expect(deepFreeze(value)).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.a)).toBe(true);
    expect(Object.isFrozen(value.a.b)).toBe(true);
    expect(Object.isFrozen(value.a.b[0])).toBe(true);
  });

  it('returns primitives unchanged', () => {
    expect(deepFreeze('x')).toBe('x');
    expect(deepFreeze(3)).toBe(3);
    expect(deepFreeze(null)).toBeNull();
  });
});
