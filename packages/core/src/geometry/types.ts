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
 * Where the label of a Fibonacci level goes (CSS px): the left end of the level line. `text` is
 * what it says: the ratio when `showRatio` (`0.618`), the price when `showPrice` (formatted by
 * `GeometryOptions.priceFormatter`, 2 decimals by default), both as `0.618 (111.80)`. A host with its own
 * Fibonacci renderer can format `ratio` and `price` itself.
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
  readonly text: string;
}

/**
 * An open path through `points` (CSS px), at least two. It is stroked with the resolved style and never filled.
 *
 * @example
 * ```ts
 * const zigzag: PolylineShape = { type: 'polyline', part: 'body', points: [{ x: 0, y: 0 }, { x: 40, y: 30 }, { x: 80, y: 0 }] };
 * ```
 */
export interface PolylineShape {
  readonly type: 'polyline';
  readonly part: GeometryPart;
  readonly points: readonly Point[];
}

/**
 * A closed path through `points` (CSS px), at least three; the last point joins the first. It is stroked with the resolved style
 * and filled with its `fillColor` at `fillOpacity` (nothing when that is 0).
 *
 * @example
 * ```ts
 * const triangle: PolygonShape = { type: 'polygon', part: 'body', points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 40, y: 60 }] };
 * ```
 */
export interface PolygonShape {
  readonly type: 'polygon';
  readonly part: GeometryPart;
  readonly points: readonly Point[];
}

/**
 * A whole ellipse (CSS px) as `CanvasRenderingContext2D.ellipse` takes it: the radii along its own axes, turned by `rotation`
 * radians (0 puts `radiusX` along x; with y growing downwards a positive rotation is clockwise on screen). It is stroked and
 * filled like a polygon. A circle has equal radii.
 *
 * @example
 * ```ts
 * const ellipse: EllipseShape = { type: 'ellipse', part: 'body', center: { x: 100, y: 80 }, radiusX: 60, radiusY: 30, rotation: 0 };
 * ```
 */
export interface EllipseShape {
  readonly type: 'ellipse';
  readonly part: GeometryPart;
  readonly center: Point;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly rotation: number;
}

/**
 * A Bezier curve from `from` to `to` (CSS px): quadratic with one control point, cubic with two. It is stroked and never filled.
 *
 * @example
 * ```ts
 * const bow: CurveShape = { type: 'curve', part: 'body', from: { x: 0, y: 0 }, controls: [{ x: 50, y: -40 }], to: { x: 100, y: 0 } };
 * ```
 */
export interface CurveShape {
  readonly type: 'curve';
  readonly part: GeometryPart;
  readonly from: Point;
  readonly controls: readonly [Point] | readonly [Point, Point];
  readonly to: Point;
}

/**
 * A filled triangle with its tip at `tip` (CSS px), pointing in the direction `angle` (radians, canvas convention: 0 points right,
 * positive turns clockwise on screen). Its base is `width` wide and `length` behind the tip. It is filled with the stroke
 * colour of the resolved style, so it is a solid head whatever the fill of the drawing.
 *
 * @example
 * ```ts
 * const head: ArrowheadShape = { type: 'arrowhead', part: 'body', tip: { x: 100, y: 50 }, angle: 0, length: 10, width: 8 };
 * ```
 */
export interface ArrowheadShape {
  readonly type: 'arrowhead';
  readonly part: GeometryPart;
  readonly tip: Point;
  readonly angle: number;
  readonly length: number;
  readonly width: number;
}

/**
 * A glyph in the box with its top left corner at `x`, `y` (CSS px). `source` says what `glyph` is: `text`, drawn with the text colour
 * of the resolved style; `emoji`, drawn as it is; or `icon`, the name of a built-in icon the host draws (`arrow-up`, `arrow-down`,
 * `arrow-left`, `arrow-right` and `pin`) in the stroke colour, filling the box. A host leaves an icon it does not know undrawn.
 * `fontSize` is the size of text and emoji; an icon fills `width` by `height`.
 *
 * @example
 * ```ts
 * const flag: GlyphShape = { type: 'glyph', part: 'body', x: 10, y: 20, width: 24, height: 24, glyph: 'pin', source: 'icon', fontSize: 24 };
 * ```
 */
export interface GlyphShape {
  readonly type: 'glyph';
  readonly part: GeometryPart;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly glyph: string;
  readonly source: 'text' | 'emoji' | 'icon';
  readonly fontSize: number;
}

export type Shape = LineShape | RectShape | ArcShape | TextShape | LabelShape | PolylineShape | PolygonShape | EllipseShape | CurveShape | ArrowheadShape | GlyphShape;

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

/** Formats a price for a label (FR-SC-001). `yAxisId` is the y-axis the price belongs to, so a host can format each pane its own way. */
export type PriceFormatter = (price: number, yAxisId: string) => string;

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
  /** Formats the price on the label of a horizontal line. Default: the price with 2 decimals. */
  readonly priceFormatter?: PriceFormatter;
}
