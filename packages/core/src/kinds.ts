import type { DrawingKind } from './types';

/** The number of anchors each drawing kind takes. */
export const ANCHOR_COUNT: Readonly<Record<DrawingKind, number>> = {
  'trend-line': 2,
  'horizontal-line': 1,
  rectangle: 2,
  'fibonacci-retracement': 2,
  'fibonacci-arcs': 2,
  'fibonacci-fans': 2,
  'fibonacci-time-zones': 2,
  'text-note': 1,
};

/** Every drawing kind, in catalog order. */
export const DRAWING_KINDS = Object.keys(ANCHOR_COUNT) as readonly DrawingKind[];

export function isDrawingKind(value: unknown): value is DrawingKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ANCHOR_COUNT, value);
}
