import { describe, expect, it } from 'vitest';
import { DrawingError } from '../src/errors';
import { HOST_API_VERSION } from '../src/host';
import { assertHost, REQUIRED_HOST_MEMBERS, validateHost } from '../src/host-check';
import { fakeHost } from './host-fixture';

const ALL = 'timeToX, xToTime, priceToY, yToPrice, yAxisAt, paneRect, nearestBar, barInterval, onPointer, onKey, onViewportChange, setCursor, requestRender';

describe('REQUIRED_HOST_MEMBERS', () => {
  it('lists the required members of contract version 2', () => {
    expect(HOST_API_VERSION).toBe(2);
    expect(REQUIRED_HOST_MEMBERS.join(', ')).toBe(ALL);
    expect(Object.isFrozen(REQUIRED_HOST_MEMBERS)).toBe(true);
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
    expect(validateHost({ ...fakeHost(), apiVersion: 1 })).toEqual([{ code: 'KFT-E-HOST', message: 'The host apiVersion must be 2, got 1.' }]);
    expect(validateHost({ ...fakeHost(), apiVersion: '2' })).toEqual([{ code: 'KFT-E-HOST', message: 'The host apiVersion must be 2, got 2.' }]);
  });

  it.each(REQUIRED_HOST_MEMBERS)('names a missing or non-function %s', (member) => {
    const issue = [{ code: 'KFT-E-HOST', message: `The host is missing these functions: ${member}.` }];
    expect(validateHost({ ...fakeHost(), [member]: undefined })).toEqual(issue);
    expect(validateHost({ ...fakeHost(), [member]: 1 })).toEqual(issue);
  });

  it('lists every missing member in one issue, after the version issue', () => {
    expect(validateHost({})).toEqual([
      { code: 'KFT-E-HOST', message: 'The host apiVersion must be 2, got undefined.' },
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
      assertHost({ ...fakeHost(), apiVersion: 3 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DrawingError);
    expect((caught as DrawingError).issues).toEqual([{ code: 'KFT-E-HOST', message: 'The host apiVersion must be 2, got 3.' }]);
  });
});
