import type { Point } from '../host';
import type { DrawingTheme } from '../theme';
import type { DrawingKind } from '../types';

/**
 * Which part of a drawing a shape belongs to: the body, a Fibonacci level (retracement, fan and arc
 * ratio, or time-zone sequence value) or a label.
 */
export type GeometryPart = 'body' | 'label' | `level:${number}`;

/** A straight line in plot coordinates (CSS px). */
export interface LineShape {
  readonly type: 'line';
  readonly part: GeometryPart;
  readonly from: Point;
  readonly to: Point;
}

/** An axis-aligned rectangle in plot coordinates (CSS px), always with a non-negative width and height. */
export interface RectShape {
  readonly type: 'rect';
  readonly part: GeometryPart;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A circular arc in plot coordinates (CSS px). Angles are radians as `CanvasRenderingContext2D.arc`
 * takes them (0 points right; with y growing downwards, positive angles turn clockwise on screen),
 * drawn from `startAngle` to `endAngle`.
 */
export interface ArcShape {
  readonly type: 'arc';
  readonly part: GeometryPart;
  readonly center: Point;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

/** The box of a text note: its top left corner, size and the lines of text (CSS px). */
export interface TextShape {
  readonly type: 'text';
  readonly part: GeometryPart;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly string[];
  readonly fontSize: number;
  readonly lineHeight: number;
}

/**
 * Where the label of a Fibonacci level goes (CSS px): the left end of the level line. The renderer
 * formats the text: the ratio when `showRatio`, the price when `showPrice`.
 */
export interface LabelShape {
  readonly type: 'label';
  readonly part: 'label';
  readonly x: number;
  readonly y: number;
  readonly ratio: number;
  readonly price: number;
  readonly showRatio: boolean;
  readonly showPrice: boolean;
}

export type Shape = LineShape | RectShape | ArcShape | TextShape | LabelShape;

/** A grab point of a drawing. The id stays the same across frames: `handle:<n>`. */
export interface HandlePoint {
  readonly id: `handle:${number}`;
  readonly x: number;
  readonly y: number;
}

/** The pixel geometry of one drawing for the current frame. */
export interface DrawingGeometry {
  readonly drawingId: string;
  readonly kind: DrawingKind;
  readonly shapes: readonly Shape[];
  readonly handles: readonly HandlePoint[];
}

/**
 * Options of `geometryOf`.
 *
 * @example
 * ```ts
 * const options: GeometryOptions = { theme: DARK_THEME, measureText: (line, fontSize) => measure(line, fontSize) };
 * ```
 */
export interface GeometryOptions {
  /** Supplies the font size of text notes without one. Default `LIGHT_THEME`. */
  readonly theme?: DrawingTheme;
  /**
   * Measures the width (CSS px) of one line of text at a font size. Without it the width is
   * estimated as `fontSize * TEXT_CHAR_WIDTH` per character.
   */
  readonly measureText?: (line: string, fontSize: number) => number;
}
