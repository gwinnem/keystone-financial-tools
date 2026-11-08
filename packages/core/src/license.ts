import { deepFreeze } from './object';
import type { DrawingKind } from './types';

/**
 * The tier a feature starts at (FR-LIC-002): the ladder of keystone-license without Developer. A Developer license
 * has every feature, so no feature names it.
 */
export type FeatureTier = 'community' | 'professional' | 'professional-plus' | 'enterprise';

/**
 * The features the license gates (FR-LIC-002). A tool is the feature of its kind, except the four Fibonacci tools,
 * which are one feature: see `TOOL_FEATURES`.
 */
export type DrawingFeature =
  'trend-line' | 'horizontal-line' | 'selection' | 'rectangle' | 'text-note' | 'fibonacci' | 'magnet-snapping' | 'undo-redo' | 'persistence' | 'plugin-api' | 'storage-adapters';

/**
 * The lowest tier of each feature (FR-LIC-002, OD-2). Give it to keystone-license as the `features` of
 * `getLicenseContext`, so the license decides with the same table the tools use.
 *
 * @example
 * ```ts
 * const license = getLicenseContext({ packageName: 'keystone-financial-tools-core', packageVersion: '0.1.0', features: FEATURE_TIERS });
 * ```
 */
export const FEATURE_TIERS: Readonly<Record<DrawingFeature, FeatureTier>> = deepFreeze<Record<DrawingFeature, FeatureTier>>({
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

/**
 * The feature each drawing kind needs: the kind itself, and `fibonacci` for the four Fibonacci tools.
 *
 * @example
 * ```ts
 * FEATURE_TIERS[TOOL_FEATURES['fibonacci-arcs']]; // 'professional'
 * ```
 */
export const TOOL_FEATURES: Readonly<Record<DrawingKind, DrawingFeature>> = deepFreeze<Record<DrawingKind, DrawingFeature>>({
  'trend-line': 'trend-line',
  'horizontal-line': 'horizontal-line',
  rectangle: 'rectangle',
  'fibonacci-retracement': 'fibonacci',
  'fibonacci-arcs': 'fibonacci',
  'fibonacci-fans': 'fibonacci',
  'fibonacci-time-zones': 'fibonacci',
  'text-note': 'text-note',
});

/**
 * What the tools ask of a license: whether a feature may be used. The `LicenseManager` of keystone-license is one;
 * the tools do not import it (AR-1), so any object with this method will do.
 */
export interface LicenseSource {
  canUseFeature(feature: string): boolean;
}

/** What `getLicenseContext` of keystone-license returns, as far as the tools need it: the manager that decides. */
export interface LicenseContext {
  readonly manager: LicenseSource;
}

/**
 * Decides which features may be used (FR-LIC-001). Without a license only the Community features may.
 */
export interface LicenseGate {
  /** Whether the feature may be used. Never throws. */
  canUse(feature: DrawingFeature): boolean;
  /** Whether the tool of this kind may be used: `canUse(TOOL_FEATURES[kind])`. */
  canUseTool(kind: DrawingKind): boolean;
}

const MESSAGE = 'The license must be a LicenseContext of keystone-license or an object with a canUseFeature function.';

function communityHas(feature: DrawingFeature): boolean {
  return FEATURE_TIERS[feature] === 'community';
}

/** Asks the source each time; a source that throws is answered as no license. */
function askLicense(source: LicenseSource): (feature: DrawingFeature) => boolean {
  return (feature) => {
    try {
      return source.canUseFeature(feature) === true;
    } catch {
      return communityHas(feature);
    }
  };
}

function sourceOf(license: unknown): LicenseSource {
  const source = (license as { manager?: unknown } | null)?.manager ?? license;
  if (typeof (source as Partial<LicenseSource> | null | undefined)?.canUseFeature !== 'function') throw new RangeError(MESSAGE);
  return source as LicenseSource;
}

/**
 * Makes the gate of a license: a `LicenseContext` of keystone-license or its manager (anything with
 * `canUseFeature`), or none, which is Community. A license that is not one is a `RangeError`. An answer other than
 * `true` is a refusal, and a source that throws counts as no license for that question (Community), so a broken
 * license never opens a gate.
 *
 * @example
 * ```ts
 * const gate = createLicenseGate({ canUseFeature: (feature) => feature !== 'persistence' });
 * gate.canUseTool('rectangle'); // true
 * createLicenseGate().canUseTool('rectangle'); // false: Community
 * ```
 */
export function createLicenseGate(license?: LicenseContext | LicenseSource): LicenseGate {
  const canUse = license === undefined ? communityHas : askLicense(sourceOf(license));
  return Object.freeze({ canUse, canUseTool: (kind: DrawingKind) => canUse(TOOL_FEATURES[kind]) });
}
