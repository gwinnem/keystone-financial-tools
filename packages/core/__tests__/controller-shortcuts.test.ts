import { describe, expect, it } from 'vitest';
import { toolbarEntries } from '../src/catalog';
import { createDrawingTools } from '../src/controller';
import { DrawingError } from '../src/errors';
import { DEFAULT_TOOLS, DRAWING_KINDS } from '../src/kinds';
import { resolveShortcuts } from '../src/shortcuts';
import { DrawingStore } from '../src/store';
import { createMockHost } from '../src/testing/mock-host';
import type { DrawingKind } from '../src/types';
import { A, deferredEditor, flush, LINE, NOTE, record, rig } from './controller-rig';

// FR-FW-040 and FR-FW-041 through the controller: the toolbar in the state, the tool shortcuts and the
// undo and redo keys, all through `host.onKey`.
const ALT = { altKey: true };
const CTRL = { ctrlKey: true };

describe('tool shortcuts (FR-FW-041)', () => {
  it.each<[string, DrawingKind]>([
    ['t', 'trend-line'],
    ['h', 'horizontal-line'],
    ['r', 'rectangle'],
    ['n', 'text-note'],
    ['f', 'fibonacci-retracement'],
  ])('Alt+%s activates the %s tool and the key is handled', (letter, tool) => {
    const { host, tools } = rig();
    expect(host.key(letter, ALT)).toBe(true);
    expect(tools.getState().activeTool).toBe(tool);
    expect(host.cursors).toStrictEqual(['crosshair']);
  });

  it('takes the capital letter and the physical key, as Option+T on a Mac gives another character', () => {
    const { host, tools } = rig();
    expect(host.key('T', ALT)).toBe(true);
    expect(tools.getState().activeTool).toBe('trend-line');
    tools.deactivate();
    expect(host.key('†', { ...ALT, code: 'KeyH' })).toBe(true);
    expect(tools.getState().activeTool).toBe('horizontal-line');
  });

  it('does not handle a key that is bound to no tool, or has other modifiers', () => {
    const { host, tools } = rig();
    const errors = record(tools, 'error');
    for (const [key, modifiers] of [
      ['a', ALT],
      ['t', {}],
      ['t', { altKey: true, shiftKey: true }],
      ['t', { altKey: true, ctrlKey: true }],
      ['t', { altKey: true, metaKey: true }],
      ['t', CTRL],
      ['†', ALT],
    ] as const) {
      expect(host.key(key, modifiers), `${key} ${JSON.stringify(modifiers)}`).toBe(false);
    }
    expect(tools.getState().activeTool).toBeNull();
    expect(errors).toStrictEqual([]);
  });

  it('switches to the tool of the key while another tool is placing, and drops the drawing in progress', () => {
    const { host, store, tools, click } = rig();
    tools.activate('trend-line');
    click(100, 200);
    expect(host.key('r', ALT)).toBe(true);
    expect(tools.getState().activeTool).toBe('rectangle');
    click(300, 100);
    click(350, 150);
    expect(store.list().map((drawing) => [drawing.kind, drawing.anchors])).toStrictEqual([['rectangle', [A(300, 100), A(350, 150)]]]);
  });

  it('chooses the tool again when it is already the active one, and starts over', () => {
    const { host, store, tools, click } = rig();
    tools.activate('trend-line');
    click(100, 200);
    expect(host.key('t', ALT)).toBe(true);
    click(300, 100);
    expect(store.list()).toStrictEqual([]);
    expect(tools.getState().activeTool).toBe('trend-line');
  });

  it('leaves a selection when it activates a tool', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    tools.select(['l']);
    expect(host.key('h', ALT)).toBe(true);
    expect(tools.getState()).toMatchObject({ activeTool: 'horizontal-line', selection: [] });
  });

  it('uses the shortcuts of the option over the defaults', () => {
    const { host, tools } = rig({ shortcuts: { 'trend-line': 'Ctrl+Alt+L', 'fibonacci-arcs': 'Alt+A' } });
    expect(host.key('t', ALT)).toBe(false);
    expect(host.key('l', { ...ALT, ...CTRL })).toBe(true);
    expect(tools.getState().activeTool).toBe('trend-line');
    expect(host.key('a', ALT)).toBe(true);
    expect(tools.getState().activeTool).toBe('fibonacci-arcs');
    expect(host.key('h', ALT)).toBe(true);
    expect(tools.getState().activeTool).toBe('horizontal-line');
  });

  it('takes Cmd as it takes Ctrl', () => {
    const { host, tools } = rig({ shortcuts: { rectangle: 'Cmd+Q' } });
    expect(host.key('q', { metaKey: true })).toBe(true);
    expect(tools.getState().activeTool).toBe('rectangle');
    tools.deactivate();
    expect(host.key('q', CTRL)).toBe(true);
    expect(tools.getState().activeTool).toBe('rectangle');
  });

  it('turns a shortcut off with null', () => {
    const { host, tools } = rig({ shortcuts: { rectangle: null } });
    expect(host.key('r', ALT)).toBe(false);
    expect(tools.getState().activeTool).toBeNull();
    expect(host.key('t', ALT)).toBe(true);
  });

  it('does not handle the key of a tool that is not in the tools option, and handles it once it is', () => {
    const { host, tools } = rig({ tools: ['rectangle'] });
    const errors = record(tools, 'error');
    expect(host.key('t', ALT)).toBe(false);
    expect(tools.getState().activeTool).toBeNull();
    expect(host.key('r', ALT)).toBe(true);
    expect(tools.getState().activeTool).toBe('rectangle');
    tools.setOptions({ tools: ['trend-line'] });
    expect(tools.getState().activeTool).toBeNull();
    expect(host.key('r', ALT)).toBe(false);
    expect(host.key('t', ALT)).toBe(true);
    expect(tools.getState().activeTool).toBe('trend-line');
    expect(errors).toStrictEqual([]);
  });

  it('does not change the tool while a drawing is dragged', () => {
    const { host, tools, click } = rig({ store: new DrawingStore([LINE]) });
    click(200, 150);
    host.pointer('down', 200, 150);
    host.pointer('move', 220, 170);
    expect(tools.getState().interaction.type).toBe('moving');
    expect(host.key('t', ALT)).toBe(false);
    expect(tools.getState()).toMatchObject({ activeTool: null, interaction: { type: 'moving' } });
    host.pointer('up', 220, 170);
    expect(tools.getState().interaction.type).toBe('selected');
  });

  it('does not change the tool while the text of a note is edited', async () => {
    const editor = deferredEditor();
    const { host, tools } = rig({ store: new DrawingStore([NOTE]) }, { editText: editor.editText });
    tools.select(['t']);
    host.key('Enter');
    expect(tools.getState().interaction.type).toBe('editing-text');
    expect(host.key('r', ALT)).toBe(false);
    expect(tools.getState().interaction.type).toBe('editing-text');
    editor.answer(null);
    await flush();
    expect(tools.getState().activeTool).toBeNull();
  });

  it('is gone with the tools: no listener, so no key is handled', () => {
    const { host, tools } = rig();
    tools.destroy();
    expect(host.listenerCount('key')).toBe(0);
    expect(host.key('t', ALT)).toBe(false);
    expect(host.key('z', CTRL)).toBe(false);
  });

  it('checks the option when the tools are created, before anything is subscribed', () => {
    const host = createMockHost();
    expect(() => createDrawingTools(host, { shortcuts: { rectangle: 'R' } })).toThrow(RangeError);
    expect(() => createDrawingTools(host, { shortcuts: { rectangle: 'Ctrl+Z' } })).toThrow(RangeError);
    expect(() => createDrawingTools(host, { shortcuts: { 'trend-line': 'Alt+H' } })).toThrow(new RangeError('The shortcut Alt+H is given to both trend-line and horizontal-line.'));
    expect(host.listenerCount('pointer')).toBe(0);
    expect(host.listenerCount('key')).toBe(0);
    expect(host.listenerCount('viewport')).toBe(0);
  });

  it('rejects a name that is not a tool with KFT-E-KIND', () => {
    expect(() => createDrawingTools(createMockHost(), { shortcuts: { pitchfork: 'Alt+P' } as never })).toThrow(DrawingError);
    expect(() => createDrawingTools(createMockHost(), { shortcuts: { pitchfork: 'Alt+P' } as never })).toThrow('KFT-E-KIND: Unknown drawing kinds in shortcuts: pitchfork.');
  });
});

