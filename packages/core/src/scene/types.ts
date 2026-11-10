import type { Shape } from '../geometry/types';
import type { GeometryCache } from '../hit/geometry-cache';
import type { Point } from '../host';
import type { DrawingTheme, HandleStyle, ResolvedStyle } from '../theme';
import type { Anchor, Drawing, DrawingKind, FibonacciLevel } from '../types';

/** How a drawing is shown: `locked` wins over `selected`, which wins over `hover`. */
export type ItemState = 'normal' | 'hover' | 'selected' | 'locked';

/** The Fibonacci kinds. The host draws them from data space with its own Fibonacci renderer (D-3). */
export type FibonacciKind = Extract<DrawingKind, `fibonacci-${string}`>;

/** The resolved options of each Fibonacci kind: every key the kind has, none left to default. */
export interface ResolvedFibonacciOptions {
  readonly 'fibonacci-retracement': {
    readonly levels: readonly FibonacciLevel[];
    readonly reverse: boolean;
    readonly extendLeft: boolean;
    readonly extendRight: boolean;
    readonly showLabels: boolean;
    readonly showPrices: boolean;
  };
  readonly 'fibonacci-arcs': { readonly levels: readonly FibonacciLevel[]; readonly fullCircles: boolean; readonly showLabels: boolean };
  readonly 'fibonacci-fans': { readonly levels: readonly FibonacciLevel[]; readonly showLabels: boolean };
  readonly 'fibonacci-time-zones': { readonly sequence: readonly number[]; readonly showLabels: boolean };
  readonly 'fibonacci-trend-based': {
    readonly levels: readonly FibonacciLevel[];
    readonly extendLeft: boolean;
    readonly extendRight: boolean;
    readonly showLabels: boolean;
    readonly showPrices: boolean;
  };
  readonly 'fibonacci-channel': { readonly levels: readonly FibonacciLevel[]; readonly extendLeft: boolean; readonly extendRight: boolean; readonly showLabels: boolean };
  readonly 'fibonacci-time-extension': { readonly levels: readonly FibonacciLevel[]; readonly showLabels: boolean };
  readonly 'fibonacci-circles': { readonly levels: readonly FibonacciLevel[]; readonly showLabels: boolean };
  readonly 'fibonacci-spiral': { readonly turns: number; readonly clockwise: boolean };
  readonly 'fibonacci-wedge': { readonly levels: readonly FibonacciLevel[]; readonly showLabels: boolean };
}

/** Fields every drawing item carries. */
interface DrawingItemBase {
  readonly drawingId: string;
  /** The drawing's own style over the theme, `lineWidth` already changed by the state. */
  readonly style: ResolvedStyle;
  /** Multiplies the opacity of strokes, fills and text (0 to 1): the state's opacity. */
  readonly opacity: number;
  readonly state: ItemState;
}

/** A primitive drawing as pixel shapes. */
export interface ShapeItem extends DrawingItemBase {
  readonly type: 'shape';
  readonly shapes: readonly Shape[];
}

/** A Fibonacci drawing in data space with fully resolved options (FR-SC-004). */
export type FibonacciItem = {
  readonly [K in FibonacciKind]: DrawingItemBase & {
    readonly type: 'fibonacci';
    readonly kind: K;
    readonly anchors: readonly Anchor[];
    readonly options: ResolvedFibonacciOptions[K];
  };
}[FibonacciKind];

/** The grab points of a selected drawing, in `handle:<n>` order. */
export interface HandlesItem {
  readonly type: 'handles';
  readonly drawingId: string;
  readonly points: readonly Point[];
  /** Index of the handle being dragged; absent when none is. */
  readonly active?: number;
  readonly style: HandleStyle;
  /** The drawing is locked: draw lock markers instead of grab handles. */
  readonly locked: boolean;
}

/** The drawing being placed, or the snap indicator: shapes in pixels. */
export interface PreviewItem {
  readonly type: 'preview';
  readonly shapes: readonly Shape[];
  readonly style: ResolvedStyle;
}

/** One thing the host draws on its overlay (FR-SC-001). */
export type SceneItem = ShapeItem | FibonacciItem | HandlesItem | PreviewItem;

/**
 * What a scene is built from. Controller state is passed in, so the scene is a pure function of its
 * options; pass the same object for an unchanged value so `SceneCache` can reuse the scene.
 */
export interface SceneOptions {
  /** The drawings in insertion order (`store.list()`). */
  readonly drawings: readonly Drawing[];
  /** The pixel geometry of the drawings; create it with the same theme as `theme`. */
  readonly cache: GeometryCache;
  /** Default `LIGHT_THEME`. */
  readonly theme?: DrawingTheme;
  /** Ids of the selected drawings: they get a `handles` item. Default none. */
  readonly selected?: ReadonlySet<string>;
  /** Id of the drawing under the pointer. */
  readonly hover?: string | null;
  /** The handle being dragged. */
  readonly active?: { readonly drawingId: string; readonly index: number } | null;
  /** The drawing being placed, with the pointer as its missing anchor. */
  readonly preview?: Drawing | null;
  /** The snapped point in plot coordinates; marks it with a circle. */
  readonly snap?: Point | null;
}
