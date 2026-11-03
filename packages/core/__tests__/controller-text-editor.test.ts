import { describe, expect, it, vi } from 'vitest';
import type { TextEditRequest } from '../src/host';
import { DrawingStore } from '../src/store';
import { TextEditor, type TextEditSession } from '../src/text-editor';
import { flush, NOTE, record, rig } from './controller-rig';

// The `editText` option: an editor for a host that has none (FR-INT-050).

const REQUEST_OF_NOTE: TextEditRequest = { drawingId: 't', text: 'hi', x: 100, y: 200, fontSize: 14 };

describe('the editText option', () => {
  it('edits a note with it when the host has no editor', async () => {
    const requests: TextEditRequest[] = [];
    const { host, store, tools } = rig({ store: new DrawingStore([NOTE]), editText: (request) => (requests.push(request), Promise.resolve('typed')) });
    tools.select(['t']);
    expect(host.key('Enter')).toBe(true);
    await flush();
    expect(requests).toStrictEqual([REQUEST_OF_NOTE]);
    expect(store.get('t')?.text).toBe('typed');
  });

  it('prefers the editor of the host', async () => {
    const used: string[] = [];
    const { host, store, tools } = rig(
      { store: new DrawingStore([NOTE]), editText: () => (used.push('option'), Promise.resolve('from option')) },
      { editText: () => (used.push('host'), Promise.resolve('from host')) }
    );
    tools.select(['t']);
    host.key('Enter');
    await flush();
    expect(used).toStrictEqual(['host']);
    expect(store.get('t')?.text).toBe('from host');
  });

  it('calls the editor of the host as a method of the host', async () => {
    const { host, tools } = rig({ store: new DrawingStore([NOTE]) });
    const editText = vi.fn(() => Promise.resolve(null));
    host.editText = editText;
    tools.select(['t']);
    host.key('Enter');
    await flush();
    expect(editText.mock.contexts).toStrictEqual([host]);
  });

  it('takes a new note back, without a history entry, when the editor answers null', async () => {
    const { store, tools, click } = rig({ editText: () => Promise.resolve(null) });
    tools.activate('text-note');
    click(100, 200);
    await flush();
    expect(store.list()).toStrictEqual([]);
    expect(tools.getState().canUndo).toBe(false);
  });

  it('keeps a new note with its text as one history entry when the editor confirms', async () => {
    const { store, tools, click } = rig({ editText: () => Promise.resolve('note') });
    tools.activate('text-note');
    click(100, 200);
    await flush();
    expect(store.list()[0]?.text).toBe('note');
    expect(tools.undo()).toBe(true);
    expect(store.list()).toStrictEqual([]);
  });

  it('keeps the note as it is and reports the failure when the editor rejects', async () => {
    const { store, tools, click } = rig({ editText: () => Promise.reject(new Error('no editor')) });
    const errors = record(tools, 'error');
    tools.activate('text-note');
    click(100, 200);
    await flush();
    expect(errors.map((error) => [error.source, error.message])).toStrictEqual([['text-editor', 'no editor']]);
    expect(store.list()[0]?.text).toBe('');
  });

  it('works with a TextEditor: the session is open while the note is edited and the answer is applied', async () => {
    const editor = new TextEditor();
    const { store, tools, click } = rig({ editText: editor.edit });
    tools.activate('text-note');
    click(100, 200);
    const session = editor.session as TextEditSession;
    expect(session.request).toMatchObject({ drawingId: 'd1', text: '', x: 100, y: 200 });
    expect(tools.getState().interaction.type).toBe('editing-text');
    session.confirm('from the session');
    await flush();
    expect(store.get('d1')?.text).toBe('from the session');
    expect(editor.session).toBeNull();
    expect(tools.getState().interaction.type).toBe('selected');
  });

  it('drops the answer of an editor that arrives after destroy', async () => {
    const editor = new TextEditor();
    const { store, tools, click } = rig({ editText: editor.edit });
    tools.activate('text-note');
    click(100, 200);
    tools.destroy();
    (editor.session as TextEditSession).confirm('too late');
    await flush();
    expect(store.get('d1')?.text).toBe('');
  });
});
