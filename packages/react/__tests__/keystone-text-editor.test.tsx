import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TEXT_EDITOR_LABEL, TextEditor, type TextEditRequest, type TextEditSession } from 'keystone-financial-tools-core';
import { KeystoneTextEditor } from '../src/keystone-text-editor';

const REQUEST: TextEditRequest = { drawingId: 'n', text: 'hello', x: 120, y: 80, fontSize: 14 };
const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'];

interface StubSession extends TextEditSession {
  readonly confirm: Mock<(text: string) => void>;
  readonly cancel: Mock<() => void>;
}

function stub(request: TextEditRequest = REQUEST): StubSession {
  return { request, confirm: vi.fn<(text: string) => void>(), cancel: vi.fn<() => void>() };
}

interface Mounted {
  readonly container: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly field: () => HTMLTextAreaElement | null;
  readonly show: (session: TextEditSession | null | undefined, label?: string) => void;
  readonly outside: { keys: KeyboardEvent[]; pointers: Event[] };
}

/** Renders the editor in a container with a button that has the focus, and records the events that bubble out of the editor. */
function mount(initial: TextEditSession | null | undefined, label?: string): Mounted {
  const container = document.createElement('div');
  const button = document.createElement('button');
  container.append(button);
  document.body.append(container);
  button.focus();
  const outside: Mounted['outside'] = { keys: [], pointers: [] };
  container.addEventListener('keydown', (event) => outside.keys.push(event));
  for (const type of POINTER_EVENTS) container.addEventListener(type, (event) => outside.pointers.push(event));
  const view = render(<KeystoneTextEditor session={initial} label={label} />, { container: container.appendChild(document.createElement('div')) });
  return {
    container,
    button,
    field: () => container.querySelector('textarea'),
    show: (session, nextLabel) => view.rerender(<KeystoneTextEditor session={session} label={nextLabel} />),
    outside,
  };
}

