import { afterEach, describe, expect, it } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { Anchor, Drawing } from 'keystone-financial-tools-core';
import { createMockHost } from 'keystone-financial-tools-core/testing';
import { useDrawingTools, type UseDrawingTools, type UseDrawingToolsOptions } from '../src/use-drawing-tools';

// NFR-A11Y-001: the `announcement` the composable gives for a live region.
const NBSP = String.fromCharCode(160);
const anchor = (time: number, price: number): Anchor => ({ time, price, yAxisId: 'price' });
const line = (id: string): Drawing => ({ id, kind: 'trend-line', anchors: [anchor(600_000, 100), anchor(1_800_000, 150)] });

const scopes: EffectScope[] = [];

function setup(options?: UseDrawingToolsOptions): UseDrawingTools {
  const scope = effectScope();
  scopes.push(scope);
  const result = scope.run(() => useDrawingTools(createMockHost(), options));
  if (result === undefined) throw new Error('scope did not run');
  return result;
}

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
});

describe('useDrawingTools announcement', () => {
  it('is empty until the tools announce something', () => {
    expect(setup().announcement.value).toBe('');
  });

  it('is the last message of the announce event', () => {
    const { store, undo, redo, announcement } = setup();
    store.add(line('a'));
    undo();
    expect(announcement.value).toBe('Undone');
    redo();
    expect(announcement.value).toBe('Redone');
  });

  it('names the tool of what is deleted and selected', () => {
    const { store, select, remove, announcement } = setup();
    store.add(line('a'));
    select(['a']);
    expect(announcement.value).toBe('Trend line selected');
    remove(['a']);
    expect(announcement.value).toBe('Trend line deleted');
  });

  it('gives the same message a different text each time, so a screen reader reads it again', () => {
    const { store, remove, announcement } = setup();
    const texts: string[] = [];
    for (const id of ['a', 'b', 'c']) {
      store.add(line(id));
      remove([id]);
      texts.push(announcement.value);
    }
    expect(texts).toStrictEqual(['Trend line deleted', `Trend line deleted${NBSP}`, 'Trend line deleted']);
  });

  it('is in the language of the messages option', () => {
    const { store, undo, announcement } = setup({ messages: { 'announce.undone': 'Rückgängig' } });
    store.add(line('a'));
    undo();
    expect(announcement.value).toBe('Rückgängig');
  });

  it('stays empty with announcements: false, while the tools still raise the event', () => {
    const { store, tools, undo, announcement } = setup({ announcements: false });
    const events: string[] = [];
    tools.on('announce', (message) => events.push(message));
    store.add(line('a'));
    undo();
    expect(events).toStrictEqual(['Undone']);
    expect(announcement.value).toBe('');
  });

  it('is announced with announcements: true, as without the option', () => {
    const { store, undo, announcement } = setup({ announcements: true });
    store.add(line('a'));
    undo();
    expect(announcement.value).toBe('Undone');
  });

  it('is not changed any more once the scope is stopped', () => {
    const scope = effectScope();
    const result = scope.run(() => useDrawingTools(createMockHost()));
    if (result === undefined) throw new Error('scope did not run');
    result.store.add(line('a'));
    result.undo();
    scope.stop();
    result.redo();
    expect(result.announcement.value).toBe('Undone');
  });
});
