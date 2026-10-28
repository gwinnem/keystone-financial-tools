import { vi } from 'vitest';
import type { DrawingHost, HostKeyEvent, HostPointerEvent } from '../src/host';

/** A minimal host whose members are spies; the listeners it was given can be called directly. */
export interface FakeHost extends DrawingHost {
  readonly pointerListeners: ((event: HostPointerEvent) => void)[];
  readonly keyListeners: ((event: HostKeyEvent) => boolean)[];
  readonly viewportListeners: (() => void)[];
}

export function fakeHost(): FakeHost {
  const pointerListeners: ((event: HostPointerEvent) => void)[] = [];
  const keyListeners: ((event: HostKeyEvent) => boolean)[] = [];
  const viewportListeners: (() => void)[] = [];
  const remover =
    <T>(list: T[], item: T): (() => void) =>
    () => {
      list.splice(list.indexOf(item), 1);
    };
  return {
    apiVersion: 2,
    pointerListeners,
    keyListeners,
    viewportListeners,
    timeToX: vi.fn((time: number) => time),
    xToTime: vi.fn((x: number) => x),
    priceToY: vi.fn((price: number) => price),
    yToPrice: vi.fn((y: number) => y),
    yAxisAt: vi.fn(() => 'price'),
    paneRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
    nearestBar: vi.fn(() => null),
    barInterval: vi.fn(() => 60_000),
    onPointer: vi.fn((listener: (event: HostPointerEvent) => void) => {
      pointerListeners.push(listener);
      return remover(pointerListeners, listener);
    }),
    onKey: vi.fn((listener: (event: HostKeyEvent) => boolean) => {
      keyListeners.push(listener);
      return remover(keyListeners, listener);
    }),
    onViewportChange: vi.fn((listener: () => void) => {
      viewportListeners.push(listener);
      return remover(viewportListeners, listener);
    }),
    setCursor: vi.fn(),
    requestRender: vi.fn(),
  };
}

export const NO_MODIFIERS = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false } as const;
