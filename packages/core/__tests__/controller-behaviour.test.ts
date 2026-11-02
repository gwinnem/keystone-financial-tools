import { describe, expect, it } from 'vitest';
import type { DrawingToolsOptions } from '../src/controller';
import { DrawingError } from '../src/errors';
import type { MockHostOptions, MockPane } from '../src/testing/mock-host';
import { DEFAULT_MOCK_PANE } from '../src/testing/mock-host';
import { DrawingStore } from '../src/store';
import { DARK_THEME, LIGHT_THEME, resolveStyle } from '../src/theme';
import type { Drawing } from '../src/types';
import { A, CountingStore, deferredEditor, flush, LINE, NOTE, OTHER, previewEnd, record, rig } from './controller-rig';

// The behaviour of the controller that the other tests only touch in passing: which entry point an error
// comes from, what the state is in every interaction state, what is logged, which subscriptions are open,
// and the paths where a pane is gone or a key does nothing.

const TWO_PANES: MockPane[] = [
  { yAxisId: 'price', top: 0, height: 300, min: 0, max: 150 },
  { yAxisId: 'volume', top: 300, height: 100, min: 0, max: 1000 },
];

type Rig = ReturnType<typeof rig>;

describe('the source of an error is the entry point it came from', () => {
  /** Runs `act` on a host whose render fails and gives the source of the last error. */
  async function lastSource(act: (r: Rig) => void | Promise<void>, hostOptions: MockHostOptions = {}): Promise<string | undefined> {
    const r = rig({ store: new DrawingStore([LINE]) }, hostOptions);
    const errors = record(r.tools, 'error');
    r.host.requestRender = () => {
      throw new Error('render');
    };
    await act(r);
    return errors[errors.length - 1]?.source;
  }

  const cases: [string, string, (r: Rig) => void | Promise<void>, MockHostOptions?][] = [
    ['activate', 'action', (r) => r.tools.activate('trend-line')],
    [
      'deactivate',
      'action',
      (r) => {
        r.tools.activate('trend-line');
        r.tools.deactivate();
      },
    ],
    ['select', 'action', (r) => r.tools.select(['l'])],
    ['remove', 'action', (r) => r.tools.remove(['l'])],
    [
      'undo',
      'action',
      (r) => {
        r.store.add(OTHER);
        r.tools.undo();
      },
    ],
    [
      'redo',
      'action',
      (r) => {
        r.store.add(OTHER);
        r.tools.undo();
        r.tools.redo();
      },
    ],
    ['setMagnet', 'action', (r) => r.tools.setMagnet('weak')],
    ['setTheme', 'action', (r) => r.tools.setTheme(DARK_THEME)],
    ['setOptions', 'action', (r) => r.tools.setOptions({ stayInTool: true })],
    ['a store change', 'store', (r) => r.store.add(OTHER)],
    ['a viewport change', 'viewport', (r) => r.host.zoom(2)],
    ['a pointer event', 'pointer', (r) => r.host.pointer('move', 1, 1)],
    ['a key event', 'key', (r) => void r.host.key('a')],
    [
      'the text editor',
      'text-editor',
      async (r) => {
        r.tools.activate('text-note');
        r.click(100, 200);
        await flush();
      },
      { editText: () => Promise.resolve('x') },
    ],
  ];

  it.each(cases)('%s: %s', async (_name, expected, act, hostOptions) => {
    expect(await lastSource(act, hostOptions)).toBe(expected);
  });
});

describe('creation and the magnet', () => {
  it('names the magnet modes in its error', () => {
    const { tools } = rig();
    expect(() => tools.setMagnet('sticky' as never)).toThrow(new RangeError('The magnet must be one of off, weak, strong.'));
  });

  it('describes a history entry that no longer fits by its issue', () => {
    const { store, tools } = rig();
    const errors = record(tools, 'error');
    store.add(LINE);
    store.remove('l', { history: false });
    tools.undo();
    const issues = (errors[0]?.error as DrawingError).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('KFT-E-MISSING');
    expect(errors[0]?.message).toContain(issues[0]?.message);
  });
});

