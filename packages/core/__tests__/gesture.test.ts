import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostPointerEvent, PointerPhase } from '../src/host';
import { GestureRecogniser, type Gesture, type GestureOptions } from '../src/interaction/gesture';

const ev = (phase: PointerPhase, x: number, y: number, extra: Partial<HostPointerEvent> = {}): HostPointerEvent => ({
  phase,
  x,
  y,
  pointerType: 'mouse',
  button: 0,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...extra,
});

function setup(options: GestureOptions = {}) {
  const clock = { t: 0 };
  const recogniser = new GestureRecogniser({ now: () => clock.t, ...options });
  const send = (event: HostPointerEvent, at?: number): Gesture[] => {
    if (at !== undefined) clock.t = at;
    return recogniser.handle(event);
  };
  return { recogniser, clock, send };
}

const types = (gestures: readonly Gesture[]): string[] => gestures.map((gesture) => gesture.type);

afterEach(() => {
  vi.useRealTimers();
});

describe('click (FR-INT-002)', () => {
  it('is a down and up in place within 300 ms', () => {
    const { send } = setup();
    expect(send(ev('down', 10, 20), 0)).toEqual([]);
    const gestures = send(ev('up', 10, 20), 300);
    expect(gestures).toEqual([{ type: 'click', point: { x: 10, y: 20 }, button: 0, pointerType: 'mouse', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }]);
  });

  it('is not a click when held longer than 300 ms, and is nothing at all', () => {
    const { send } = setup();
    send(ev('down', 10, 20), 0);
    expect(send(ev('up', 10, 20), 301)).toEqual([]);
    expect(send(ev('up', 10, 20), 302)).toEqual([]);
  });

  it('stays a click with a tremor of exactly 3 px, and becomes a drag beyond', () => {
    const a = setup();
    a.send(ev('down', 0, 0), 0);
    expect(a.send(ev('move', 3, 0), 10)).toEqual([]);
    expect(types(a.send(ev('up', 3, 0), 20))).toEqual(['click']);
    const b = setup();
    b.send(ev('down', 0, 0), 0);
    expect(types(b.send(ev('move', 0, 3.01), 10))).toEqual(['drag-start']);
  });

  it('measures the tremor as a straight distance, not per axis', () => {
    const { send } = setup();
    send(ev('down', 0, 0), 0);
    expect(types(send(ev('move', 2.2, 2.2), 1))).toEqual(['drag-start']);
  });

  it('is not a click when released far away without any move event', () => {
    const { send } = setup();
    send(ev('down', 0, 0), 0);
    expect(send(ev('up', 3.5, 0), 10)).toEqual([]);
    send(ev('down', 0, 0), 20);
    expect(types(send(ev('up', 3, 0), 30))).toEqual(['click']);
  });

  it('passes the position, button, pointer type and every modifier of the up event', () => {
    const { send } = setup();
    send(ev('down', 5, 6, { button: 2 }), 0);
    const [click] = send(ev('up', 5, 6, { button: 2, pointerType: 'touch', shiftKey: true, ctrlKey: false, altKey: true, metaKey: false }), 10);
    expect(click).toEqual({ type: 'click', point: { x: 5, y: 6 }, button: 2, pointerType: 'touch', shiftKey: true, ctrlKey: false, altKey: true, metaKey: false });
    send(ev('down', 5, 6), 20);
    const [other] = send(ev('up', 5, 6, { ctrlKey: true, metaKey: true }), 30);
    expect(other).toMatchObject({ shiftKey: false, ctrlKey: true, altKey: false, metaKey: true });
  });

  it('ignores an up without a down', () => {
    expect(setup().send(ev('up', 1, 1))).toEqual([]);
  });

  it('uses the thresholds it is given', () => {
    const { send } = setup({ moveThreshold: 10, clickMs: 50 });
    send(ev('down', 0, 0), 0);
    expect(send(ev('move', 10, 0), 1)).toEqual([]);
    expect(types(send(ev('up', 10, 0), 50))).toEqual(['click']);
    send(ev('down', 0, 0), 100);
    expect(send(ev('up', 0, 0), 151)).toEqual([]);
    send(ev('down', 0, 0), 200);
    expect(types(send(ev('move', 10.5, 0), 201))).toEqual(['drag-start']);
  });

  it('uses Date.now by default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const recogniser = new GestureRecogniser();
    recogniser.handle(ev('down', 0, 0));
    vi.setSystemTime(1300);
    expect(types(recogniser.handle(ev('up', 0, 0)))).toEqual(['click']);
    recogniser.handle(ev('down', 0, 0));
    vi.setSystemTime(1601);
    expect(recogniser.handle(ev('up', 0, 0))).toEqual([]);
  });
});

