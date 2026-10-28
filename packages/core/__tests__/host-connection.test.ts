import { describe, expect, it, vi } from 'vitest';
import { DrawingError } from '../src/errors';
import type { HostKeyEvent } from '../src/host';
import { connectHost } from '../src/host-connection';
import { fakeHost, NO_MODIFIERS } from './host-fixture';

function handlers(keyResult: unknown = true) {
  return { pointer: vi.fn(), key: vi.fn((_event: HostKeyEvent) => keyResult as boolean), viewport: vi.fn() };
}

const pointerEvent = { phase: 'down', x: 1, y: 2, pointerType: 'mouse', button: 0, ...NO_MODIFIERS } as const;
const keyEvent = { key: 'Delete', ...NO_MODIFIERS } as const;

describe('connectHost (FR-HOST-004, FR-HOST-005, FR-INT-060)', () => {
  it('subscribes to pointer, key and viewport events once each and forwards them', () => {
    const host = fakeHost();
    const on = handlers();
    connectHost(host, on);
    expect(host.onPointer).toHaveBeenCalledTimes(1);
    expect(host.onKey).toHaveBeenCalledTimes(1);
    expect(host.onViewportChange).toHaveBeenCalledTimes(1);
    host.pointerListeners[0](pointerEvent);
    host.viewportListeners[0]();
    expect(on.pointer).toHaveBeenCalledWith(pointerEvent);
    expect(on.viewport).toHaveBeenCalledTimes(1);
    expect(host.keyListeners[0](keyEvent)).toBe(true);
    expect(on.key).toHaveBeenCalledWith(keyEvent);
  });

  it('tells the host a key was handled only when the handler returns exactly true', () => {
    for (const [result, handled] of [
      [true, true],
      [false, false],
      [1, false],
      ['yes', false],
      [undefined, false],
    ] as const) {
      const host = fakeHost();
      // Built inline: handlers(undefined) would fall back to its default of true.
      connectHost(host, { pointer: vi.fn(), key: () => result as unknown as boolean, viewport: vi.fn() });
      expect(host.keyListeners[0](keyEvent)).toBe(handled);
    }
  });

  it('unsubscribes every listener once on dispose', () => {
    const host = fakeHost();
    const connection = connectHost(host, handlers());
    expect(connection.dispose()).toEqual([]);
    expect(host.pointerListeners).toEqual([]);
    expect(host.keyListeners).toEqual([]);
    expect(host.viewportListeners).toEqual([]);
    connection.dispose();
    expect(connection.disposed).toBe(true);
  });

  it('still unsubscribes the others when one unsubscribe throws, and returns the error', () => {
    const host = fakeHost();
    const failure = new Error('host unsubscribe failed');
    const unsubscribePointer = vi.fn();
    host.onPointer = vi.fn(() => unsubscribePointer);
    host.onKey = vi.fn(() => () => {
      throw failure;
    });
    const unsubscribeViewport = vi.fn();
    host.onViewportChange = vi.fn(() => unsubscribeViewport);
    expect(connectHost(host, handlers()).dispose()).toEqual([failure]);
    expect(unsubscribePointer).toHaveBeenCalledTimes(1);
    expect(unsubscribeViewport).toHaveBeenCalledTimes(1);
  });

  it.each(['onPointer', 'onKey', 'onViewportChange'] as const)('throws KFT-E-HOST and undoes earlier subscriptions when %s returns no function', (member) => {
    const host = fakeHost();
    host[member] = vi.fn(() => undefined as unknown as () => void);
    let caught: unknown;
    try {
      connectHost(host, handlers());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DrawingError);
    expect((caught as DrawingError).issues).toEqual([{ code: 'KFT-E-HOST', message: `host.${member} must return an unsubscribe function.` }]);
    expect(host.pointerListeners).toEqual([]);
    expect(host.keyListeners).toEqual([]);
    expect(host.viewportListeners).toEqual([]);
  });
});
