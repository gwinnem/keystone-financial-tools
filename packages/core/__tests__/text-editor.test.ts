import { describe, expect, it, vi } from 'vitest';
import type { TextEditRequest } from '../src/host';
import { shouldRestoreFocus, TEXT_EDITOR_LABEL, TextEditor, textEditorKeyAction, type TextEditSession } from '../src/text-editor';

const REQUEST: TextEditRequest = { drawingId: 'n1', text: 'hello', x: 10, y: 20, fontSize: 14 };
const OTHER: TextEditRequest = { drawingId: 'n2', text: '', x: 30, y: 40, fontSize: 12 };
const KEY = { key: 'a', ctrlKey: false, metaKey: false };

/** What the promise of `edit` settled with, or `pending` while it has not. */
async function outcome(promise: Promise<string | null>): Promise<string | null | 'pending'> {
  return Promise.race([promise, new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 0))]);
}

describe('TEXT_EDITOR_LABEL', () => {
  it('names the editor for assistive technology', () => {
    expect(TEXT_EDITOR_LABEL).toBe('Note text');
  });
});

describe('shouldRestoreFocus', () => {
  const editor = { id: 'editor' };
  const body = { id: 'body' };
  const other = { id: 'other' };

  it('restores while the focus is still in the editor', () => {
    expect(shouldRestoreFocus(editor, editor, body)).toBe(true);
  });

  it('restores when the focus is on the body', () => {
    expect(shouldRestoreFocus(body, editor, body)).toBe(true);
  });

  it('restores when nothing has the focus', () => {
    expect(shouldRestoreFocus(null, editor, body)).toBe(true);
  });

  it('leaves the focus where the user put it', () => {
    expect(shouldRestoreFocus(other, editor, body)).toBe(false);
  });
});

describe('textEditorKeyAction', () => {
  it('cancels with Escape, with or without modifiers', () => {
    expect(textEditorKeyAction({ ...KEY, key: 'Escape' })).toBe('cancel');
    expect(textEditorKeyAction({ ...KEY, key: 'Escape', ctrlKey: true })).toBe('cancel');
  });

  it('confirms with Ctrl+Enter and with Cmd+Enter', () => {
    expect(textEditorKeyAction({ ...KEY, key: 'Enter', ctrlKey: true })).toBe('confirm');
    expect(textEditorKeyAction({ ...KEY, key: 'Enter', metaKey: true })).toBe('confirm');
  });

  it('treats a plain Enter as typing', () => {
    expect(textEditorKeyAction({ ...KEY, key: 'Enter' })).toBeNull();
  });

  it('treats other keys as typing, also with Ctrl or Cmd', () => {
    expect(textEditorKeyAction(KEY)).toBeNull();
    expect(textEditorKeyAction({ ...KEY, ctrlKey: true })).toBeNull();
    expect(textEditorKeyAction({ ...KEY, key: 'Delete', metaKey: true })).toBeNull();
  });

  it('leaves Escape and Ctrl+Enter to an input method that is composing', () => {
    expect(textEditorKeyAction({ ...KEY, key: 'Escape', isComposing: true })).toBeNull();
    expect(textEditorKeyAction({ ...KEY, key: 'Enter', ctrlKey: true, isComposing: true })).toBeNull();
  });

  it('acts when the input method is not composing', () => {
    expect(textEditorKeyAction({ ...KEY, key: 'Escape', isComposing: false })).toBe('cancel');
    expect(textEditorKeyAction({ ...KEY, key: 'Enter', metaKey: true, isComposing: false })).toBe('confirm');
  });
});