describe('undo and redo keys (FR-FW-041)', () => {
  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z and with Ctrl+Y, and handles those keys', () => {
    const { host, store } = rig();
    store.add(LINE);
    expect(host.key('z', CTRL)).toBe(true);
    expect(store.list()).toStrictEqual([]);
    expect(host.key('Z', { ...CTRL, shiftKey: true })).toBe(true);
    expect(store.list()).toStrictEqual([LINE]);
    expect(host.key('z', CTRL)).toBe(true);
    expect(store.list()).toStrictEqual([]);
    expect(host.key('y', CTRL)).toBe(true);
    expect(store.list()).toStrictEqual([LINE]);
  });

  it('takes Cmd as it takes Ctrl', () => {
    const { host, store } = rig();
    store.add(LINE);
    expect(host.key('z', { metaKey: true })).toBe(true);
    expect(store.list()).toStrictEqual([]);
    expect(host.key('z', { metaKey: true, shiftKey: true })).toBe(true);
    expect(store.list()).toStrictEqual([LINE]);
    host.key('z', { metaKey: true });
    expect(host.key('y', { metaKey: true })).toBe(true);
    expect(store.list()).toStrictEqual([LINE]);
  });

  it('does not handle the key when there is nothing to undo or redo, so the host keeps it', () => {
    const { host, store } = rig();
    expect(host.key('z', CTRL)).toBe(false);
    expect(host.key('y', CTRL)).toBe(false);
    expect(host.key('z', { ...CTRL, shiftKey: true })).toBe(false);
    store.add(LINE);
    expect(host.key('y', CTRL)).toBe(false);
    expect(host.key('z', CTRL)).toBe(true);
    expect(host.key('z', CTRL)).toBe(false);
  });

  it('undoes a drawing that was placed with a tool, as one step', () => {
    const { host, store, tools, click } = rig();
    tools.activate('horizontal-line');
    click(100, 200);
    expect(store.list()).toHaveLength(1);
    expect(host.key('z', CTRL)).toBe(true);
    expect(store.list()).toStrictEqual([]);
  });

  it('publishes the new state and asks for a render, as the action does', () => {
    const { host, store, tools } = rig();
    store.add(LINE);
    const states = record(tools, 'state');
    const renders = host.renderRequests;
    host.key('z', CTRL);
    expect(tools.getState()).toMatchObject({ canUndo: false, canRedo: true });
    expect(states.length).toBeGreaterThan(0);
    expect(host.renderRequests).toBeGreaterThan(renders);
    host.key('y', CTRL);
    expect(tools.getState()).toMatchObject({ canUndo: true, canRedo: false });
  });

  it('does not undo while the text editor of a new note is open, and leaves the note', async () => {
    const editor = deferredEditor();
    const { host, store, tools, click } = rig({}, { editText: editor.editText });
    tools.activate('text-note');
    click(100, 200);
    expect(host.key('z', CTRL)).toBe(false);
    expect(store.list()).toHaveLength(1);
    editor.answer('hello');
    await flush();
    expect(store.list()[0]?.text).toBe('hello');
    expect(host.key('z', CTRL)).toBe(true);
    expect(store.list()).toStrictEqual([]);
  });

  it('does not take Ctrl+Alt+Z or Ctrl+Shift+Y for undo or redo', () => {
    const { host, store } = rig();
    store.add(LINE);
    expect(host.key('z', { ...CTRL, altKey: true })).toBe(false);
    expect(host.key('y', { ...CTRL, shiftKey: true })).toBe(false);
    expect(host.key('z')).toBe(false);
    expect(store.list()).toStrictEqual([LINE]);
  });

  it('leaves the other Ctrl keys of the tools as they were', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    expect(host.key('a', CTRL)).toBe(true);
    expect(tools.getState().selection).toStrictEqual(['l']);
    expect(host.key('d', CTRL)).toBe(true);
    expect(tools.getState().selection).toHaveLength(1);
    expect(tools.getState().selection).not.toContain('l');
  });
});

