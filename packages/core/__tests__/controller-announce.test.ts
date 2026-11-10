import { describe, expect, it } from 'vitest';
import { ANCHOR_COUNT, DEFAULT_TOOLS } from '../src/kinds';
import { DEFAULT_MESSAGES } from '../src/messages';
import { DrawingStore } from '../src/store';
import type { Drawing } from '../src/types';
import { deferredEditor, flush, LINE, NOTE, OTHER, record, rig } from './controller-rig';

// NFR-A11Y-001 through the controller: the `announce` event, one localised message for each action.
const CTRL = { ctrlKey: true };
const ALT = { altKey: true };
const LOCKED: Drawing = { ...LINE, locked: true };
const TWO = (): DrawingStore => new DrawingStore([LINE, OTHER]);

describe('placing', () => {
  it('announces the drawing when it is placed, with the name of its tool, and not before', () => {
    const { tools, click } = rig();
    const said = record(tools, 'announce');
    tools.activate('trend-line');
    click(100, 200);
    expect(said).toStrictEqual([]);
    click(300, 100);
    expect(said).toStrictEqual(['Trend line placed']);
  });

  it('does not announce that the new drawing is selected on top of it', () => {
    const { tools, click } = rig();
    const said = record(tools, 'announce');
    tools.activate('trend-line');
    click(100, 200);
    click(300, 100);
    expect(tools.getState().selection).toStrictEqual(['d1']);
    expect(said).toHaveLength(1);
  });

  it.each(DEFAULT_TOOLS.filter((kind) => kind !== 'text-note'))('names the %s tool', (kind) => {
    const { tools, click } = rig();
    const said = record(tools, 'announce');
    tools.activate(kind);
    const points: [number, number][] = [
      [100, 200],
      [300, 100],
    ];
    for (const [x, y] of points.slice(0, ANCHOR_COUNT[kind])) click(x, y);
    expect(said).toStrictEqual([`${DEFAULT_MESSAGES[`tool.${kind}`]} placed`]);
  });

  it('announces a drawing placed by a drag', () => {
    const { tools, drag } = rig();
    const said = record(tools, 'announce');
    tools.activate('rectangle');
    drag([100, 200], [300, 100]);
    expect(said).toStrictEqual(['Rectangle placed']);
  });

  it('announces a drawing placed with the keyboard', () => {
    const { host, tools } = rig();
    const said = record(tools, 'announce');
    host.key('t', ALT);
    host.key('Enter');
    expect(said).toStrictEqual(['Trend line tool active']);
    host.key('ArrowRight', { shiftKey: true });
    host.key('Enter');
    expect(said).toStrictEqual(['Trend line tool active', 'Trend line placed']);
  });

  it('announces every drawing of a row, also when the message is the same', () => {
    const { tools, click } = rig({ stayInTool: true });
    const said = record(tools, 'announce');
    tools.activate('trend-line');
    click(100, 200);
    click(300, 100);
    click(100, 300);
    click(300, 250);
    expect(said).toStrictEqual(['Trend line placed', 'Trend line placed']);
  });

  it('says nothing when the drawing could not be added', () => {
    const { tools, click } = rig({ createId: () => 'l', store: new DrawingStore([LINE]) });
    const said = record(tools, 'announce');
    const errors = record(tools, 'error');
    tools.activate('rectangle');
    click(100, 200);
    click(300, 100);
    expect(errors).toHaveLength(1);
    expect(said).toStrictEqual([]);
  });

  it('says nothing for a pointer that only moves, hovers or cancels', () => {
    const { host, tools, click } = rig({ store: new DrawingStore([LINE]) });
    const said = record(tools, 'announce');
    host.pointer('move', 200, 150);
    host.pointer('move', 600, 50);
    tools.activate('trend-line');
    click(100, 200);
    host.pointer('move', 150, 150);
    host.key('Escape');
    tools.deactivate();
    expect(said).toStrictEqual([]);
  });
});

