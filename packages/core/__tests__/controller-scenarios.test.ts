import { describe, expect, it } from 'vitest';
import { createDrawingTools, type DrawingToolsEventName, type DrawingToolsEvents, type DrawingTools, type DrawingToolsOptions } from '../src/controller';
import type { NearestBar } from '../src/host';
import { DrawingStore } from '../src/store';
import { createMockHost, type MockHostOptions } from '../src/testing/mock-host';
import type { SceneItem } from '../src/scene/types';
import type { Anchor, Drawing } from '../src/types';

// End-to-end flows through the controller on the mock host (FR-INT-001 to FR-INT-061). The pane is `price`, 400 px
// high with prices 0 to 200 (y = (200 - p) * 2); time is x * 6000.
const OHLC = { open: 100, high: 140, low: 40, close: 60 };
const bar = (x: number): NearestBar => ({ time: x * 6000, ohlc: OHLC });
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
const LINE: Drawing = { id: 'l', kind: 'trend-line', anchors: [A(100, 200), A(300, 100)] };

function rig(options: DrawingToolsOptions = {}, hostOptions: MockHostOptions = {}, drawings: Drawing[] = []) {
  const host = createMockHost({ bars: [bar(100), bar(300), bar(400)], ...hostOptions });
  const store = new DrawingStore(drawings);
  let clock = 0;
  let next = 0;
  const tools = createDrawingTools(host, { store, createId: () => `d${++next}`, gestures: { now: () => clock }, history: { now: () => clock }, ...options });
  const click = (x: number, y: number, opts: Parameters<typeof host.pointer>[3] = {}): void => {
    host.pointer('down', x, y, opts);
    host.pointer('up', x, y, opts);
    clock += 1000;
  };
  const drag = (from: [number, number], to: [number, number], via: [number, number][] = [], opts: Parameters<typeof host.pointer>[3] = {}): void => {
    host.pointer('down', from[0], from[1], opts);
    for (const [x, y] of [...via, to]) host.pointer('move', x, y, opts);
    host.pointer('up', to[0], to[1], opts);
    clock += 1000;
  };
  return { host, store, tools, click, drag };
}

function record<E extends DrawingToolsEventName>(tools: DrawingTools, event: E): DrawingToolsEvents[E][] {
  const seen: DrawingToolsEvents[E][] = [];
  tools.on(event, (payload) => {
    seen.push(payload);
  });
  return seen;
}

function indicator(items: readonly SceneItem[]): { x: number; y: number } | null {
  for (const item of items) {
    if (item.type !== 'preview') continue;
    const shape = item.shapes[0];
    if (shape?.type === 'arc') return shape.center;
  }
  return null;
}

