import type { HostKeyEvent, HostPointerEvent, Modifiers, PointerPhase, PointerType } from 'keystone-financial-tools-core';

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

/** A DOM key event as the host contract's key event. */
export function toHostKey(fields: KeyFields): HostKeyEvent {
  return { key: fields.key, shiftKey: fields.shiftKey, ctrlKey: fields.ctrlKey, altKey: fields.altKey, metaKey: fields.metaKey };
}
