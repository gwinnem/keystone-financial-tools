import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { KeystoneLiveRegion } from '../src/keystone-live-region';

// NFR-A11Y-001: the live region the announcements are shown in.
function mount(message?: string): { readonly region: () => HTMLElement | null; readonly show: (next?: string) => void; readonly container: HTMLElement } {
  const view = render(<KeystoneLiveRegion message={message} />);
  return { region: () => view.container.firstElementChild as HTMLElement | null, show: (next) => view.rerender(<KeystoneLiveRegion message={next} />), container: view.container };
}

afterEach(cleanup);

describe('KeystoneLiveRegion', () => {
  it('is one element that is a polite live region read as a whole, with no role of its own', () => {
    const { region, container } = mount('Undone');
    expect(container.children).toHaveLength(1);
    expect(region()?.tagName).toBe('DIV');
    expect(region()?.getAttribute('aria-live')).toBe('polite');
    expect(region()?.getAttribute('aria-atomic')).toBe('true');
    expect(region()?.hasAttribute('role')).toBe(false);
  });

  it('is hidden from the eye and not from a screen reader', () => {
    const style = mount('Undone').region()?.style;
    expect(style?.position).toBe('absolute');
    expect(style?.width).toBe('1px');
    expect(style?.height).toBe('1px');
    expect(style?.overflow).toBe('hidden');
    expect(style?.display).toBe('');
    expect(style?.visibility).toBe('');
  });

  it('shows the message, and follows it', () => {
    const { region, show } = mount('Undone');
    expect(region()?.textContent).toBe('Undone');
    show('Redone');
    expect(region()?.textContent).toBe('Redone');
  });

  it('is empty without a message', () => {
    const { region } = mount();
    expect(region()?.textContent).toBe('');
    expect(region()?.getAttribute('aria-live')).toBe('polite');
  });

  it('shows the message as text, never as HTML', () => {
    const { region } = mount('<b>x</b>');
    expect(region()?.textContent).toBe('<b>x</b>');
    expect(region()?.querySelector('b')).toBeNull();
  });
});
