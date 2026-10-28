import type { Anchor, Drawing } from '../src/types';

export function anchor(time: number, price = 100, yAxisId = 'price'): Anchor {
  return { time, price, yAxisId };
}

export function trendLine(id = 't1'): Drawing {
  return { id, kind: 'trend-line', anchors: [anchor(1), anchor(2, 110)] };
}

export function horizontalLine(id = 'h1'): Drawing {
  return { id, kind: 'horizontal-line', anchors: [anchor(1)] };
}
