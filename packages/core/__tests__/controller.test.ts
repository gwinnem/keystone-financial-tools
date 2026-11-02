import { describe, expect, it } from 'vitest';
import { createDrawingTools, type DrawingTools, type DrawingToolsEventName, type DrawingToolsEvents, type DrawingToolsOptions } from '../src/controller';
import { DrawingError } from '../src/errors';
import type { NearestBar } from '../src/host';
import { IDLE_STATE } from '../src/interaction/types';
import type { SceneItem } from '../src/scene/types';
import { DrawingStore } from '../src/store';
import { createMockHost, type MockHost, type MockHostOptions } from '../src/testing/mock-host';
import { DARK_THEME, LIGHT_THEME, resolveStyle } from '../src/theme';
import type { Anchor, Drawing, DrawingIssue } from '../src/types';

// SDS 9.7 (FR-INT-060, FR-INT-061, NFR-REL-001): the controller on the mock host. The pane is `price`, 400 px
// high with prices 0 to 200, so a price p is at y = (200 - p) * 2; time is x * 6000 (10 px per bar).
const OHLC = { open: 100, high: 140, low: 40, close: 60 };
const bar = (x: number): NearestBar => ({ time: x * 6000, ohlc: OHLC });
const BARS = [bar(100), bar(300), bar(400)];
const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
const LINE: Drawing = { id: 'l', kind: 'trend-line', anchors: [A(100, 200), A(300, 100)] };
const OTHER: Drawing = { id: 'o', kind: 'rectangle', anchors: [A(500, 300), A(600, 350)] };

/** A store whose `update` and `restore` can be made to fail, to inject faults. */
class FlakyStore extends DrawingStore {
  failUpdateAfter = Number.POSITIVE_INFINITY;
  failRestore = false;
  private updates = 0;

  override update(...args: Parameters<DrawingStore['update']>): Drawing {
    if (++this.updates > this.failUpdateAfter) throw new Error('flaky update');
    return super.update(...args);
  }

  override restore(...args: Parameters<DrawingStore['restore']>): void {
    if (this.failRestore) throw new Error('flaky restore');
    super.restore(...args);
  }
}

function rig(options: DrawingToolsOptions = {}, hostOptions: MockHostOptions = {}) {
  const host = createMockHost({ bars: BARS, ...hostOptions });
  const store = options.store ?? new DrawingStore();
  let clock = 0;
  let next = 0;
  const tools = createDrawingTools(host, { createId: () => `d${++next}`, gestures: { now: () => clock }, history: { now: () => clock }, ...options, store });
  const click = (x: number, y: number): void => {
    host.pointer('down', x, y);
    host.pointer('up', x, y);
    clock += 1000;
  };
  /** Press at `from`, move through `via` to `to`, release. */
  const drag = (from: [number, number], to: [number, number], via: [number, number][] = []): void => {
    host.pointer('down', from[0], from[1]);
    for (const [x, y] of [...via, to]) host.pointer('move', x, y);
    host.pointer('up', to[0], to[1]);
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

function issuesOf(fn: () => unknown): readonly DrawingIssue[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof DrawingError) return error.issues;
    throw error;
  }
  throw new Error('Expected a DrawingError.');
}

