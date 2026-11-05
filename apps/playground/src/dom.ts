import { toHostKey, toHostPointer, toWheelAction, type PointerFields } from './input';
import type { PlotHost } from './plot-host';

const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave'] as const;

/**
 * Sends the pointer events over `element` and the key events while it has focus to the host; the wheel zooms and scrolls it.
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
  const onWheel = (event: WheelEvent): void => {
    const action = toWheelAction(event, element.getBoundingClientRect(), host.pxPerBar);
    if (action === null) return;
    // The page does not scroll while the wheel works the chart.
    event.preventDefault();
    if (action.kind === 'zoom') host.zoom(action.factor, action.anchorX);
    else host.scroll(action.bars);
  };
  for (const type of POINTER_EVENTS) element.addEventListener(type, onPointer as EventListener);
  element.addEventListener('keydown', onKey);
  element.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    for (const type of POINTER_EVENTS) element.removeEventListener(type, onPointer as EventListener);
    element.removeEventListener('keydown', onKey);
    element.removeEventListener('wheel', onWheel);
  };
}
