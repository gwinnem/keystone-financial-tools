import { geometryOf } from '../geometry/index';
import type { DrawingGeometry } from '../geometry/types';
import type { DrawingHost } from '../host';
import { resolveOptions } from '../options';
import { LIGHT_THEME, resolveStyle, type DrawingTheme, type StateStyle } from '../theme';
import type { Drawing } from '../types';
import type { FibonacciItem, FibonacciKind, ItemState, SceneItem, SceneOptions } from './types';

/** Radius (CSS px) of the circle that marks a snapped point. */
export const SNAP_INDICATOR_RADIUS = 5;

const NORMAL: StateStyle = Object.freeze({ lineWidthDelta: 0, opacity: 1 });

function isFibonacci(drawing: Drawing): drawing is Drawing & { readonly kind: FibonacciKind } {
  return drawing.kind.startsWith('fibonacci-');
}

function isSelected(drawing: Drawing, options: SceneOptions): boolean {
  return options.selected?.has(drawing.id) === true;
}

function stateOf(drawing: Drawing, options: SceneOptions): ItemState {
  if (drawing.locked === true) return 'locked';
  if (isSelected(drawing, options)) return 'selected';
  return options.hover === drawing.id ? 'hover' : 'normal';
}

function drawingItem(drawing: Drawing, geometry: DrawingGeometry, state: ItemState, theme: DrawingTheme): SceneItem {
  const emphasis = state === 'normal' ? NORMAL : theme.states[state];
  const resolved = resolveStyle(drawing, theme);
  const base = { drawingId: drawing.id, style: { ...resolved, lineWidth: resolved.lineWidth + emphasis.lineWidthDelta }, opacity: emphasis.opacity, state };
  if (isFibonacci(drawing)) {
    return { type: 'fibonacci', ...base, kind: drawing.kind, anchors: drawing.anchors, options: resolveOptions(drawing.kind, drawing.options) } as FibonacciItem;
  }
  return { type: 'shape', ...base, shapes: geometry.shapes };
}

function handlesItem(drawing: Drawing, geometry: DrawingGeometry, options: SceneOptions, theme: DrawingTheme): SceneItem {
  const active = options.active?.drawingId === drawing.id ? options.active.index : undefined;
  return {
    type: 'handles',
    drawingId: drawing.id,
    points: geometry.handles.map(({ x, y }) => ({ x, y })),
    ...(active === undefined ? {} : { active }),
    style: theme.states.handles,
    locked: drawing.locked === true,
  };
}

/**
 * Builds the scene the host draws in one overlay pass (FR-SC-001..004): the items in paint order
 * (`zIndex`, then insertion), then the placement preview and the snap indicator, then the handles of
 * the selected drawings last.
 *
 * - Hidden drawings and drawings without a pane have no item.
 * - Primitive kinds are `shape` items with pixel shapes. Fibonacci kinds are `fibonacci` items in
 *   data space with fully resolved options (every level, including hidden ones with `visible: false`).
 * - Every drawing item has its `state` (`locked`, else `selected`, else `hover`, else `normal`), the
 *   style resolved from the drawing and the theme with the state's line width change, and the state's
 *   `opacity`.
 * - A selected drawing also gets a `handles` item (`locked` for a locked drawing, `active` for the
 *   handle being dragged).
 * - `preview` is a `preview` item with the shapes of that drawing; `snap` a `preview` item with a
 *   small circle (`SNAP_INDICATOR_RADIUS`) in the theme's default style.
 *
 * @example
 * ```ts
 * const cache = new GeometryCache(host, { store });
 * const scene = buildScene(host, { drawings: store.list(), cache, selected: new Set(selection), hover: hoverId });
 * for (const item of scene) paint(item);
 * ```
 */
export function buildScene(host: DrawingHost, options: SceneOptions): SceneItem[] {
  const theme = options.theme ?? LIGHT_THEME;
  const visible = options.drawings.filter((drawing) => drawing.hidden !== true);
  // Array.prototype.sort is stable, so equal zIndex values keep insertion order.
  const ordered = [...visible].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const items: SceneItem[] = [];
  const handles: SceneItem[] = [];
  for (const drawing of ordered) {
    const geometry = options.cache.get(drawing);
    if (geometry === null) continue;
    items.push(drawingItem(drawing, geometry, stateOf(drawing, options), theme));
    if (isSelected(drawing, options)) handles.push(handlesItem(drawing, geometry, options, theme));
  }
  if (options.preview != null) {
    const preview = geometryOf(options.preview, host, { theme });
    if (preview !== null) items.push({ type: 'preview', shapes: preview.shapes, style: resolveStyle(options.preview, theme) });
  }
  if (options.snap != null) {
    items.push({
      type: 'preview',
      shapes: [{ type: 'arc', part: 'body', center: options.snap, radius: SNAP_INDICATOR_RADIUS, startAngle: 0, endAngle: 2 * Math.PI }],
      style: theme.defaults,
    });
  }
  return [...items, ...handles];
}