describe('text notes', () => {
  it('announces a new note when its editor confirms it, not when it opens', async () => {
    const editor = deferredEditor();
    const { tools, click } = rig({}, { editText: editor.editText });
    const said = record(tools, 'announce');
    tools.activate('text-note');
    click(100, 200);
    expect(tools.getState().interaction.type).toBe('editing-text');
    expect(said).toStrictEqual([]);
    editor.answer('hello');
    await flush();
    expect(said).toStrictEqual(['Text note placed']);
  });

  it('says nothing about a new note whose editor is cancelled, as the note is taken back', async () => {
    const editor = deferredEditor();
    const { store, tools, click } = rig({}, { editText: editor.editText });
    const said = record(tools, 'announce');
    tools.activate('text-note');
    click(100, 200);
    editor.answer(null);
    await flush();
    expect(store.list()).toStrictEqual([]);
    expect(said).toStrictEqual([]);
  });

  it('announces a note that is placed without an editor', async () => {
    const { tools, click } = rig();
    const said = record(tools, 'announce');
    tools.activate('text-note');
    click(100, 200);
    await flush();
    expect(said).toStrictEqual(['Text note placed']);
  });

  it('announces a note whose editor failed, which stays as it is', async () => {
    const { tools, click } = rig({ editText: () => Promise.reject(new Error('no editor')) });
    const said = record(tools, 'announce');
    const errors = record(tools, 'error');
    tools.activate('text-note');
    click(100, 200);
    await flush();
    expect(errors).toHaveLength(1);
    expect(said).toStrictEqual(['Text note placed']);
  });

  it('does not announce a placement when the text of an existing note is edited', async () => {
    const editor = deferredEditor();
    const { host, tools } = rig({ store: new DrawingStore([NOTE]) }, { editText: editor.editText });
    const said = record(tools, 'announce');
    tools.select(['t']);
    host.key('Enter');
    editor.answer('changed');
    await flush();
    expect(said).toStrictEqual(['Text note selected']);
  });

  it('announces the next new note after one that was cancelled', async () => {
    const answers: (string | null)[] = [null, 'second'];
    const { tools, click } = rig({ editText: () => Promise.resolve(answers.shift() ?? null) });
    const said = record(tools, 'announce');
    tools.activate('text-note');
    click(100, 200);
    await flush();
    tools.activate('text-note');
    click(300, 100);
    await flush();
    expect(said).toStrictEqual(['Text note placed']);
  });
});

