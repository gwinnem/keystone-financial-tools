import type { HostPointerEvent, Modifiers, Point, PointerType } from '../host';

/** Thresholds of `GestureRecogniser` (FR-INT-002). */
export interface GestureOptions {
  /** A press that moves more than this many CSS px is a drag, one that stays within it can be a click. Default 3. */
  readonly moveThreshold?: number;
  /** Longest press (ms) that is still a click. Default 300. */
  readonly clickMs?: number;
  /** Longest time (ms) between two clicks of a double-click. Default 400. */
  readonly doubleClickMs?: number;
  /** Furthest distance (CSS px) between two clicks of a double-click. Default 6. */
  readonly doubleClickPx?: number;
  /** The clock in ms; inject one in tests. Default `Date.now`. */
  readonly now?: () => number;
}

/** What every gesture that has a pointer position carries. */
export interface GestureBase extends Modifiers {
  /** Where the pointer is, in plot coordinates. */
  readonly point: Point;
  readonly button: number;
  readonly pointerType: PointerType;
}

/**
 * What the recogniser makes of raw pointer events:
 * - `move`: the pointer moved with nothing pressed (hover).
 * - `click`: down and up within the click time and distance.
 * - `double-click`: a click that completes a double-click; it comes after its `click`.
 * - `drag-start`: a press moved beyond the threshold; `origin` is where it went down, `point` the current position.
 * - `drag`, `drag-end`: the pointer moves and is released after a `drag-start`.
 * - `cancel`: the pointer was taken away during a drag (cancel or leave): revert like Escape.
 * - `leave`: the pointer left the plot area.
 */
export type Gesture =
  | (GestureBase & { readonly type: 'move' })
  | (GestureBase & { readonly type: 'click' })
  | (GestureBase & { readonly type: 'double-click' })
  | (GestureBase & { readonly type: 'drag-start'; readonly origin: Point })
  | (GestureBase & { readonly type: 'drag' })
  | (GestureBase & { readonly type: 'drag-end' })
  | { readonly type: 'cancel' }
  | { readonly type: 'leave' };

interface Press {
  readonly origin: Point;
  readonly at: number;
  readonly button: number;
  dragging: boolean;
}

interface LastClick {
  readonly point: Point;
  readonly at: number;
  readonly button: number;
}

function base(event: HostPointerEvent): GestureBase {
  return {
    point: { x: event.x, y: event.y },
    button: event.button,
    pointerType: event.pointerType,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  };
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Turns host pointer events into gestures (FR-INT-002), so a hand tremor does not turn a click into
 * a drag. A press is a click when it is released within `moveThreshold` (3 px) and `clickMs` (300 ms);
 * moving further starts a drag; a press held longer without moving is neither. Two clicks within
 * `doubleClickMs` (400 ms) and `doubleClickPx` (6 px) of each other, with the same button, make a
 * double-click (a third click starts again). While one button is pressed, other buttons are ignored.
 *
 * @example
 * ```ts
 * const recogniser = new GestureRecogniser();
 * host.onPointer((event) => {
 *   for (const gesture of recogniser.handle(event)) route(gesture);
 * });
 * ```
 */
export class GestureRecogniser {
  private readonly moveThreshold: number;
  private readonly clickMs: number;
  private readonly doubleClickMs: number;
  private readonly doubleClickPx: number;
  private readonly now: () => number;
  private press: Press | null = null;
  private lastClick: LastClick | null = null;

  constructor(options: GestureOptions = {}) {
    this.moveThreshold = options.moveThreshold ?? 3;
    this.clickMs = options.clickMs ?? 300;
    this.doubleClickMs = options.doubleClickMs ?? 400;
    this.doubleClickPx = options.doubleClickPx ?? 6;
    this.now = options.now ?? Date.now;
  }

  /** The gestures one pointer event makes: none, one, or two (a click and its double-click). */
  handle(event: HostPointerEvent): Gesture[] {
    switch (event.phase) {
      case 'down':
        return this.down(event);
      case 'move':
        return this.move(event);
      case 'up':
        return this.up(event);
      case 'cancel':
        return this.cancel();
      case 'leave':
        return [...this.cancel(), { type: 'leave' }];
    }
  }

  /** Forgets a press in progress and the last click. */
  reset(): void {
    this.press = null;
    this.lastClick = null;
  }

  private down(event: HostPointerEvent): Gesture[] {
    if (this.press === null || this.press.button === event.button) {
      this.press = { origin: { x: event.x, y: event.y }, at: this.now(), button: event.button, dragging: false };
    }
    return [];
  }

  private move(event: HostPointerEvent): Gesture[] {
    const press = this.press;
    if (press === null) return [{ type: 'move', ...base(event) }];
    if (press.dragging) return [{ type: 'drag', ...base(event) }];
    if (distance(press.origin, { x: event.x, y: event.y }) > this.moveThreshold) {
      press.dragging = true;
      return [{ type: 'drag-start', origin: press.origin, ...base(event) }];
    }
    return [];
  }

  private up(event: HostPointerEvent): Gesture[] {
    const press = this.press;
    if (press === null || press.button !== event.button) return [];
    this.press = null;
    if (press.dragging) {
      this.lastClick = null;
      return [{ type: 'drag-end', ...base(event) }];
    }
    const point = { x: event.x, y: event.y };
    const at = this.now();
    if (at - press.at > this.clickMs || distance(press.origin, point) > this.moveThreshold) return [];
    const click: Gesture = { type: 'click', ...base(event) };
    const last = this.lastClick;
    if (last !== null && last.button === event.button && at - last.at <= this.doubleClickMs && distance(last.point, point) <= this.doubleClickPx) {
      this.lastClick = null;
      return [click, { type: 'double-click', ...base(event) }];
    }
    this.lastClick = { point, at, button: event.button };
    return [click];
  }

  private cancel(): Gesture[] {
    const dragging = this.press?.dragging === true;
    this.press = null;
    return dragging ? [{ type: 'cancel' }] : [];
  }
}
