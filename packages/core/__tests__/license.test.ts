import { describe, expect, it, vi } from 'vitest';
import { TOOL_CATALOG } from '../src/catalog';
import { DRAWING_KINDS } from '../src/kinds';
import { createLicenseGate, FEATURE_TIERS, TOOL_FEATURES, type DrawingFeature, type LicenseSource } from '../src/license';

// FR-LIC-001, FR-LIC-002: the feature table and the gate that answers from a license, or from none.
const FEATURES = Object.keys(FEATURE_TIERS) as DrawingFeature[];
const INVALID = 'The license must be a LicenseContext of keystone-license or an object with a canUseFeature function.';

describe('FEATURE_TIERS', () => {
  it('is the split of FR-LIC-002', () => {
    expect(FEATURE_TIERS).toStrictEqual({
      'trend-line': 'community',
      'horizontal-line': 'community',
      selection: 'community',
      rectangle: 'professional',
      'text-note': 'professional',
      fibonacci: 'professional',
      'magnet-snapping': 'professional',
      'undo-redo': 'professional',
      persistence: 'professional-plus',
      'plugin-api': 'enterprise',
      'storage-adapters': 'enterprise',
    });
  });

  it('never names the developer tier, which has every feature', () => {
    expect(Object.values(FEATURE_TIERS)).not.toContain('developer');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(FEATURE_TIERS)).toBe(true);
  });
});

describe('TOOL_FEATURES', () => {
  it('is the kind itself, and fibonacci for the four Fibonacci tools', () => {
    expect(TOOL_FEATURES).toStrictEqual({
      'trend-line': 'trend-line',
      'horizontal-line': 'horizontal-line',
      rectangle: 'rectangle',
      'fibonacci-retracement': 'fibonacci',
      'fibonacci-arcs': 'fibonacci',
      'fibonacci-fans': 'fibonacci',
      'fibonacci-time-zones': 'fibonacci',
      'text-note': 'text-note',
    });
  });

  it('has an entry for every drawing kind and a feature of the table for each', () => {
    expect(Object.keys(TOOL_FEATURES)).toStrictEqual([...DRAWING_KINDS]);
    for (const feature of Object.values(TOOL_FEATURES)) expect(FEATURES).toContain(feature);
  });

  it('gives every catalog entry the tier of its feature', () => {
    for (const entry of TOOL_CATALOG) expect(entry.tier).toBe(FEATURE_TIERS[TOOL_FEATURES[entry.id]]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(TOOL_FEATURES)).toBe(true);
  });
});

describe('createLicenseGate without a license', () => {
  it('is Community: it allows the features of the Community tier and no other', () => {
    const gate = createLicenseGate();
    for (const feature of FEATURES) expect(gate.canUse(feature)).toBe(FEATURE_TIERS[feature] === 'community');
    expect(FEATURES.filter((feature) => gate.canUse(feature))).toStrictEqual(['trend-line', 'horizontal-line', 'selection']);
  });

  it('allows the tools of the Community tier', () => {
    const gate = createLicenseGate();
    expect(DRAWING_KINDS.filter((kind) => gate.canUseTool(kind))).toStrictEqual(['trend-line', 'horizontal-line']);
  });
});

describe('createLicenseGate with a license', () => {
  it('asks the license, with the name of the feature, and uses its answer', () => {
    const canUseFeature = vi.fn((feature: string) => feature === 'persistence');
    const gate = createLicenseGate({ canUseFeature });
    expect(gate.canUse('persistence')).toBe(true);
    expect(gate.canUse('trend-line')).toBe(false);
    expect(canUseFeature.mock.calls).toStrictEqual([['persistence'], ['trend-line']]);
  });

  it('asks for the feature a tool needs', () => {
    const asked: string[] = [];
    const gate = createLicenseGate({
      canUseFeature: (feature) => {
        asked.push(feature);
        return true;
      },
    });
    for (const kind of DRAWING_KINDS) expect(gate.canUseTool(kind)).toBe(true);
    expect(asked).toStrictEqual(Object.values(TOOL_FEATURES));
  });

  it('takes the manager out of a LicenseContext', () => {
    const gate = createLicenseGate({ manager: { canUseFeature: (feature) => feature === 'rectangle' } });
    expect(gate.canUseTool('rectangle')).toBe(true);
    expect(gate.canUseTool('text-note')).toBe(false);
  });

  it('prefers the manager of a context to a canUseFeature of the context itself', () => {
    const context = { canUseFeature: () => false, manager: { canUseFeature: () => true } };
    expect(createLicenseGate(context).canUse('persistence')).toBe(true);
  });

  it('calls a method of a class instance on the instance', () => {
    class Manager implements LicenseSource {
      readonly allowed = new Set(['fibonacci']);
      canUseFeature(feature: string): boolean {
        return this.allowed.has(feature);
      }
    }
    const gate = createLicenseGate({ manager: new Manager() });
    expect(gate.canUseTool('fibonacci-fans')).toBe(true);
    expect(gate.canUseTool('rectangle')).toBe(false);
    expect(createLicenseGate(new Manager()).canUse('fibonacci')).toBe(true);
  });

  it('can refuse a Community feature too, as a blocked license does', () => {
    const gate = createLicenseGate({ canUseFeature: () => false });
    expect(gate.canUse('trend-line')).toBe(false);
  });

  it('answers each time from the license, so a license that changes is followed', () => {
    let tier = false;
    const gate = createLicenseGate({ canUseFeature: () => tier });
    expect(gate.canUse('persistence')).toBe(false);
    tier = true;
    expect(gate.canUse('persistence')).toBe(true);
  });

  it('accepts only true as a yes', () => {
    for (const answer of [1, 'yes', {}, undefined, null, 0]) {
      expect(createLicenseGate({ canUseFeature: () => answer as never }).canUse('trend-line')).toBe(false);
    }
  });

  it('counts a license that throws as no license for that question: Community', () => {
    const gate = createLicenseGate({
      canUseFeature: () => {
        throw new Error('broken');
      },
    });
    expect(gate.canUse('trend-line')).toBe(true);
    expect(gate.canUse('rectangle')).toBe(false);
    expect(gate.canUseTool('horizontal-line')).toBe(true);
    expect(gate.canUseTool('fibonacci-arcs')).toBe(false);
  });
});

describe('createLicenseGate with something that is not a license', () => {
  it.each([
    ['null', null],
    ['a number', 42],
    ['a string', 'professional'],
    ['an empty object', {}],
    ['an object whose canUseFeature is not a function', { canUseFeature: true }],
    ['a context without a manager', { name: 'x' }],
    ['a context whose manager is empty', { manager: {} }],
    ['a context whose manager is null', { manager: null }],
    ['a context whose manager is a string', { manager: 'x' }],
  ])('throws a RangeError for %s', (_name, license) => {
    expect(() => createLicenseGate(license as never)).toThrow(new RangeError(INVALID));
  });
});

describe('createLicenseGate result', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(createLicenseGate())).toBe(true);
  });
});
