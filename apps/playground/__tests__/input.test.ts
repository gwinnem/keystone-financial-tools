import { describe, expect, it } from 'vitest';
import { toHostKey, toHostPointer, type PointerFields } from '../src/input';

const NONE = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
const FIELDS: PointerFields = { type: 'pointerdown', clientX: 130, clientY: 90, pointerType: 'mouse', button: 0, ...NONE };
const ORIGIN = { left: 30, top: 40 };

describe('toHostPointer', () => {
  it('names the phase as the contract does', () => {
    const phases = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave'].map((type) => toHostPointer({ ...FIELDS, type }, ORIGIN)?.phase);
    expect(phases).toStrictEqual(['down', 'move', 'up', 'cancel', 'leave']);
  });

  it('returns null for an event the contract has no phase for', () => {
    expect(toHostPointer({ ...FIELDS, type: 'pointerenter' }, ORIGIN)).toBe(null);
    expect(toHostPointer({ ...FIELDS, type: 'constructor' }, ORIGIN)).toBe(null);
  });

  it('gives plot coordinates: the client position less where the plot starts', () => {
    const event = toHostPointer(FIELDS, ORIGIN);
    expect([event?.x, event?.y]).toStrictEqual([100, 50]);
  });

  it('keeps touch and pen, and takes anything else for a mouse', () => {
    const types = ['mouse', 'touch', 'pen', '', 'other'].map((pointerType) => toHostPointer({ ...FIELDS, pointerType }, ORIGIN)?.pointerType);
    expect(types).toStrictEqual(['mouse', 'touch', 'pen', 'mouse', 'mouse']);
  });

  it('keeps the button, and takes the -1 of a move for the primary button', () => {
    expect(toHostPointer({ ...FIELDS, button: 2 }, ORIGIN)?.button).toBe(2);
    expect(toHostPointer({ ...FIELDS, button: 0 }, ORIGIN)?.button).toBe(0);
    expect(toHostPointer({ ...FIELDS, button: -1 }, ORIGIN)?.button).toBe(0);
  });

  it('carries each modifier on its own', () => {
    expect(toHostPointer({ ...FIELDS, shiftKey: true }, ORIGIN)).toMatchObject({ shiftKey: true, ctrlKey: false, altKey: false, metaKey: false });
    expect(toHostPointer({ ...FIELDS, ctrlKey: true }, ORIGIN)).toMatchObject({ shiftKey: false, ctrlKey: true, altKey: false, metaKey: false });
    expect(toHostPointer({ ...FIELDS, altKey: true }, ORIGIN)).toMatchObject({ shiftKey: false, ctrlKey: false, altKey: true, metaKey: false });
    expect(toHostPointer({ ...FIELDS, metaKey: true }, ORIGIN)).toMatchObject({ shiftKey: false, ctrlKey: false, altKey: false, metaKey: true });
  });

  it('is exactly the contract event and nothing more', () => {
    expect(toHostPointer(FIELDS, ORIGIN)).toStrictEqual({ phase: 'down', x: 100, y: 50, pointerType: 'mouse', button: 0, ...NONE });
  });
});

describe('toHostKey', () => {
  it('keeps the key and each modifier', () => {
    expect(toHostKey({ key: 'Delete', shiftKey: true, ctrlKey: false, altKey: true, metaKey: false })).toStrictEqual({ key: 'Delete', shiftKey: true, ctrlKey: false, altKey: true, metaKey: false });
    expect(toHostKey({ key: 'z', shiftKey: false, ctrlKey: true, altKey: false, metaKey: true })).toStrictEqual({ key: 'z', shiftKey: false, ctrlKey: true, altKey: false, metaKey: true });
  });

  it('drops the other fields of a keyboard event', () => {
    const event = { key: 'a', code: 'KeyA', repeat: true, ...NONE };
    expect(toHostKey(event)).toStrictEqual({ key: 'a', ...NONE });
  });
});
