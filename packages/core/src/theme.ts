import { deepFreeze, definedOnly } from './object';
import type { Drawing, DrawingKind, DrawingStyle, LineStyle } from './types';

/** A style with every field set: what the host draws with. */
export interface ResolvedStyle {
  readonly color: string;
  readonly lineWidth: number;
  readonly lineStyle: LineStyle;
  readonly fillColor: string;
  readonly fillOpacity: number;
  readonly textColor: string;
  readonly fontSize: number;
}

/** How an interaction state changes the resolved style of a drawing. */
export interface StateStyle {
  /** Added to the resolved `lineWidth`. */
  readonly lineWidthDelta: number;
  /** Multiplies the opacity of strokes, fills and text, 0 to 1. */
  readonly opacity: number;
}

/** The grab points drawn on a selected drawing. */
export interface HandleStyle {
  /** Side of the square handle in CSS px. */
  readonly size: number;
  readonly fillColor: string;
  readonly strokeColor: string;
  readonly lineWidth: number;
}

/**
 * Default styles for drawings. Applied at scene time, never written into stored drawings, so a theme
 * switch restyles every drawing that does not override a value.
 *
 * @example
 * ```ts
 * const brand: DrawingTheme = { ...LIGHT_THEME, name: 'brand', defaults: { ...LIGHT_THEME.defaults, color: '#ff6d00' } };
 * ```
 */
export interface DrawingTheme {
  readonly name: string;
  /** Global defaults for every kind. */
  readonly defaults: ResolvedStyle;
  /** Per-kind overrides of the global defaults. */
  readonly kinds: Readonly<Partial<Record<DrawingKind, DrawingStyle>>>;
  readonly states: {
    readonly hover: StateStyle;
    readonly selected: StateStyle;
    readonly locked: StateStyle;
    readonly handles: HandleStyle;
  };
}

const FIBONACCI_LIGHT: DrawingStyle = { color: '#787b86', lineWidth: 1 };
const FIBONACCI_DARK: DrawingStyle = { color: '#868993', lineWidth: 1 };

/**
 * The light preset (frozen).
 *
 * @example
 * ```ts
 * resolveStyle({ kind: 'trend-line' }, LIGHT_THEME).color; // '#2962ff'
 * ```
 */
export const LIGHT_THEME: DrawingTheme = deepFreeze<DrawingTheme>({
  name: 'light',
  defaults: { color: '#2962ff', lineWidth: 2, lineStyle: 'solid', fillColor: '#2962ff', fillOpacity: 0, textColor: '#131722', fontSize: 12 },
  kinds: {
    rectangle: { fillOpacity: 0.15 },
    'text-note': { fontSize: 14 },
    'fibonacci-retracement': FIBONACCI_LIGHT,
    'fibonacci-arcs': FIBONACCI_LIGHT,
    'fibonacci-fans': FIBONACCI_LIGHT,
    'fibonacci-time-zones': FIBONACCI_LIGHT,
  },
  states: {
    hover: { lineWidthDelta: 1, opacity: 1 },
    selected: { lineWidthDelta: 1, opacity: 1 },
    locked: { lineWidthDelta: 0, opacity: 0.6 },
    handles: { size: 8, fillColor: '#ffffff', strokeColor: '#2962ff', lineWidth: 1 },
  },
});

/**
 * The dark preset (frozen).
 *
 * @example
 * ```ts
 * resolveStyle({ kind: 'text-note' }, DARK_THEME).textColor; // '#d1d4dc'
 * ```
 */
export const DARK_THEME: DrawingTheme = deepFreeze<DrawingTheme>({
  name: 'dark',
  defaults: { color: '#5b8cff', lineWidth: 2, lineStyle: 'solid', fillColor: '#5b8cff', fillOpacity: 0, textColor: '#d1d4dc', fontSize: 12 },
  kinds: {
    rectangle: { fillOpacity: 0.2 },
    'text-note': { fontSize: 14 },
    'fibonacci-retracement': FIBONACCI_DARK,
    'fibonacci-arcs': FIBONACCI_DARK,
    'fibonacci-fans': FIBONACCI_DARK,
    'fibonacci-time-zones': FIBONACCI_DARK,
  },
  states: {
    hover: { lineWidthDelta: 1, opacity: 1 },
    selected: { lineWidthDelta: 1, opacity: 1 },
    locked: { lineWidthDelta: 0, opacity: 0.6 },
    handles: { size: 8, fillColor: '#131722', strokeColor: '#5b8cff', lineWidth: 1 },
  },
});

/**
 * The style a drawing is drawn with: its own `style` over the theme's kind defaults over the theme's
 * global defaults. Values set to `undefined` do not override. Returns a new object; the drawing and
 * the theme are not modified.
 *
 * @example
 * ```ts
 * resolveStyle({ kind: 'rectangle', style: { color: '#e91e63' } }, DARK_THEME);
 * // { color: '#e91e63', fillOpacity: 0.2, lineWidth: 2, ... }
 * ```
 */
export function resolveStyle(drawing: Pick<Drawing, 'kind' | 'style'>, theme: DrawingTheme = LIGHT_THEME): ResolvedStyle {
  return { ...theme.defaults, ...definedOnly(theme.kinds[drawing.kind]), ...definedOnly(drawing.style) };
}
