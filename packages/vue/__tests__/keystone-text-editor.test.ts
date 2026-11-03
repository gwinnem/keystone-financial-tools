import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createApp, defineComponent, h, nextTick, shallowRef, type App } from 'vue';
import { TEXT_EDITOR_LABEL, TextEditor, type TextEditRequest, type TextEditSession } from 'keystone-financial-tools-core';
import { KeystoneTextEditor } from '../src/keystone-text-editor';

const REQUEST: TextEditRequest = { drawingId: 'n', text: 'hello', x: 120, y: 80, fontSize: 14 };

interface Mounted {
  readonly session: { value: TextEditSession | null };
  readonly label: { value: string | undefined };
  readonly container: HTMLElement;
  readonly field: () => HTMLTextAreaElement | null;
  readonly outside: { keys: KeyboardEvent[]; pointers: Event[] };
}

const apps: { app: App; container: HTMLElement }[] = [];

/** Mounts the editor in a container with a button that has the focus, and records the events that bubble out of it. */
function mount(initial: TextEditSession | null, label?: string): Mounted {
  const container = document.createElement('div');
  const button = document.createElement('button');
  container.append(button);
  document.body.append(container);
  button.focus();
  const session = shallowRef<TextEditSession | null>(initial);
  const outside: Mounted['outside'] = { keys: [], pointers: [] };
  container.addEventListener('keydown', (event) => outside.keys.push(event));
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) container.addEventListener(type, (event) => outside.pointers.push(event));
  const labelRef = shallowRef<string | undefined>(label);
  const Root = defineComponent({ render: () => h(KeystoneTextEditor, { session: session.value, ...(labelRef.value === undefined ? {} : { label: labelRef.value }) }) });
  const app = createApp(Root);
  app.mount(container.appendChild(document.createElement('div')));
  apps.push({ app, container });
  return { session, label: labelRef, container, field: () => container.querySelector('textarea'), outside };
}

interface StubSession extends TextEditSession {
  readonly confirm: Mock<(text: string) => void>;
  readonly cancel: Mock<() => void>;
}

function stub(request: TextEditRequest = REQUEST): StubSession {
  return { request, confirm: vi.fn<(text: string) => void>(), cancel: vi.fn<() => void>() };
}

const press = (field: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  field.dispatchEvent(event);
  return event;
};

afterEach(() => {
  for (const { app, container } of apps.splice(0)) {
    app.unmount();
    container.remove();
  }
});