describe('selecting', () => {
  it('announces the drawing a click selects, with the name of its tool', () => {
    const { tools, click } = rig({ store: TWO() });
    const said = record(tools, 'announce');
    click(200, 150);
    expect(said).toStrictEqual(['Trend line selected']);
    expect(tools.getState().selection).toStrictEqual(['l']);
    click(550, 300);
    expect(said).toStrictEqual(['Trend line selected', 'Rectangle selected']);
  });

  it('counts the drawings when several are selected', () => {
    const { host, tools } = rig({ store: TWO() });
    const said = record(tools, 'announce');
    host.key('a', CTRL);
    expect(said).toStrictEqual(['2 drawings selected']);
    expect(tools.getState().selection).toStrictEqual(['l', 'o']);
  });

  it('announces a selection made with the select action, of the drawings that exist', () => {
    const { tools } = rig({ store: TWO() });
    const said = record(tools, 'announce');
    tools.select(['o', 'nope']);
    tools.select(['l', 'o']);
    expect(said).toStrictEqual(['Rectangle selected', '2 drawings selected']);
  });

  it('says nothing when the selection does not change', () => {
    const { tools, click } = rig({ store: TWO() });
    tools.select(['l']);
    const said = record(tools, 'announce');
    tools.select(['l']);
    click(200, 150);
    expect(said).toStrictEqual([]);
  });

  it('says nothing when the selection is cleared, or when nothing exists to select', () => {
    const { host, tools, click } = rig({ store: TWO() });
    tools.select(['l']);
    const said = record(tools, 'announce');
    host.key('Escape');
    expect(tools.getState().selection).toStrictEqual([]);
    tools.select(['nope']);
    expect(tools.getState().selection).toStrictEqual([]);
    expect(said).toStrictEqual([]);
    tools.select(['l']);
    said.length = 0;
    click(700, 50);
    expect(tools.getState().selection).toStrictEqual([]);
    tools.select(['o']);
    said.length = 0;
    tools.clearSelection();
    expect(said).toStrictEqual([]);
  });

  it('announces the copy that Ctrl+D selects', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    tools.select(['l']);
    const said = record(tools, 'announce');
    host.key('d', CTRL);
    expect(tools.getState().selection).not.toContain('l');
    expect(said).toStrictEqual(['Trend line selected']);
  });

  it('says nothing about moving a drawing: not when it is dragged, nudged or its handle is dragged', () => {
    const { host, tools, click, drag } = rig({ store: new DrawingStore([LINE]) });
    click(200, 150);
    const said = record(tools, 'announce');
    drag([200, 150], [220, 170]);
    host.key('ArrowRight');
    host.key('ArrowUp', { shiftKey: true });
    // The drawing moved by (20, 20) with the drag, one bar right and ten pixels up with the keys: its first handle is at (130, 210).
    drag([130, 210], [150, 190]);
    expect(said).toStrictEqual([]);
  });

  it('says nothing about a drawing under the pointer', () => {
    const { host, tools } = rig({ store: TWO() });
    const said = record(tools, 'announce');
    host.pointer('move', 200, 150);
    expect(tools.getState().hover).toBe('l');
    expect(said).toStrictEqual([]);
  });
});

describe('deleting', () => {
  it('announces the drawing the Delete key removes, with the name of its tool', () => {
    const { host, store, tools } = rig({ store: TWO() });
    tools.select(['o']);
    const said = record(tools, 'announce');
    host.key('Delete');
    expect(store.get('o')).toBeUndefined();
    expect(said).toStrictEqual(['Rectangle deleted']);
  });

  it('counts the drawings when several are deleted', () => {
    const { host, store, tools } = rig({ store: TWO() });
    host.key('a', CTRL);
    const said = record(tools, 'announce');
    host.key('Backspace');
    expect(store.list()).toStrictEqual([]);
    expect(said).toStrictEqual(['2 drawings deleted']);
    expect(tools.getState().selection).toStrictEqual([]);
  });

  it('announces what remove deletes: one drawing by its tool, several by their number', () => {
    const { store, tools } = rig({ store: new DrawingStore([LINE, OTHER, NOTE]) });
    const said = record(tools, 'announce');
    tools.remove(['l']);
    tools.remove(['o', 't']);
    expect(store.list()).toStrictEqual([]);
    expect(said).toStrictEqual(['Trend line deleted', '2 drawings deleted']);
  });

  it('says only that, and not that the rest of the selection is selected', () => {
    const { store, tools } = rig({ store: TWO() });
    tools.select(['l', 'o']);
    const said = record(tools, 'announce');
    tools.remove(['l']);
    expect(tools.getState().selection).toStrictEqual(['o']);
    expect(store.list().map((drawing) => drawing.id)).toStrictEqual(['o']);
    expect(said).toStrictEqual(['Trend line deleted']);
  });

  it('counts only the drawings that were there, and each once', () => {
    const { tools } = rig({ store: TWO() });
    const said = record(tools, 'announce');
    tools.remove(['l', 'l']);
    tools.remove(['o', 'nope']);
    expect(said).toStrictEqual(['Trend line deleted', 'Rectangle deleted']);
  });

  it('says nothing when there is nothing to delete', () => {
    const { host, tools } = rig({ store: new DrawingStore([LINE]) });
    const said = record(tools, 'announce');
    tools.remove([]);
    tools.remove(['nope']);
    host.key('Delete');
    expect(said).toStrictEqual([]);
  });

  it('says that a locked drawing is locked, which Delete leaves alone, and announces the others that it deletes', () => {
    const { host, store, tools } = rig({ store: new DrawingStore([LOCKED, OTHER]) });
    const blocked = record(tools, 'blocked');
    tools.select(['l']);
    const said = record(tools, 'announce');
    host.key('Delete');
    expect(blocked).toHaveLength(1);
    expect(store.list()).toHaveLength(2);
    expect(said).toStrictEqual(['Trend line is locked']);
    host.key('a', CTRL);
    said.length = 0;
    host.key('Delete');
    expect(store.list().map((drawing) => drawing.id)).toStrictEqual(['l']);
    expect(said).toStrictEqual(['Rectangle deleted']);
  });

  it('announces a drawing that a locked one is selected with, once', () => {
    const { host, tools } = rig({ store: new DrawingStore([LOCKED, OTHER]) });
    const said = record(tools, 'announce');
    host.key('a', CTRL);
    host.key('Delete');
    expect(said).toStrictEqual(['2 drawings selected', 'Rectangle deleted']);
  });
});

