import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DrawingStore, type Drawing } from 'keystone-financial-tools-core';
import { KeystoneDrawingService } from './drawing.service';

const line = (id: string): Drawing => ({
  id,
  kind: 'trend-line',
  anchors: [
    { time: 1, price: 10, yAxisId: 'price' },
    { time: 2, price: 11, yAxisId: 'price' },
  ],
});

function latest(service: KeystoneDrawingService): readonly Drawing[] | undefined {
  let value: readonly Drawing[] | undefined;
  service.drawings$.subscribe((drawings) => (value = drawings)).unsubscribe();
  return value;
}

describe('KeystoneDrawingService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('is provided in root and starts with an empty store', () => {
    const service = TestBed.inject(KeystoneDrawingService);
    expect(service.store).toBeInstanceOf(DrawingStore);
    expect(service.store.list()).toEqual([]);
    expect(latest(service)).toEqual([]);
  });

  it('emits the changes of its store', () => {
    const service = TestBed.inject(KeystoneDrawingService);
    service.store.add(line('a'));
    expect(latest(service)).toEqual([line('a')]);
  });

  it('switches to an attached store and stops following the old one', () => {
    const service = TestBed.inject(KeystoneDrawingService);
    const old = service.store;
    const next = new DrawingStore([line('b')]);
    service.attach(next);
    expect(service.store).toBe(next);
    expect(latest(service)).toEqual([line('b')]);

    old.add(line('a'));
    expect(latest(service)).toEqual([line('b')]);
    next.add(line('c'));
    expect(latest(service)).toEqual([line('b'), line('c')]);
  });

  it('completes and stops following the store on destroy', () => {
    const service = TestBed.inject(KeystoneDrawingService);
    const seen: (readonly Drawing[])[] = [];
    let completed = false;
    service.drawings$.subscribe({
      next: (drawings) => seen.push(drawings),
      complete: () => (completed = true),
    });
    service.ngOnDestroy();
    expect(completed).toBe(true);
    service.store.add(line('a'));
    expect(seen).toEqual([[]]);
  });
});
