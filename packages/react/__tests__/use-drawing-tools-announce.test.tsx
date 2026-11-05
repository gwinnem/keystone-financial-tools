import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { Anchor, Drawing, DrawingHost } from 'keystone-financial-tools-core';
import { createMockHost } from 'keystone-financial-tools-core/testing';
import { useDrawingTools, type UseDrawingToolsOptions } from '../src/use-drawing-tools';

// NFR-A11Y-001: the `announcement` the hook gives for a live region.
const NBSP = String.fromCharCode(160);
const anchor = (time: number, price: number): Anchor => ({ time, price, yAxisId: 'price' });
const line = (id: string): Drawing => ({ id, kind: 'trend-line', anchors: [anchor(600_000, 100), anchor(1_800_000, 150)] });

interface Props {
  readonly host: DrawingHost | null;
  readonly options?: UseDrawingToolsOptions;
}

const render = (host: DrawingHost | null, options?: UseDrawingToolsOptions) => renderHook(({ host, options }: Props) => useDrawingTools(host, options), { initialProps: { host, options } as Props });

afterEach(cleanup);

describe('useDrawingTools announcement', () => {
  it('is empty until the tools announce something, and before there is a host', () => {
    expect(render(null).result.current.announcement).toBe('');
    expect(render(createMockHost()).result.current.announcement).toBe('');
  });

  it('is the last message of the announce event', () => {
    const { result } = render(createMockHost());
    act(() => result.current.store.add(line('a')));
    act(() => {
      result.current.undo();
    });
    expect(result.current.announcement).toBe('Undone');
    act(() => {
      result.current.redo();
    });
    expect(result.current.announcement).toBe('Redone');
  });

  it('names the tool of what is selected and deleted', () => {
    const { result } = render(createMockHost());
    act(() => result.current.store.add(line('a')));
    act(() => result.current.select(['a']));
    expect(result.current.announcement).toBe('Trend line selected');
    act(() => result.current.remove(['a']));
    expect(result.current.announcement).toBe('Trend line deleted');
  });

  it('gives the same message a different text each time, so a screen reader reads it again', () => {
    const { result } = render(createMockHost());
    const texts: string[] = [];
    for (const id of ['a', 'b', 'c']) {
      act(() => result.current.store.add(line(id)));
      act(() => result.current.remove([id]));
      texts.push(result.current.announcement);
    }
    expect(texts).toStrictEqual(['Trend line deleted', `Trend line deleted${NBSP}`, 'Trend line deleted']);
  });

  it('is in the language of the messages option', () => {
    const { result } = render(createMockHost(), { messages: { 'announce.undone': 'Rückgängig' } });
    act(() => result.current.store.add(line('a')));
    act(() => {
      result.current.undo();
    });
    expect(result.current.announcement).toBe('Rückgängig');
  });

  it('stays empty with announcements: false, while the tools still raise the event', () => {
    const { result } = render(createMockHost(), { announcements: false });
    const events: string[] = [];
    result.current.tools?.on('announce', (message) => events.push(message));
    act(() => result.current.store.add(line('a')));
    act(() => {
      result.current.undo();
    });
    expect(events).toStrictEqual(['Undone']);
    expect(result.current.announcement).toBe('');
  });

  it('is announced with announcements: true, as without the option', () => {
    const { result } = render(createMockHost(), { announcements: true });
    act(() => result.current.store.add(line('a')));
    act(() => {
      result.current.undo();
    });
    expect(result.current.announcement).toBe('Undone');
  });

  it('is empty again when the host goes, and works with the next one', () => {
    const first = createMockHost();
    const { result, rerender } = render(first);
    act(() => result.current.store.add(line('a')));
    act(() => {
      result.current.undo();
    });
    expect(result.current.announcement).toBe('Undone');
    rerender({ host: null });
    expect(result.current.announcement).toBe('');
    rerender({ host: createMockHost() });
    act(() => result.current.store.add(line('b')));
    act(() => {
      result.current.undo();
    });
    expect(result.current.announcement).toBe('Undone');
  });
});