/** The centre of the snap indicator (a circle, the only arc of these scenes), or null. */
function indicator(items: readonly SceneItem[]): { x: number; y: number } | null {
  for (const item of items) {
    if (item.type !== 'preview') continue;
    const shape = item.shapes[0];
    if (shape?.type === 'arc') return shape.center;
  }
  return null;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('createDrawingTools: creation (FR-HOST-001, S01)', () => {
  it('subscribes to the host and starts idle with the defaults', () => {
    const { host, tools } = rig();
    expect(host.listenerCount('pointer')).toBe(1);
    expect(host.listenerCount('key')).toBe(1);
    expect(host.listenerCount('viewport')).toBeGreaterThan(0);
    expect(tools.getState()).toEqual({ activeTool: null, interaction: IDLE_STATE, selection: [], hover: null, canUndo: false, canRedo: false, magnet: 'off' });
    expect(tools.getScene()).toEqual([]);
  });

  it('rejects a host that does not satisfy the contract (KFT-E-HOST)', () => {
    expect(issuesOf(() => createDrawingTools({} as never)).map((issue) => issue.code)).toEqual(['KFT-E-HOST', 'KFT-E-HOST']);
    expect(issuesOf(() => createDrawingTools({ ...createMockHost(), apiVersion: 1 } as never))[0]?.message).toContain('apiVersion');
  });

  it('validates the options', () => {
    expect(() => createDrawingTools(createMockHost(), { magnet: 'sticky' as never })).toThrow(RangeError);
    expect(() => createDrawingTools(createMockHost(), { history: { limit: 0 } })).toThrow(RangeError);
    const issues = issuesOf(() => createDrawingTools(createMockHost(), { tools: ['trend-line', 'pitchfork' as never, 'arrow' as never] }));
    expect(issues).toEqual([{ code: 'KFT-E-KIND', message: 'Unknown drawing kinds in tools: pitchfork, arrow.' }]);
  });

  it('accepts every magnet mode and an empty tool list', () => {
    for (const magnet of ['off', 'weak', 'strong'] as const) expect(createDrawingTools(createMockHost(), { magnet }).getState().magnet).toBe(magnet);
    const none = createDrawingTools(createMockHost(), { tools: [] });
    expect(() => none.activate('trend-line')).toThrow(DrawingError);
  });

  it('unsubscribes everything it subscribed when the host does not return unsubscribe functions', () => {
    const host = createMockHost();
    const broken = Object.assign(host, { onKey: () => undefined }) as unknown as MockHost;
    expect(issuesOf(() => createDrawingTools(broken))[0]?.code).toBe('KFT-E-HOST');
    expect(host.listenerCount('pointer')).toBe(0);
    expect(host.listenerCount('viewport')).toBe(0);
  });

  it('draws into the store it is given and creates its own otherwise', () => {
    const store = new DrawingStore([LINE]);
    const given = rig({ store });
    expect(given.store).toBe(store);
    expect(given.tools.hitTest(200, 150)).toEqual({ id: 'l', part: 'body', locked: false });

    const own = rig();
    const changes = record(own.tools, 'change');
    own.tools.activate('horizontal-line');
    own.click(100, 200);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.drawings).toEqual([{ id: 'd1', kind: 'horizontal-line', anchors: [A(100, 200)] }]);
    expect(changes[0]?.operations.map((operation) => operation.type)).toEqual(['add']);
  });
});