describe('locked drawings', () => {
  const LOCKED_OTHER: Drawing = { ...OTHER, locked: true };

  it('announces the drawing that Delete leaves alone, with the name of its tool, once for each key press', () => {
    const { host, tools } = rig({ store: new DrawingStore([LOCKED, OTHER]) });
    const blocked = record(tools, 'blocked');
    tools.select(['l']);
    const said = record(tools, 'announce');
    host.key('Delete');
    expect(said).toStrictEqual(['Trend line is locked']);
    host.key('Backspace');
    expect(said).toStrictEqual(['Trend line is locked', 'Trend line is locked']);
    expect(blocked).toHaveLength(2);
    expect(tools.getState().selection).toStrictEqual(['l']);
  });

  it('counts the drawings when several locked ones are asked to change', () => {
    const { host, tools } = rig({ store: new DrawingStore([LOCKED, LOCKED_OTHER]) });
    host.key('a', CTRL);
    const said = record(tools, 'announce');
    host.key('Delete');
    host.key('ArrowRight');
    expect(said).toStrictEqual(['2 drawings are locked', '2 drawings are locked']);
  });

  it.each([['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown']])('announces the drawing an %s key leaves alone, also with Shift', (key) => {
    const { host, tools } = rig({ store: new DrawingStore([LOCKED]) });
    tools.select(['l']);
    const said = record(tools, 'announce');
    host.key(key);
    host.key(key, { shiftKey: true });
    expect(said).toStrictEqual(['Trend line is locked', 'Trend line is locked']);
  });

  it('announces a drag that starts on a locked drawing once, and not what the pointer does after it', () => {
    const { tools, drag } = rig({ store: new DrawingStore([LOCKED]) });
    tools.select(['l']);
    const said = record(tools, 'announce');
    drag(
      [200, 150],
      [260, 190],
      [
        [220, 160],
        [240, 170],
      ]
    );
    expect(said).toStrictEqual(['Trend line is locked']);
  });

  it('says what a delete removed, and not that a locked drawing of the selection stays', () => {
    const { host, tools } = rig({ store: new DrawingStore([LOCKED, OTHER]) });
    host.key('a', CTRL);
    const said = record(tools, 'announce');
    host.key('Delete');
    expect(said).toStrictEqual(['Rectangle deleted']);
  });

  it('says that a locked drawing stays when a nudge moves the others, and when a drag moves them', () => {
    const { host, tools, drag } = rig({ store: new DrawingStore([LOCKED, OTHER]) });
    host.key('a', CTRL);
    const said = record(tools, 'announce');
    host.key('ArrowRight');
    expect(said).toStrictEqual(['Trend line is locked']);
    drag([550, 300], [560, 310]);
    expect(said).toStrictEqual(['Trend line is locked', 'Trend line is locked']);
  });

  it('says nothing more than the selection for a click on a locked drawing, and nothing for what is not locked', () => {
    const { host, tools, click, drag } = rig({ store: new DrawingStore([LOCKED, OTHER]) });
    const said = record(tools, 'announce');
    click(200, 150);
    expect(said).toStrictEqual(['Trend line selected']);
    said.length = 0;
    tools.select(['o']);
    said.length = 0;
    host.key('ArrowRight');
    drag([550, 300], [560, 310]);
    host.key('Delete');
    expect(said).toStrictEqual(['Rectangle deleted']);
  });

  it('says nothing for a locked drawing that is gone', () => {
    const { host, store, tools } = rig({ store: new DrawingStore([LOCKED]) });
    tools.select(['l']);
    store.remove('l');
    const said = record(tools, 'announce');
    host.key('Delete');
    expect(said).toStrictEqual([]);
  });

  it('gives the announcement in the language of the application', () => {
    const { host, tools } = rig({
      store: new DrawingStore([LOCKED, LOCKED_OTHER]),
      messages: { 'tool.trend-line': 'Trendlinie', 'announce.blocked': '{tool} ist gesperrt', 'announce.blockedMany': '{count} Zeichnungen sind gesperrt' },
    });
    tools.select(['l']);
    const said = record(tools, 'announce');
    host.key('Delete');
    host.key('a', CTRL);
    said.length = 0;
    host.key('Delete');
    expect(said).toStrictEqual(['2 Zeichnungen sind gesperrt']);
    tools.select(['l']);
    said.length = 0;
    host.key('ArrowUp');
    expect(said).toStrictEqual(['Trendlinie ist gesperrt']);
  });
});

