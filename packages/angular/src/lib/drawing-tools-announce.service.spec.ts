import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { Anchor, Drawing } from 'keystone-financial-tools-core';
import { createMockHost } from 'keystone-financial-tools-core/testing';
import { KeystoneDrawingToolsService } from './drawing-tools.service';

// NFR-A11Y-001: the `announcement` the service gives for a live region.
const NBSP = String.fromCharCode(160);
const anchor = (time: number, price: number): Anchor => ({ time, price, yAxisId: 'price' });
const line = (id: string): Drawing => ({ id, kind: 'trend-line', anchors: [anchor(600_000, 100), anchor(1_800_000, 150)] });

function setup(): KeystoneDrawingToolsService {
  TestBed.configureTestingModule({ providers: [KeystoneDrawingToolsService] });
  return TestBed.inject(KeystoneDrawingToolsService);
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('KeystoneDrawingToolsService announcement', () => {
  it('is empty before a host is attached, and until the tools announce something', () => {
    const service = setup();
    expect(service.announcement()).toBe('');
    service.attach(createMockHost());
    expect(service.announcement()).toBe('');
  });

  it('is the last message of the announce event', () => {
    const service = setup();
    service.attach(createMockHost());
    service.store.add(line('a'));
    service.undo();
    expect(service.announcement()).toBe('Undone');
    service.redo();
    expect(service.announcement()).toBe('Redone');
  });

  it('names the tool of what is selected and deleted', () => {
    const service = setup();
    service.attach(createMockHost());
    service.store.add(line('a'));
    service.select(['a']);
    expect(service.announcement()).toBe('Trend line selected');
    service.remove(['a']);
    expect(service.announcement()).toBe('Trend line deleted');
  });

  it('gives the same message a different text each time, so a screen reader reads it again', () => {
    const service = setup();
    service.attach(createMockHost());
    const texts: string[] = [];
    for (const id of ['a', 'b', 'c']) {
      service.store.add(line(id));
      service.remove([id]);
      texts.push(service.announcement());
    }
    expect(texts).toStrictEqual(['Trend line deleted', `Trend line deleted${NBSP}`, 'Trend line deleted']);
  });

  it('is in the language of the messages option', () => {
    const service = setup();
    service.attach(createMockHost(), { messages: { 'announce.undone': 'Rückgängig' } });
    service.store.add(line('a'));
    service.undo();
    expect(service.announcement()).toBe('Rückgängig');
  });

  it('is also an observable that emits the current value on subscribe, and every change', () => {
    const service = setup();
    const seen: string[] = [];
    service.announcement$.subscribe((text) => seen.push(text));
    service.attach(createMockHost());
    service.store.add(line('a'));
    service.undo();
    service.redo();
    expect(seen).toStrictEqual(['', 'Undone', 'Redone']);
  });

  it('stays empty with announcements: false, while the tools still raise the event', () => {
    const service = setup();
    service.attach(createMockHost(), { announcements: false });
    const events: string[] = [];
    service.tools()?.on('announce', (message) => events.push(message));
    service.store.add(line('a'));
    service.undo();
    expect(events).toStrictEqual(['Undone']);
    expect(service.announcement()).toBe('');
  });

  it('is announced with announcements: true, as without the option', () => {
    const service = setup();
    service.attach(createMockHost(), { announcements: true });
    service.store.add(line('a'));
    service.undo();
    expect(service.announcement()).toBe('Undone');
  });

  it('is empty again after detach, and works with the next host', () => {
    const service = setup();
    service.attach(createMockHost());
    service.store.add(line('a'));
    service.undo();
    service.detach();
    expect(service.announcement()).toBe('');
    service.attach(createMockHost());
    service.store.add(line('b'));
    service.undo();
    expect(service.announcement()).toBe('Undone');
  });

  it('does not keep the listener of the controller that an attach replaced', () => {
    const service = setup();
    service.attach(createMockHost());
    const first = service.tools();
    service.attach(createMockHost(), { announcements: false });
    service.store.add(line('a'));
    service.undo();
    expect(first).not.toBe(service.tools());
    expect(service.announcement()).toBe('');
  });

  it('completes the observable when the service is destroyed', () => {
    const service = setup();
    let completed = false;
    service.announcement$.subscribe({
      complete: () => {
        completed = true;
      },
    });
    TestBed.resetTestingModule();
    expect(completed).toBe(true);
  });
});
