import { describe, expect, it } from 'vitest';
import { DrawingError } from '../src/errors';
import { HOST_API_VERSION, MIN_HOST_API_VERSION } from '../src/host';
import { assertHost, REQUIRED_HOST_MEMBERS, REQUIRED_HOST_MEMBERS_V3, validateHost } from '../src/host-check';
import { fakeHost } from './host-fixture';

const ALL = 'timeToX, xToTime, priceToY, yToPrice, yAxisAt, paneRect, nearestBar, barInterval, onPointer, onKey, onViewportChange, setCursor, requestRender';
const V3 = { paneIds: () => ['price'], barsBetween: () => 0 };
const host3 = (): Record<string, unknown> => ({ ...fakeHost(), apiVersion: 3, ...V3 });

describe('REQUIRED_HOST_MEMBERS', () => {
  it('lists the required members of contract version 2', () => {
    expect(HOST_API_VERSION).toBe(3);
    expect(MIN_HOST_API_VERSION).toBe(2);
    expect(REQUIRED_HOST_MEMBERS.join(', ')).toBe(ALL);
    expect(Object.isFrozen(REQUIRED_HOST_MEMBERS)).toBe(true);
  });

  it('lists what version 3 adds', () => {
    expect(REQUIRED_HOST_MEMBERS_V3.join(', ')).toBe('paneIds, barsBetween');
    expect(Object.isFrozen(REQUIRED_HOST_MEMBERS_V3)).toBe(true);
  });
});

describe('validateHost (FR-HOST-001)', () => {
  it('accepts a complete version 2 host, with or without editText', () => {
    expect(validateHost(fakeHost())).toEqual([]);
    expect(validateHost({ ...fakeHost(), editText: async () => null })).toEqual([]);
  });

  it('rejects a value that is not an object', () => {
    for (const value of [null, undefined, 2, 'host']) {
      expect(validateHost(value)).toEqual([{ code: 'KFT-E-HOST', message: 'The host must be an object.' }]);
    }
  });

  it('rejects another api version', () => {
    expect(validateHost({ ...fakeHost(), apiVersion: 1 })).toEqual([{ code: 'KFT-E-HOST', message: 'The host apiVersion must be 2 or 3, got 1.' }]);
    expect(validateHost({ ...fakeHost(), apiVersion: '2' })).toEqual([{ code: 'KFT-E-HOST', message: 'The host apiVersion must be 2 or 3, got 2.' }]);
    expect(validateHost({ ...fakeHost(), apiVersion: 4 })).toEqual([{ code: 'KFT-E-HOST', message: 'The host apiVersion must be 2 or 3, got 4.' }]);
  });

  it('accepts a version 3 host, with or without volumeBetween', () => {
    expect(validateHost(host3())).toEqual([]);
    expect(validateHost({ ...host3(), volumeBetween: () => null })).toEqual([]);
  });

  it('keeps accepting a version 2 host, which has none of the version 3 members', () => {
    expect(validateHost({ ...fakeHost(), apiVersion: 2 })).toEqual([]);
    expect(validateHost({ ...fakeHost(), apiVersion: 2, ...V3, volumeBetween: () => 0 })).toEqual([]);
  });

  it.each(REQUIRED_HOST_MEMBERS_V3)('names a version 3 host that lacks %s', (member) => {
    const issue = [{ code: 'KFT-E-HOST', message: `The host is missing these functions: ${member}.` }];
    expect(validateHost({ ...host3(), [member]: undefined })).toEqual(issue);
    expect(validateHost({ ...host3(), [member]: 1 })).toEqual(issue);
  });

  it.each(['paneIds', 'barsBetween', 'volumeBetween'])('rejects a %s that is not a function, on a version 2 host too', (member) => {
    expect(validateHost({ ...fakeHost(), apiVersion: 2, [member]: 'x' })).toEqual([{ code: 'KFT-E-HOST', message: `The host is missing these functions: ${member}.` }]);
  });

  it('lists the version 3 members after the version 2 ones, then volumeBetween and editText', () => {
    expect(validateHost({ ...host3(), setCursor: null, paneIds: null, volumeBetween: 1, editText: 1 })).toEqual([
      { code: 'KFT-E-HOST', message: 'The host is missing these functions: setCursor, paneIds, volumeBetween, editText.' },
    ]);
  });

  it.each(REQUIRED_HOST_MEMBERS)('names a missing or non-function %s', (member) => {
    const issue = [{ code: 'KFT-E-HOST', message: `The host is missing these functions: ${member}.` }];
    expect(validateHost({ ...fakeHost(), [member]: undefined })).toEqual(issue);
    expect(validateHost({ ...fakeHost(), [member]: 1 })).toEqual(issue);
  });

  it('lists every missing member in one issue, after the version issue', () => {
    expect(validateHost({})).toEqual([
      { code: 'KFT-E-HOST', message: 'The host apiVersion must be 2 or 3, got undefined.' },
      { code: 'KFT-E-HOST', message: `The host is missing these functions: ${ALL}.` },
    ]);
  });

  it('rejects an editText that is not a function', () => {
    expect(validateHost({ ...fakeHost(), editText: 'inline', setCursor: null })).toEqual([{ code: 'KFT-E-HOST', message: 'The host is missing these functions: setCursor, editText.' }]);
  });

  it('only reads the members, without calling them', () => {
    const host = fakeHost();
    validateHost(host);
    expect(host.onPointer).not.toHaveBeenCalled();
    expect(host.timeToX).not.toHaveBeenCalled();
  });
});

describe('assertHost', () => {
  it('passes a valid host and throws DrawingError with the issues otherwise', () => {
    expect(() => assertHost(fakeHost())).not.toThrow();
    let caught: unknown;
    try {
      assertHost({ ...fakeHost(), apiVersion: 4 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DrawingError);
    expect((caught as DrawingError).issues).toEqual([{ code: 'KFT-E-HOST', message: 'The host apiVersion must be 2 or 3, got 4.' }]);
  });

  it('passes a version 3 host', () => {
    expect(() => assertHost(host3())).not.toThrow();
  });
});