describe('actions (S01)', () => {
  it('activates and deactivates a tool, with the crosshair cursor while one is active', () => {
    const { host, tools } = rig();
    const tool = record(tools, 'tool');
    tools.activate('trend-line');
    expect(tools.getState().activeTool).toBe('trend-line');
    expect(tools.getState().interaction).toEqual({ type: 'placing', tool: 'trend-line' });
    expect(host.cursors).toEqual(['crosshair']);
    tools.deactivate();
    expect(tools.getState().activeTool).toBeNull();
    expect(host.cursors).toEqual(['crosshair', 'default']);
    expect(tool).toEqual(['trend-line', null]);
  });

  it('rejects a kind that is unknown or not in the tools option (KFT-E-KIND), and keeps the state', () => {
    const { tools } = rig({ tools: ['rectangle'] });
    expect(issuesOf(() => tools.activate('trend-line'))).toEqual([{ code: 'KFT-E-KIND', message: 'The tool trend-line is not available.' }]);
    expect(issuesOf(() => tools.activate('pitchfork' as never))[0]?.message).toBe('The tool pitchfork is not available.');
    expect(tools.getState().activeTool).toBeNull();
    tools.activate('rectangle');
    expect(tools.getState().activeTool).toBe('rectangle');
  });

  it('switching the tool while placing drops the drawing in progress', () => {
    const { store, tools, click } = rig();
    tools.activate('trend-line');
    click(100, 200);
    tools.activate('rectangle');
    click(300, 100);
    expect(store.list()).toEqual([]);
    click(350, 150);
    expect(store.list().map((drawing) => [drawing.kind, drawing.anchors])).toEqual([['rectangle', [A(300, 100), A(350, 150)]]]);
  });

  it('selects, clears the selection and removes drawings (locked ones too: locks only stop interaction)', () => {
    const locked: Drawing = { ...OTHER, locked: true };
    const { store, tools } = rig({ store: new DrawingStore([LINE, locked]) });
    tools.select(['l', 'nope', 'o', 'l']);
    expect(tools.getState().selection).toEqual(['l', 'o']);
    tools.clearSelection();
    expect(tools.getState().selection).toEqual([]);
    tools.remove(['o', 'unknown']);
    expect(store.list()).toEqual([LINE]);
    tools.remove([]);
    expect(store.list()).toEqual([LINE]);
  });

  it('removes several drawings as one history entry', () => {
    const { store, tools } = rig({ store: new DrawingStore([LINE, OTHER]) });
    tools.remove(['l', 'o']);
    expect(store.list()).toEqual([]);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([LINE, OTHER]);
    expect(tools.undo()).toBe(false);
  });

  it('undoes and redoes, reporting whether anything happened', () => {
    const { store, tools } = rig();
    expect(tools.undo()).toBe(false);
    expect(tools.redo()).toBe(false);
    store.add(LINE);
    expect(tools.getState()).toMatchObject({ canUndo: true, canRedo: false });
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([]);
    expect(tools.getState()).toMatchObject({ canUndo: false, canRedo: true });
    expect(tools.redo()).toBe(true);
    expect(store.list()).toEqual([LINE]);
    expect(tools.getState()).toMatchObject({ canUndo: true, canRedo: false });
  });

  it('sets the magnet mode and rejects a bad one', () => {
    const { tools } = rig();
    const states = record(tools, 'state');
    tools.setMagnet('strong');
    expect(tools.getState().magnet).toBe('strong');
    expect(states).toHaveLength(1);
    tools.setMagnet('strong');
    expect(states).toHaveLength(1);
    expect(() => tools.setMagnet('sticky' as never)).toThrow(RangeError);
    expect(tools.getState().magnet).toBe('strong');
  });

  it('changing the magnet removes the snap indicator until the pointer moves again', () => {
    const { host, tools } = rig({ magnet: 'strong' });
    tools.activate('trend-line');
    host.pointer('move', 103, 205);
    expect(indicator(tools.getScene())).not.toBeNull();
    tools.setMagnet('off');
    expect(indicator(tools.getScene())).toBeNull();
  });

  it('restyles with a new theme', () => {
    const { tools } = rig({ store: new DrawingStore([LINE]) });
    const light = tools.getScene();
    expect(light[0]).toMatchObject({ type: 'shape', style: { color: resolveStyle(LINE, LIGHT_THEME).color } });
    tools.setTheme(DARK_THEME);
    const dark = tools.getScene();
    expect(dark).not.toBe(light);
    expect(dark[0]).toMatchObject({ type: 'shape', style: { color: resolveStyle(LINE, DARK_THEME).color } });
  });

  it('changes stayInTool and the available tools at run time', () => {
    const { store, tools, click } = rig();
    tools.setOptions({ stayInTool: true });
    tools.activate('horizontal-line');
    click(100, 200);
    expect(tools.getState().activeTool).toBe('horizontal-line');
    tools.setOptions({ stayInTool: false });
    click(100, 250);
    expect(store.list()).toHaveLength(2);
    expect(tools.getState().activeTool).toBeNull();

    tools.activate('horizontal-line');
    tools.setOptions({ tools: ['rectangle'] });
    expect(tools.getState().activeTool).toBeNull();
    expect(() => tools.activate('horizontal-line')).toThrow(DrawingError);
    tools.activate('rectangle');
    tools.setOptions({ tools: ['rectangle', 'trend-line'] });
    expect(tools.getState().activeTool).toBe('rectangle');
    tools.setOptions({});
    expect(tools.getState().activeTool).toBe('rectangle');
    expect(() => tools.setOptions({ tools: ['pitchfork' as never] })).toThrow(DrawingError);
  });

  it('answers hitTest with what is under a plot point', () => {
    const { tools } = rig({ store: new DrawingStore([LINE]) });
    expect(tools.hitTest(200, 150)).toEqual({ id: 'l', part: 'body', locked: false });
    expect(tools.hitTest(200, 300)).toBeNull();
    // Handles can only be hit once the drawing is selected.
    expect(tools.hitTest(300, 100)?.part).toBe('body');
    tools.select(['l']);
    expect(tools.hitTest(300, 100)?.part).toBe('handle:1');
  });

  it('logs inputs the state machine ignores at debug level only', () => {
    const messages: string[] = [];
    const { tools, click } = rig({ debug: (message) => messages.push(message) });
    tools.deactivate();
    expect(messages).toEqual(['Ignored deactivate while idle.']);
    tools.activate('trend-line');
    expect(messages).toEqual(['Ignored deactivate while idle.']);
    click(100, 450);
    expect(messages).toContain('Ignored placement click.');
    expect(messages).not.toContain('Ignored click while placing.');
  });

  it('works without a debug function', () => {
    const { tools } = rig();
    expect(() => tools.deactivate()).not.toThrow();
  });
});

