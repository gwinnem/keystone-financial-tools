import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId, createIdGenerator } from '../src/ids';
import { validateDrawing } from '../src/validate';
import { horizontalLine } from './fixtures';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FALLBACK = /^[0-9a-z]+-[0-9a-z]+-[0-9a-z]{7}$/;

function uniqueCount(next: () => string, count: number): number {
  const ids = new Set<string>();
  for (let i = 0; i < count; i++) ids.add(next());
  return ids.size;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createIdGenerator', () => {
  it('uses the injected randomUUID', () => {
    const next = createIdGenerator({ randomUUID: () => 'u-1' });
    expect(next()).toBe('u-1');
  });

  it('uses crypto.randomUUID by default, looked up on every call', () => {
    const next = createIdGenerator();
    expect(next()).toMatch(UUID);
    vi.stubGlobal('crypto', { randomUUID: () => '1-2-3-4-5' });
    expect(next()).toBe('1-2-3-4-5');
  });

  it('calls crypto.randomUUID with crypto as this', () => {
    vi.stubGlobal('crypto', {
      prefix: 'bound',
      randomUUID(this: { prefix: string }): string {
        return `${this.prefix}-id`;
      },
    });
    expect(createIdGenerator()()).toBe('bound-id');
  });

  it('falls back when the runtime has no crypto or no randomUUID', () => {
    vi.stubGlobal('crypto', undefined);
    expect(createIdGenerator({ now: () => 35, random: () => 0 })()).toBe('z-0-0000000');
    vi.stubGlobal('crypto', {});
    expect(createIdGenerator({ now: () => 36, random: () => 0 })()).toBe('10-0-0000000');
  });

  it('builds fallback ids from time, counter and a 7-digit random suffix', () => {
    const next = createIdGenerator({ randomUUID: null, now: () => 1_700_000_000_000, random: () => 0.5 });
    expect(next()).toBe('loyw3v28-0-0zik0zk');
    expect(next()).toBe('loyw3v28-1-0zik0zk');
    expect(next()).toBe('loyw3v28-2-0zik0zk');
  });

  it('keeps the largest suffix within seven digits', () => {
    const next = createIdGenerator({ randomUUID: null, now: () => 0, random: () => 1 - Number.EPSILON });
    expect(next()).toBe('0-0-1z141z3');
  });

  it('gives every generator its own counter', () => {
    const source = { randomUUID: null, now: (): number => 0, random: (): number => 0 };
    const a = createIdGenerator(source);
    const b = createIdGenerator(source);
    expect(a()).toBe('0-0-0000000');
    expect(a()).toBe('0-1-0000000');
    expect(b()).toBe('0-0-0000000');
  });

  it('uses Date.now and Math.random when the fallback has no injected sources', () => {
    vi.spyOn(Date, 'now').mockReturnValue(71);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(createIdGenerator({ randomUUID: null })()).toBe('1z-0-0000000');
  });

  it('returns 10,000 unique ids in a tight loop in both modes', () => {
    expect(uniqueCount(createIdGenerator(), 10_000)).toBe(10_000);
    expect(uniqueCount(createIdGenerator({ randomUUID: null }), 10_000)).toBe(10_000);
  });

  it('returns 10,000 unique fallback ids even with a frozen clock and a constant random source', () => {
    expect(uniqueCount(createIdGenerator({ randomUUID: null, now: () => 5, random: () => 0.25 }), 10_000)).toBe(10_000);
  });
});

describe('createId', () => {
  it('returns a UUID when crypto.randomUUID exists', () => {
    expect(createId()).toMatch(UUID);
  });

  it('returns a fallback id without crypto', () => {
    vi.stubGlobal('crypto', undefined);
    expect(createId()).toMatch(FALLBACK);
  });

  it('returns ids that validateDrawing accepts', () => {
    expect(validateDrawing({ ...horizontalLine(), id: createId() })).toEqual([]);
    vi.stubGlobal('crypto', undefined);
    expect(validateDrawing({ ...horizontalLine(), id: createId() })).toEqual([]);
  });
});