describe('drag', () => {
  it('starts when the press moves beyond the threshold, then follows and ends', () => {
    const { send } = setup();
    send(ev('down', 10, 10), 0);
    const [start] = send(ev('move', 20, 10, { shiftKey: true }), 5);
    expect(start).toEqual({ type: 'drag-start', origin: { x: 10, y: 10 }, point: { x: 20, y: 10 }, button: 0, pointerType: 'mouse', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false });
    expect(send(ev('move', 30, 11), 6)).toEqual([expect.objectContaining({ type: 'drag', point: { x: 30, y: 11 } })]);
    expect(send(ev('move', 10, 10), 7)).toEqual([expect.objectContaining({ type: 'drag', point: { x: 10, y: 10 } })]);
    expect(send(ev('up', 31, 12), 8)).toEqual([expect.objectContaining({ type: 'drag-end', point: { x: 31, y: 12 }, button: 0 })]);
  });

  it('stays a drag however long it takes and makes no click', () => {
    const { send } = setup();
    send(ev('down', 0, 0), 0);
    send(ev('move', 50, 0), 1000);
    expect(types(send(ev('up', 50, 0), 2000))).toEqual(['drag-end']);
  });

  it('does not start another drag-start while dragging, and ends the press', () => {
    const { send } = setup();
    send(ev('down', 0, 0), 0);
    send(ev('move', 9, 0), 1);
    expect(types(send(ev('move', 0, 0), 2))).toEqual(['drag']);
    send(ev('up', 0, 0), 3);
    expect(types(send(ev('move', 1, 1), 4))).toEqual(['move']);
  });
});

describe('hover and leave', () => {
  it('reports moves without a press as move with the event details', () => {
    const { send } = setup();
    expect(send(ev('move', 7, 8, { pointerType: 'pen', ctrlKey: true }))).toEqual([
      { type: 'move', point: { x: 7, y: 8 }, button: 0, pointerType: 'pen', shiftKey: false, ctrlKey: true, altKey: false, metaKey: false },
    ]);
  });

  it('cancels a drag on pointer cancel, and a later up does nothing', () => {
    const { send } = setup();
    send(ev('down', 0, 0), 0);
    send(ev('move', 20, 0), 1);
    expect(send(ev('cancel', 20, 0), 2)).toEqual([{ type: 'cancel' }]);
    expect(send(ev('up', 20, 0), 3)).toEqual([]);
  });

  it('cancels a drag on leave and reports the leave', () => {
    const { send } = setup();
    send(ev('down', 0, 0), 0);
    send(ev('move', 20, 0), 1);
    expect(send(ev('leave', 20, 0), 2)).toEqual([{ type: 'cancel' }, { type: 'leave' }]);
  });

  it('reports a leave without a drag as only a leave, and drops a press', () => {
    const { send } = setup();
    send(ev('down', 0, 0), 0);
    expect(send(ev('leave', 0, 0), 1)).toEqual([{ type: 'leave' }]);
    expect(send(ev('up', 0, 0), 2)).toEqual([]);
    expect(send(ev('leave', 0, 0), 3)).toEqual([{ type: 'leave' }]);
  });

  it('drops a press on pointer cancel without a gesture', () => {
    const { send } = setup();
    send(ev('down', 0, 0), 0);
    expect(send(ev('cancel', 0, 0), 1)).toEqual([]);
    expect(send(ev('up', 0, 0), 2)).toEqual([]);
  });
});

describe('buttons', () => {
  it('ignores another button while one is pressed, and its up', () => {
    const { send } = setup();
    send(ev('down', 0, 0, { button: 0 }), 0);
    expect(send(ev('down', 50, 50, { button: 2 }), 1)).toEqual([]);
    expect(send(ev('up', 50, 50, { button: 2 }), 2)).toEqual([]);
    expect(send(ev('up', 0, 0, { button: 0 }), 3)).toEqual([expect.objectContaining({ type: 'click', point: { x: 0, y: 0 } })]);
  });

  it('starts again on a second down of the same button (a lost up)', () => {
    const { send } = setup();
    send(ev('down', 0, 0), 0);
    send(ev('down', 100, 100), 400);
    expect(types(send(ev('up', 100, 100), 450))).toEqual(['click']);
  });

  it('reports a press of any button as a click', () => {
    const { send } = setup();
    send(ev('down', 0, 0, { button: 2 }), 0);
    expect(send(ev('up', 0, 0, { button: 2 }), 1)).toEqual([expect.objectContaining({ type: 'click', button: 2 })]);
  });
});