describe('state and events (S02, FR-INT-061)', () => {
  it('keeps the state object while nothing changes and gives a new one when a value does', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    const states = record(tools, 'state');
    const first = tools.getState();
    host.pointer('move', 700, 100);
    expect(tools.getState()).toBe(first);
    host.pointer('move', 200, 150);
    const hovered = tools.getState();
    expect(hovered).not.toBe(first);
    expect(hovered.hover).toBe('l');
    host.pointer('move', 202, 149);
    expect(tools.getState()).toBe(hovered);
    expect(states).toHaveLength(1);
  });

  it('keeps the selection array when only the hover changes', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    tools.select(['l']);
    const selection = tools.getState().selection;
    host.pointer('move', 200, 150);
    expect(tools.getState().hover).toBe('l');
    expect(tools.getState().selection).toBe(selection);
    tools.select(['l']);
    expect(tools.getState().selection).toBe(selection);
  });

  it('raises tool, selection and interaction events only for what changed, in that order, then state', () => {
    const { tools } = rig({ store: new DrawingStore([LINE, OTHER]) });
    const log: string[] = [];
    for (const name of ['tool', 'selection', 'interaction', 'state'] as const) {
      tools.on(name, () => {
        log.push(name);
      });
    }
    tools.activate('trend-line');
    expect(log).toEqual(['tool', 'interaction', 'state']);
    log.length = 0;
    tools.deactivate();
    expect(log).toEqual(['tool', 'interaction', 'state']);
    log.length = 0;
    tools.select(['l']);
    expect(log).toEqual(['selection', 'interaction', 'state']);
    log.length = 0;
    tools.select(['l', 'o']);
    expect(log).toEqual(['selection', 'interaction', 'state']);
    log.length = 0;
    tools.select(['o', 'l']);
    expect(log).toEqual(['selection', 'interaction', 'state']);
    log.length = 0;
    tools.select(['o', 'l']);
    expect(log).toEqual([]);
  });

  it('types every payload by event name', () => {
    const { tools } = rig({ store: new DrawingStore([LINE]) });
    const selection = record(tools, 'selection');
    const interaction = record(tools, 'interaction');
    const state = record(tools, 'state');
    const change = record(tools, 'change');
    tools.select(['l']);
    expect(selection).toEqual([['l']]);
    expect(interaction).toEqual([{ type: 'selected', ids: ['l'], hover: null }]);
    expect(state[0]).toBe(tools.getState());
    tools.remove(['l']);
    expect(change.map((entry) => entry.operations.map((operation) => operation.type))).toEqual([['remove']]);
  });

  it('reports canUndo and canRedo changes that come with no change of the interaction', () => {
    const { store, tools } = rig();
    const states = record(tools, 'state');
    store.add(LINE);
    expect(states.map((state) => [state.canUndo, state.canRedo])).toEqual([[true, false]]);
    tools.undo();
    expect(states.map((state) => [state.canUndo, state.canRedo])).toEqual([
      [true, false],
      [false, true],
    ]);
    tools.redo();
    expect(states[states.length - 1]).toMatchObject({ canUndo: true, canRedo: false });
  });

  it('unsubscribes with the function on returns, once or repeatedly', () => {
    const { tools } = rig();
    let calls = 0;
    const off = tools.on('state', () => calls++);
    tools.setMagnet('weak');
    off();
    off();
    tools.setMagnet('strong');
    expect(calls).toBe(1);
  });

  it('asks the host to render after every input it handles', () => {
    const { host, tools, click } = rig({ store: new DrawingStore([LINE]) });
    expect(host.renderRequests).toBe(0);
    tools.select(['l']);
    expect(host.renderRequests).toBe(1);
    host.pointer('move', 200, 150);
    expect(host.renderRequests).toBe(2);
    host.key('Escape');
    expect(host.renderRequests).toBe(3);
    host.zoom(2);
    expect(host.renderRequests).toBe(4);
    click(700, 100);
    expect(host.renderRequests).toBeGreaterThan(4);
  });
});

