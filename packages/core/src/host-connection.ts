import { Disposables } from './disposables';
import { DrawingError } from './errors';
import type { DrawingHost, HostKeyEvent, HostPointerEvent } from './host';

/** What the tools do with the host's events. */
export interface HostHandlers {
  pointer(event: HostPointerEvent): void;
  /** Returns true only for keys the tools handled; the host then prevents the default action. */
  key(event: HostKeyEvent): boolean;
  viewport(): void;
}

function subscribe(subscriptions: Disposables, member: string, unsubscribe: unknown): void {
  if (typeof unsubscribe !== 'function') {
    subscriptions.dispose();
    throw new DrawingError([{ code: 'KFT-E-HOST', message: `host.${member} must return an unsubscribe function.` }]);
  }
  subscriptions.add(unsubscribe as () => void);
}

/**
 * Subscribes `handlers` to the host's pointer, key and viewport events, once each, and returns
 * the subscriptions: `dispose()` unsubscribes every one exactly once, even when one throws. A key
 * handler's result is passed to the host as a strict boolean. Throws `KFT-E-HOST` (after undoing the
 * subscriptions made so far) when a subscribe method does not return a function.
 *
 * @example
 * ```ts
 * const connection = connectHost(host, { pointer: onPointer, key: onKey, viewport: () => host.requestRender() });
 * // ...
 * connection.dispose();
 * ```
 */
export function connectHost(host: DrawingHost, handlers: HostHandlers): Disposables {
  const subscriptions = new Disposables();
  subscribe(
    subscriptions,
    'onPointer',
    host.onPointer((event) => handlers.pointer(event))
  );
  subscribe(
    subscriptions,
    'onKey',
    host.onKey((event) => handlers.key(event) === true)
  );
  subscribe(
    subscriptions,
    'onViewportChange',
    host.onViewportChange(() => handlers.viewport())
  );
  return subscriptions;
}
