import { afterEach, describe, expect, it } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { KeystoneLiveRegionComponent } from './live-region.component';

// NFR-A11Y-001: the live region the announcements are shown in.
function mount(message?: string | null): { readonly fixture: ComponentFixture<KeystoneLiveRegionComponent>; readonly element: HTMLElement; readonly show: (next: string | null | undefined) => void } {
  const fixture = TestBed.createComponent(KeystoneLiveRegionComponent);
  if (message !== undefined) fixture.componentRef.setInput('message', message);
  return { fixture, element: fixture.nativeElement as HTMLElement, show: (next) => fixture.componentRef.setInput('message', next) };
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('KeystoneLiveRegionComponent', () => {
  it('is a polite live region read as a whole, with no role of its own', () => {
    const { element } = mount('Undone');
    expect(element.getAttribute('aria-live')).toBe('polite');
    expect(element.getAttribute('aria-atomic')).toBe('true');
    expect(element.hasAttribute('role')).toBe(false);
  });

  it('is hidden from the eye and not from a screen reader', () => {
    const { style } = mount('Undone').element;
    expect(style.position).toBe('absolute');
    expect(style.width).toBe('1px');
    expect(style.height).toBe('1px');
    expect(style.overflow).toBe('hidden');
    expect(style.display).toBe('');
    expect(style.visibility).toBe('');
  });

  it('is a live region before it has a message', () => {
    const { element } = mount();
    expect(element.textContent).toBe('');
    expect(element.getAttribute('aria-live')).toBe('polite');
  });

  it('shows the message, and follows it', () => {
    const { element, show } = mount('Undone');
    expect(element.textContent).toBe('Undone');
    show('Redone');
    expect(element.textContent).toBe('Redone');
  });

  it('is empty for no message, null or undefined', () => {
    const { element, show } = mount('Undone');
    show(null);
    expect(element.textContent).toBe('');
    show('Redone');
    show(undefined);
    expect(element.textContent).toBe('');
  });

  it('shows the message as text, never as HTML', () => {
    const { element } = mount('<b>x</b>');
    expect(element.textContent).toBe('<b>x</b>');
    expect(element.querySelector('b')).toBeNull();
  });
});
