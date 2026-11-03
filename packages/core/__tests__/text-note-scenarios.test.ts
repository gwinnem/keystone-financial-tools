import { describe, expect, it } from 'vitest';
import type { TextShape } from '../src/geometry/types';
import type { SceneItem } from '../src/scene/types';
import { DrawingStore } from '../src/store';
import type { MockHost } from '../src/testing/mock-host';
import { DARK_THEME, LIGHT_THEME } from '../src/theme';
import type { Drawing } from '../src/types';
import { A, deferredEditor, flush, LINE, NOTE, record, rig } from './controller-rig';

// E05-F04: the text note tool through the controller, on the mock host (QA-005). The pane is `price`, 800 px
// wide and 400 px high with prices 0 to 200 (y = (200 - p) * 2); time is x * 6000. A note's box starts at its
// anchor; the default note font is 14 px, so a character is 8.4 px wide (0.6 * 14) and a line 18.2 px high (1.3 * 14).
const NOTE_KIND = 'text-note';
const CHAR = 14 * 0.6;
const LINE_HEIGHT = 14 * 1.3;
const BIG_NOTE_THEME = { ...LIGHT_THEME, kinds: { ...LIGHT_THEME.kinds, [NOTE_KIND]: { fontSize: 30 } } };

function noteItem(items: readonly SceneItem[], id: string): Extract<SceneItem, { type: 'shape' }> {
  for (const item of items) {
    if (item.type === 'shape' && item.drawingId === id) return item;
  }
  throw new Error(`No shape item for ${id}.`);
}

/** The text box of note `id` in the scene. */
function noteBox(items: readonly SceneItem[], id: string): TextShape {
  for (const shape of noteItem(items, id).shapes) {
    if (shape.type === 'text') return shape;
  }
  throw new Error(`No text box for ${id}.`);
}

function doubleClick(host: MockHost, x: number, y: number): void {
  for (let i = 0; i < 2; i++) {
    host.pointer('down', x, y);
    host.pointer('up', x, y);
  }
}