const press = (field: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  field.dispatchEvent(event);
  return event;
};

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe('KeystoneTextEditor', () => {
  it('renders nothing without a session', () => {
    expect(mount(null).field()).toBeNull();
  });

  it('renders nothing when the session prop is left out', () => {
    const container = document.createElement('div');
    document.body.append(container);
    render(<KeystoneTextEditor />, { container });
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('shows a textarea with the text, placed at the note and sized like it', () => {
    const area = mount(stub()).field();
    expect(area?.value).toBe('hello');
    expect(area?.style.position).toBe('absolute');
    expect(area?.style.left).toBe('120px');
    expect(area?.style.top).toBe('80px');
    expect(area?.style.fontSize).toBe('14px');
  });

  it('names the textarea, by default and with a label', () => {
    expect(mount(stub()).field()?.getAttribute('aria-label')).toBe(TEXT_EDITOR_LABEL);
    expect(mount(stub(), 'Notiztext').field()?.getAttribute('aria-label')).toBe('Notiztext');
  });

  it('never reads the text as HTML', () => {
    const { field, container } = mount(stub({ ...REQUEST, text: '<img src=x onerror=alert(1)><b>x</b>' }));
    expect(field()?.value).toBe('<img src=x onerror=alert(1)><b>x</b>');
    expect(container.querySelector('img, b')).toBeNull();
  });

  it('keeps the same textarea, with what was typed in it, while its session stays open', () => {
    const session = stub();
    const { field, show } = mount(session);
    const area = field() as HTMLTextAreaElement;
    area.value = 'typed';
    show(session, 'Other label');
    expect(field()).toBe(area);
    expect(area.value).toBe('typed');
    expect(area.getAttribute('aria-label')).toBe('Other label');
  });

  it('shows the text of a new session in the same place', () => {
    const { field, show } = mount(stub());
    (field() as HTMLTextAreaElement).value = 'typed';
    show(stub({ ...REQUEST, text: 'second', x: 5, y: 6, fontSize: 9 }));
    expect(field()?.value).toBe('second');
    expect(field()?.style.left).toBe('5px');
  });

  describe('focus', () => {
    it('moves to the textarea, with the text selected, and goes back when the session ends', () => {
      const { field, show, button } = mount(null);
      expect(document.activeElement).toBe(button);
      show(stub());
      const area = field();
      expect(document.activeElement).toBe(area);
      expect([area?.selectionStart, area?.selectionEnd]).toStrictEqual([0, 5]);
      show(null);
      expect(field()).toBeNull();
      expect(document.activeElement).toBe(button);
    });

    it('has nothing to go back to when no element had the focus', () => {
      const { show, field } = mount(null);
      const active = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null);
      show(stub());
      active.mockRestore();
      show(null);
      expect(field()).toBeNull();
    });

    it('goes back to the element that had the focus when the editor opened, not to an earlier one', () => {
      const { show, container } = mount(null);
      const other = document.createElement('input');
      container.append(other);
      other.focus();
      show(stub());
      show(null);
      expect(document.activeElement).toBe(other);
    });

    it('goes back when the textarea was left for nothing in particular', () => {
      const { show, field, button } = mount(null);
      show(stub());
      field()?.blur();
      expect(document.activeElement).toBe(document.body);
      show(null);
      expect(document.activeElement).toBe(button);
    });

    it('leaves the focus with the element the user moved it to, without giving it to anything on the way', () => {
      // React puts the focus back on the element that had it when the editor closes, so the end state alone does not tell.
      const { show, field, container, button } = mount(null);
      const other = document.createElement('input');
      container.append(other);
      show(stub());
      other.focus();
      expect(field()).not.toBeNull();
      const refocused = vi.fn();
      button.addEventListener('focus', refocused);
      show(null);
      expect(document.activeElement).toBe(other);
      expect(refocused).not.toHaveBeenCalled();
    });
  });

  describe('keys', () => {
    it('confirms with the typed text on Ctrl+Enter and on Cmd+Enter', () => {
      for (const init of [{ ctrlKey: true }, { metaKey: true }]) {
        const session = stub();
        const area = mount(session).field() as HTMLTextAreaElement;
        area.value = 'typed';
        const event = press(area, 'Enter', init);
        expect(event.defaultPrevented).toBe(true);
        expect(session.confirm).toHaveBeenCalledExactlyOnceWith('typed');
        expect(session.cancel).not.toHaveBeenCalled();
      }
    });

    it('cancels on Escape', () => {
      const session = stub();
      const event = press(mount(session).field() as HTMLElement, 'Escape');
      expect(event.defaultPrevented).toBe(true);
      expect(session.cancel).toHaveBeenCalledOnce();
      expect(session.confirm).not.toHaveBeenCalled();
    });

    it('leaves other keys to the textarea, a plain Enter included', () => {
      const session = stub();
      const area = mount(session).field() as HTMLElement;
      for (const key of ['Enter', 'a', 'Delete', 'Backspace']) expect(press(area, key).defaultPrevented).toBe(false);
      expect(session.confirm).not.toHaveBeenCalled();
      expect(session.cancel).not.toHaveBeenCalled();
    });

    it('ignores the keys of an input method that is composing', () => {
      const session = stub();
      const area = mount(session).field() as HTMLElement;
      press(area, 'Escape', { isComposing: true });
      press(area, 'Enter', { isComposing: true, ctrlKey: true });
      expect(session.cancel).not.toHaveBeenCalled();
      expect(session.confirm).not.toHaveBeenCalled();
    });

    it('keeps every key from reaching the chart', () => {
      const { field, outside } = mount(stub());
      for (const key of ['Delete', 'Backspace', 'Escape', 'a']) press(field() as HTMLElement, key);
      expect(outside.keys).toStrictEqual([]);
    });
  });

  it('keeps pointer events from reaching the chart', () => {
    const { field, outside } = mount(stub());
    for (const type of POINTER_EVENTS) field()?.dispatchEvent(new Event(type, { bubbles: true }));
    expect(outside.pointers).toStrictEqual([]);
  });

  describe('leaving the textarea', () => {
    it('confirms the text', () => {
      const session = stub();
      const area = mount(session).field() as HTMLTextAreaElement;
      area.value = 'left';
      area.blur();
      expect(session.confirm).toHaveBeenCalledExactlyOnceWith('left');
    });

    it('applies the first answer only', async () => {
      const editor = new TextEditor();
      const answer = editor.edit(REQUEST);
      const { field } = mount(editor.session);
      const area = field() as HTMLTextAreaElement;
      area.value = 'first';
      press(area, 'Enter', { ctrlKey: true });
      area.value = 'second';
      area.blur();
      await expect(answer).resolves.toBe('first');
    });

    it('cancels the editor when Escape was pressed, not confirming it as the textarea goes', async () => {
      const editor = new TextEditor();
      const answer = editor.edit(REQUEST);
      const { field, show } = mount(editor.session);
      press(field() as HTMLElement, 'Escape');
      show(editor.session);
      await expect(answer).resolves.toBeNull();
    });
  });

  describe('when the session is replaced', () => {
    it('listens for the new session only', () => {
      const first = stub();
      const second = stub({ ...REQUEST, text: 'second' });
      const { field, show, outside } = mount(first);
      show(second);
      const area = field() as HTMLTextAreaElement;
      press(area, 'Enter', { ctrlKey: true });
      area.blur();
      expect(first.confirm).not.toHaveBeenCalled();
      expect(second.confirm).toHaveBeenCalledWith('second');
      expect(outside.keys).toStrictEqual([]);
    });

    it('stops listening to the old session when it ends', () => {
      const session = stub();
      const { field, show } = mount(session);
      const area = field() as HTMLTextAreaElement;
      show(null);
      press(area, 'Escape');
      area.dispatchEvent(new Event('blur'));
      expect(session.cancel).not.toHaveBeenCalled();
      expect(session.confirm).not.toHaveBeenCalled();
    });
  });
});
