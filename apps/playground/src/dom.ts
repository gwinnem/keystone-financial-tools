import { toHostKey, toHostPointer, type PointerFields } from './input';
import type { PlotHost } from './plot-host';

const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave'] as const;

/**
 * Sends the pointer events over `element` and the key events while it has focus to the host.
 * Returns the function that removes the listeners.
 */
export function bindInput(element: HTMLElement, host: PlotHost): () => void {
  const onPointer = (event: PointerEvent): void => {
    const hostEvent = toHostPointer(event as PointerFields, element.getBoundingClientRect());
    if (hostEvent === null) return;
    // Keeps the move and up events coming while a drag leaves the plot.
    if (event.type === 'pointerdown') element.setPointerCapture(event.pointerId);
    host.dispatchPointer(hostEvent);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (host.dispatchKey(toHostKey(event))) event.preventDefault();
  };
  for (const type of POINTER_EVENTS) element.addEventListener(type, onPointer as EventListener);
  element.addEventListener('keydown', onKey);
  return () => {
    for (const type of POINTER_EVENTS) element.removeEventListener(type, onPointer as EventListener);
    element.removeEventListener('keydown', onKey);
  };
}