describe('subscriptions', () => {
  it('follows the store with the controller, the history and the geometry cache, and lets go of all three', () => {
    const store = new CountingStore([LINE]);
    const { host, tools } = rig({ store });
    expect(store.active).toBe(3);
    tools.setTheme(DARK_THEME);
    expect(store.active).toBe(3);
    tools.destroy();
    expect(store.active).toBe(0);
    tools.destroy();
    expect(store.active).toBe(0);
    expect(host.listenerCount('viewport')).toBe(0);
  });

  it('does not call a listener added after destroy', () => {
    const { store, tools } = rig();
    tools.destroy();
    let calls = 0;
    tools.on('change', () => calls++);
    store.add(LINE);
    expect(calls).toBe(0);
  });

  it('keeps the state it had when a listener destroys the tools before the state is published', () => {
    const { store, tools } = rig({ store: new DrawingStore([LINE]) });
    tools.select(['l']);
    const before = tools.getState();
    tools.on('change', () => tools.destroy());
    store.remove('l');
    expect(tools.getState()).toBe(before);
  });
});

describe('state', () => {
  it('has no hover while a tool is placing', () => {
    const { tools } = rig();
    tools.activate('trend-line');
    expect(tools.getState().hover).toBeNull();
  });

  it('keeps the selection while a drawing is moved and while a handle is dragged', () => {
    const moving = rig({ store: new DrawingStore([LINE]) });
    moving.click(200, 150);
    moving.host.pointer('down', 200, 150);
    moving.host.pointer('move', 220, 170);
    expect(moving.tools.getState()).toMatchObject({ interaction: { type: 'moving' }, selection: ['l'], hover: null });

    const handle = rig({ store: new DrawingStore([LINE]) });
    handle.click(200, 150);
    handle.host.pointer('down', 300, 100);
    handle.host.pointer('move', 320, 100);
    expect(handle.tools.getState()).toMatchObject({ interaction: { type: 'dragging-handle' }, selection: ['l'], hover: null });
  });

  it('selects the note being edited and keeps the selection array when the editing is over', async () => {
    const editor = deferredEditor();
    const { host, store, tools } = rig({ store: new DrawingStore([NOTE]) }, { editText: editor.editText });
    tools.select(['t']);
    expect(host.key('Enter')).toBe(true);
    expect(tools.getState()).toMatchObject({ interaction: { type: 'editing-text' }, selection: ['t'], activeTool: null, hover: null });
    const during = tools.getState().selection;
    editor.answer('new');
    await flush();
    expect(store.get('t')?.text).toBe('new');
    expect(tools.getState().interaction.type).toBe('selected');
    expect(tools.getState().selection).toBe(during);
  });

  it('shows the tool a note returns to while its text is edited, with stayInTool only', async () => {
    const staying = deferredEditor();
    const stay = rig({ stayInTool: true }, { editText: staying.editText });
    stay.tools.activate('text-note');
    stay.click(100, 200);
    expect(stay.tools.getState().activeTool).toBe('text-note');
    staying.answer(null);
    await flush();
    expect(stay.tools.getState()).toMatchObject({ activeTool: 'text-note', interaction: { type: 'placing' } });

    const leaving = deferredEditor();
    const leave = rig({}, { editText: leaving.editText });
    leave.tools.activate('text-note');
    leave.click(100, 200);
    expect(leave.tools.getState().activeTool).toBeNull();
    leaving.answer(null);
    await flush();
  });

  it('uses a new selection array when the ids differ but their number does not', () => {
    const { tools } = rig({ store: new DrawingStore([LINE, OTHER, { ...OTHER, id: 'p' }]) });
    tools.select(['l', 'o']);
    tools.select(['l', 'p']);
    expect(tools.getState().selection).toEqual(['l', 'p']);
  });

  it('drops a selected drawing that was removed from the store', () => {
    const { store, tools } = rig({ store: new DrawingStore([LINE]) });
    tools.select(['l']);
    store.remove('l');
    expect(tools.getState().selection).toEqual([]);
    expect(tools.getState().interaction.type).toBe('idle');
  });

  it('reports a change of canRedo alone, and no tool, selection or interaction event for a change of canUndo', () => {
    const { store, tools } = rig();
    const states = record(tools, 'state');
    const others = [record(tools, 'tool'), record(tools, 'selection'), record(tools, 'interaction')];
    store.add(LINE);
    store.add(OTHER);
    expect(states).toHaveLength(1);
    tools.undo();
    expect(states).toHaveLength(2);
    expect(states[1]).toMatchObject({ canUndo: true, canRedo: true });
    expect(others.map((seen) => seen.length)).toEqual([0, 0, 0]);
  });

  it('keeps the scene when only the interaction state changed', () => {
    const { tools } = rig();
    const scene = tools.getScene();
    tools.activate('trend-line');
    expect(tools.getScene()).toBe(scene);
  });
});