describe('TextEditor', () => {
  it('has no session at first', () => {
    expect(new TextEditor().session).toBeNull();
  });

  it('opens a session for the request and keeps the promise pending', async () => {
    const editor = new TextEditor();
    const answer = editor.edit(REQUEST);
    expect(editor.session?.request).toBe(REQUEST);
    expect(await outcome(answer)).toBe('pending');
  });

  it('resolves with the confirmed text and closes the session', async () => {
    const editor = new TextEditor();
    const answer = editor.edit(REQUEST);
    (editor.session as TextEditSession).confirm('new text');
    expect(await answer).toBe('new text');
    expect(editor.session).toBeNull();
  });

  it('keeps an empty confirmed text as an empty text, not a cancel', async () => {
    const editor = new TextEditor();
    const answer = editor.edit(REQUEST);
    (editor.session as TextEditSession).confirm('');
    expect(await answer).toBe('');
  });

  it('resolves with null when the session is cancelled and closes it', async () => {
    const editor = new TextEditor();
    const answer = editor.edit(REQUEST);
    (editor.session as TextEditSession).cancel();
    expect(await answer).toBeNull();
    expect(editor.session).toBeNull();
  });

  it('cancels the open session through the editor', async () => {
    const editor = new TextEditor();
    const answer = editor.edit(REQUEST);
    editor.cancel();
    expect(await answer).toBeNull();
    expect(editor.session).toBeNull();
  });

  it('does nothing when it cancels and no session is open', () => {
    const editor = new TextEditor();
    const listener = vi.fn();
    editor.subscribe(listener);
    editor.cancel();
    expect(listener).not.toHaveBeenCalled();
  });

  it('cancels the open session when another is opened, and the new one is the open one', async () => {
    const editor = new TextEditor();
    const first = editor.edit(REQUEST);
    const second = editor.edit(OTHER);
    expect(await first).toBeNull();
    expect(editor.session?.request).toBe(OTHER);
    expect(await outcome(second)).toBe('pending');
  });

  it('ignores an answer from a session that is closed', async () => {
    const editor = new TextEditor();
    const answer = editor.edit(REQUEST);
    const session = editor.session as TextEditSession;
    session.confirm('first');
    const listener = vi.fn();
    editor.subscribe(listener);
    session.confirm('second');
    session.cancel();
    expect(await answer).toBe('first');
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores an answer from a session that was replaced, and keeps the new one open', async () => {
    const editor = new TextEditor();
    const first = editor.edit(REQUEST);
    const stale = editor.session as TextEditSession;
    const second = editor.edit(OTHER);
    stale.confirm('late');
    expect(await first).toBeNull();
    expect(editor.session?.request).toBe(OTHER);
    expect(await outcome(second)).toBe('pending');
  });

  it('tells the listeners about each session opening and closing, in order', () => {
    const editor = new TextEditor();
    const seen: (string | null)[] = [];
    editor.subscribe((session) => seen.push(session === null ? null : session.request.drawingId));
    void editor.edit(REQUEST);
    (editor.session as TextEditSession).confirm('x');
    void editor.edit(OTHER);
    void editor.edit(REQUEST);
    expect(seen).toStrictEqual(['n1', null, 'n2', null, 'n1']);
  });

  it('tells a listener about the closing before the promise resolves', async () => {
    const editor = new TextEditor();
    const order: string[] = [];
    editor.subscribe((session) => order.push(session === null ? 'closed' : 'open'));
    const answer = editor.edit(REQUEST).then(() => order.push('resolved'));
    (editor.session as TextEditSession).confirm('x');
    await answer;
    expect(order).toStrictEqual(['open', 'closed', 'resolved']);
  });

  it('stops telling a listener that unsubscribed, also when it unsubscribes twice', () => {
    const editor = new TextEditor();
    const listener = vi.fn();
    const stop = editor.subscribe(listener);
    void editor.edit(REQUEST);
    stop();
    stop();
    void editor.edit(OTHER);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('tells every listener, also one that unsubscribes while it is told', () => {
    const editor = new TextEditor();
    const later = vi.fn();
    const stop = editor.subscribe(() => stop());
    editor.subscribe(later);
    void editor.edit(REQUEST);
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('works as a detached editText: it does not need `this`', async () => {
    const { edit, cancel } = (() => {
      const editor = new TextEditor();
      return { edit: editor.edit, cancel: () => editor.cancel() };
    })();
    const answer = edit(REQUEST);
    cancel();
    expect(await answer).toBeNull();
  });
});