describe('double-click', () => {
  const click = (send: (event: HostPointerEvent, at?: number) => Gesture[], x: number, y: number, at: number, extra: Partial<HostPointerEvent> = {}): Gesture[] => {
    send(ev('down', x, y, extra), at);
    return send(ev('up', x, y, extra), at + 10);
  };

  it('is a second click within 400 ms and 6 px, after its click', () => {
    const { send } = setup();
    expect(types(click(send, 0, 0, 0))).toEqual(['click']);
    const second = click(send, 6, 0, 100);
    expect(types(second)).toEqual(['click', 'double-click']);
    expect(second[1]).toEqual({ type: 'double-click', point: { x: 6, y: 0 }, button: 0, pointerType: 'mouse', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false });
  });

  it('measures the time between the two releases: 400 ms is a double-click, 401 is not', () => {
    const a = setup();
    click(a.send, 0, 0, 0);
    expect(types(click(a.send, 0, 0, 400))).toEqual(['click', 'double-click']);
    const b = setup();
    click(b.send, 0, 0, 0);
    expect(types(click(b.send, 0, 0, 401))).toEqual(['click']);
  });

  it('allows 6 px between the clicks, not more', () => {
    const a = setup();
    click(a.send, 0, 0, 0);
    expect(types(click(a.send, 0, 6, 50))).toEqual(['click', 'double-click']);
    const b = setup();
    click(b.send, 0, 0, 0);
    expect(types(click(b.send, 0, 6.01, 50))).toEqual(['click']);
  });

  it('measures the distance as a straight line', () => {
    const { send } = setup();
    click(send, 0, 0, 0);
    expect(types(click(send, 4.5, 4.5, 50))).toEqual(['click']);
  });

  it('needs the same button', () => {
    const { send } = setup();
    click(send, 0, 0, 0, { button: 0 });
    expect(types(click(send, 0, 0, 50, { button: 2 }))).toEqual(['click']);
  });

  it('makes the third click start again', () => {
    const { send } = setup();
    click(send, 0, 0, 0);
    expect(types(click(send, 0, 0, 50))).toEqual(['click', 'double-click']);
    expect(types(click(send, 0, 0, 100))).toEqual(['click']);
    expect(types(click(send, 0, 0, 150))).toEqual(['click', 'double-click']);
  });

  it('is not made by a click after a drag', () => {
    const { send } = setup();
    click(send, 0, 0, 0);
    send(ev('down', 0, 0), 20);
    send(ev('move', 30, 0), 21);
    send(ev('up', 30, 0), 22);
    expect(types(click(send, 0, 0, 50))).toEqual(['click']);
  });

  it('counts a slow press that made no click as nothing', () => {
    const { send } = setup();
    click(send, 0, 0, 0);
    send(ev('down', 0, 0), 20);
    send(ev('up', 0, 0), 500);
    expect(types(click(send, 0, 0, 510))).toEqual(['click']);
  });

  it('uses the thresholds it is given', () => {
    const { send } = setup({ doubleClickMs: 100, doubleClickPx: 2 });
    click(send, 0, 0, 0);
    expect(types(click(send, 2, 0, 100))).toEqual(['click', 'double-click']);
    click(send, 0, 0, 1000);
    expect(types(click(send, 3, 0, 1050))).toEqual(['click']);
    click(send, 0, 0, 2000);
    expect(types(click(send, 0, 0, 2111))).toEqual(['click']);
  });
});

describe('reset', () => {
  it('forgets a press in progress', () => {
    const { recogniser, send } = setup();
    send(ev('down', 0, 0), 0);
    recogniser.reset();
    expect(send(ev('up', 0, 0), 10)).toEqual([]);
  });

  it('forgets the last click', () => {
    const { recogniser, send } = setup();
    send(ev('down', 0, 0), 0);
    send(ev('up', 0, 0), 1);
    recogniser.reset();
    send(ev('down', 0, 0), 2);
    expect(types(send(ev('up', 0, 0), 3))).toEqual(['click']);
  });
});