describe('tool shortcuts', () => {
  it.each([
    ['t', 'Trend line'],
    ['h', 'Horizontal line'],
    ['r', 'Rectangle'],
    ['f', 'Fibonacci retracement'],
    ['n', 'Text note'],
  ])('announces the tool Alt+%s chooses', (key, name) => {
    const { host, tools } = rig();
    const said = record(tools, 'announce');
    expect(host.key(key, ALT)).toBe(true);
    expect(said).toStrictEqual([`${name} tool active`]);
    expect(tools.getState().activeTool).not.toBeNull();
  });

  it('does not announce a tool that is chosen with activate, which is what the toolbar button does', () => {
    const { tools } = rig();
    const said = record(tools, 'announce');
    tools.activate('trend-line');
    tools.activate('rectangle');
    expect(said).toStrictEqual([]);
  });

  it('announces every shortcut: a change of tool and the same tool again', () => {
    const { host, tools } = rig();
    const said = record(tools, 'announce');
    host.key('t', ALT);
    host.key('r', ALT);
    host.key('r', ALT);
    expect(said).toStrictEqual(['Trend line tool active', 'Rectangle tool active', 'Rectangle tool active']);
  });

  it('announces the tool chosen from a selection, and not that the selection is gone', () => {
    const { host, tools } = rig({ store: TWO() });
    tools.select(['l']);
    const said = record(tools, 'announce');
    host.key('r', ALT);
    expect(tools.getState().selection).toStrictEqual([]);
    expect(said).toStrictEqual(['Rectangle tool active']);
  });

  it('says nothing for a tool that is not allowed, and leaves the key to the host', () => {
    const { host, tools } = rig({ tools: ['rectangle'] });
    const said = record(tools, 'announce');
    expect(host.key('t', ALT)).toBe(false);
    expect(tools.getState().activeTool).toBeNull();
    expect(said).toStrictEqual([]);
  });

  it('says nothing for a tool that is turned off or has no shortcut', () => {
    const { host, tools } = rig({ shortcuts: { 'trend-line': null } });
    const said = record(tools, 'announce');
    expect(host.key('t', ALT)).toBe(false);
    expect(said).toStrictEqual([]);
  });

  it('says nothing while the state cannot change tool, when a note is edited', () => {
    const editor = deferredEditor();
    const { host, tools, click } = rig({}, { editText: editor.editText });
    tools.activate('text-note');
    click(100, 200);
    expect(tools.getState().interaction.type).toBe('editing-text');
    const said = record(tools, 'announce');
    expect(host.key('r', ALT)).toBe(false);
    expect(said).toStrictEqual([]);
  });

  it('gives the announcement with the key of the shortcut option and in the language of the application', () => {
    const { host, tools } = rig({ shortcuts: { 'trend-line': 'Alt+L' }, messages: { 'tool.trend-line': 'Trendlinie', 'announce.toolActive': 'Werkzeug {tool} aktiv' } });
    const said = record(tools, 'announce');
    host.key('l', ALT);
    expect(said).toStrictEqual(['Werkzeug Trendlinie aktiv']);
  });

  it('is raised once, after the state is published, with the tool already active', () => {
    const { host, tools } = rig();
    let active: unknown;
    const said = record(tools, 'announce');
    tools.on('announce', () => {
      active = tools.getState().activeTool;
    });
    host.key('t', ALT);
    expect(said).toHaveLength(1);
    expect(active).toBe('trend-line');
  });
});