describe('the toolbar in the state (FR-FW-040)', () => {
  const ALL = new Set<DrawingKind>(DRAWING_KINDS);

  it('has every tool enabled and none active before anything is done, with the default shortcuts', () => {
    const { tools } = rig();
    const { toolbar } = tools.getState();
    expect(toolbar).toStrictEqual(toolbarEntries(null, ALL, resolveShortcuts().shortcuts));
    expect(toolbar.map((entry) => entry.id)).toStrictEqual([...DEFAULT_TOOLS]);
    expect(toolbar.every((entry) => entry.enabled && !entry.active)).toBe(true);
    expect(toolbar.map((entry) => entry.shortcut)).toStrictEqual(['Alt+T', 'Alt+H', 'Alt+R', 'Alt+F', null, null, null, 'Alt+N']);
  });

  it('marks the tool that is placing drawings as active, and no tool once it is done', () => {
    const { tools, click } = rig();
    tools.activate('rectangle');
    expect(
      tools
        .getState()
        .toolbar.filter((entry) => entry.active)
        .map((entry) => entry.id)
    ).toStrictEqual(['rectangle']);
    tools.activate('text-note');
    expect(
      tools
        .getState()
        .toolbar.filter((entry) => entry.active)
        .map((entry) => entry.id)
    ).toStrictEqual(['text-note']);
    tools.deactivate();
    expect(tools.getState().toolbar.some((entry) => entry.active)).toBe(false);
    tools.activate('horizontal-line');
    click(100, 200);
    expect(tools.getState().toolbar.some((entry) => entry.active)).toBe(false);
  });

  it('keeps the tool active while its note is edited and it stays in the tool', async () => {
    const editor = deferredEditor();
    const { tools, click } = rig({ stayInTool: true }, { editText: editor.editText });
    tools.activate('text-note');
    click(100, 200);
    expect(tools.getState().toolbar.find((entry) => entry.id === 'text-note')?.active).toBe(true);
    editor.answer(null);
    await flush();
    expect(tools.getState().toolbar.find((entry) => entry.id === 'text-note')?.active).toBe(true);
  });

  it('keeps the same array while no entry changes, and gives a new one when one does', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    const first = tools.getState().toolbar;
    host.pointer('move', 200, 150);
    expect(tools.getState().hover).toBe('l');
    expect(tools.getState().toolbar).toBe(first);
    tools.select(['l']);
    expect(tools.getState().toolbar).toBe(first);
    tools.activate('rectangle');
    const second = tools.getState().toolbar;
    expect(second).not.toBe(first);
    expect(first.some((entry) => entry.active)).toBe(false);
    host.key('Escape');
    expect(tools.getState().toolbar).not.toBe(second);
    expect(tools.getState().toolbar.some((entry) => entry.active)).toBe(false);
  });

  it('enables only the tools of the tools option', () => {
    const { tools } = rig({ tools: ['rectangle', 'text-note'] });
    expect(
      tools
        .getState()
        .toolbar.filter((entry) => entry.enabled)
        .map((entry) => entry.id)
    ).toStrictEqual(['rectangle', 'text-note']);
    expect(
      rig({ tools: [] })
        .tools.getState()
        .toolbar.some((entry) => entry.enabled)
    ).toBe(false);
  });

  it('shows the shortcuts of the option, null for one that is off', () => {
    const { tools } = rig({ shortcuts: { 'trend-line': 'ctrl+alt+l', rectangle: null, 'fibonacci-fans': 'Alt+X' } });
    const byId = new Map(tools.getState().toolbar.map((entry) => [entry.id, entry.shortcut]));
    expect(byId.get('trend-line')).toBe('Ctrl+Alt+L');
    expect(byId.get('rectangle')).toBeNull();
    expect(byId.get('fibonacci-fans')).toBe('Alt+X');
    expect(byId.get('horizontal-line')).toBe('Alt+H');
  });

  it('publishes a new state when setOptions changes which tools are enabled, and not when it does not', () => {
    const { tools } = rig();
    const states = record(tools, 'state');
    const others = [record(tools, 'tool'), record(tools, 'selection'), record(tools, 'interaction')];
    tools.setOptions({ tools: ['rectangle'] });
    expect(states).toHaveLength(1);
    expect(states[0]).toBe(tools.getState());
    expect(
      tools
        .getState()
        .toolbar.filter((entry) => entry.enabled)
        .map((entry) => entry.id)
    ).toStrictEqual(['rectangle']);
    tools.setOptions({ tools: ['rectangle'] });
    tools.setOptions({ stayInTool: true });
    tools.setOptions({});
    expect(states).toHaveLength(1);
    tools.setOptions({ tools: ['rectangle', 'trend-line'] });
    expect(states).toHaveLength(2);
    expect(
      tools
        .getState()
        .toolbar.filter((entry) => entry.enabled)
        .map((entry) => entry.id)
    ).toStrictEqual(['trend-line', 'rectangle']);
    expect(others.map((seen) => seen.length)).toStrictEqual([0, 0, 0]);
  });

  it('drops the active tool from the toolbar when setOptions no longer allows it', () => {
    const { tools } = rig();
    tools.activate('trend-line');
    tools.setOptions({ tools: ['rectangle'] });
    const { toolbar, activeTool } = tools.getState();
    expect(activeTool).toBeNull();
    expect(toolbar.find((entry) => entry.id === 'trend-line')).toMatchObject({ active: false, enabled: false });
    expect(toolbar.find((entry) => entry.id === 'rectangle')).toMatchObject({ active: false, enabled: true });
  });

  it('keeps the shortcut and the order of the entries when the state changes', () => {
    const { tools } = rig({ shortcuts: { 'trend-line': 'Alt+L' } });
    tools.activate('trend-line');
    tools.setOptions({ tools: ['trend-line', 'rectangle'] });
    expect(tools.getState().toolbar.map((entry) => [entry.id, entry.shortcut])).toStrictEqual([
      ['trend-line', 'Alt+L'],
      ['horizontal-line', 'Alt+H'],
      ['rectangle', 'Alt+R'],
      ['fibonacci-retracement', 'Alt+F'],
      ['fibonacci-arcs', null],
      ['fibonacci-fans', null],
      ['fibonacci-time-zones', null],
      ['text-note', 'Alt+N'],
    ]);
  });
});
