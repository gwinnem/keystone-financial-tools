import type { DrawingToolsState, MagnetMode } from 'keystone-financial-tools-core';

/**
 * The magnet mode the Magnet button switches to: off becomes weak, anything else becomes off.
 *
 * @example
 * ```ts
 * tools.setMagnet(nextMagnet(tools.getState().magnet));
 * ```
 */
export function nextMagnet(mode: MagnetMode): MagnetMode {
  return mode === 'off' ? 'weak' : 'off';
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