describe('undo and redo', () => {
  it('announces an undo and a redo, from the keys and from the actions', () => {
    const { host, store, tools } = rig();
    store.add(LINE);
    const said = record(tools, 'announce');
    host.key('z', CTRL);
    host.key('y', CTRL);
    expect(tools.undo()).toBe(true);
    expect(tools.redo()).toBe(true);
    host.key('z', CTRL);
    host.key('z', { ...CTRL, shiftKey: true });
    expect(said).toStrictEqual(['Undone', 'Redone', 'Undone', 'Redone', 'Undone', 'Redone']);
    expect(store.list().map((drawing) => drawing.id)).toStrictEqual(['l']);
  });

  it('says nothing when there is nothing to undo or redo', () => {
    const { host, tools } = rig();
    const said = record(tools, 'announce');
    expect(tools.undo()).toBe(false);
    expect(tools.redo()).toBe(false);
    expect(host.key('z', CTRL)).toBe(false);
    expect(host.key('y', CTRL)).toBe(false);
    expect(said).toStrictEqual([]);
  });

  it('says only that, and not that the drawings that remain selected are selected', () => {
    const { tools, click } = rig({ stayInTool: true });
    tools.activate('trend-line');
    click(100, 200);
    click(300, 100);
    click(100, 300);
    click(300, 250);
    tools.deactivate();
    tools.select(['d1', 'd2']);
    const said = record(tools, 'announce');
    expect(tools.undo()).toBe(true);
    expect(tools.getState().selection).toStrictEqual(['d1']);
    expect(said).toStrictEqual(['Undone']);
    expect(tools.redo()).toBe(true);
    expect(said).toStrictEqual(['Undone', 'Redone']);
  });

  it('announces a selection again after an undo, a redo and a delete', () => {
    const { store, tools } = rig({ store: TWO() });
    const said = record(tools, 'announce');
    store.add({ ...LINE, id: 'x' });
    tools.undo();
    tools.select(['l']);
    tools.redo();
    tools.select(['o']);
    tools.remove(['o']);
    tools.select(['l']);
    expect(said).toStrictEqual(['Undone', 'Trend line selected', 'Redone', 'Rectangle selected', 'Rectangle deleted', 'Trend line selected']);
  });
});