describe('placing', () => {
  it('places a trend line by click-click and keeps the history to one entry', () => {
    const { store, tools, click } = rig();
    const tool = record(tools, 'tool');
    tools.activate('trend-line');
    click(100, 200);
    expect(store.list()).toEqual([]);
    click(300, 100);
    expect(store.list()).toEqual([{ id: 'd1', kind: 'trend-line', anchors: [A(100, 200), A(300, 100)] }]);
    expect(tools.getState()).toMatchObject({ activeTool: null, selection: ['d1'], canUndo: true });
    expect(tool).toEqual(['trend-line', null]);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it('places a trend line by press, drag and release', () => {
    const { store, tools, drag } = rig();
    tools.activate('trend-line');
    drag([100, 200], [300, 100], [[200, 150]]);
    expect(store.list().map((drawing) => drawing.anchors)).toEqual([[A(100, 200), A(300, 100)]]);
  });

  it('stays in the tool when stayInTool is set', () => {
    const { store, tools, click } = rig({ stayInTool: true });
    tools.activate('horizontal-line');
    click(100, 200);
    click(100, 300);
    expect(store.list()).toHaveLength(2);
    expect(tools.getState().activeTool).toBe('horizontal-line');
  });

  it('cancels a placement with Escape and with a right click, without a history entry', () => {
    const { host, store, tools, click } = rig();
    tools.activate('trend-line');
    click(100, 200);
    expect(host.key('Escape')).toBe(true);
    expect(store.list()).toEqual([]);
    expect(tools.getState().canUndo).toBe(false);
    tools.activate('trend-line');
    click(100, 200);
    click(300, 100, { button: 2 });
    expect(tools.getState().activeTool).toBeNull();
    expect(store.list()).toEqual([]);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('places with the keyboard: arrows move the cursor, Enter places', () => {
    const { host, store, tools } = rig();
    tools.activate('trend-line');
    host.key('ArrowRight');
    host.key('Enter');
    host.key('ArrowRight');
    host.key('ArrowUp');
    host.key('Enter');
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.kind).toBe('trend-line');
    expect(tools.getState().activeTool).toBeNull();
  });

  it('places a text note, opens the editor and stores the text', async () => {
    const requests: unknown[] = [];
    const { store, tools, click } = rig({}, { editText: (request: unknown) => (requests.push(request), Promise.resolve('hello')) });
    tools.activate('text-note');
    click(100, 200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests).toHaveLength(1);
    expect(store.get('d1')?.text).toBe('hello');
    expect(tools.getState().interaction.type).toBe('selected');
  });

  it('keeps the empty text when the editor is cancelled, and when the host has no editor', async () => {
    const cancelled = rig({}, { editText: () => Promise.resolve(null) });
    cancelled.tools.activate('text-note');
    cancelled.click(100, 200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancelled.store.get('d1')?.text).toBe('');

    const plain = rig();
    plain.tools.activate('text-note');
    plain.click(100, 200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(plain.store.get('d1')?.text).toBe('');
  });
});

describe('magnet snapping (FR-INT-040, FR-INT-041)', () => {
  it('snaps the placed anchor to the nearest OHLC value and inverts the mode with Ctrl', () => {
    const snapped = rig({ magnet: 'strong' });
    snapped.tools.activate('horizontal-line');
    snapped.click(103, 205);
    expect(snapped.store.list()[0]?.anchors[0]?.time).toBe(100 * 6000);
    expect(snapped.store.list()[0]?.anchors[0]?.price).toBe(100);

    const inverted = rig({ magnet: 'strong' });
    inverted.tools.activate('horizontal-line');
    inverted.click(103, 205, { ctrlKey: true });
    const anchor = inverted.store.list()[0]?.anchors[0];
    expect(anchor?.time).toBe(103 * 6000);
    expect(anchor?.price).toBeCloseTo(97.5, 9);
  });

  it('shows the snap indicator while the pointer is near a value, and not after it leaves', () => {
    const { host, tools } = rig({ magnet: 'strong' });
    tools.activate('trend-line');
    host.pointer('move', 103, 205);
    expect(indicator(tools.getScene())).not.toBeNull();
    host.pointer('leave', 103, 205);
    expect(indicator(tools.getScene())).toBeNull();
  });

  it('drops the indicator when the viewport changes', () => {
    const { host, tools } = rig({ magnet: 'strong' });
    tools.activate('trend-line');
    host.pointer('move', 103, 205);
    host.zoom(2);
    expect(indicator(tools.getScene())).toBeNull();
  });

  it('does not change the stored magnet mode when Ctrl inverts it', () => {
    const { tools, click } = rig({ magnet: 'strong' });
    tools.activate('horizontal-line');
    click(103, 205, { ctrlKey: true });
    expect(tools.getState().magnet).toBe('strong');
  });
});

describe('selecting, moving and resizing', () => {
  it('selects by click and clears the selection by clicking the background', () => {
    const { tools, click } = rig({}, {}, [LINE]);
    click(200, 150);
    expect(tools.getState().selection).toEqual(['l']);
    click(700, 100);
    expect(tools.getState().selection).toEqual([]);
  });

  it('moves a drawing with one history entry for the whole drag', () => {
    const { store, tools, click, drag } = rig({}, {}, [LINE]);
    click(200, 150);
    const changes = record(tools, 'change');
    drag(
      [200, 150],
      [250, 200],
      [
        [220, 170],
        [240, 190],
      ]
    );
    expect(store.get('l')?.anchors).toEqual([A(150, 250), A(350, 150)]);
    expect(changes.length).toBeGreaterThan(0);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([LINE]);
    expect(tools.undo()).toBe(false);
  });

  it('resizes by dragging a handle, as one history entry', () => {
    const { store, tools, click, drag } = rig({}, {}, [LINE]);
    click(200, 150);
    drag([300, 100], [340, 80], [[320, 90]]);
    expect(store.get('l')?.anchors[1]).toEqual(A(340, 80));
    expect(tools.undo()).toBe(true);
    expect(store.get('l')).toEqual(LINE);
  });

  it('reverts a drag with Escape and leaves no history entry', () => {
    const { host, store, tools, click } = rig({}, {}, [LINE]);
    click(200, 150);
    host.pointer('down', 200, 150);
    host.pointer('move', 250, 200);
    expect(store.get('l')?.anchors).not.toEqual(LINE.anchors);
    host.key('Escape');
    expect(store.list()).toEqual([LINE]);
    expect(tools.getState().canUndo).toBe(false);
    host.pointer('up', 250, 200);
    expect(store.list()).toEqual([LINE]);
  });

  it('emits blocked once per drag of a locked drawing and does not move it', () => {
    const locked: Drawing = { ...LINE, locked: true };
    const { host, store, tools, click } = rig({}, {}, [locked]);
    const blocked = record(tools, 'blocked');
    click(200, 150);
    host.pointer('down', 200, 150);
    host.pointer('move', 220, 170);
    host.pointer('move', 240, 190);
    host.pointer('up', 240, 190);
    expect(store.list()).toEqual([locked]);
    expect(blocked).toEqual([{ code: 'KFT-E-LOCKED', ids: ['l'] }]);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('keeps the history empty after a click without movement', () => {
    const { tools, click } = rig({}, {}, [LINE]);
    click(200, 150);
    click(200, 150);
    expect(tools.getState().canUndo).toBe(false);
  });
});

describe('keyboard', () => {
  it('nudges the selection with the arrows as one history entry per key and reports the key handled', () => {
    const { host, store, tools, click } = rig({}, {}, [LINE]);
    click(200, 150);
    expect(host.key('ArrowRight')).toBe(true);
    expect(store.get('l')?.anchors[0]?.time).toBeGreaterThan(LINE.anchors[0]?.time ?? 0);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([LINE]);
  });

  it('handles keys only when they changed something', () => {
    const { host, tools } = rig({}, {}, [LINE]);
    expect(host.key('ArrowRight')).toBe(false);
    expect(host.key('Delete')).toBe(false);
    expect(host.key('Escape')).toBe(false);
    expect(host.key('a', { ctrlKey: true })).toBe(true);
    expect(tools.getState().selection).toEqual(['l']);
    expect(host.key('a', { ctrlKey: true })).toBe(true);
  });

  it('deletes the selection with Delete as one history entry', () => {
    const { host, store, tools, click } = rig({}, {}, [LINE]);
    click(200, 150);
    expect(host.key('Delete')).toBe(true);
    expect(store.list()).toEqual([]);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([LINE]);
  });

  it('duplicates the selection with Ctrl+D and selects the copies', () => {
    const { host, store, tools, click } = rig({}, {}, [LINE]);
    click(200, 150);
    expect(host.key('d', { ctrlKey: true })).toBe(true);
    expect(store.list()).toHaveLength(2);
    expect(tools.getState().selection).toEqual(['d1']);
  });

  it('clears the selection with Escape', () => {
    const { host, tools, click } = rig({}, {}, [LINE]);
    click(200, 150);
    expect(host.key('Escape')).toBe(true);
    expect(tools.getState().selection).toEqual([]);
  });
});

describe('undo and redo through the API', () => {
  it('undoes a placement and redoes it', () => {
    const { store, tools, click } = rig();
    tools.activate('horizontal-line');
    click(100, 200);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([]);
    expect(tools.redo()).toBe(true);
    expect(store.list()).toHaveLength(1);
  });
});
