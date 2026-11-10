import { anchorHandles, horizontalLineHandles, rectangleHandles, timeZoneHandles } from './geometry/handles';
import { rectangleShapes, textNoteShapes } from './geometry/boxes';
import {
  arcShapes,
  channelShapes,
  circleShapes,
  fanShapes,
  retracementShapes,
  spiralShapes,
  timeExtensionShapes,
  timeZoneShapes,
  trendBasedShapes,
  wedgeShapes,
  type PriceLevelOptions,
  type RetracementOptions,
} from './geometry/fibonacci';
import { formatPrice, horizontalLineShapes, priceLabelShapes, trendLineShapes } from './geometry/lines';
import { registerBuiltInKind, registerKind, type KindGeometryContext } from './kind-registry';
import { BUILT_IN_DEFAULTS } from './option-defaults';
import { resolveStyle } from './theme';
import type { DrawingKind, FibonacciLevel } from './types';

function priceText(context: KindGeometryContext, price: number, yAxisId: string): string {
  return (context.options.priceFormatter ?? formatPrice)(price, yAxisId);
}

function levelsOf(context: KindGeometryContext): readonly FibonacciLevel[] {
  return context.kindOptions.levels as readonly FibonacciLevel[];
}

const TWO = { min: 2, max: 2 } as const;
const ONE = { min: 1, max: 1 } as const;
const THREE = { min: 3, max: 3 } as const;

function register(id: DrawingKind, definition: Omit<Parameters<typeof registerBuiltInKind>[0], 'id' | 'defaults'>): void {
  registerBuiltInKind({ id, defaults: BUILT_IN_DEFAULTS[id], ...definition });
}

// The eight kinds of 1.0, in catalog order (FR-FW-040). Their ids, anchors and documents do not change (D-8).
register('trend-line', {
  anchors: TWO,
  group: 'lines',
  geometry: (c) => trendLineShapes(c.points[0], c.points[1], c.rect, c.kindOptions.extendLeft as boolean, c.kindOptions.extendRight as boolean),
  handles: anchorHandles,
});
register('horizontal-line', {
  anchors: ONE,
  group: 'lines',
  geometry: (c) => {
    const [a] = c.drawing.anchors;
    return [
      ...horizontalLineShapes(c.points[0], c.rect),
      ...priceLabelShapes(c.points[0], c.rect, priceText(c, a.price, a.yAxisId), resolveStyle(c.drawing, c.options.theme).fontSize, c.options.measureText),
    ];
  },
  handles: horizontalLineHandles,
});
register('rectangle', {
  anchors: TWO,
  group: 'shapes',
  geometry: (c) => rectangleShapes(c.points[0], c.points[1]),
  handles: rectangleHandles,
});
register('fibonacci-retracement', {
  anchors: TWO,
  group: 'fibonacci',
  geometry: (c) => {
    const [a1, a2] = c.drawing.anchors;
    return retracementShapes(a1, a2, c.rect, c.host, c.kindOptions as RetracementOptions, (price) => priceText(c, price, a1.yAxisId));
  },
  handles: anchorHandles,
});
register('fibonacci-arcs', {
  anchors: TWO,
  group: 'fibonacci',
  geometry: (c) => arcShapes(c.points[0], c.points[1], levelsOf(c), c.kindOptions.fullCircles as boolean),
  handles: anchorHandles,
});
register('fibonacci-fans', {
  anchors: TWO,
  group: 'fibonacci',
  geometry: (c) => fanShapes(c.drawing.anchors[0], c.drawing.anchors[1], c.rect, c.host, levelsOf(c)),
  handles: anchorHandles,
});
register('fibonacci-time-zones', {
  anchors: TWO,
  group: 'fibonacci',
  geometry: (c) => timeZoneShapes(c.drawing.anchors[0], c.drawing.anchors[1], c.rect, c.host, c.kindOptions.sequence as readonly number[]),
  handles: timeZoneHandles,
});
register('text-note', {
  anchors: ONE,
  group: 'annotations',
  geometry: (c) => textNoteShapes(c.points[0], c.drawing.text ?? '', resolveStyle(c.drawing, c.options.theme).fontSize, c.options.measureText),
  handles: anchorHandles,
});

// The Fibonacci kinds of E11 and E15 (D-8): registered, so documents with them are valid and a host draws them with its Fibonacci renderer,
// but not in the default `tools` (they are not built-in tools of 1.0) and not in `TOOL_CATALOG` until their tool stories add an entry.
function registerFibonacci(id: DrawingKind, definition: Omit<Parameters<typeof registerKind>[0], 'id' | 'defaults' | 'group'>): void {
  registerKind({ id, defaults: BUILT_IN_DEFAULTS[id], group: 'fibonacci', ...definition });
}

registerFibonacci('fibonacci-trend-based', {
  anchors: THREE,
  geometry: (c) => {
    const [a1, a2, a3] = c.drawing.anchors;
    return trendBasedShapes(a1, a2, a3, c.rect, c.host, c.kindOptions as unknown as PriceLevelOptions, (price) => priceText(c, price, a3.yAxisId));
  },
});
registerFibonacci('fibonacci-channel', {
  anchors: THREE,
  geometry: (c) => channelShapes(c.points[0], c.points[1], c.points[2], c.rect, levelsOf(c), c.kindOptions.extendLeft as boolean, c.kindOptions.extendRight as boolean),
});
registerFibonacci('fibonacci-time-extension', {
  anchors: THREE,
  geometry: (c) => timeExtensionShapes(c.drawing.anchors[0], c.drawing.anchors[1], c.drawing.anchors[2], c.rect, c.host, levelsOf(c)),
});
registerFibonacci('fibonacci-circles', {
  anchors: TWO,
  geometry: (c) => circleShapes(c.points[0], c.points[1], levelsOf(c)),
});
registerFibonacci('fibonacci-spiral', {
  anchors: TWO,
  geometry: (c) => spiralShapes(c.points[0], c.points[1], c.kindOptions.turns as number, c.kindOptions.clockwise as boolean),
});
registerFibonacci('fibonacci-wedge', {
  anchors: THREE,
  geometry: (c) => wedgeShapes(c.points[0], c.points[1], c.points[2], c.rect, levelsOf(c)),
});
