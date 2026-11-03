import type { DrawingKind, DrawingToolsState } from 'keystone-financial-tools-core';

/**
 * The label of a tool button: the kind's name with spaces and a capital.
 *
 * @example
 * ```ts
 * toolLabel('fibonacci-retracement'); // 'Fibonacci retracement'
 * ```
 */
export function toolLabel(kind: DrawingKind): string {
  const words = kind.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The status line under the chart, for people and for screen readers (it is a live region).
 *
 * @example
 * ```ts
 * statusText(tools.getState(), store.list().length); // 'Tool: trend-line · 2 drawings · 1 selected'
 * ```
 */
export function statusText(state: Pick<DrawingToolsState, 'activeTool' | 'selection'>, drawings: number): string {
  const noun = drawings === 1 ? 'drawing' : 'drawings';
  return `Tool: ${state.activeTool ?? 'none'} · ${drawings} ${noun} · ${state.selection.length} selected`;
}