describe('what is logged', () => {
  it('logs nothing for inputs the machine accepts', () => {
    const messages: string[] = [];
    const { tools, click } = rig({ debug: (message) => messages.push(message) });
    tools.activate('trend-line');
    expect(messages).toEqual([]);
    click(100, 200);
    expect(messages).toEqual([]);
    click(300, 100);
    // The store change that adds the drawing is a `sync` the machine has nothing to do with while placing.
    expect(messages).toEqual(['Ignored sync while placing.']);
  });

  it('logs nothing when the available tools change while nothing is being placed', () => {
    const messages: string[] = [];
    const { tools } = rig({ debug: (message) => messages.push(message), store: new DrawingStore([LINE]) });
    tools.setOptions({ tools: ['rectangle'] });
    tools.select(['l']);
    tools.setOptions({ tools: ['rectangle', 'trend-line'] });
    expect(messages).toEqual([]);
    expect(tools.getState().selection).toEqual(['l']);
  });

  it('does not follow a drag that did not start', () => {
    const messages: string[] = [];
    const { host } = rig({ debug: (message) => messages.push(message), store: new DrawingStore([LINE]) });
    host.pointer('down', 700, 100);
    host.pointer('move', 720, 120);
    expect(messages).toEqual(['Ignored drag-start while idle.']);
  });
});

describe('selecting with the keyboard', () => {
  it('edits a note with Enter only when it is a note, unlocked and alone', async () => {
    const editor = deferredEditor();
    const lockedNote: Drawing = { ...NOTE, id: 'tl', locked: true };
    const { host, tools } = rig({ store: new DrawingStore([NOTE, lockedNote, LINE]) }, { editText: editor.editText });
    tools.select(['t']);
    expect(host.key('Enter')).toBe(true);
    expect(editor.requests).toEqual([{ drawingId: 't', text: 'hi', x: 100, y: 200, fontSize: resolveStyle(NOTE, LIGHT_THEME).fontSize }]);
    editor.answer(null);
    await flush();
    tools.select(['tl']);
    expect(host.key('Enter')).toBe(false);
    tools.select(['l']);
    expect(host.key('Enter')).toBe(false);
    expect(editor.requests).toHaveLength(1);
  });

  it('edits a note on a double-click', () => {
    const editor = deferredEditor();
    const { host, tools } = rig({ store: new DrawingStore([NOTE]) }, { editText: editor.editText });
    for (let i = 0; i < 2; i++) {
      host.pointer('down', 105, 205);
      host.pointer('up', 105, 205);
    }
    expect(editor.requests).toEqual([{ drawingId: 't', text: 'hi', x: 100, y: 200, fontSize: resolveStyle(NOTE, LIGHT_THEME).fontSize }]);
    expect(tools.getState().interaction.type).toBe('editing-text');
  });

  it('leaves a note as it is when the host has no editor, without an error', async () => {
    const { host, store, tools } = rig({ store: new DrawingStore([NOTE]) });
    const errors = record(tools, 'error');
    tools.select(['t']);
    host.key('Enter');
    await flush();
    expect(errors).toEqual([]);
    expect(store.get('t')?.text).toBe('hi');
    expect(tools.getState().interaction.type).toBe('selected');
  });

  it('reports locked drawings as blocked for Delete and for an arrow key, and leaves them', () => {
    const locked: Drawing = { ...LINE, locked: true };
    const { host, store, tools } = rig({ store: new DrawingStore([locked]) });
    const blocked = record(tools, 'blocked');
    tools.select(['l']);
    expect(host.key('Delete')).toBe(true);
    expect(host.key('ArrowRight')).toBe(true);
    expect(blocked).toEqual([
      { code: 'KFT-E-LOCKED', ids: ['l'] },
      { code: 'KFT-E-LOCKED', ids: ['l'] },
    ]);
    expect(store.list()).toEqual([locked]);
  });

  it('does not select hidden drawings with Ctrl+A', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE, { ...OTHER, hidden: true }]) });
    expect(host.key('a', { ctrlKey: true })).toBe(true);
    expect(tools.getState().selection).toEqual(['l']);
  });

  it('commits a drag at the point where the pointer is released', () => {
    const { host, store, click } = rig({ store: new DrawingStore([LINE]) });
    click(200, 150);
    host.pointer('down', 200, 150);
    host.pointer('move', 220, 170);
    host.pointer('up', 250, 200);
    expect(store.get('l')?.anchors).toEqual([A(150, 250), A(350, 150)]);
  });

  it('follows the pointer while a drawing is moved', () => {
    const { host, store, click } = rig({ store: new DrawingStore([LINE]) });
    click(200, 150);
    host.pointer('down', 200, 150);
    host.pointer('move', 220, 170);
    host.pointer('move', 240, 190);
    expect(store.get('l')?.anchors).toEqual([A(140, 240), A(340, 140)]);
  });

  it('reverts a drag when the pointer is cancelled', () => {
    const { host, store, tools, click } = rig({ store: new DrawingStore([LINE]) });
    click(200, 150);
    host.pointer('down', 200, 150);
    host.pointer('move', 250, 200);
    host.pointer('cancel', 250, 200);
    expect(store.list()).toEqual([LINE]);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('keeps a move on one axis with Shift', () => {
    const { store, click, drag } = rig({ store: new DrawingStore([LINE]) });
    click(200, 150);
    drag([200, 150], [260, 170], [[230, 160]], { shiftKey: true });
    expect(store.get('l')?.anchors).toEqual([A(160, 200), A(360, 100)]);
  });

  it('records a drag as one history entry that coalesces with the next when the history says so', () => {
    const { store, tools, click, drag } = rig({ store: new DrawingStore([LINE]), history: { now: () => 0, coalesceKeys: ['drag'] } });
    click(200, 150);
    drag([200, 150], [250, 200], [[220, 170]]);
    drag([250, 200], [300, 250], [[270, 220]]);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([LINE]);
    expect(tools.undo()).toBe(false);
  });

  it('records quick arrow keys as one history entry', () => {
    const { host, store, tools, click } = rig({ store: new DrawingStore([LINE]) });
    click(200, 150);
    host.key('ArrowRight');
    host.key('ArrowRight');
    expect(store.get('l')?.anchors[0]?.time).toBeGreaterThan(LINE.anchors[0]?.time ?? 0);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([LINE]);
    expect(tools.undo()).toBe(false);
  });
});