describe('scene', () => {
  it('returns the same scene until something it depends on changes', () => {
    const { host, store, tools } = rig({ store: new DrawingStore([LINE]) });
    const scene = tools.getScene();
    expect(tools.getScene()).toBe(scene);
    tools.select(['l']);
    const selected = tools.getScene();
    expect(selected).not.toBe(scene);
    expect(selected.map((item) => item.type)).toEqual(['shape', 'handles']);
    expect(tools.getScene()).toBe(selected);
    host.pointer('move', 200, 150);
    const hovered = tools.getScene();
    expect(hovered).not.toBe(selected);
    expect(tools.getScene()).toBe(hovered);
    store.update('l', { locked: true });
    expect(tools.getScene()).not.toBe(hovered);
  });

  it('marks the handle being dragged and the selected drawings', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    tools.select(['l']);
    host.pointer('down', 300, 100);
    host.pointer('move', 320, 100);
    expect(tools.getScene().find((item) => item.type === 'handles')).toMatchObject({ drawingId: 'l', active: 1 });
    host.pointer('up', 320, 100);
    expect(tools.getScene().find((item) => item.type === 'handles')).not.toHaveProperty('active');
  });

  it('shows the drawing in progress and the snap indicator, and drops them when the placement is over', () => {
    const { host, tools, click } = rig({ magnet: 'strong' });
    tools.activate('trend-line');
    expect(tools.getScene()).toEqual([]);
    click(103, 205);
    host.pointer('move', 302, 283);
    const items = tools.getScene();
    expect(items.filter((item) => item.type === 'preview')).toHaveLength(2);
    const center = indicator(items);
    expect(center?.x).toBeCloseTo(300, 9);
    expect(center?.y).toBeCloseTo(280, 9);
    expect(tools.getScene()).toBe(items);
    tools.deactivate();
    expect(tools.getScene().filter((item) => item.type === 'preview')).toHaveLength(0);
  });
});