describe('placing a note and requesting its text (FR-INT-050)', () => {
  it('places the note with one click and asks the editor for its text', async () => {
    const editor = deferredEditor();
    const { store, tools, click } = rig({}, { editText: editor.editText });
    tools.activate(NOTE_KIND);
    click(120, 160);
    expect(store.list()).toHaveLength(1);
    expect(store.get('d1')).toMatchObject({ kind: NOTE_KIND, text: '', anchors: [A(120, 160)] });
    expect(editor.requests).toEqual([{ drawingId: 'd1', text: '', x: 120, y: 160, fontSize: 14 }]);
    expect(tools.getState().interaction).toEqual({ type: 'editing-text', drawingId: 'd1' });
    editor.answer('Breakout');
    await flush();
    expect(store.get('d1')?.text).toBe('Breakout');
    expect(tools.getState()).toMatchObject({ interaction: { type: 'selected', ids: ['d1'] }, selection: ['d1'], activeTool: null });
    expect(editor.requests).toHaveLength(1);
  });

  it('asks for the font size of the theme', () => {
    const editor = deferredEditor();
    const { tools, click } = rig({ theme: BIG_NOTE_THEME }, { editText: editor.editText });
    tools.activate(NOTE_KIND);
    click(120, 160);
    expect(editor.requests).toMatchObject([{ fontSize: 30 }]);
  });

  it('places nothing for a click outside every pane or with the right button', () => {
    const editor = deferredEditor();
    const { store, tools, click } = rig({}, { editText: editor.editText });
    tools.activate(NOTE_KIND);
    click(120, 450);
    expect(tools.getState().activeTool).toBe(NOTE_KIND);
    click(120, 160, { button: 2 });
    expect(store.list()).toEqual([]);
    expect(editor.requests).toEqual([]);
  });

  it('places the note and its text as one history entry', async () => {
    const { store, tools, click } = rig({}, { editText: () => Promise.resolve('Support') });
    tools.activate(NOTE_KIND);
    click(120, 160);
    await flush();
    expect(tools.getState().canUndo).toBe(true);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([]);
    expect(tools.undo()).toBe(false);
    expect(tools.redo()).toBe(true);
    expect(store.get('d1')).toMatchObject({ kind: NOTE_KIND, text: 'Support' });
    expect(tools.redo()).toBe(false);
  });

  it('removes the note without a history entry when the editor is cancelled', async () => {
    const editor = deferredEditor();
    const { store, tools, click } = rig({}, { editText: editor.editText });
    tools.activate(NOTE_KIND);
    click(120, 160);
    editor.answer(null);
    await flush();
    expect(store.list()).toEqual([]);
    expect(tools.getState()).toMatchObject({ interaction: { type: 'idle' }, selection: [], activeTool: null, canUndo: false, canRedo: false });
    expect(tools.undo()).toBe(false);
  });

  it('leaves the undo and redo entries as they were when a new note is cancelled', async () => {
    const editor = deferredEditor();
    const { store, tools, click } = rig({ store: new DrawingStore([LINE]) }, { editText: editor.editText });
    tools.remove(['l']);
    tools.undo();
    expect(tools.getState()).toMatchObject({ canUndo: false, canRedo: true });
    tools.activate(NOTE_KIND);
    click(120, 160);
    editor.answer(null);
    await flush();
    expect(store.list()).toEqual([LINE]);
    expect(tools.getState()).toMatchObject({ canUndo: false, canRedo: true });
    expect(tools.redo()).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it('takes a note back with a keyboard placement too', async () => {
    const editor = deferredEditor();
    const { host, store, tools } = rig({}, { editText: editor.editText });
    tools.activate(NOTE_KIND);
    expect(host.key('Enter')).toBe(true);
    expect(store.list()).toMatchObject([{ kind: NOTE_KIND, text: '' }]);
    expect(editor.requests).toHaveLength(1);
    editor.answer(null);
    await flush();
    expect(store.list()).toEqual([]);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('returns to the tool after the editor with stayInTool, with the note or without it', async () => {
    const editor = deferredEditor();
    const { store, tools, click } = rig({ stayInTool: true }, { editText: editor.editText });
    tools.activate(NOTE_KIND);
    click(120, 160);
    editor.answer('first');
    await flush();
    expect(store.list()).toMatchObject([{ id: 'd1', text: 'first' }]);
    expect(tools.getState()).toMatchObject({ activeTool: NOTE_KIND, interaction: { type: 'placing' }, selection: [] });
    click(220, 160);
    editor.answer(null);
    await flush();
    expect(store.list()).toMatchObject([{ id: 'd1' }]);
    expect(tools.getState()).toMatchObject({ activeTool: NOTE_KIND, interaction: { type: 'placing' }, selection: [] });
    click(320, 160);
    editor.answer('third');
    await flush();
    expect(store.list()).toMatchObject([{ id: 'd1' }, { id: 'd3', text: 'third' }]);
  });

  it('keeps the empty note when the host has no editor', async () => {
    const { store, tools, click } = rig();
    tools.activate(NOTE_KIND);
    click(120, 160);
    await flush();
    expect(store.get('d1')).toMatchObject({ kind: NOTE_KIND, text: '' });
    expect(tools.getState()).toMatchObject({ interaction: { type: 'selected', ids: ['d1'] }, canUndo: true });
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it('keeps the empty note when the editor fails, and reports it', async () => {
    const { store, tools, click } = rig({}, { editText: () => Promise.reject(new Error('editor')) });
    const errors = record(tools, 'error');
    tools.activate(NOTE_KIND);
    click(120, 160);
    await flush();
    expect(errors).toMatchObject([{ source: 'text-editor', message: 'editor' }]);
    expect(store.get('d1')).toMatchObject({ text: '' });
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it('keeps the note when the editor answers with an empty text: that is not a cancel', async () => {
    const { store, tools, click } = rig({}, { editText: () => Promise.resolve('') });
    tools.activate(NOTE_KIND);
    click(120, 160);
    await flush();
    expect(store.get('d1')).toMatchObject({ text: '' });
    expect(tools.getState().interaction).toEqual({ type: 'selected', ids: ['d1'], hover: null });
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it('keeps undo and redo shut while the editor of a new note is open', async () => {
    const editor = deferredEditor();
    const { store, tools, click } = rig({ store: new DrawingStore([LINE]) }, { editText: editor.editText });
    tools.remove(['l']);
    tools.activate(NOTE_KIND);
    click(120, 160);
    expect(tools.undo()).toBe(false);
    expect(tools.redo()).toBe(false);
    editor.answer('x');
    await flush();
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([]);
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([LINE]);
  });

  it('reports a drawing that cannot be added as it is, and leaves no history entry open', () => {
    const { store, tools, click } = rig({ store: new DrawingStore([LINE]), createId: () => 'l' });
    const errors = record(tools, 'error');
    tools.activate('horizontal-line');
    click(120, 160);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('pointer');
    expect(errors[0]?.message).toContain('Duplicate drawing id l');
    expect(store.list()).toEqual([LINE]);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('does not leave a history entry open when the note cannot be added', async () => {
    const ids = ['t', 'n2'];
    const editor = deferredEditor();
    const { store, tools, click } = rig({ store: new DrawingStore([NOTE]), createId: () => ids.shift() ?? 'more' }, { editText: editor.editText });
    const errors = record(tools, 'error');
    tools.activate(NOTE_KIND);
    click(120, 160);
    expect(errors).toMatchObject([{ source: 'pointer' }]);
    expect(store.list()).toEqual([NOTE]);
    expect(editor.requests).toEqual([]);
    click(220, 160);
    editor.answer('works');
    await flush();
    expect(errors).toHaveLength(1);
    expect(store.get('n2')?.text).toBe('works');
    expect(tools.undo()).toBe(true);
    expect(store.list()).toEqual([NOTE]);
  });
});

describe('editing an existing note (FR-INT-050)', () => {
  it('edits on a double-click inside the box, and the change is one history entry', async () => {
    const editor = deferredEditor();
    const { host, store, tools } = rig({ store: new DrawingStore([NOTE]) }, { editText: editor.editText });
    const errors = record(tools, 'error');
    doubleClick(host, 110, 210);
    expect(editor.requests).toEqual([{ drawingId: 't', text: 'hi', x: 100, y: 200, fontSize: 14 }]);
    expect(tools.getState().interaction).toEqual({ type: 'editing-text', drawingId: 't' });
    editor.answer('changed');
    await flush();
    expect(errors).toEqual([]);
    expect(store.get('t')?.text).toBe('changed');
    expect(tools.getState().interaction).toEqual({ type: 'selected', ids: ['t'], hover: null });
    expect(tools.undo()).toBe(true);
    expect(store.get('t')).toEqual(NOTE);
    expect(tools.undo()).toBe(false);
    expect(tools.redo()).toBe(true);
    expect(store.get('t')?.text).toBe('changed');
  });

  it('edits on Enter when the note is selected, and a cancel changes nothing', async () => {
    const editor = deferredEditor();
    const { host, store, tools } = rig({ store: new DrawingStore([NOTE]) }, { editText: editor.editText });
    const errors = record(tools, 'error');
    tools.select(['t']);
    expect(host.key('Enter')).toBe(true);
    expect(editor.requests).toHaveLength(1);
    editor.answer(null);
    await flush();
    expect(errors).toEqual([]);
    expect(store.get('t')).toEqual(NOTE);
    expect(tools.getState()).toMatchObject({ interaction: { type: 'selected', ids: ['t'] }, canUndo: false });
  });

  it('keeps an existing note after a cancel, even when a new note was cancelled before', async () => {
    let answer: string | null = null;
    const { host, store, tools, click } = rig({ store: new DrawingStore([NOTE]) }, { editText: () => Promise.resolve(answer) });
    tools.activate(NOTE_KIND);
    click(300, 300);
    await flush();
    expect(store.list()).toEqual([NOTE]);
    tools.select(['t']);
    host.key('Enter');
    await flush();
    expect(store.list()).toEqual([NOTE]);
    answer = 'edited';
    host.key('Enter');
    await flush();
    expect(store.get('t')?.text).toBe('edited');
  });

  it('does not edit a locked note', () => {
    const editor = deferredEditor();
    const { host, tools } = rig({ store: new DrawingStore([{ ...NOTE, locked: true }]) }, { editText: editor.editText });
    doubleClick(host, 110, 210);
    expect(editor.requests).toEqual([]);
    expect(tools.getState().interaction.type).toBe('selected');
  });
});

describe('plain text only (FR-INT-051, NFR-SEC-002)', () => {
  it('stores and draws markup as literal text, and hands it back to the editor unchanged', async () => {
    const markup = '<b>bold</b> &amp; <script>alert(1)</script>';
    const editor = deferredEditor();
    const { host, store, tools, click } = rig({}, { editText: editor.editText });
    tools.activate(NOTE_KIND);
    click(120, 160);
    editor.answer(markup);
    await flush();
    expect(store.get('d1')?.text).toBe(markup);
    const box = noteBox(tools.getScene(), 'd1');
    expect(box.lines).toEqual([markup]);
    expect(box.width).toBeCloseTo(markup.length * CHAR, 9);

    host.key('Enter');
    expect(editor.requests).toHaveLength(2);
    expect(editor.requests[1]).toMatchObject({ text: markup });
  });

  it('keeps a markup line of a multi-line note as it is', () => {
    const note: Drawing = { id: 'm', kind: NOTE_KIND, anchors: [A(100, 100)], text: '<i>one</i>\n<b>two</b>' };
    const { tools } = rig({ store: new DrawingStore([note]) });
    expect(noteBox(tools.getScene(), 'm').lines).toEqual(['<i>one</i>', '<b>two</b>']);
  });
});

describe('the multi-line box (FR-GEO-007)', () => {
  const sceneBox = (text: string, extra: Partial<Drawing> = {}, options: Parameters<typeof rig>[0] = {}): TextShape => {
    const note: Drawing = { id: 'n', kind: NOTE_KIND, anchors: [A(100, 200)], text, ...extra };
    return noteBox(rig({ ...options, store: new DrawingStore([note]) }).tools.getScene(), 'n');
  };

  it('is one line, as wide as the text, with its top left corner at the anchor', () => {
    const box = sceneBox('abc');
    expect(box).toMatchObject({ x: 100, y: 200, lines: ['abc'], fontSize: 14 });
    expect(box.width).toBeCloseTo(3 * CHAR, 9);
    expect(box.height).toBeCloseTo(LINE_HEIGHT, 9);
    expect(box.lineHeight).toBeCloseTo(LINE_HEIGHT, 9);
  });

  it('splits on line breaks and is as wide as the longest line and as high as the line count', () => {
    const box = sceneBox('ab\ncdefg\nx');
    expect(box.lines).toEqual(['ab', 'cdefg', 'x']);
    expect(box.width).toBeCloseTo(5 * CHAR, 9);
    expect(box.height).toBeCloseTo(3 * LINE_HEIGHT, 9);
  });

  it('grows with the longest line and the number of lines when the text changes', () => {
    const { store, tools } = rig({ store: new DrawingStore([{ id: 'n', kind: NOTE_KIND, anchors: [A(100, 200)], text: 'ab' }]) });
    const before = noteBox(tools.getScene(), 'n');
    store.update('n', { text: 'ab\nabcdef' });
    const after = noteBox(tools.getScene(), 'n');
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.width).toBeCloseTo(6 * CHAR, 9);
    expect(after.height).toBeCloseTo(2 * LINE_HEIGHT, 9);
    expect(before.height).toBeCloseTo(LINE_HEIGHT, 9);
  });

  it('counts an empty line and a trailing line break', () => {
    expect(sceneBox('a\n\nb')).toMatchObject({ lines: ['a', '', 'b'] });
    const trailing = sceneBox('a\n');
    expect(trailing.lines).toEqual(['a', '']);
    expect(trailing.height).toBeCloseTo(2 * LINE_HEIGHT, 9);
  });

  it('is one character wide and one line high when the note is empty', () => {
    const box = sceneBox('');
    expect(box.lines).toEqual(['']);
    expect(box.width).toBeCloseTo(CHAR, 9);
    expect(box.height).toBeCloseTo(LINE_HEIGHT, 9);
  });

  it('does not cut or wrap a long word: the box grows beyond the plot', () => {
    const word = 'x'.repeat(300);
    const box = sceneBox(`short\n${word}`);
    expect(box.lines).toEqual(['short', word]);
    expect(box.width).toBeCloseTo(300 * CHAR, 6);
    expect(box.width).toBeGreaterThan(800);
    expect(box.height).toBeCloseTo(2 * LINE_HEIGHT, 9);
  });

  it('follows the font size of the drawing and of the theme', () => {
    const own = sceneBox('abc', { style: { fontSize: 20 } });
    expect(own.fontSize).toBe(20);
    expect(own.lineHeight).toBeCloseTo(26, 9);
    expect(own.width).toBeCloseTo(3 * 20 * 0.6, 9);
    expect(own.height).toBeCloseTo(26, 9);

    const themed = sceneBox('abc', {}, { theme: BIG_NOTE_THEME });
    expect(themed.fontSize).toBe(30);
    expect(themed.width).toBeCloseTo(3 * 30 * 0.6, 9);
  });

  it('draws the text in the text colour of the theme or of the drawing', () => {
    const textColorOf = (extra: Partial<Drawing>, options: Parameters<typeof rig>[0] = {}): string => {
      const note: Drawing = { id: 'n', kind: NOTE_KIND, anchors: [A(100, 200)], text: 'abc', ...extra };
      return noteItem(rig({ ...options, store: new DrawingStore([note]) }).tools.getScene(), 'n').style.textColor;
    };
    expect(textColorOf({})).toBe('#131722');
    expect(textColorOf({}, { theme: DARK_THEME })).toBe('#d1d4dc');
    expect(textColorOf({ style: { textColor: '#ff0000' } }, { theme: DARK_THEME })).toBe('#ff0000');
  });
});

describe('hit-testing uses the box (FR-HIT-001)', () => {
  // Text "ab\ncdefg": a box from (100, 200), 42 wide and 36.4 high.
  const N: Drawing = { id: 'n', kind: NOTE_KIND, anchors: [A(100, 200)], text: 'ab\ncdefg' };
  const HIT = { id: 'n', part: 'body', locked: false };

  it('hits anywhere in the box, also beside a short line', () => {
    const { tools } = rig({ store: new DrawingStore([N]) });
    expect(tools.hitTest(101, 201)).toEqual(HIT);
    expect(tools.hitTest(141, 205)).toEqual(HIT);
    expect(tools.hitTest(141, 230)).toEqual(HIT);
    expect(tools.hitTest(120, 218)).toEqual(HIT);
  });

  it('hits within 6 px of the box and misses beyond', () => {
    const { tools } = rig({ store: new DrawingStore([N]) });
    expect(tools.hitTest(147, 218)).toEqual(HIT);
    expect(tools.hitTest(149, 218)).toBeNull();
    expect(tools.hitTest(120, 241)).toEqual(HIT);
    expect(tools.hitTest(120, 244)).toBeNull();
    expect(tools.hitTest(95, 218)).toEqual(HIT);
    expect(tools.hitTest(93, 218)).toBeNull();
    expect(tools.hitTest(120, 195)).toEqual(HIT);
    expect(tools.hitTest(120, 193)).toBeNull();
  });

  it('hits an empty note, which is one character wide', () => {
    const { tools } = rig({ store: new DrawingStore([{ ...N, text: '' }]) });
    expect(tools.hitTest(104, 209)).toEqual(HIT);
    expect(tools.hitTest(116, 209)).toBeNull();
  });

  it('follows the box when the text grows', () => {
    const { store, tools } = rig({ store: new DrawingStore([N]) });
    expect(tools.hitTest(170, 230)).toBeNull();
    store.update('n', { text: 'ab\ncdefg\nhijklmnopq' });
    expect(tools.hitTest(170, 230)).toEqual(HIT);
    expect(tools.hitTest(170, 250)).toEqual(HIT);
  });

  it('selects the note by a click in its box', () => {
    const { tools, click } = rig({ store: new DrawingStore([N]) });
    click(149, 218);
    expect(tools.getState().selection).toEqual([]);
    click(141, 205);
    expect(tools.getState().selection).toEqual(['n']);
  });

  it('gives a selected note one handle at its anchor', () => {
    const { tools } = rig({ store: new DrawingStore([N]) });
    tools.select(['n']);
    const handles = tools.getScene().find((item) => item.type === 'handles');
    expect(handles).toMatchObject({ type: 'handles', drawingId: 'n', points: [{ x: 100, y: 200 }] });
  });
});