describe('pointer, cursors and hover', () => {
  it('keeps the cursor of what is under the pointer when an action runs', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    host.pointer('move', 200, 150);
    expect(host.cursors[host.cursors.length - 1]).toBe('pointer');
    tools.select(['l']);
    expect(host.cursors[host.cursors.length - 1]).toBe('pointer');
  });

  it('shows the resize cursor of a rectangle corner, and nothing is wrong over empty space', () => {
    const rectangle: Drawing = { id: 'r', kind: 'rectangle', anchors: [A(100, 100), A(300, 300)] };
    const { host, tools, click } = rig({ store: new DrawingStore([rectangle]) });
    const errors = record(tools, 'error');
    click(200, 200);
    host.pointer('move', 100, 100);
    expect(host.cursors[host.cursors.length - 1]).toBe('nwse-resize');
    host.pointer('move', 700, 350);
    expect(host.cursors[host.cursors.length - 1]).toBe('default');
    expect(tools.getState().hover).toBeNull();
    expect(errors).toEqual([]);
  });

  it('drops the hover when the pointer leaves', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    host.pointer('move', 200, 150);
    expect(tools.getState().hover).toBe('l');
    host.pointer('leave', 200, 150);
    expect(tools.getState().hover).toBeNull();
  });
});

describe('placing', () => {
  it('shows the drawing in progress where the pointer is, also while it is dragged', () => {
    const { host, tools } = rig();
    tools.activate('trend-line');
    host.pointer('down', 100, 200);
    host.pointer('move', 200, 150);
    expect(previewEnd(tools.getScene())).toEqual({ x: 200, y: 150 });
    host.pointer('move', 250, 120);
    expect(previewEnd(tools.getScene())).toEqual({ x: 250, y: 120 });
  });

  it('starts over when the pointer is cancelled during a drag, with the tool still active', () => {
    const { host, store, tools, click } = rig();
    const errors = record(tools, 'error');
    tools.activate('trend-line');
    host.pointer('down', 100, 200);
    host.pointer('move', 200, 150);
    host.pointer('cancel', 200, 150);
    expect(errors).toEqual([]);
    expect(previewEnd(tools.getScene())).toBeNull();
    expect(tools.getState().activeTool).toBe('trend-line');
    click(100, 200);
    click(300, 100);
    expect(store.list()).toHaveLength(1);
  });

  it('is not disturbed by a double-click in the tool', () => {
    const { host, store, tools } = rig({ stayInTool: true });
    const errors = record(tools, 'error');
    tools.activate('horizontal-line');
    for (let i = 0; i < 2; i++) {
      host.pointer('down', 100, 200);
      host.pointer('up', 100, 200);
    }
    expect(store.list()).toHaveLength(2);
    expect(tools.getState().activeTool).toBe('horizontal-line');
    expect(errors).toEqual([]);
  });

  it('snaps with the Cmd key held as it does with Ctrl', () => {
    const { store, tools, click } = rig({ magnet: 'strong' });
    tools.activate('horizontal-line');
    click(103, 205, { metaKey: true });
    expect(store.list()[0]?.anchors[0]?.price).toBeCloseTo(97.5, 9);
  });

  it('places with the keyboard cursor with the magnet inverted while Ctrl is held', () => {
    const { host, store, tools } = rig({ magnet: 'strong' });
    tools.activate('horizontal-line');
    host.key('ArrowDown');
    host.key('Enter', { ctrlKey: true });
    expect(store.list()[0]?.anchors[0]?.price).toBeCloseTo(99.5, 9);

    const snapped = rig({ magnet: 'strong' });
    snapped.tools.activate('horizontal-line');
    snapped.host.key('ArrowDown');
    snapped.host.key('Enter');
    expect(snapped.store.list()[0]?.anchors[0]?.price).toBeCloseTo(100, 9);
  });

  it('moves the preview with the keyboard cursor', () => {
    const { host, tools } = rig();
    tools.activate('trend-line');
    host.key('Enter');
    const start = previewEnd(tools.getScene());
    host.key('ArrowRight');
    const moved = previewEnd(tools.getScene());
    expect(start).not.toBeNull();
    expect((moved?.x ?? 0) - (start?.x ?? 0)).toBe(10);
  });

  it('starts the keyboard cursor in the default pane, and keeps to the pane of the first anchor', () => {
    const start = rig({ defaultYAxisId: 'volume' }, { panes: TWO_PANES });
    start.tools.activate('horizontal-line');
    start.host.key('Enter');
    expect(start.store.list()[0]?.anchors[0]?.yAxisId).toBe('volume');
    expect(start.store.list()[0]?.anchors[0]?.price).toBeCloseTo(500, 6);

    const second = rig({}, { panes: TWO_PANES });
    second.tools.activate('trend-line');
    second.click(100, 350);
    second.host.key('ArrowRight');
    second.host.key('Enter');
    expect(second.store.list()[0]?.anchors[1]?.price).toBeCloseTo(500, 6);
  });

  it('does nothing with the keyboard when the default pane does not exist', () => {
    const messages: string[] = [];
    const { host, store, tools } = rig({ defaultYAxisId: 'nowhere', debug: (message) => messages.push(message) });
    const errors = record(tools, 'error');
    tools.activate('horizontal-line');
    host.key('ArrowRight');
    // Nothing is sent to the placement: it would log that it ignored a move.
    expect(messages).toEqual([]);
    host.key('Enter');
    expect(messages).toEqual([]);
    expect(errors).toEqual([]);
    expect(store.list()).toEqual([]);
  });
});

