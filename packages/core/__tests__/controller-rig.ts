import { createDrawingTools, type DrawingTools, type DrawingToolsEventName, type DrawingToolsEvents, type DrawingToolsOptions } from '../src/controller';
import type { NearestBar, TextEditRequest } from '../src/host';
import type { SceneItem } from '../src/scene/types';
import { DrawingStore } from '../src/store';
import { createMockHost, type MockHostOptions, type MockPointerOptions } from '../src/testing/mock-host';
import type { Anchor, Drawing } from '../src/types';

// Shared by the controller tests. The pane is `price`, 400 px high with prices 0 to 200 (y = (200 - p) * 2);
// time is x * 6000 (10 px per bar).
const OHLC = { open: 100, high: 140, low: 40, close: 60 };
const bar = (x: number): NearestBar => ({ time: x * 6000, ohlc: OHLC });
export const BARS = [bar(100), bar(300), bar(400)];
export const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
export const LINE: Drawing = { id: 'l', kind: 'trend-line', anchors: [A(100, 200), A(300, 100)] };
export const OTHER: Drawing = { id: 'o', kind: 'rectangle', anchors: [A(500, 300), A(600, 350)] };
export const NOTE: Drawing = { id: 't', kind: 'text-note', anchors: [A(100, 200)], text: 'hi' };

/** A store that counts its active subscriptions. */
export class CountingStore extends DrawingStore {
  active = 0;

  override subscribe(...args: Parameters<DrawingStore['subscribe']>): () => void {
    this.active++;
    const off = super.subscribe(...args);
    let open = true;
    return () => {
      if (open) this.active--;
      open = false;
      off();
    };
  }
}

export function rig(options: DrawingToolsOptions = {}, hostOptions: MockHostOptions = {}, drawings: Drawing[] = []) {
  const host = createMockHost({ bars: BARS, ...hostOptions });
  const store = options.store ?? new DrawingStore(drawings);
  let clock = 0;
  let next = 0;
  const tools = createDrawingTools(host, { createId: () => `d${++next}`, gestures: { now: () => clock }, history: { now: () => clock }, ...options, store });
  const click = (x: number, y: number, opts: MockPointerOptions = {}): void => {
    host.pointer('down', x, y, opts);
    host.pointer('up', x, y, opts);
    clock += 1000;
  };
  /** Presses at `from`, moves through `via` to `to` and releases there. */
  const drag = (from: [number, number], to: [number, number], via: [number, number][] = [], opts: MockPointerOptions = {}): void => {
    host.pointer('down', from[0], from[1], opts);
    for (const [x, y] of [...via, to]) host.pointer('move', x, y, opts);
    host.pointer('up', to[0], to[1], opts);
    clock += 1000;
  };
  return { host, store, tools, click, drag };
}

export function record<E extends DrawingToolsEventName>(tools: DrawingTools, event: E): DrawingToolsEvents[E][] {
  const seen: DrawingToolsEvents[E][] = [];
  tools.on(event, (payload) => {
    seen.push(payload);
  });
  return seen;
}

/** The centre of the snap indicator (a circle, the only arc of these scenes), or null. */
export function indicator(items: readonly SceneItem[]): { x: number; y: number } | null {
  for (const item of items) {
    if (item.type !== 'preview') continue;
    const shape = item.shapes[0];
    if (shape?.type === 'arc') return shape.center;
  }
  return null;
}

/** The end of the line of the placement preview, or null. */
export function previewEnd(items: readonly SceneItem[]): { x: number; y: number } | null {
  for (const item of items) {
    if (item.type !== 'preview') continue;
    const shape = item.shapes[0];
    if (shape?.type === 'line') return shape.to;
  }
  return null;
}

export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A text editor that stays open until the test answers it. */
export function deferredEditor() {
  const requests: TextEditRequest[] = [];
  let resolve: (text: string | null) => void = () => undefined;
  return {
    requests,
    editText: (request: TextEditRequest): Promise<string | null> => {
      requests.push(request);
      return new Promise((done) => {
        resolve = done;
      });
    },
    answer: (text: string | null): void => resolve(text),
  };
}
