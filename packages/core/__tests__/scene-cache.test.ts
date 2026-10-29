import { describe, expect, it } from 'vitest';
import { GeometryCache } from '../src/hit/geometry-cache';
import { SceneCache } from '../src/scene/scene-cache';
import type { SceneOptions } from '../src/scene/types';
import { createMockHost } from '../src/testing/mock-host';
import { DARK_THEME } from '../src/theme';
import type { Anchor, Drawing } from '../src/types';

const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
const trend = (id: string): Drawing => ({ id, kind: 'trend-line', anchors: [A(10, 10), A(110, 60)] });

function setup() {
  const host = createMockHost();
  const cache = new GeometryCache(host);
  const drawings = [trend('a'), trend('b')];
  const base: SceneOptions = { drawings, cache };
  return { host, cache, drawings, base, scenes: new SceneCache(host) };
}

describe('SceneCache (FR-SC-001 caching)', () => {
  it('builds the scene once for the same options', () => {
    const { scenes, base } = setup();
    const first = scenes.get(base);
    expect(first).toHaveLength(2);
    expect(scenes.get(base)).toBe(first);
    expect(scenes.get({ ...base })).toBe(first);
  });

  it('keeps the scene while the optional inputs stay absent or equal', () => {
    const { scenes, base } = setup();
    const selected = new Set(['a']);
    const active = { drawingId: 'a', index: 0 };
    const preview = trend('p');
    const snap = { x: 1, y: 2 };
    const full: SceneOptions = { ...base, selected, hover: 'a', active, preview, snap, theme: DARK_THEME };
    const first = scenes.get(full);
    expect(scenes.get({ ...full })).toBe(first);
  });

  const changes: [string, (o: SceneOptions) => SceneOptions][] = [
    ['drawings', (o) => ({ ...o, drawings: [...o.drawings] })],
    ['cache', (o) => ({ ...o, cache: new GeometryCache(createMockHost()) })],
    ['theme', (o) => ({ ...o, theme: DARK_THEME })],
    ['selected', (o) => ({ ...o, selected: new Set(['a']) })],
    ['hover', (o) => ({ ...o, hover: 'b' })],
    ['active', (o) => ({ ...o, active: { drawingId: 'a', index: 1 } })],
    ['preview', (o) => ({ ...o, preview: trend('p') })],
    ['snap', (o) => ({ ...o, snap: { x: 3, y: 4 } })],
  ];

  it.each(changes)('builds a new scene when %s changes', (_name, change) => {
    const { scenes, base } = setup();
    const first = scenes.get(base);
    const next = scenes.get(change(base));
    expect(next).not.toBe(first);
  });

  it.each(changes)('compares %s by reference: an equal copy is a change', (name, change) => {
    const { scenes, base } = setup();
    const changed = change(base);
    const first = scenes.get(changed);
    const key = name as keyof SceneOptions;
    const copy = { ...changed, [key]: structuredCloneLike(changed[key]) } as SceneOptions;
    if (key === 'drawings' || key === 'selected' || key === 'active' || key === 'preview' || key === 'snap') expect(scenes.get(copy)).not.toBe(first);
  });

  it('builds a new scene after a viewport change, once', () => {
    const { host, scenes, base } = setup();
    const first = scenes.get(base);
    host.scroll(10);
    const second = scenes.get(base);
    expect(second).not.toBe(first);
    expect(scenes.get(base)).toBe(second);
    host.zoom(2);
    expect(scenes.get(base)).not.toBe(second);
  });

  it('reflects the new viewport in the scene', () => {
    const { host, cache, scenes, base } = setup();
    const before = scenes.get({ ...base, selected: new Set(['a']) });
    host.scroll(10);
    cache.clear();
    const after = scenes.get({ ...base, selected: new Set(['a']) });
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
  });

  it('invalidate forces a new scene', () => {
    const { scenes, base } = setup();
    const first = scenes.get(base);
    scenes.invalidate();
    expect(scenes.get(base)).not.toBe(first);
  });

  it('subscribes to the viewport once and unsubscribes on destroy, twice safe', () => {
    const { host, scenes, base } = setup();
    expect(host.listenerCount('viewport')).toBe(2); // the geometry cache and the scene cache
    scenes.get(base);
    scenes.destroy();
    expect(host.listenerCount('viewport')).toBe(1);
    expect(() => scenes.destroy()).not.toThrow();
    expect(host.listenerCount('viewport')).toBe(1);
  });

  it('forgets the scene on destroy', () => {
    const { scenes, base } = setup();
    const first = scenes.get(base);
    scenes.destroy();
    expect(scenes.get(base)).not.toBe(first);
  });
});

function structuredCloneLike(value: unknown): unknown {
  if (value instanceof Set) return new Set(value);
  if (Array.isArray(value)) return [...value];
  if (typeof value === 'object' && value !== null) return { ...value };
  return value;
}
