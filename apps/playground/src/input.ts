import type { HostKeyEvent, HostPointerEvent, Modifiers, PointerPhase, PointerType } from 'keystone-financial-tools-core';
import { ZOOM_STEP } from './viewport';

/** The `PointerEvent` fields `toHostPointer` reads. */
export interface PointerFields extends Modifiers {
  /** `PointerEvent.type`. */
  readonly type: string;
  readonly clientX: number;
  readonly clientY: number;
  /** `PointerEvent.pointerType`. */
  readonly pointerType: string;
  /** `PointerEvent.button`; -1 while the pointer only moves. */
  readonly button: number;
}

/** The `KeyboardEvent` fields `toHostKey` reads. */
export interface KeyFields extends Modifiers {
  readonly key: string;
}

/** Where the plot area starts on the page (`getBoundingClientRect()` of the chart element). */
export interface PlotOrigin {
  readonly left: number;
  readonly top: number;
}

const PHASES: ReadonlyMap<string, PointerPhase> = new Map<string, PointerPhase>([
  ['pointerdown', 'down'],
  ['pointermove', 'move'],
  ['pointerup', 'up'],
  ['pointercancel', 'cancel'],
  ['pointerleave', 'leave'],
]);

const POINTER_TYPES: ReadonlySet<string> = new Set(['touch', 'pen']);

/**
 * A DOM pointer event as the host contract's pointer event: plot coordinates in CSS px, the
 * phase named as the contract names it. Returns null for an event type the contract has no phase for.
 *
 * @example
 * ```ts
 * element.addEventListener('pointerdown', (event) => {
 *   const hostEvent = toHostPointer(event, element.getBoundingClientRect());
 *   if (hostEvent !== null) host.dispatchPointer(hostEvent);
 * });
 * ```
 */
export function toHostPointer(fields: PointerFields, origin: PlotOrigin): HostPointerEvent | null {
  const phase = PHASES.get(fields.type);
  if (phase === undefined) return null;
  const pointerType = (POINTER_TYPES.has(fields.pointerType) ? fields.pointerType : 'mouse') as PointerType;
  return {
    phase,
    x: fields.clientX - origin.left,
    y: fields.clientY - origin.top,
    pointerType,
    button: Math.max(0, fields.button),
    shiftKey: fields.shiftKey,
    ctrlKey: fields.ctrlKey,
    altKey: fields.altKey,
    metaKey: fields.metaKey,
  };
}

/** The `WheelEvent` fields `toWheelAction` reads. */
export interface WheelFields {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly clientX: number;
  readonly shiftKey: boolean;
}

/** What a wheel turn does to the chart: zoom around a plot x, or scroll by bar slots. */
export type WheelAction = { readonly kind: 'zoom'; readonly factor: number; readonly anchorX: number } | { readonly kind: 'scroll'; readonly bars: number };

/**
 * A wheel turn as a chart action. Sideways movement (or Shift with the wheel) scrolls by the distance in bar slots;
 * the wheel alone zooms in (away from you) or out around the pointer. Null when the wheel did not move.
 *
 * @example
 * ```ts
 * element.addEventListener('wheel', (event) => {
 *   const action = toWheelAction(event, element.getBoundingClientRect(), host.pxPerBar);
 *   if (action?.kind === 'zoom') host.zoom(action.factor, action.anchorX);
 * });
 * ```
 */
export function toWheelAction(fields: WheelFields, origin: PlotOrigin, pxPerBar: number): WheelAction | null {
  const sideways = fields.deltaX !== 0 ? fields.deltaX : fields.shiftKey ? fields.deltaY : 0;
  if (sideways !== 0) return { kind: 'scroll', bars: sideways / pxPerBar };
  if (fields.deltaY === 0) return null;
  return { kind: 'zoom', factor: fields.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, anchorX: fields.clientX - origin.left };
}

/** A DOM key event as the host contract's key event. */
export function toHostKey(fields: KeyFields): HostKeyEvent {
  return { key: fields.key, shiftKey: fields.shiftKey, ctrlKey: fields.ctrlKey, altKey: fields.altKey, metaKey: fields.metaKey };
}
