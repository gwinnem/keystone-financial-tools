import { afterEach, describe, expect, it } from 'vitest';
import { DrawingError } from '../src/errors';
import { geometryOf } from '../src/geometry/index';
import { importDocument } from '../src/import';
import { ANCHOR_COUNT, ANCHOR_RULES, DEFAULT_TOOLS, DRAWING_KINDS, isDrawingKind, isFreehandKind, kindDefinition, registerKind, type KindDefinition } from '../src/kinds';
import { defaultOptions, resolveOptions, validateOptions } from '../src/options';
import { DrawingStore } from '../src/store';
import { createMockHost } from '../src/testing/mock-host';
import type { Drawing, DrawingKind } from '../src/types';
import { validateDrawing } from '../src/validate';
import { rig } from './controller-rig';
import { anchor } from './fixtures';

// E12-F01-S01 (FR-TOOL-030, D-8, D-15): one registry of kinds; a new kind is one entry.
const BUILT_IN = ['trend-line', 'horizontal-line', 'rectangle', 'fibonacci-retracement', 'fibonacci-arcs', 'fibonacci-fans', 'fibonacci-time-zones', 'text-note'];

const FAKE = 'triangle' as DrawingKind;
const fake = (overrides: Partial<KindDefinition> = {}): KindDefinition => ({
  id: FAKE,
  anchors: { min: 3, max: 5 },
  defaults: { showLabels: true },
  group: 'shapes',
  geometry: ({ points }) => [{ type: 'line', part: 'body', from: points[0], to: points[1] }],
  ...overrides,
});
const triangle = (anchors = 3): Drawing => ({ id: 'tri', kind: FAKE, anchors: Array.from({ length: anchors }, (_, index) => anchor(index + 1)) });

const disposers: (() => void)[] = [];
const register = (definition: KindDefinition = fake()): (() => void) => {
  const dispose = registerKind(definition);
  disposers.push(dispose);
  return dispose;
};
afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
});

describe('the eight kinds of 1.0', () => {
  it('are registered in catalog order with fixed anchor rules', () => {
    expect(DRAWING_KINDS).toEqual(BUILT_IN);
    expect(DEFAULT_TOOLS).toEqual(BUILT_IN);
    expect(ANCHOR_RULES['trend-line']).toEqual({ min: 2, max: 2 });
    expect(ANCHOR_RULES['text-note']).toEqual({ min: 1, max: 1 });
    for (const kind of BUILT_IN) {
      const rule = ANCHOR_RULES[kind as DrawingKind];
      expect(ANCHOR_COUNT[kind as DrawingKind]).toBe(rule.min);
      expect(rule.min).toBe(rule.max);
    }
  });

  it('carry a group and their option defaults in the registry', () => {
    expect(kindDefinition('rectangle')?.group).toBe('shapes');
    expect(kindDefinition('fibonacci-fans')?.group).toBe('fibonacci');
    expect(kindDefinition('trend-line')?.defaults).toEqual({ extendLeft: false, extendRight: false });
    expect(Object.isFrozen(kindDefinition('trend-line'))).toBe(true);
  });
});

