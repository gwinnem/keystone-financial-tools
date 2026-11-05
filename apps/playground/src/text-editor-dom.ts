import { shouldRestoreFocus, textEditorKeyAction, type TextEditor, type TextEditSession } from 'keystone-financial-tools-typescript';

/** Keeps pointer events in the editor from reaching the chart, which would take them for clicks on the plot. */
const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;

const stopPropagation = (event: Event): void => event.stopPropagation();

/** Opens a textarea at the note's position and returns the function that closes it. */
function openEditor(chart: HTMLElement, session: TextEditSession, label: string): () => void {
  const previous = document.activeElement as HTMLElement | null;
  const { x, y, fontSize, text } = session.request;
  const field = document.createElement('textarea');
  field.setAttribute('aria-label', label);
  field.style.position = 'absolute';
  field.style.left = `${x}px`;
  field.style.top = `${y}px`;
  field.style.fontSize = `${fontSize}px`;
  // The text is a value, never markup (NFR-SEC-002).
  field.value = text;
  chart.append(field);
  field.focus();
  field.select();
  const onKeydown = (event: KeyboardEvent): void => {
    // Typing must not reach the chart's key handling: Delete would delete the selected note.
    event.stopPropagation();
    const action = textEditorKeyAction(event);
    if (action === null) return;
    event.preventDefault();
    if (action === 'confirm') session.confirm(field.value);
    else session.cancel();
  };
  const onBlur = (): void => session.confirm(field.value);
  field.addEventListener('keydown', onKeydown);
  field.addEventListener('blur', onBlur);
  for (const type of POINTER_EVENTS) field.addEventListener(type, stopPropagation);
  return () => {
    field.removeEventListener('keydown', onKeydown);
    field.removeEventListener('blur', onBlur);
    for (const type of POINTER_EVENTS) field.removeEventListener(type, stopPropagation);
    field.remove();
    if (shouldRestoreFocus(document.activeElement, field, document.body)) previous?.focus();
  };
}

/**
 * The editor of text notes for the plain TypeScript page (FR-INT-050): a textarea inside `chart` (which must be positioned) while
 * `editor` has a session. Ctrl or Cmd with Enter confirms, Escape cancels and leaving the textarea confirms. The framework pages
 * use the editor component of their package; the TypeScript package has no DOM code, so this is the demo's own.
 * Returns the function that removes it.
 */
export function mountTextEditor(chart: HTMLElement, editor: TextEditor, label: string): () => void {
  let close: (() => void) | null = null;
  const stop = editor.subscribe((session) => {
    close?.();
    close = session === null ? null : openEditor(chart, session, label);
  });
  return () => {
    stop();
    close?.();
  };
}