describe('error isolation (S03, NFR-REL-001)', () => {
  it('catches an exception in the pointer handler and leaves the store unchanged', () => {
    const { host, store, tools, click } = rig();
    const errors = record(tools, 'error');
    tools.activate('horizontal-line');
    host.yAxisAt = () => {
      throw new Error('boom');
    };
    expect(() => click(100, 200)).not.toThrow();
    expect(store.list()).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ source: 'pointer', message: 'boom' });
    expect((errors[0]?.error as Error).message).toBe('boom');
  });

  it('describes a thrown value that is not an Error by its text', () => {
    const { host, tools } = rig();
    const errors = record(tools, 'error');
    tools.activate('horizontal-line');
    host.yAxisAt = () => {
      throw 'plain text';
    };
    host.pointer('down', 100, 200);
    host.pointer('up', 100, 200);
    expect(errors[0]).toMatchObject({ source: 'pointer', message: 'plain text', error: 'plain text' });
  });

  it('catches an exception in the key handler and reports the key as not handled', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    const errors = record(tools, 'error');
    tools.select(['l']);
    host.barInterval = () => {
      throw new Error('interval');
    };
    expect(host.key('ArrowRight')).toBe(false);
    expect(errors).toMatchObject([{ source: 'key', message: 'interval' }]);
  });

  it('keeps working after an error', () => {
    const { host, store, tools, click } = rig();
    const errors = record(tools, 'error');
    tools.activate('horizontal-line');
    const yAxisAt = host.yAxisAt;
    host.yAxisAt = () => {
      throw new Error('once');
    };
    click(100, 200);
    host.yAxisAt = yAxisAt;
    click(100, 200);
    expect(errors).toHaveLength(1);
    expect(store.list()).toHaveLength(1);
  });

  it('reports an exception of a listener as an error event and still calls the other listeners', () => {
    const { tools } = rig({ store: new DrawingStore([LINE]) });
    const errors = record(tools, 'error');
    let second = 0;
    tools.on('selection', () => {
      throw new Error('bad listener');
    });
    tools.on('selection', () => second++);
    expect(() => tools.select(['l'])).not.toThrow();
    expect(second).toBe(1);
    expect(errors).toMatchObject([{ source: 'listener', message: 'bad listener' }]);
  });

  it('does not report an error listener that throws again', () => {
    const { tools } = rig({ store: new DrawingStore([LINE]) });
    let calls = 0;
    tools.on('error', () => {
      calls++;
      throw new Error('error listener');
    });
    tools.on('selection', () => {
      throw new Error('bad listener');
    });
    expect(() => tools.select(['l'])).not.toThrow();
    expect(calls).toBe(1);
  });

  it('catches a host that fails to render', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    const errors = record(tools, 'error');
    host.requestRender = () => {
      throw new Error('render');
    };
    expect(() => tools.select(['l'])).not.toThrow();
    expect(errors).toMatchObject([{ source: 'action', message: 'render' }]);
    expect(tools.getState().selection).toEqual(['l']);
  });

  it('getScene returns an empty scene and hitTest null when the host fails', () => {
    const scene = rig({ store: new DrawingStore([LINE]) });
    const sceneErrors = record(scene.tools, 'error');
    scene.host.priceToY = () => {
      throw new Error('scale');
    };
    expect(scene.tools.getScene()).toEqual([]);
    expect(sceneErrors).toMatchObject([{ source: 'scene', message: 'scale' }]);

    const hit = rig({ store: new DrawingStore([LINE]) });
    const hitErrors = record(hit.tools, 'error');
    hit.host.priceToY = () => {
      throw new Error('scale');
    };
    expect(hit.tools.hitTest(200, 150)).toBeNull();
    expect(hitErrors).toMatchObject([{ source: 'action', message: 'scale' }]);
  });

  it('reverts a drag whose store change fails, leaves the store as it was and can drag again', () => {
    const store = new FlakyStore([LINE]);
    const { tools, click, drag } = rig({ store });
    const errors = record(tools, 'error');
    click(200, 150);
    store.failUpdateAfter = 1;
    drag([200, 150], [250, 200], [[230, 170]]);
    expect(store.list()).toEqual([LINE]);
    expect(errors).toMatchObject([{ source: 'pointer', message: 'flaky update' }]);
    expect(tools.getState().interaction).toEqual({ type: 'selected', ids: ['l'], hover: null });
    expect(tools.getState().canUndo).toBe(false);

    store.failUpdateAfter = Number.POSITIVE_INFINITY;
    drag([200, 150], [250, 200], [[230, 170]]);
    expect(store.get('l')?.anchors).toEqual([A(150, 250), A(350, 150)]);
    expect(errors).toHaveLength(1);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([LINE]);
  });

  it('reports a second error when the failed drag cannot be reverted either', () => {
    const store = new FlakyStore([LINE]);
    const { tools, click, drag } = rig({ store });
    const errors = record(tools, 'error');
    click(200, 150);
    store.failUpdateAfter = 1;
    store.failRestore = true;
    drag([200, 150], [250, 200], [[230, 170]]);
    expect(errors.map((error) => error.message)).toEqual(['flaky restore', 'flaky update']);
    expect(tools.getState().interaction.type).toBe('selected');
  });

  it('closes the nudge transaction when the nudge fails', () => {
    const store = new FlakyStore([LINE]);
    const { host, tools } = rig({ store });
    const errors = record(tools, 'error');
    tools.select(['l']);
    store.failUpdateAfter = 0;
    expect(host.key('ArrowRight')).toBe(false);
    expect(errors).toMatchObject([{ source: 'key', message: 'flaky update' }]);
    expect(store.list()).toEqual([LINE]);
    store.failUpdateAfter = Number.POSITIVE_INFINITY;
    expect(host.key('ArrowRight')).toBe(true);
    expect(errors).toHaveLength(1);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([LINE]);
  });

  it('reports a history entry that no longer fits as an error event', () => {
    const { store, tools } = rig();
    const errors = record(tools, 'error');
    store.add(LINE);
    store.remove('l', { history: false });
    expect(tools.undo()).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ source: 'history' });
    expect(errors[0]?.error).toBeInstanceOf(DrawingError);
  });

  it('reports a text editor that fails and carries on', async () => {
    const { store, tools, click } = rig(
      {},
      {
        editText: () => Promise.reject(new Error('editor')),
      }
    );
    const errors = record(tools, 'error');
    tools.activate('text-note');
    click(100, 200);
    await flush();
    expect(errors).toMatchObject([{ source: 'text-editor', message: 'editor' }]);
    expect(store.get('d1')?.text).toBe('');
    expect(tools.getState().interaction).toEqual({ type: 'selected', ids: ['d1'], hover: null });
  });

  it('reports a text editor that throws at once', async () => {
    const { tools, click } = rig(
      {},
      {
        editText: () => {
          throw new Error('sync editor');
        },
      }
    );
    const errors = record(tools, 'error');
    tools.activate('text-note');
    click(100, 200);
    await flush();
    expect(errors).toMatchObject([{ source: 'text-editor', message: 'sync editor' }]);
    expect(tools.getState().interaction.type).toBe('selected');
  });
});