describe('the event', () => {
  it('is raised after the state is published, once for each action', () => {
    const { tools, click } = rig();
    const order: string[] = [];
    tools.on('state', () => order.push('state'));
    tools.on('selection', () => order.push('selection'));
    tools.on('announce', () => order.push('announce'));
    tools.activate('trend-line');
    order.length = 0;
    click(100, 200);
    click(300, 100);
    expect(order[order.length - 1]).toBe('announce');
    expect(order.filter((name) => name === 'announce')).toHaveLength(1);
    expect(order.indexOf('selection')).toBeLessThan(order.indexOf('announce'));
  });

  it('has the state of the announced change already in getState', () => {
    const { host, store, tools } = rig();
    store.add(LINE);
    let canUndo: boolean | undefined;
    tools.on('announce', () => {
      canUndo = tools.getState().canUndo;
    });
    host.key('z', CTRL);
    expect(canUndo).toBe(false);
  });

  it('can be unsubscribed', () => {
    const { host, store, tools } = rig();
    store.add(LINE);
    const said: string[] = [];
    const off = tools.on('announce', (message) => said.push(message));
    host.key('z', CTRL);
    off();
    host.key('y', CTRL);
    expect(said).toStrictEqual(['Undone']);
  });

  it('reaches every listener, also when one throws, and reports the exception as an error of source listener', () => {
    const { host, store, tools } = rig();
    store.add(LINE);
    const errors = record(tools, 'error');
    tools.on('announce', () => {
      throw new Error('listener failed');
    });
    const said = record(tools, 'announce');
    host.key('z', CTRL);
    expect(said).toStrictEqual(['Undone']);
    expect(errors.map((error) => [error.source, error.message])).toStrictEqual([['listener', 'listener failed']]);
  });

  it('is raised once even when a listener acts on the tools', () => {
    const { tools, click } = rig();
    const said = record(tools, 'announce');
    tools.on('announce', () => tools.clearSelection());
    tools.activate('trend-line');
    click(100, 200);
    click(300, 100);
    expect(said).toStrictEqual(['Trend line placed']);
    expect(tools.getState().selection).toStrictEqual([]);
  });

  it('is not raised after destroy', () => {
    const { store, tools } = rig({ store: TWO() });
    const said = record(tools, 'announce');
    tools.destroy();
    tools.remove(['l']);
    tools.select(['o']);
    tools.undo();
    tools.redo();
    expect(store.list()).toHaveLength(2);
    expect(said).toStrictEqual([]);
  });

  it('is not raised when a listener destroys the tools while the state is published', () => {
    const { tools, click } = rig();
    const said = record(tools, 'announce');
    tools.activate('trend-line');
    click(100, 200);
    tools.on('state', () => tools.destroy());
    click(300, 100);
    expect(said).toStrictEqual([]);
  });
});

describe('the messages option', () => {
  it('gives the announcements in the language of the application', () => {
    const { host, tools, click } = rig({
      store: TWO(),
      messages: {
        'tool.trend-line': 'Trendlinie',
        'tool.rectangle': 'Rechteck',
        'announce.placed': '{tool} platziert',
        'announce.selected': '{tool} ausgewählt',
        'announce.selectedMany': '{count} Zeichnungen ausgewählt',
        'announce.deleted': '{tool} gelöscht',
        'announce.deletedMany': '{count} Zeichnungen gelöscht',
        'announce.undone': 'Rückgängig',
        'announce.redone': 'Wiederholt',
      },
    });
    const said = record(tools, 'announce');
    tools.activate('rectangle');
    click(100, 50);
    click(150, 80);
    host.key('a', CTRL);
    host.key('Delete');
    host.key('z', CTRL);
    host.key('y', CTRL);
    tools.undo();
    tools.select(['l']);
    expect(said).toStrictEqual(['Rechteck platziert', '3 Zeichnungen ausgewählt', '3 Zeichnungen gelöscht', 'Rückgängig', 'Wiederholt', 'Rückgängig', 'Trendlinie ausgewählt']);
  });

  it('takes a text without a placeholder as it is', () => {
    const { tools } = rig({ store: TWO(), messages: { 'announce.deleted': 'Weg' } });
    const said = record(tools, 'announce');
    tools.remove(['l']);
    expect(said).toStrictEqual(['Weg']);
  });

  it('puts the name a tool has in the messages in the announcement, not the name of its kind', () => {
    const { tools } = rig({ store: TWO(), messages: { 'tool.rectangle': 'Box' } });
    const said = record(tools, 'announce');
    tools.select(['o']);
    expect(said).toStrictEqual(['Box selected']);
  });
});
