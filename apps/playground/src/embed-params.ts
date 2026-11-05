import { DRAWING_KINDS, isDrawingKind, type DrawingKind } from 'keystone-financial-tools-core';

/**
 * The drawing kind an embed page enables: the `tool` parameter of its address, or null when it is missing or not a drawing kind.
 * The docs site embeds `embed.html?tool=trend-line` in the page of each tool (E09-F01-S03).
 *
 * @example
 * ```ts
 * toolFromSearch('?tool=trend-line'); // 'trend-line'
 * toolFromSearch('?tool=circle'); // null
 * ```
 */
export function toolFromSearch(search: string): DrawingKind | null {
  const value = new URLSearchParams(search).get('tool');
  return value !== null && isDrawingKind(value) ? value : null;
}

/**
 * What the embed page says when `toolFromSearch` finds no tool: how to ask for one.
 *
 * @example
 * ```ts
 * status.textContent = unknownToolMessage(); // 'Add ?tool= with one of: trend-line, horizontal-line, ...'
 * ```
 */
export function unknownToolMessage(): string {
  return `Add ?tool= with one of: ${DRAWING_KINDS.join(', ')}.`;
}