describe('destroy (FR-INT-060)', () => {
  it('unsubscribes from the host and is idempotent', () => {
    const { host, tools } = rig();
    tools.destroy();
    expect(host.listenerCount('pointer')).toBe(0);
    expect(host.listenerCount('key')).toBe(0);
    expect(host.listenerCount('viewport')).toBe(0);
    expect(() => tools.destroy()).not.toThrow();
  });

  it('makes every call a no-op that emits nothing', () => {
    const { host, store, tools } = rig({ store: new DrawingStore([LINE]) });
    const everything: unknown[] = [];
    for (const name of ['change', 'selection', 'tool', 'interaction', 'state', 'blocked', 'error'] as const) {
      tools.on(name, (payload) => {
        everything.push([name, payload]);
      });
    }
    const state = tools.getState();
    const renders = host.renderRequests;
    tools.destroy();
    tools.activate('trend-line');
    tools.activate('pitchfork' as never);
    tools.deactivate();
    tools.select(['l']);
    tools.clearSelection();
    tools.remove(['l']);
    tools.setMagnet('strong');
    tools.setMagnet('sticky' as never);
    tools.setOptions({ stayInTool: true });
    tools.setOptions({ tools: ['pitchfork' as never] });
    tools.setTheme(DARK_THEME);
    expect(tools.undo()).toBe(false);
    expect(tools.redo()).toBe(false);
    expect(tools.hitTest(200, 150)).toBeNull();
    expect(tools.getScene()).toEqual([]);
    store.add(OTHER);
    host.pointer('move', 200, 150);
    host.key('Escape');
    expect(everything).toEqual([]);
    expect(host.renderRequests).toBe(renders);
    expect(tools.getState()).toBe(state);
    expect(store.list()).toEqual([LINE, OTHER]);
    const off = tools.on('state', () => everything.push('late'));
    off();
    store.add({ ...OTHER, id: 'p' });
    expect(everything).toEqual([]);
  });

  it('stops calling the listeners that are left once a listener destroys the tools', () => {
    const { tools } = rig({ store: new DrawingStore([LINE]) });
    let later = 0;
    tools.on('selection', () => tools.destroy());
    tools.on('selection', () => later++);
    tools.select(['l']);
    expect(later).toBe(0);
  });

  it('does not publish or render after a handler destroyed the tools', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    const states = record(tools, 'state');
    tools.on('selection', () => tools.destroy());
    const renders = host.renderRequests;
    tools.select(['l']);
    expect(states).toEqual([]);
    expect(host.renderRequests).toBe(renders);
  });

  it('resets the cursor and reverts a drag in progress', () => {
    const store = new DrawingStore([LINE]);
    const { host, tools, click } = rig({ store });
    click(200, 150);
    host.pointer('down', 200, 150);
    host.pointer('move', 250, 200);
    expect(store.get('l')?.anchors).toEqual([A(150, 250), A(350, 150)]);
    tools.destroy();
    expect(store.list()).toEqual([LINE]);
    expect(host.cursors[host.cursors.length - 1]).toBe('default');
    host.pointer('up', 250, 200);
    expect(store.list()).toEqual([LINE]);
  });

  it('ignores the answer of a text editor that arrives after destroy', async () => {
    let resolve: (text: string | null) => void = () => undefined;
    const { store, tools, click } = rig({}, { editText: () => new Promise<string | null>((done) => (resolve = done)) });
    const errors = record(tools, 'error');
    tools.activate('text-note');
    click(100, 200);
    tools.destroy();
    resolve('late text');
    await flush();
    expect(store.get('d1')?.text).toBe('');
    expect(errors).toEqual([]);
  });

  it('stops following the viewport and the store', () => {
    const { host, store, tools } = rig({ store: new DrawingStore([LINE]) });
    const changes = record(tools, 'change');
    tools.destroy();
    host.zoom(2);
    store.add(OTHER);
    expect(changes).toEqual([]);
  });
});