describe('KeystoneTextEditor', () => {
  it('renders nothing without a session', () => {
    const { field } = mount(null);
    expect(field()).toBeNull();
  });

  it('renders nothing when the session prop is left out', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const app = createApp(KeystoneTextEditor);
    const errors: unknown[] = [];
    app.config.errorHandler = (error) => errors.push(error);
    app.mount(container);
    apps.push({ app, container });
    expect(errors).toStrictEqual([]);
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('keeps the same textarea, with what was typed in it, while its session stays open', async () => {
    const { field, label } = mount(stub());
    const area = field() as HTMLTextAreaElement;
    area.value = 'typed';
    label.value = 'Other label';
    await nextTick();
    expect(field()).toBe(area);
    expect(area.value).toBe('typed');
    expect(area.getAttribute('aria-label')).toBe('Other label');
  });

  it('shows a textarea with the text, placed at the note and sized like it', () => {
    const { field } = mount(stub());
    const area = field();
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

  describe('focus', () => {
    it('moves to the textarea, with the text selected, and goes back when the session ends', async () => {
      const { field, session, container } = mount(null);
      const button = container.querySelector('button');
      expect(document.activeElement).toBe(button);
      session.value = stub();
      await nextTick();
      const area = field();
      expect(document.activeElement).toBe(area);
      expect([area?.selectionStart, area?.selectionEnd]).toStrictEqual([0, 5]);
      session.value = null;
      await nextTick();
      expect(field()).toBeNull();
      expect(document.activeElement).toBe(button);
    });

    it('has nothing to go back to when no element had the focus', async () => {
      const { session, field } = mount(null);
      const active = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null);
      session.value = stub();
      await nextTick();
      active.mockRestore();
      session.value = null;
      await nextTick();
      expect(field()).toBeNull();
    });

    it('goes back to the element that had the focus when the editor opened, not to an earlier one', async () => {
      const { session, container } = mount(null);
      const other = document.createElement('input');
      container.append(other);
      other.focus();
      session.value = stub();
      await nextTick();
      session.value = null;
      await nextTick();
      expect(document.activeElement).toBe(other);
    });

    it('goes back to the element that had the focus when the textarea was left for nothing in particular', async () => {
      const { session, field, container } = mount(null);
      const button = container.querySelector('button');
      session.value = stub();
      await nextTick();
      field()?.blur();
      expect(document.activeElement).toBe(document.body);
      session.value = null;
      await nextTick();
      expect(document.activeElement).toBe(button);
    });

    it('leaves the focus with the element the user moved it to', async () => {
      const { session, field, container } = mount(null);
      const other = document.createElement('input');
      container.append(other);
      session.value = stub();
      await nextTick();
      other.focus();
      expect(field()).not.toBeNull();
      session.value = null;
      await nextTick();
      expect(document.activeElement).toBe(other);
    });

    it('gives a new session a new textarea', async () => {
      const editor = new TextEditor();
      const { session, field } = mount(null);
      void editor.edit(REQUEST);
      session.value = editor.session;
      await nextTick();
      const first = field();
      void editor.edit({ ...REQUEST, text: 'second' });
      session.value = editor.session;
      await nextTick();
      expect(field()).not.toBe(first);
      expect(field()?.value).toBe('second');
      expect(document.activeElement).toBe(field());
    });
  });

  describe('keys', () => {
    it('confirms with the typed text on Ctrl+Enter and on Cmd+Enter', () => {
      for (const init of [{ ctrlKey: true }, { metaKey: true }]) {
        const session = stub();
        const { field } = mount(session);
        const area = field() as HTMLTextAreaElement;
        area.value = 'typed';
        const event = press(area, 'Enter', init);
        expect(event.defaultPrevented).toBe(true);
        expect(session.confirm).toHaveBeenCalledExactlyOnceWith('typed');
        expect(session.cancel).not.toHaveBeenCalled();
      }
    });

    it('cancels on Escape', () => {
      const session = stub();
      const { field } = mount(session);
      const event = press(field() as HTMLElement, 'Escape');
      expect(event.defaultPrevented).toBe(true);
      expect(session.cancel).toHaveBeenCalledOnce();
      expect(session.confirm).not.toHaveBeenCalled();
    });

    it('leaves other keys to the textarea, a plain Enter included', () => {
      const session = stub();
      const { field } = mount(session);
      for (const key of ['Enter', 'a', 'Delete', 'Backspace']) expect(press(field() as HTMLElement, key).defaultPrevented).toBe(false);
      expect(session.confirm).not.toHaveBeenCalled();
      expect(session.cancel).not.toHaveBeenCalled();
    });

    it('ignores the keys of an input method that is composing', () => {
      const session = stub();
      const { field } = mount(session);
      press(field() as HTMLElement, 'Escape', { isComposing: true });
      press(field() as HTMLElement, 'Enter', { isComposing: true, ctrlKey: true });
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
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) field()?.dispatchEvent(new Event(type, { bubbles: true }));
    expect(outside.pointers).toStrictEqual([]);
  });

  describe('leaving the textarea', () => {
    it('confirms the text', () => {
      const session = stub();
      const { field } = mount(session);
      const area = field() as HTMLTextAreaElement;
      area.value = 'left';
      area.blur();
      expect(session.confirm).toHaveBeenCalledExactlyOnceWith('left');
    });

    it('applies the first answer only', async () => {
      const editor = new TextEditor();
      const { session, field } = mount(null);
      const answer = editor.edit(REQUEST);
      session.value = editor.session;
      await nextTick();
      const area = field() as HTMLTextAreaElement;
      area.value = 'first';
      press(area, 'Enter', { ctrlKey: true });
      area.value = 'second';
      area.blur();
      await expect(answer).resolves.toBe('first');
    });

    it('cancels the editor when Escape was pressed, not confirming it as the textarea goes', async () => {
      const editor = new TextEditor();
      const { session, field } = mount(null);
      const answer = editor.edit(REQUEST);
      session.value = editor.session;
      await nextTick();
      press(field() as HTMLElement, 'Escape');
      session.value = editor.session;
      await nextTick();
      await expect(answer).resolves.toBeNull();
    });
  });
});
