import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TEXT_EDITOR_LABEL, TextEditor, type TextEditRequest, type TextEditSession } from 'keystone-financial-tools-core';
import { KeystoneTextEditorComponent } from './text-editor.component';

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
  readonly fixture: ComponentFixture<KeystoneTextEditorComponent>;
  readonly button: HTMLButtonElement;
  readonly field: () => HTMLTextAreaElement | null;
  readonly show: (session: TextEditSession | null | undefined) => void;
  readonly outside: { keys: KeyboardEvent[]; pointers: Event[] };
}

const buttons: HTMLButtonElement[] = [];
const bodyListeners: [string, EventListener][] = [];

/** Creates the editor with a button that has the focus, and records the events that bubble out of it to the body. */
function mount(initial: TextEditSession | null | undefined, label?: string): Mounted {
  const button = document.createElement('button');
  document.body.append(button);
  buttons.push(button);
  button.focus();
  const outside: Mounted['outside'] = { keys: [], pointers: [] };
  const record = (type: string, listener: EventListener): void => {
    document.body.addEventListener(type, listener);
    bodyListeners.push([type, listener]);
  };
  record('keydown', (event) => outside.keys.push(event as KeyboardEvent));
  for (const type of POINTER_EVENTS) record(type, (event) => outside.pointers.push(event));
  const fixture = TestBed.createComponent(KeystoneTextEditorComponent);
  if (label !== undefined) fixture.componentRef.setInput('label', label);
  fixture.componentRef.setInput('session', initial);
  return {
    fixture,
    button,
    field: () => fixture.nativeElement.querySelector('textarea'),
    show: (session) => fixture.componentRef.setInput('session', session),
    outside,
  };
}

const press = (field: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  field.dispatchEvent(event);
  return event;
};

afterEach(() => {
  TestBed.resetTestingModule();
  for (const [type, listener] of bodyListeners.splice(0)) document.body.removeEventListener(type, listener);
  for (const button of buttons.splice(0)) button.remove();
});

describe('KeystoneTextEditorComponent', () => {
  it('renders nothing without a session, and is not more than its element', () => {
    const { fixture, field } = mount(null);
    expect(field()).toBeNull();
    expect(fixture.nativeElement.textContent).toBe('');
    expect(fixture.nativeElement.children).toHaveLength(0);
  });

  it('renders nothing when the session is left out or undefined', () => {
    expect(mount(undefined).field()).toBeNull();
    const fixture = TestBed.createComponent(KeystoneTextEditorComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });

  it('is used as keystone-text-editor with a session and a label', () => {
    @Component({ imports: [KeystoneTextEditorComponent], template: '<keystone-text-editor [session]="session" label="Notiztext" />' })
    class Host {
      session = stub();
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const area = fixture.nativeElement.querySelector('keystone-text-editor textarea') as HTMLTextAreaElement | null;
    expect(area?.value).toBe('hello');
    expect(area?.getAttribute('aria-label')).toBe('Notiztext');
  });

  it('shows a textarea with the text, placed at the note and sized like it', () => {
    const area = mount(stub()).field();
    expect(area?.value).toBe('hello');
    expect(area?.style.position).toBe('absolute');
    expect(area?.style.left).toBe('120px');
    expect(area?.style.top).toBe('80px');
    expect(area?.style.fontSize).toBe('14px');
  });

  it('puts the textarea inside the element of the component', () => {
    const { fixture, field } = mount(stub());
    expect(field()?.parentElement).toBe(fixture.nativeElement);
  });

  it('names the textarea, by default and with a label', () => {
    expect(mount(stub()).field()?.getAttribute('aria-label')).toBe(TEXT_EDITOR_LABEL);
    expect(mount(stub(), 'Notiztext').field()?.getAttribute('aria-label')).toBe('Notiztext');
  });

  it('never reads the text as HTML', () => {
    const { field, fixture } = mount(stub({ ...REQUEST, text: '<img src=x onerror=alert(1)><b>x</b>' }));
    expect(field()?.value).toBe('<img src=x onerror=alert(1)><b>x</b>');
    expect(fixture.nativeElement.querySelector('img, b')).toBeNull();
  });

  it('changes the name of the open textarea, keeping the textarea and what was typed in it', () => {
    const { fixture, field } = mount(stub());
    const area = field() as HTMLTextAreaElement;
    area.value = 'typed';
    fixture.componentRef.setInput('label', 'Other label');
    expect(field()).toBe(area);
    expect(area.value).toBe('typed');
    expect(area.getAttribute('aria-label')).toBe('Other label');
    fixture.componentRef.setInput('label', undefined);
    expect(area.getAttribute('aria-label')).toBe(TEXT_EDITOR_LABEL);
  });

  it('keeps the label it was given for the next session', () => {
    const { show, field } = mount(null, 'Notiztext');
    show(stub());
    expect(field()?.getAttribute('aria-label')).toBe('Notiztext');
  });

  it('shows the text of a new session in a new textarea', () => {
    const { field, show } = mount(stub());
    const first = field();
    (first as HTMLTextAreaElement).value = 'typed';
    show(stub({ ...REQUEST, text: 'second', x: 5, y: 6, fontSize: 9 }));
    expect(field()).not.toBe(first);
    expect(field()?.value).toBe('second');
    expect(field()?.style.left).toBe('5px');
    expect(first?.isConnected).toBe(false);
  });

  it('removes the textarea when the component is destroyed', () => {
    const { fixture, field, button } = mount(stub());
    const area = field();
    fixture.destroy();
    expect(area?.isConnected).toBe(false);
    expect(document.activeElement).toBe(button);
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
      const { show } = mount(null);
      const other = document.createElement('input');
      document.body.append(other);
      other.focus();
      show(stub());
      show(null);
      expect(document.activeElement).toBe(other);
      other.remove();
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
      const { show, field, button } = mount(null);
      const other = document.createElement('input');
      document.body.append(other);
      show(stub());
      other.focus();
      expect(field()).not.toBeNull();
      const refocused = vi.fn();
      button.addEventListener('focus', refocused);
      show(null);
      expect(document.activeElement).toBe(other);
      expect(refocused).not.toHaveBeenCalled();
      other.remove();
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

    it('does not confirm a cancelled editor as the textarea goes', async () => {
      const editor = new TextEditor();
      const answer = editor.edit(REQUEST);
      const { field, show } = mount(editor.session);
      press(field() as HTMLElement, 'Escape');
      show(null);
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
      // A listener that was left would still stop the event (the flag is reset after the dispatch, so the call is what shows it).
      const stopped = (event: Event): boolean => {
        const stop = vi.spyOn(event, 'stopPropagation');
        area.dispatchEvent(event);
        return stop.mock.calls.length > 0;
      };
      expect(stopped(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))).toBe(false);
      for (const type of POINTER_EVENTS) expect(stopped(new Event(type, { bubbles: true }))).toBe(false);
    });
  });
});
