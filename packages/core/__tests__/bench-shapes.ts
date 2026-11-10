import { registerKind } from '../src/kinds';
import type { Drawing, DrawingKind } from '../src/types';
import { seeded } from './random';

/** A kind made up for the benches: it draws every new shape (FR-TOOL-036) between its two anchors. */
export const BENCH_SHAPES_KIND = 'bench-shapes' as DrawingKind;

registerKind({
  id: BENCH_SHAPES_KIND,
  anchors: { min: 2, max: 2 },
  defaults: {},
  group: 'shapes',
  geometry: ({ points }) => {
    const [p1, p2] = points as [{ x: number; y: number }, { x: number; y: number }];
    const middle = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    return [
      { type: 'polyline', part: 'body', points: [p1, middle, p2] },
      { type: 'polygon', part: 'body', points: [p1, { x: p2.x, y: p1.y }, p2] },
      { type: 'ellipse', part: 'body', center: middle, radiusX: Math.abs(p2.x - p1.x) / 2, radiusY: Math.abs(p2.y - p1.y) / 2, rotation: 0.5 },
      { type: 'curve', part: 'body', from: p1, controls: [{ x: middle.x, y: p1.y }], to: p2 },
      {
        type: 'curve',
        part: 'body',
        from: p1,
        controls: [
          { x: middle.x, y: p1.y },
          { x: middle.x, y: p2.y },
        ],
        to: p2,
      },
      { type: 'arrowhead', part: 'body', tip: p2, angle: Math.PI / 4, length: 10, width: 8 },
      { type: 'glyph', part: 'body', x: p1.x, y: p1.y, width: 24, height: 24, glyph: 'pin', source: 'icon', fontSize: 24 },
    ];
  },
});

/** `count` drawings of the shapes kind with seeded random anchors inside the default pane of the mock host (time 0 to 4 800 000 ms, price 0 to 200). */
export function benchShapeDrawings(count: number, seed: number): Drawing[] {
  const random = seeded(seed);
  const anchor = () => ({ time: Math.floor(random() * 4_800_000), price: random() * 200, yAxisId: 'price' });
  return Array.from({ length: count }, (_, index): Drawing => ({ id: `s${index}`, kind: BENCH_SHAPES_KIND, anchors: [anchor(), anchor()], style: { fillOpacity: 0.2 }, zIndex: index % 7 }));
}
