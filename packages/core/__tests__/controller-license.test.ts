import { describe, expect, it } from 'vitest';
import { DRAWING_KINDS } from '../src/kinds';
import { FEATURE_TIERS, type DrawingFeature } from '../src/license';
import { rig } from './controller-rig';

// FR-LIC-001: the `license` option and what the controller answers from it.
const FEATURES = Object.keys(FEATURE_TIERS) as DrawingFeature[];

describe('the license option', () => {
  it('is Community without a license', () => {
    const { tools } = rig();
    expect(FEATURES.filter((feature) => tools.canUseFeature(feature))).toStrictEqual(['trend-line', 'horizontal-line', 'selection']);
    expect(DRAWING_KINDS.filter((kind) => tools.canUseTool(kind))).toStrictEqual(['trend-line', 'horizontal-line']);
  });

  it('answers from the manager it is given', () => {
    const { tools } = rig({ license: { canUseFeature: (feature) => feature === 'persistence' || feature === 'fibonacci' } });
    expect(tools.canUseFeature('persistence')).toBe(true);
    expect(tools.canUseFeature('rectangle')).toBe(false);
    expect(tools.canUseTool('fibonacci-time-zones')).toBe(true);
    expect(tools.canUseTool('rectangle')).toBe(false);
  });

  it('answers from the manager of a license context', () => {
    const { tools } = rig({ license: { manager: { canUseFeature: () => true } } });
    expect(FEATURES.every((feature) => tools.canUseFeature(feature))).toBe(true);
    expect(DRAWING_KINDS.every((kind) => tools.canUseTool(kind))).toBe(true);
  });

  it('follows a license that changes while the tools run', () => {
    let open = false;
    const { tools } = rig({ license: { canUseFeature: () => open } });
    expect(tools.canUseTool('rectangle')).toBe(false);
    open = true;
    expect(tools.canUseTool('rectangle')).toBe(true);
  });

  it('does not throw when the license does: that question is answered as Community', () => {
    const { tools } = rig({
      license: {
        canUseFeature: () => {
          throw new Error('broken');
        },
      },
    });
    expect(tools.canUseFeature('trend-line')).toBe(true);
    expect(tools.canUseFeature('persistence')).toBe(false);
  });

  it('is an error at creation for something that is not a license', () => {
    const message = 'The license must be a LicenseContext of keystone-license or an object with a canUseFeature function.';
    expect(() => rig({ license: {} as never })).toThrow(new RangeError(message));
    expect(() => rig({ license: null as never })).toThrow(new RangeError(message));
  });

  it('still answers after destroy', () => {
    const { tools } = rig({ license: { canUseFeature: (feature) => feature === 'rectangle' } });
    tools.destroy();
    expect(tools.canUseTool('rectangle')).toBe(true);
    expect(tools.canUseTool('trend-line')).toBe(false);
  });

  it('does not change the state or what the tools can do yet: the toolbar follows the tools option (FR-LIC-003 is E10-F02)', () => {
    const plain = rig().tools.getState();
    const licensed = rig({ license: { canUseFeature: () => false } }).tools.getState();
    expect(licensed).toStrictEqual(plain);
    const { tools } = rig({ license: { canUseFeature: () => false } });
    expect(() => {
      tools.activate('rectangle');
    }).not.toThrow();
    expect(tools.getState().activeTool).toBe('rectangle');
  });
});
