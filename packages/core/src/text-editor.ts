import type { TextEditRequest } from './host';

/** The accessible name of the default note editor. Replaced by the message table (E07-F06). */
export const TEXT_EDITOR_LABEL = 'Note text';

/** One open request to edit a note's text, as the adapters' default editors show it. Answering it more than once does nothing. */
export interface TextEditSession {
  /** What the tools asked for: the note, its text, where its text box starts (plot coordinates, CSS px) and the font size. */
  readonly request: TextEditRequest;
  /** Keeps `text` as the note's text. */
  confirm(text: string): void;
  /** Leaves the note as it was (a new note is taken back). */
  cancel(): void;
}

/** Called with the open session, or null when none is open any more. */
export type TextEditorListener = (session: TextEditSession | null) => void;

/** What a key press does in a note editor: `confirm` the text or `cancel` the editing. */
export type TextEditorKeyAction = 'confirm' | 'cancel';

/** The fields of a `KeyboardEvent` that `textEditorKeyAction` reads. */
export interface TextEditorKeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  /** True while an input method (IME) composes text: Enter and Escape then belong to it. */
  readonly isComposing?: boolean;
}

/**
 * What a key press means in a note editor: Ctrl or Cmd with Enter confirms, Escape cancels, anything
 * else (plain Enter is a new line) is typing. Nothing happens while an input method composes text.
 *
 * @example
 * ```ts
 * textarea.addEventListener('keydown', (event) => {
 *   const action = textEditorKeyAction(event);
 *   if (action === 'confirm') session.confirm(textarea.value);
 *   if (action === 'cancel') session.cancel();
 * });
 * ```
 */
export function textEditorKeyAction(event: TextEditorKeyEvent): TextEditorKeyAction | null {
  if (event.isComposing === true) return null;
  if (event.key === 'Escape') return 'cancel';
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) return 'confirm';
  return null;
}

/**
 * The framework-neutral part of the default note editor (FR-INT-050): `edit` is an `editText` for
 * `createDrawingTools` that opens a `TextEditSession` instead of showing anything itself. An adapter
 * shows the open session (a textarea at `session.request`) and calls `confirm` or `cancel` on it.
 * Opening a session while another is open cancels the first.
 *
 * @example
 * ```ts
 * const editor = new TextEditor();
 * const tools = createDrawingTools(host, { editText: editor.edit });
 * editor.subscribe((session) => (session === null ? hideEditor() : showEditor(session)));
 * ```
 */
export class TextEditor {
  private current: TextEditSession | null = null;
  private readonly listeners = new Set<TextEditorListener>();

  /** Opens a session for the request; resolves with the confirmed text, or null when it is cancelled or replaced. Pass it as the `editText` option. */
  readonly edit = (request: TextEditRequest): Promise<string | null> => {
    this.cancel();
    return new Promise((resolve) => {
      const session: TextEditSession = {
        request,
        confirm: (text) => this.settle(session, text, resolve),
        cancel: () => this.settle(session, null, resolve),
      };
      this.current = session;
      this.notify();
    });
  };

  /** The open session, or null. */
  get session(): TextEditSession | null {
    return this.current;
  }

  /** Subscribes to the session opening and closing; returns the unsubscribe function. */
  subscribe(listener: TextEditorListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Cancels the open session, if there is one. */
  cancel(): void {
    this.current?.cancel();
  }

  private settle(session: TextEditSession, answer: string | null, resolve: (answer: string | null) => void): void {
    // A session that is closed or was replaced has nothing more to say.
    if (this.current !== session) return;
    this.current = null;
    this.notify();
    resolve(answer);
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener(this.current);
  }
}