describe('registerKind', () => {
  it('makes a fake kind work without a change anywhere else', () => {
    register();
    expect(isDrawingKind(FAKE)).toBe(true);
    expect(DRAWING_KINDS[DRAWING_KINDS.length - 1]).toBe(FAKE);
    expect(ANCHOR_RULES[FAKE]).toEqual({ min: 3, max: 5 });
    expect(FAKE in ANCHOR_COUNT).toBe(false);
    expect(defaultOptions(FAKE)).toEqual({ showLabels: true });
    expect(resolveOptions(FAKE, { showLabels: false })).toEqual({ showLabels: false });
    expect(validateOptions(FAKE, { levels: [] })).toEqual([{ code: 'KFT-E-OPTIONS', message: 'The option levels is not allowed on a triangle.' }]);
    expect(validateDrawing(triangle(4))).toEqual([]);
    const geometry = geometryOf(triangle(), createMockHost());
    expect(geometry?.kind).toBe(FAKE);
    expect(geometry?.shapes).toHaveLength(1);
    expect(geometry?.handles.map((handle) => handle.id)).toEqual(['handle:0', 'handle:1', 'handle:2']);
  });

  it('uses the handles of the entry when it has them', () => {
    register(fake({ handles: () => [{ id: 'handle:0', x: 1, y: 2 }] }));
    expect(geometryOf(triangle(), createMockHost())?.handles).toEqual([{ id: 'handle:0', x: 1, y: 2 }]);
  });

  it('keeps a registered kind out of the default tools', () => {
    register();
    expect(DEFAULT_TOOLS).toEqual(BUILT_IN);
    const { tools } = rig();
    expect(() => tools.activate(FAKE)).toThrow(DrawingError);
    expect(tools.getState().toolbar.map((entry) => entry.id)).toEqual(BUILT_IN);
  });

  it('puts a fixed kind in ANCHOR_COUNT too', () => {
    register(fake({ anchors: { min: 4, max: 4 } }));
    expect(ANCHOR_COUNT[FAKE]).toBe(4);
  });

  it('removes the kind again with the function it returns, once', () => {
    const dispose = register();
    dispose();
    expect(isDrawingKind(FAKE)).toBe(false);
    expect(DRAWING_KINDS).toEqual(BUILT_IN);
    expect(FAKE in ANCHOR_RULES).toBe(false);
    expect(geometryOf(triangle(), createMockHost())).toBeNull();
    const again = register();
    dispose();
    expect(isDrawingKind(FAKE)).toBe(true);
    again();
  });

  it('rejects an empty id, a taken id and a bad anchor rule', () => {
    expect(() => registerKind(fake({ id: '' }))).toThrow(RangeError);
    expect(() => registerKind(fake({ id: 'rectangle' }))).toThrow('The kind rectangle is already registered.');
    for (const anchors of [
      { min: 0, max: 2 },
      { min: 3, max: 2 },
      { min: 1.5, max: 2 },
      { min: 1, max: 2.5 },
      { min: 1, max: Infinity },
    ]) {
      expect(() => registerKind(fake({ anchors }))).toThrow('The anchor rule of triangle needs whole numbers with 1 <= min <= max.');
    }
    expect(isDrawingKind(FAKE)).toBe(false);
  });

  it('does not let a later change of the definition leak in', () => {
    const definition = fake({ anchors: { min: 3, max: 5 }, defaults: { showLabels: true } });
    register(definition);
    (definition.anchors as { max: number }).max = 9;
    expect(ANCHOR_RULES[FAKE]).toEqual({ min: 3, max: 5 });
  });
});

describe('KFT-E-ANCHORS with an anchor range', () => {
  it('names the range of a variable kind and the count of a fixed one', () => {
    register();
    expect(validateDrawing(triangle(2))).toEqual([{ code: 'KFT-E-ANCHORS', message: 'A triangle needs 3 to 5 anchors.' }]);
    expect(validateDrawing(triangle(6))).toEqual([{ code: 'KFT-E-ANCHORS', message: 'A triangle needs 3 to 5 anchors.' }]);
    expect(validateDrawing(triangle(3))).toEqual([]);
    expect(validateDrawing(triangle(5))).toEqual([]);
    expect(validateDrawing({ id: 'x', kind: 'trend-line', anchors: [anchor(1)] })).toEqual([{ code: 'KFT-E-ANCHORS', message: 'A trend-line needs 2 anchor(s).' }]);
    expect(validateDrawing({ id: 'x', kind: FAKE })).toEqual([{ code: 'KFT-E-ANCHORS', message: 'A triangle needs 3 to 5 anchors.' }]);
  });
});

describe('freehand kinds (FR-TOOL-034)', () => {
  it('are told from point kinds, also when not registered', () => {
    register(fake({ anchors: { min: 2, max: 512 }, placement: 'freehand' }));
    expect(isFreehandKind(FAKE)).toBe(true);
    expect(isFreehandKind('trend-line')).toBe(false);
    expect(isFreehandKind('nope' as DrawingKind)).toBe(false);
  });

  it('treats an explicit points placement as a point kind', () => {
    register(fake({ placement: 'points' }));
    expect(isFreehandKind(FAKE)).toBe(false);
  });

  it('need at least two anchors', () => {
    expect(() => register(fake({ anchors: { min: 1, max: 512 }, placement: 'freehand' }))).toThrow(RangeError);
    expect(() => register(fake({ anchors: { min: 1, max: 512 }, placement: 'freehand' }))).toThrow('The freehand kind triangle needs at least two anchors.');
    expect(isFreehandKind(FAKE)).toBe(false);
  });
});

describe('a document with an unknown kind (D-15)', () => {
  const document = { version: 2, drawings: [triangle(), { id: 'ok', kind: 'trend-line', anchors: [anchor(1), anchor(2)] }] };

  it('fails that drawing with KFT-E-KIND and keeps the others, in merge and replace mode', () => {
    for (const mode of ['merge', 'replace'] as const) {
      const store = new DrawingStore();
      const report = importDocument(store, document, { mode });
      expect(report.added).toEqual(['ok']);
      expect(report.skipped).toEqual([{ index: 0, issues: [{ code: 'KFT-E-KIND', message: 'Unknown drawing kind: triangle.' }] }]);
      expect(store.list().map((drawing) => drawing.id)).toEqual(['ok']);
    }
  });

  it('loads the drawing once its kind is registered', () => {
    register();
    const store = new DrawingStore();
    expect(importDocument(store, document).skipped).toEqual([]);
    expect(store.list().map((drawing) => drawing.id)).toEqual(['tri', 'ok']);
  });
});