describe('a pane that is gone', () => {
  it('leaves a handle drag where it was', () => {
    const panes = [DEFAULT_MOCK_PANE];
    const { host, store, tools, click } = rig({ store: new DrawingStore([LINE]) }, { panes });
    const errors = record(tools, 'error');
    click(200, 150);
    host.pointer('down', 300, 100);
    host.pointer('move', 320, 100);
    panes.splice(0);
    host.pointer('move', 340, 100);
    host.pointer('up', 340, 100);
    expect(errors).toEqual([]);
    expect(store.get('l')?.anchors[1]).toEqual(A(320, 100));
  });

  it('nudges and duplicates nothing', () => {
    const panes = [DEFAULT_MOCK_PANE];
    const { host, store, tools, click } = rig({ store: new DrawingStore([LINE]) }, { panes });
    const errors = record(tools, 'error');
    click(200, 150);
    panes.splice(0);
    expect(host.key('ArrowRight')).toBe(true);
    expect(host.key('d', { ctrlKey: true })).toBe(true);
    expect(errors).toEqual([]);
    expect(store.list()).toEqual([LINE]);
  });
});

describe('options that the tests above do not reach', () => {
  it('uses the options it is given', () => {
    const options: DrawingToolsOptions = { theme: DARK_THEME, stayInTool: true };
    const { tools } = rig(options, {}, [LINE]);
    tools.activate('horizontal-line');
    expect(tools.getState().activeTool).toBe('horizontal-line');
    expect(tools.getScene()[0]).toMatchObject({ style: { color: resolveStyle(LINE, DARK_THEME).color } });
  });
});
