import type { Point } from '../host';
import type { RectShape, TextShape } from './types';

/** Estimated width of one character, as a fraction of the font size (FR-GEO-007). */
export const TEXT_CHAR_WIDTH = 0.6;
/** Height of one line of text, as a multiple of the font size (FR-GEO-007). */
export const TEXT_LINE_HEIGHT = 1.3;

/** A rectangle between two opposite corners, in any order. */
export function rectangleShapes(p1: Point, p2: Point): RectShape[] {
  return [{ type: 'rect', part: 'body', x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), width: Math.abs(p2.x - p1.x), height: Math.abs(p2.y - p1.y) }];
}

/**
 * The box of a text note with its top left corner at the anchor. Lines split on `\n`; the box is as
 * wide as the widest line (`measureText`, or the estimate) and at least one character wide, so an
 * empty note stays clickable.
 */
export function textNoteShapes(p: Point, text: string, fontSize: number, measureText?: (line: string, fontSize: number) => number): TextShape[] {
  const lines = text.split('\n');
  const measure = measureText ?? ((line: string, size: number): number => line.length * size * TEXT_CHAR_WIDTH);
  const lineHeight = fontSize * TEXT_LINE_HEIGHT;
  const width = Math.max(fontSize * TEXT_CHAR_WIDTH, ...lines.map((line) => measure(line, fontSize)));
  return [{ type: 'text', part: 'body', x: p.x, y: p.y, width, height: lines.length * lineHeight, lines, fontSize, lineHeight }];
}
